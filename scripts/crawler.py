# -*- coding: utf-8 -*-
"""抓取与页面改写：官方优先 + R2 回退、版本化保存。"""
import glob
import os
import re
from copy import deepcopy
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from common import (
    COMIC_EPISODE_RE,
    HEADERS,
    HTML_DIR,
    OFFICIAL_BXB_ASSET,
    OFFICIAL_GRIMOIRE,
    R2_PUBLIC,
    R2_STAGING,
    SITE,
    body_hash,
    canonical_name,
    now_jst_str,
    parse_file,
    ts_compact,
    version_name,
    write_page,
)

GTAG_SRC = "https://www.googletagmanager.com/gtag/js?id=G-C5DZFTSEB3"


# ---------------------------------------------------------------- 请求

def fetch_topic(num):
    """抓取数字 id 页。返回 (raw_html, base_url)；不存在/失败返回 None。"""
    url = f"{SITE}/topics/{num}"
    try:
        resp = requests.get(url, headers=HEADERS, allow_redirects=True, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"  抓取 {url} 失败：{e}")
        return None
    if resp.url.rstrip("/") == f"{SITE}/topics":  # 重定向回列表 = 不存在
        return None
    return resp.text, resp.url


# ---------------------------------------------------------------- 媒体分类与改写

def classify_src(src):
    """返回 (kind, key_or_relpath, official_url)。
    kind: 'r2'   → 官方优先 + R2 回退（bxb-assets/、bxb/ 两个前缀）
          'repo' → 小资源下载入库、相对路径（/assets/、grimoire.co 其余路径）
          'keep' → 不动
    同时兼容新抓取页（绝对 URL / 站内路径）与存量页（已改写的相对路径）。
    """
    if not src:
        return ("keep", None, None)
    s = src.strip()
    if s.startswith(("http://", "https://")):
        u = urlparse(s)
        path = u.path.lstrip("/")
        if not path:
            return ("keep", None, None)
        if u.netloc == "bxb-asset.grimoire.codes":
            return ("r2", "bxb-assets/" + path, s)
        if u.netloc in ("grimoire.co", "www.grimoire.co"):
            if path.startswith("bxb/"):
                return ("r2", path, s)
            return ("repo", path, s)
        return ("keep", None, None)
    if s.startswith("/assets/"):
        return ("repo", s.lstrip("/"), urljoin(SITE + "/", s))
    # 存量页相对路径（query 早已丢失，官方 URL 不带 query 也能访问）
    if s.startswith("bxb-assets/"):
        return ("r2", s, OFFICIAL_BXB_ASSET + "/" + s[len("bxb-assets/"):])
    if s.startswith("bxb/"):
        return ("r2", s, OFFICIAL_GRIMOIRE + "/" + s)
    return ("keep", None, None)


def ensure_repo_asset(relpath, url):
    """下载入库的小资源（css/js/assets/images），已存在则跳过。"""
    local = HTML_DIR / relpath
    if local.exists():
        return
    try:
        print(f"  下载入库资源：{url}")
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        local.parent.mkdir(parents=True, exist_ok=True)
        with open(local, "wb") as f:
            f.write(resp.content)
    except Exception as e:
        print(f"  下载 {url} 失败：{e}")


def rewrite_img(soup, img, r2_needed):
    kind, key, official = classify_src(img.get("src"))
    if kind == "r2":
        img["src"] = official
        if R2_PUBLIC:
            img["onerror"] = f"this.onerror=null;this.src='{R2_PUBLIC}/{key}';"
        r2_needed.add((key, official))
    elif kind == "repo":
        ensure_repo_asset(key, official)
        img["src"] = key


def rewrite_av(soup, tag, r2_needed, missing_keys=None):
    """audio/video：删 src 属性（否则浏览器忽略 source 子节点），重建双 source。
    missing_keys 非 None 时（迁移模式）不要求本地有文件，仅记录 key。"""
    candidates = [s.get("src") for s in tag.find_all("source")]
    if tag.get("src"):
        candidates.append(tag.get("src"))
    key = official = None
    for c in candidates:
        kind, k, off = classify_src(c)
        if kind == "r2":
            key, official = k, off
            break
    if not key:
        return
    if tag.has_attr("src"):
        del tag["src"]
    for s in tag.find_all("source"):
        s.decompose()
    s1 = soup.new_tag("source")
    s1["src"] = official
    tag.append(s1)
    if R2_PUBLIC:
        s2 = soup.new_tag("source")
        s2["src"] = f"{R2_PUBLIC}/{key}"
        s2["data-r2-fallback"] = "1"
        tag.append(s2)
    if missing_keys is not None and tag.name == "video":
        missing_keys.add((key, official))
    else:
        r2_needed.add((key, official))


