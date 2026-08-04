# -*- coding: utf-8 -*-
"""probe_assets.py — 提前探测图床上 event / campaign / gacha 的 title 图。

图床 (bxb-asset.grimoire.codes) 常在公告发布前几天就上传活动/扭蛋的 title 图。
本脚本锚定当前 id frontier，向后扫 WINDOW 个 id，命中 (HTTP 200) 即说明有新内容
提前上图、公告可能尚未发布 → 记入 probe_hits.json 供 workflow 开 issue 邮件提醒。

两条 id 线 (实测 2026-06):
  line_12xx : events ∪ campaign 共用一条递增序列 (…1257e, 1258c, 1259e, 1260e)
  gacha     : 独立序列 (当前 8xx 段，等于 g_{n} slug 号)

锚点自愈: anchor = max(近期归档页里该类的最大 id, 上次存的 floor)。
  - 归档页随公告更新 → 公告一发布 anchor 自然跟上 (即便漏掉了提前上图)。
  - floor 记住"提前探到、但还没进归档"的 id → 下次能继续往更前扫。

title 命名 (当前方案，实测 200):
  events   : images/topics/events/{id}/title.jpg
  campaign : images/topics/campaign/{id}/title_{id}.jpg + 续图 title_{id}_{x:02d}.jpg (补零两位、x=1..)
  gacha    : images/topics/gachas/{id}/title_{id}_1.jpg
CDN 行为: 存在=200，不存在=403 (R2 后端，非 404)。
续图补零: campaign 续图实测是 title_{id}_01.jpg 这种补零两位 (title_{id}_1.jpg 非补零=403、2026-06-24 实测 1263);
  _series 每个 n 同时试补零/非补零变体、兜底两种命名。
"""
import glob
import json
import os
import re
import time
from datetime import datetime, timedelta

import requests

from common import HEADERS, HTML_DIR, STATE_DIR, now_jst_str

ASSET_BASE = "https://bxb-asset.grimoire.codes/images/topics"
PROBE_STATE = STATE_DIR / "asset_probe.json"
PROBE_HITS = STATE_DIR / "probe_hits.json"

WINDOW = 5          # 每条线向后扫的 id 数
BACKFILL = int(os.environ.get("PROBE_BACKFILL", 5))   # floor 以下回补的 id 数(PROBE_BACKFILL 可临时加大做深度回补)
                    # 上架顺序不严格按 id(如 838 先于 837),
                    # floor 单调前进会永久跳过后出的空洞 → 每轮重扫 [floor-BACKFILL, floor] 里不在 found 的 id
LOOKBACK_DAYS = 200  # 归档锚点只看近 N 天的页 (排除已废的旧 id 段)
ID_CAP = 100000      # 排除 date 型(8 位)/特殊大 id


def line_candidates(i):
    """events ∪ campaign 线: 每个 id 两类路径都试，命中的 category 决定它是哪种。"""
    return [
        ("events", f"events/{i}/title.jpg"),
        ("events", f"events/{i}/title_{i}.jpg"),
        ("campaign", f"campaign/{i}/title_{i}.jpg"),
        ("campaign", f"campaign/{i}/title_{i}_01.jpg"),  # 续图补零 (无单张 title 的 campaign 兜底检测)
        ("campaign", f"campaign/{i}/title_{i}_1.jpg"),
        ("campaign", f"campaign/{i}/title.jpg"),
    ]


def gacha_candidates(i):
    return [
        ("gacha", f"gachas/{i}/title_{i}_1.jpg"),
        ("gacha", f"gachas/{i}/title.jpg"),
    ]


class ProbeUnavailable(Exception):
    pass


_warp = [None, None, False]      # [module, pool, 已尝试过]


