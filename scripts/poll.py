# -*- coding: utf-8 -*-
"""轮询入口：RSS 比对判定（--check）、执行抓取（--execute）、初始化（--seed）。"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from common import (
    CHANGES_JSON,
    HEADERS,
    HTML_DIR,
    RSS_URL,
    SITE,
    TOPICS_FILE,
    load_manifest,
    load_state,
    load_versions,
    now_utc_iso,
    parse_file,
    pubdate_to_jst,
    save_json,
    save_state,
    save_versions,
)
from crawler import (
    crawl_new,
    find_canonical,
    recent_ids,
    recrawl,
    stage_r2_assets,
    update_version_selects,
)

CRON_HOURLY = "5 * * * *"
CRON_QUARTER = "20,35,50 * * * *"
CRON_DAILY = "5 7 * * *"  # 16:05 JST 安全网
WINDOW_HOURS = 5
WINDOW_IDS = 40


def fetch_rss():
    resp = requests.get(RSS_URL, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "xml")
    items = []
    for it in soup.find_all("item"):
        link = it.find("link").get_text(strip=True)
        slug = urlparse(link).path.rstrip("/").rsplit("/", 1)[-1]
        pubdate_raw = it.find("pubDate").get_text(strip=True)
        items.append({
            "slug": slug,
            "title": it.find("title").get_text(strip=True),
            "link": link,
            "pubdate_raw": pubdate_raw,
            "jst_ts": pubdate_to_jst(pubdate_raw),
        })
    return items


def gh_output(name, value):
    line = f"{name}={value}"
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    print(f"OUTPUT: {line}")


def rss_has_change(state, rss_items):
    for it in rss_items:
        known = state["rss"].get(it["slug"])
        if known is None:
            print(f"  新 slug：{it['slug']}")
            return True
        if known.get("pubDate") != it["pubdate_raw"]:
            print(f"  pubDate 变化：{it['slug']}")
            return True
    return False


def in_change_window(state):
    if not state.get("last_change_at"):
        return False
    last = datetime.fromisoformat(state["last_change_at"])
    return datetime.now(timezone.utc) - last < timedelta(hours=WINDOW_HOURS)


def do_check(schedule, dispatch):
    state = load_state()
    if state["latest_id"] is None:
        print("state.json 未初始化，请先运行 --seed")
        gh_output("mode", "none")
        return
    if dispatch == "window" or schedule == CRON_DAILY:
        gh_output("mode", "window")
        return
    if schedule == CRON_QUARTER and not in_change_window(state):
        print("不在 5h 加密轮询窗口内，跳过")
        gh_output("mode", "none")
        return
    rss_items = fetch_rss()
    gh_output("mode", "rss" if rss_has_change(state, rss_items) else "none")


def change_for(num, versions, change_type):
    entry = versions[str(num)]
    canonical = entry["canonical"]
    title = ""
    soup = parse_file(HTML_DIR / canonical)
    a = soup.find("a", class_="title_text")
    if a:
        title = a.get_text(strip=True)
    return {
        "id": num, "type": change_type, "title": title,
        "canonical": canonical, "ts": entry["versions"][-1]["ts"],
        "slug": entry.get("slug"),
        "url_official": f"{SITE}/topics/{num}",
        "mirror": f"html/{canonical}",
    }


def window_recrawl(versions, r2_needed, rss_ts_by_id):
    changes = []
    for num in recent_ids(WINDOW_IDS):
        status = recrawl(num, versions, r2_needed, rss_ts=rss_ts_by_id.get(num))
        if status == "edit":
            changes.append(change_for(num, versions, "edit"))
    return changes


def do_execute(mode):
    state = load_state()
    versions = load_versions()
    manifest = load_manifest()
    rss_items = fetch_rss()
    r2_needed = set()
    changes = []
    need_window = (mode == "window")

    # 1) 新 slug → 增量爬新 id
    if any(it["slug"] not in state["rss"] for it in rss_items):
        new_changes = crawl_new(state, versions, rss_items, r2_needed)
        for c in new_changes:
            changes.append({**c,
                            "url_official": f"{SITE}/topics/{c['id']}",
                            "mirror": f"html/{c['canonical']}"})
        # 爬完仍未匹配上的 slug 记为 id 未知，防止每轮重复触发全量扫描
        for it in rss_items:
            if it["slug"] not in state["rss"]:
                state["rss"][it["slug"]] = {"pubDate": it["pubdate_raw"], "id": None}
                need_window = True

    # 2) 已知 slug 的 pubDate 变化 → 定向重爬
    rss_ts_by_id = {}
    for it in rss_items:
        known = state["rss"].get(it["slug"])
        if not known:
            continue
        if known.get("id"):
            rss_ts_by_id[known["id"]] = it["jst_ts"]
        if known.get("pubDate") == it["pubdate_raw"]:
            continue
        num = known.get("id")
        if num:
            status = recrawl(num, versions, r2_needed,
                             rss_ts=it["jst_ts"], rss_ts_source="rss")
            if status == "edit":
                changes.append(change_for(num, versions, "edit"))
        else:
            need_window = True
        known["pubDate"] = it["pubdate_raw"]

    # 3) 滑窗重爬（安全网 / 无法定向时）
    if need_window:
        edited = {c["id"] for c in changes}
        for c in window_recrawl(versions, r2_needed, rss_ts_by_id):
            if c["id"] not in edited:
                changes.append(c)

    for c in changes:
        update_version_selects(c["id"], versions)

    staged = stage_r2_assets(r2_needed, manifest)
    if changes:
        state["last_change_at"] = now_utc_iso()
    save_json(CHANGES_JSON, {"generated_at": now_utc_iso(), "changes": changes})
    save_state(state)
    save_versions(versions)
    print(f"完成：{len(changes)} 条变化，{len(staged)} 个新媒体进入 r2-staging")


def do_seed():
    state = load_state()
    versions = load_versions()
    manifest = load_manifest()

    tsoup = parse_file(TOPICS_FILE)
    container = tsoup.find(class_="news_container")
    state["latest_id"] = int(container["latest-id"])
    print(f"latest_id = {state['latest_id']}")

    # 用最近 60 个本地页的标题给 RSS item 建 slug↔id 映射
    rss_items = fetch_rss()
    titles = {}
    for num in recent_ids(60):
        canonical = find_canonical(num)
        soup = parse_file(HTML_DIR / canonical)
        a = soup.find("a", class_="title_text")
        if a:
            titles.setdefault(a.get_text(strip=True), num)
    rss_ts_by_id = {}
    for it in rss_items:
        num = titles.get(it["title"].strip())
        state["rss"][it["slug"]] = {"pubDate": it["pubdate_raw"], "id": num}
        if num:
            rss_ts_by_id[num] = it["jst_ts"]
        print(f"  {it['slug']} → id {num}")

    # 最近 40 id 重爬：补 hash、捕获存档期间漏掉的编辑
    r2_needed = set()
    changes = window_recrawl(versions, r2_needed, rss_ts_by_id)
    for c in changes:
        update_version_selects(c["id"], versions)
    staged = stage_r2_assets(r2_needed, manifest)

    if changes:
        state["last_change_at"] = now_utc_iso()
    save_json(CHANGES_JSON, {"generated_at": now_utc_iso(), "changes": changes})
    save_state(state)
    save_versions(versions)
    print(f"seed 完成：{len(changes)} 条编辑被捕获，{len(staged)} 个媒体待上传")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--execute", action="store_true")
    g.add_argument("--seed", action="store_true")
    ap.add_argument("--schedule", default="")
    ap.add_argument("--dispatch", default="")
    ap.add_argument("--mode", default="rss", choices=["rss", "window"])
    args = ap.parse_args()

    if args.check:
        do_check(args.schedule, args.dispatch)
    elif args.execute:
        do_execute(args.mode)
    else:
        do_seed()


if __name__ == "__main__":
    main()