def inject_noindex(soup):
    head = soup.head
    if head and not head.find("meta", attrs={"name": "robots"}):
        m = soup.new_tag("meta")
        m["name"] = "robots"
        m["content"] = "noindex"
        head.insert(0, m)


def fix_back_links(soup):
    """返回按钮指向本地 Topics / 四格合集（沿用旧 crawl-topic.py 逻辑）。"""
    li_tag = soup.find("li")
    if li_tag:
        a_tag = li_tag.find("a")
        if a_tag and a_tag.has_attr("href"):
            a_tag["href"] = "../Topics.html"
    back_button = soup.find("a", class_="push_para manga_next back_blue",
                            string="魔剣機関からのお知らせ")
    if back_button and back_button.has_attr("href"):
        back_button["href"] = "../Topics.html"
    for button in soup.find_all("a", class_="push_para manga_next back_white",
                                string="他の話を読む"):
        button["href"] = "./00155_20150729.html"


def process_page(soup, base_url):
    """对新抓取页做完整改写。返回需保证存在于 R2 的 {(key, official_url)}。"""
    r2_needed = set()

    for link in soup.find_all("link", rel="stylesheet"):
        href = link.get("href")
        if not href:
            continue
        full_url = urljoin(base_url, href)
        filename = os.path.basename(urlparse(href).path)
        ensure_repo_asset(f"css/{filename}", full_url)
        link["href"] = f"css/{filename}"

    for script in soup.find_all("script"):
        src = script.get("src")
        if src and src != GTAG_SRC:
            full_url = urljoin(base_url, src)
            filename = os.path.basename(urlparse(src).path)
            ensure_repo_asset(f"js/{filename}", full_url)
            script["src"] = f"js/{filename}"

    for img in soup.find_all("img"):
        rewrite_img(soup, img, r2_needed)
    for tag in soup.find_all(["audio", "video"]):
        rewrite_av(soup, tag, r2_needed)

    inject_noindex(soup)
    fix_back_links(soup)
    return r2_needed


# ---------------------------------------------------------------- R2 暂存

def stage_r2_assets(r2_needed, manifest):
    """把 manifest/本地镜像/暂存区都没有的资源下载到 r2-staging/。返回新暂存 key 列表。"""
    staged = []
    for key, url in sorted(r2_needed):
        if key in manifest:
            continue
        if (HTML_DIR / key).exists():  # 本地跑且镜像里已有
            continue
        dest = R2_STAGING / key
        if dest.exists():
            continue
        try:
            print(f"  下载媒体 → R2 暂存：{url}")
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "wb") as f:
                f.write(resp.content)
            staged.append(key)
        except Exception as e:
            print(f"  媒体 {url} 下载失败（R2 回退将暂缺）：{e}")
    return staged


# ---------------------------------------------------------------- 日期推断（沿用旧逻辑）

def infer_datetime(soup, year, month, day, hhmm):
    """对新 id：从页面 MM/DD hh:mm 推断完整日期（跨年/四格继承）。"""
    time_div = soup.find("div", class_="time")
    new_date = time_div.get_text(strip=True)
    new_month = int(new_date[:2])
    new_day = int(new_date[3:5])
    new_hhmm = new_date[-5:]
    title_a = soup.find("a", class_="title_text")
    title = title_a.get_text(strip=True) if title_a else ""
    if title[:5] == "【四コマ】" and COMIC_EPISODE_RE.match(title):
        # 日期恒为01/01的四格：继承上一个 topic 的日期
        new_month, new_day, new_hhmm = month, day, hhmm
    elif new_month in (1, 2) and month in (11, 12):
        year += 1
    elif new_month in (11, 12) and month in (1, 2):
        year -= 1
    time_div.string = f"{year:04d}/{new_month:02d}/{new_day:02d} {new_hhmm}"
    return year, new_month, new_day, new_hhmm