# 直连持续失败时切 WARP 代理(workflow 就位配置才有);切不了返回 False
def _switch_warp():
    if _warp[2]:
        return _warp[1] is not None
    _warp[2] = True
    pool_dir = os.environ.get("BXB_WARP_POOL_DIR")
    if not pool_dir or not os.path.isdir(pool_dir):
        return False
    try:
        import warp_pool
    except ImportError:
        return False
    if not any(f.endswith(".conf") for f in os.listdir(pool_dir)):
        return False
    pool = warp_pool.WarpPool(pool_dir, os.environ.get("BXB_WIREPROXY_BIN", "bin/wireproxy"),
                             os.environ.get("BXB_WARP_BURNED", "warp_burned.txt"))
    if not pool.pick_and_start():
        return False
    warp_pool._set_env_proxy(pool.proxy_url)
    _warp[0], _warp[1] = warp_pool, pool
    print(f"::warning::图床直连失败 → 切 WARP {pool.proxy_url}")
    return True


# 200=存在 / 403/404=不存在 / 持续网络失败 → 抛 ProbeUnavailable(不可与"不存在"混为一谈)
def url_exists(path, tries=3):
    last, attempt, warped = None, 0, False
    while True:
        attempt += 1
        try:
            r = requests.get(f"{ASSET_BASE}/{path}", headers=HEADERS, timeout=15, stream=True)
            code = r.status_code
            r.close()
            if code == 200:
                return True
            if code in (403, 404):
                return False
            last = f"HTTP {code}"
        except requests.RequestException as e:
            last = f"{type(e).__name__}: {e}"
        if attempt >= tries:
            if not warped and _switch_warp():   # 切 WARP 后重新给满次数
                warped, attempt, last = True, 0, None
                continue
            raise ProbeUnavailable(f"{path}: {last}")
        time.sleep(2 * attempt)


def _series(path_fmts, cap=40):
    """探 n=1.. 直到某个 n 所有命名变体都不存在,返回存在的完整 URL 列表(N 连续)。

    path_fmts 可为单个 format 字符串、或多个变体的 list (如补零 title_{id}_{n:02d} +
    非补零 title_{id}_{n});每个 n 依次试各变体、取第一个命中,全 404 才停。
    """
    if isinstance(path_fmts, str):
        path_fmts = [path_fmts]
    urls = []
    for n in range(1, cap + 1):
        hit = None
        for fmt in path_fmts:
            p = fmt.format(n=n)
            if url_exists(p):
                hit = p
                break
        if hit is None:
            break
        urls.append(f"{ASSET_BASE}/{hit}")
    return urls


def enumerate_images(cat, i):
    """命中后枚举该实体的全部图 URL(每类命名不同,探到 404 为止)。

    gacha    : title_{id}_1..N
    events   : title.jpg (或 title_{id}.jpg) + leaflet_1{id}_1..M
    campaign : title_{id}.jpg / title.jpg + title_{id}_{x:02d}..N (续图补零两位) + info_{id}_..K
    """
    out = []
    if cat == "gacha":
        out += _series(f"gachas/{i}/title_{i}_{{n}}.jpg")
    elif cat == "events":
        if url_exists(f"events/{i}/title.jpg"):
            out.append(f"{ASSET_BASE}/events/{i}/title.jpg")
        elif url_exists(f"events/{i}/title_{i}.jpg"):
            out.append(f"{ASSET_BASE}/events/{i}/title_{i}.jpg")
        out += _series(f"events/{i}/leaflet_1{i}_{{n}}.jpg")
    elif cat == "campaign":
        for single in (f"campaign/{i}/title_{i}.jpg", f"campaign/{i}/title.jpg"):
            if url_exists(single):
                out.append(f"{ASSET_BASE}/{single}")
        # 续图: 补零两位 title_{id}_01.. (当前格式) + 非补零 title_{id}_1.. (兼容旧)
        out += _series([
            f"campaign/{i}/title_{i}_{{n:02d}}.jpg",
            f"campaign/{i}/title_{i}_{{n}}.jpg",
        ])
        out += _series([
            f"campaign/{i}/info_{i}_{{n:02d}}.jpg",
            f"campaign/{i}/info_{i}_{{n}}.jpg",
        ])
    # 去重保序
    seen, uniq = set(), []
    for u in out:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq


