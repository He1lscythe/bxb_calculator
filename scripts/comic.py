# -*- coding: utf-8 -*-
"""四格漫画处理（原 4koma.py 重构）：映射持久化，修复重爬后的 KeyError 隐患。

- --rebuild-map：全量扫描 html/*.html 重建 {话数: 文件名} 映射（旧版从 Topics.html
  重建，但相关 heading 早已被自己 decompose，重跑必然缺失——故必须持久化）。
- 常规模式：读 state/changes.json，只处理本次新增/重爬的页面；从 Topics.html
  decompose 单话 heading；新话数收录进映射并刷新合集目录。
"""
import argparse
import glob
import os
import re

from common import (
    CHANGES_JSON,
    COMIC_EPISODE_RE,
    COMIC_MAP_JSON,
    HTML_DIR,
    TOPICS_FILE,
    load_json,
    parse_file,
    save_json,
    write_page,
)

# 七个四格合集目录页（沿用 4koma.py 的 ykm_col）
DEFAULT_COLLECTIONS = [
    "00155_20150729.html", "03333_20221205.html", "02707_20210526.html",
    "02421_20200924.html", "01826_20190522.html", "01751_20190424.html",
    "01825_20190522.html",
]


def load_map():
    return load_json(COMIC_MAP_JSON, lambda: {"episodes": {}, "collections": DEFAULT_COLLECTIONS})


def episode_of(soup):
    """页面标题是【四コマ】第N話则返回 N，否则 None。"""
    a = soup.find("a", class_="title_text")
    if not a:
        return None
    m = COMIC_EPISODE_RE.match(a.get_text(strip=True))
    return int(m.group(1)) if m else None


def rebuild_map():
    cmap = load_map()
    cmap["episodes"] = {}
    files = sorted(glob.glob(str(HTML_DIR / "[0-9]*.html")))
    for path in files:
        name = os.path.basename(path)
        if not re.match(r"\d+_\d{8}\.html$", name):
            continue
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        if "【四コマ】第" not in raw:
            continue
        n = episode_of(parse_file(path))
        if n is not None:
            cmap["episodes"][str(n)] = name
    save_json(COMIC_MAP_JSON, cmap)
    print(f"漫画映射重建完成：{len(cmap['episodes'])} 话")
    return cmap


def fix_episode_links(soup, episodes):
    """修 div.center 里「第N話」的跳转与「他の話を読む」按钮。返回是否有改动。"""
    changed = False
    for div in soup.find_all("div", class_="center"):
        m = re.search(r"第\s*(\d+)\s*話", div.get_text(separator="\n", strip=True))
        a = div.find("a", href=True)
        if not (m and a):
            continue
        target = episodes.get(m.group(1))
        if not target or a["href"].endswith(".html"):
            continue
        a["href"] = "./" + target
        changed = True
    for a in soup.find_all("a", class_="push_para manga_next back_white",
                           string="他の話を読む"):
        if a.get("href") != "./00155_20150729.html":
            a["href"] = "./00155_20150729.html"
            changed = True
    return changed


def fix_collections(cmap):
    """合集目录页：每话跳转 + 目录间互跳。"""
    collections = cmap["collections"]
    for k in collections:
        path = HTML_DIR / k
        if not path.exists():
            continue
        soup = parse_file(path)
        changed = fix_episode_links(soup, cmap["episodes"])
        for idx, col in enumerate(soup.find_all(
                "a", class_="push_para manga_next back_white", href=True, style=True)):
            if idx < len(collections) and col["href"] != "./" + collections[idx]:
                col["href"] = "./" + collections[idx]
                changed = True
        if changed:
            write_page(path, soup)
            print(f"  合集目录已更新：{k}")


def decompose_episode_headings(tsoup):
    """从 Topics 列表移除单话 heading（合集/劇場保留）。返回是否有改动。"""
    changed = False
    for tp in tsoup.find_all("div", class_="news_heading"):
        a = tp.find("a", class_="title_text")
        if a and COMIC_EPISODE_RE.match(a.get_text(strip=True)):
            tp.decompose()
            changed = True
    return changed


def process_changes():
    cmap = load_map()
    changes = load_json(CHANGES_JSON, {"changes": []})["changes"]

    new_episode = False
    comic_files = []
    for c in changes:
        path = HTML_DIR / c["canonical"]
        if not path.exists():
            continue
        if "四コマ" not in c.get("title", ""):
            continue
        soup = parse_file(path)
        n = episode_of(soup)
        if n is not None and cmap["episodes"].get(str(n)) != c["canonical"]:
            cmap["episodes"][str(n)] = c["canonical"]
            new_episode = True
        comic_files.append((path, soup))

    for path, soup in comic_files:
        if fix_episode_links(soup, cmap["episodes"]):
            write_page(path, soup)
            print(f"  四格链接已修复：{path.name}")

    if new_episode:
        fix_collections(cmap)
        save_json(COMIC_MAP_JSON, cmap)

    if TOPICS_FILE.exists():
        tsoup = parse_file(TOPICS_FILE)
        if decompose_episode_headings(tsoup):
            write_page(TOPICS_FILE, tsoup)
            print("  Topics.html 中的单话 heading 已移除")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild-map", action="store_true")
    args = ap.parse_args()
    if args.rebuild_map:
        rebuild_map()
    else:
        process_changes()


if __name__ == "__main__":
    main()