# ---------------------------------------------------------------- 版本与重爬

def find_canonical(num):
    """按 id 找 canonical 文件名（不含目录）。"""
    matches = sorted(glob.glob(str(HTML_DIR / f"{num:05d}_[0-9]*.html")))
    matches = [os.path.basename(m) for m in matches
               if re.match(rf"{num:05d}_\d{{8}}\.html$", os.path.basename(m))]
    return matches[0] if matches else None


def page_time_str(path):
    """读存档页 div.time 的完整 'YYYY/MM/DD hh:mm'。"""
    soup = parse_file(path)
    t = soup.find("div", class_="time")
    return t.get_text(strip=True) if t else None


def ensure_version_entry(num, versions):
    """老 topic 第一次被版本系统接触时，把现有 canonical 登记为 v1。"""
    k = str(num)
    if k in versions:
        return versions[k]
    canonical = find_canonical(num)
    if not canonical:
        return None
    ts = page_time_str(HTML_DIR / canonical)
    ts = (ts + ":00") if ts else now_jst_str()
    versions[k] = {
        "slug": None,
        "canonical": canonical,
        "versions": [{"ts": ts, "file": canonical, "hash": None, "ts_source": "page_time"}],
    }
    return versions[k]


def _norm_text(soup):
    # time div 整个排除：存档版补写了年份、四格页官方恒显示 01/01 而存档版是继承日期
    for t in soup.find_all("div", class_="time"):
        t.string = ""
    body = soup.body or soup
    return re.sub(r"\s+", " ", body.get_text(" ", strip=True))


def _media_basenames(soup):
    names = set()
    for tag in soup.find_all(["img", "audio", "video", "source"]):
        src = tag.get("src")
        if src and src.strip():
            # 官方页面的 src 偶有首尾空格，存档版已 strip 过，比对前必须归一
            names.add(os.path.basename(urlparse(src.strip()).path))
    return names


def legacy_equal(fresh_raw, canonical_path):
    """存量页无 hash 时的内容比对：正文文本 + 媒体文件名集合。"""
    fresh = BeautifulSoup(fresh_raw, "lxml")
    stored = parse_file(canonical_path)
    return (_norm_text(fresh) == _norm_text(stored)
            and _media_basenames(fresh) == _media_basenames(stored))


def save_new_version(num, fresh_raw, base_url, entry, ts, ts_source, versions, r2_needed):
    """把 entry 的 canonical 退位成历史版本，新内容写入 canonical。"""
    canonical = entry["canonical"]
    last = entry["versions"][-1]
    old_path = HTML_DIR / canonical
    versioned = version_name(canonical, last["ts"])
    os.replace(old_path, HTML_DIR / versioned)
    last["file"] = versioned

    soup = BeautifulSoup(fresh_raw, "lxml")
    # 日期：年份沿用 canonical 文件名，不因编辑改名（链接不死）
    year = int(canonical[6:10])
    time_div = soup.find("div", class_="time")
    if time_div:
        t = time_div.get_text(strip=True)
        time_div.string = f"{year:04d}/{t[:5]} {t[-5:]}"

    r2_needed |= process_page(soup, base_url)
    write_page(HTML_DIR / canonical, soup)
    entry["versions"].append({
        "ts": ts, "file": canonical,
        "hash": body_hash(fresh_raw), "ts_source": ts_source,
    })


def latest_tsuiki_ts(raw, canonical):
    """正文里找所有 'M/D HH:MM追記' 时间,返回最新一条 'YYYY/MM/DD HH:MM:00';无则 None。
    年份取 canonical 文件名的年(追記不含年);追記月日 < 公告月日则视为跨年 +1。"""
    base_y, base_mo, base_d = int(canonical[6:10]), int(canonical[10:12]), int(canonical[12:14])
    text = BeautifulSoup(raw, "lxml").get_text(" ")
    best = None
    for m in re.finditer(r"(\d{1,2})\s*/\s*(\d{1,2})[\s　]+(\d{1,2})\s*[:：]\s*(\d{2})\s*追記", text):
        mo, d, hh, mm = (int(m.group(i)) for i in range(1, 5))
        y = base_y + (1 if (mo, d) < (base_mo, base_d) else 0)
        key = (y, mo, d, hh, mm)
        if best is None or key > best:
            best = key
    if best:
        return f"{best[0]:04d}/{best[1]:02d}/{best[2]:02d} {best[3]:02d}:{best[4]:02d}:00"
    return None