def archive_recent_max(cats):
    """近 LOOKBACK_DAYS 天归档页里、属于 cats 的最大 id (< ID_CAP)。"""
    cutoff = int((datetime.now() - timedelta(days=LOOKBACK_DAYS)).strftime("%Y%m%d"))
    pat = re.compile(r"images/topics/(?:" + "|".join(cats) + r")/(\d+)/")
    best = 0
    for p in glob.glob(str(HTML_DIR / "[0-9]*_[0-9]*.html")):
        m = re.search(r"(\d{8})\.html$", p)
        if not m or int(m.group(1)) < cutoff:
            continue
        try:
            txt = open(p, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for cid in pat.findall(txt):
            cid = int(cid)
            if cid < ID_CAP and cid > best:
                best = cid
    return best


def probe_seq(name, cats, cand_fn, state):
    s = state.setdefault(name, {"floor": 0, "found": []})
    arch = archive_recent_max(cats)
    anchor = max(s.get("floor", 0), arch)
    if anchor <= 0:
        print(f"{name}: 无锚点 (archive={arch}, floor={s.get('floor')})、跳过")
        return []
    found = set(s["found"])
    new_hits = []
    new_floor = s.get("floor", 0)
    print(f"{name}: anchor={anchor} (archive_recent={arch}, floor={s.get('floor', 0)}) "
          f"→ 扫 {anchor + 1}..{anchor + WINDOW}")
    # 前向窗口 + floor 以下的空洞回补(空洞只在已跟踪范围内取,避免扫远古 id)
    scan = [anchor + off for off in range(1, WINDOW + 1)]
    if found:
        lo = max(min(found), new_floor - BACKFILL + 1)
        holes = [j for j in range(lo, new_floor + 1) if j not in found]
        if holes:
            print(f"  回补空洞: {holes}")
            scan += holes
    try:
        for j in scan:
            for cat, path in cand_fn(j):
                if url_exists(path):
                    url = f"{ASSET_BASE}/{path}"
                    if j not in found:
                        found.add(j)
                        try:
                            imgs = enumerate_images(cat, j)
                        except ProbeUnavailable as e:
                            imgs = [url]
                            print(f"::warning::{name} id={j} 枚举中断({e})、只记 title 图")
                        new_hits.append({"sequence": name, "category": cat,
                                         "id": j, "url": url, "images": imgs,
                                         "ts": now_jst_str()})
                        print(f"  ★ 命中 {cat} id={j}: {len(imgs)} 张图 {imgs[:1]}")
                    else:
                        print(f"  · 已知 {cat} id={j} (已报过)")
                    new_floor = max(new_floor, j)
                    break  # 该 id 已确认存在、不再试其它候选
    except ProbeUnavailable as e:
        # 网络失败 ≠ 图不存在:本轮该序列不可信 → floor/found 一律不动,避免把 id 段永久跳过
        print(f"::warning::{name} 探测不可信({e})→ 本轮不更新 floor/found")
        return []
    s["floor"] = new_floor
    s["found"] = sorted(found)
    return new_hits


def main():
    state = json.loads(PROBE_STATE.read_text(encoding="utf-8")) if PROBE_STATE.exists() else {}
    hits = []
    hits += probe_seq("line_12xx", ["events", "campaign"], line_candidates, state)
    hits += probe_seq("gacha", ["gachas"], gacha_candidates, state)

    PROBE_STATE.parent.mkdir(parents=True, exist_ok=True)
    PROBE_STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    PROBE_HITS.write_text(
        json.dumps({"generated_at": now_jst_str(), "hits": hits}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if _warp[1]:
        _warp[1].stop()
    print(f"探测完成: {len(hits)} 个新命中")


if __name__ == "__main__":
    main()