def extract_edit_note(soup):
    """提取页面的「追記」注记文字(= 本次修改的部分),供编辑通知附在链接下方。
    优先含 追記 的 .caution_t 整块;无则全文取含 追記 的文本节点。多条按出现序拼接。"""
    notes = []
    for el in soup.select(".caution_t"):
        t = el.get_text(" ", strip=True)
        if "追記" in t and t not in notes:
            notes.append(t)
    if not notes:
        for s in soup.find_all(string=lambda x: x and "追記" in x):
            t = " ".join(s.split())
            if t and t not in notes:
                notes.append(t)
    return "\n".join(notes)


def recrawl(num, versions, r2_needed, rss_ts=None, rss_ts_source="rss"):
    """重爬已知 id。返回 'edit'（产生新版本）/ 'same' / 'miss'。"""
    entry = ensure_version_entry(num, versions)
    if entry is None:
        return "miss"
    result = fetch_topic(num)
    if result is None:
        return "miss"
    fresh_raw, base_url = result
    h = body_hash(fresh_raw)
    last = entry["versions"][-1]

    if last["hash"] == h:
        return "same"
    if last["hash"] is None:
        if legacy_equal(fresh_raw, HTML_DIR / entry["canonical"]):
            last["hash"] = h  # 内容相同，补登 hash，下次直接快速比对
            return "same"
    # 版本时间戳优先级:① 正文「M/D HH:MM追記」最新一条(官网改动必带追記、最准)
    #   ② RSS pubDate(若随编辑更新了、与上一版不同) ③ 检测时间兜底。
    # 避免 silent edit(改正文但 pubDate 不变)时与上一版时间戳重复。
    tsuiki = latest_tsuiki_ts(fresh_raw, entry["canonical"])
    if tsuiki:
        ts, ts_source = tsuiki, "tsuiki"
    elif rss_ts and rss_ts != last["ts"]:
        ts, ts_source = rss_ts, rss_ts_source
    else:
        ts, ts_source = now_jst_str(), "detected"
    save_new_version(num, fresh_raw, base_url, entry, ts, ts_source, versions, r2_needed)
    print(f"  topic {num} 检测到修改，已存为新版本（{ts}）")
    return "edit"


# 页内版本切换：fetch 对方版本文件，仅替换 news_body 与时间，无跳转无闪烁
VERSION_SWITCH_JS = """
function bxbSwitchVersion(u){
  fetch(u).then(function(r){return r.text();}).then(function(t){
    var d = new DOMParser().parseFromString(t, "text/html");
    var nb = d.querySelector(".news_body");
    var cur = document.querySelector(".news_body");
    if (nb && cur) { cur.replaceWith(document.importNode(nb, true)); }
    var tm = d.querySelector(".news_heading .time");
    var ct = document.querySelector(".news_heading .time");
    if (tm && ct) { ct.replaceWith(document.importNode(tm, true)); }
    if (window.twttr && twttr.widgets && twttr.widgets.load) { twttr.widgets.load(); }
  });
}
"""


def update_version_selects(num, versions):
    """给多版本话题的每个版本页面注入页内版本切换器（下拉框 + 局部替换脚本）。"""
    entry = versions.get(str(num))
    if not entry or len(entry["versions"]) <= 1:
        return
    vs = list(reversed(entry["versions"]))  # 新 → 旧
    for v in entry["versions"]:
        path = HTML_DIR / v["file"]
        if not path.exists():
            continue
        soup = parse_file(path)
        for old in soup.find_all("select", class_="version_select"):
            old.decompose()
        old_js = soup.find("script", id="version-switcher-js")
        if old_js:
            old_js.decompose()
        heading = soup.find("div", class_="news_heading")
        if heading is None:
            continue
        title_div = heading.find("div", class_="news_title") or heading
        select = soup.new_tag("select")
        select["class"] = "version_select"
        select["onchange"] = "if(this.value)bxbSwitchVersion(this.value)"
        select["style"] = "margin-left:8px;max-width:200px"
        for w in vs:
            opt = soup.new_tag("option")
            opt["value"] = "./" + w["file"]
            opt.string = w["ts"]
            if w["file"] == v["file"]:
                opt["selected"] = "selected"
            select.append(opt)
        anchor = title_div.find("a", class_="title_text")
        if anchor:
            anchor.insert_after(select)
        else:
            title_div.append(select)
        js = soup.new_tag("script", id="version-switcher-js")
        js.string = VERSION_SWITCH_JS
        (soup.body or soup).append(js)
        write_page(path, soup)


# ---------------------------------------------------------------- 增量爬新

def _match_rss_item(title, time_mmdd_hhmm, rss_items, used_slugs):
    """按 (标题精确, 时间, 顺序) 匹配 RSS item。返回 item 或 None。"""
    cands = [it for it in rss_items
             if it["title"].strip() == title and it["slug"] not in used_slugs]
    if len(cands) > 1 and time_mmdd_hhmm:
        timed = [it for it in cands if it["jst_ts"][5:16] == time_mmdd_hhmm]
        if timed:
            cands = timed
    return cands[0] if cands else None


def prev_date_context(latest_id):
    """从最新 canonical 推出 (year, month, day, hhmm) 上下文。"""
    canonical = find_canonical(latest_id)
    if not canonical:
        return 2015, 1, 1, "00:00"
    ts = page_time_str(HTML_DIR / canonical)  # 'YYYY/MM/DD hh:mm'
    if not ts or len(ts) < 16:
        return int(canonical[6:10]), int(canonical[10:12]), int(canonical[12:14]), "00:00"
    return int(ts[:4]), int(ts[5:7]), int(ts[8:10]), ts[-5:]


def crawl_new(state, versions, rss_items, r2_needed):
    """从 latest_id+1 起增量爬。返回 changes 列表。"""
    changes = []
    latest_id = state["latest_id"]
    year, month, day, hhmm = prev_date_context(latest_id)
    known_slugs = set(state["rss"].keys())
    expected = {it["slug"] for it in rss_items} - known_slugs
    used_slugs = set()
    misses = 0
    i = latest_id

    while True:
        i += 1
        limit = 200 if (expected - used_slugs) else 10
        if misses >= limit:
            break
        result = fetch_topic(i)
        if result is None:
            misses += 1
            continue
        misses = 0
        fresh_raw, base_url = result
        soup = BeautifulSoup(fresh_raw, "lxml")
        year, month, day, hhmm = infer_datetime(soup, year, month, day, hhmm)
        ymd = f"{year:04d}{month:02d}{day:02d}"
        canonical = canonical_name(i, ymd)

        title_a = soup.find("a", class_="title_text")
        title = title_a.get_text(strip=True) if title_a else ""
        item = _match_rss_item(title, f"{month:02d}/{day:02d} {hhmm}", rss_items, used_slugs)
        if item:
            used_slugs.add(item["slug"])
            slug, ts, ts_source = item["slug"], item["jst_ts"], "rss"
            state["rss"][slug] = {"pubDate": item["pubdate_raw"], "id": i}
        else:
            slug, ts, ts_source = None, f"{year:04d}/{month:02d}/{day:02d} {hhmm}:00", "page_time"

        versions[str(i)] = {
            "slug": slug,
            "canonical": canonical,
            "versions": [{"ts": ts, "file": canonical,
                          "hash": body_hash(fresh_raw), "ts_source": ts_source}],
        }
        r2_needed |= process_page(soup, base_url)
        write_page(HTML_DIR / canonical, soup)
        state["latest_id"] = i
        changes.append({"id": i, "type": "new", "title": title,
                        "canonical": canonical, "ts": ts, "slug": slug})
        print(f"  新公告 topic {i}：{title}")

    return changes


def recent_ids(n=40):
    """已存档的最近 n 个 id（按文件名枚举，跳过 id 空洞）。"""
    ids = set()
    for p in glob.glob(str(HTML_DIR / "[0-9]*.html")):
        m = re.match(r"(\d+)_\d{8}\.html$", os.path.basename(p))
        if m:
            ids.add(int(m.group(1)))
    return sorted(ids)[-n:]
