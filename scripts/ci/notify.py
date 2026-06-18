# -*- coding: utf-8 -*-
"""notify.py — update-database 的 Telegram 通知(经 Telegraph 文章)。

mode=master_data : 最新 master_data/<date>/changelog.md → Telegraph 文章 → 发链接到频道
mode=asset_version: asset delta 图(B3,另见 notify_assets)

env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BXB_MASTER_TABLES(_mt worktree)
未配 TG secret 时静默跳过、不报错。Telegraph 用匿名账号 createPage(无需 token secret)。
"""
import json
import os
import re
import sys
from pathlib import Path

import requests

TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID")
_MT = os.environ.get("BXB_MASTER_TABLES")
MT = Path(_MT) if _MT else None


def tg(method, **payload):
    r = requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/{method}", json=payload, timeout=30)
    return r.json()


def telegraph_page(title, nodes):
    """匿名建号 + 建页,返回公开 URL。"""
    acc = requests.post("https://api.telegra.ph/createAccount",
                        data={"short_name": "bxb", "author_name": "BxB Bot"}, timeout=20).json()
    token = acc["result"]["access_token"]
    r = requests.post("https://api.telegra.ph/createPage", data={
        "access_token": token,
        "title": title[:256],
        "author_name": "BxB Bot",
        "content": json.dumps(nodes, ensure_ascii=False),
        "return_content": "false",
    }, timeout=30).json()
    if not r.get("ok"):
        raise RuntimeError(f"telegraph createPage 失败: {r.get('error')}")
    return r["result"]["url"]


def _clean(s):
    # [`113003`](weapons.json#L52768) → 113003 ; 去反引号(Telegraph pre 里链接无效)
    s = re.sub(r"\[`?([^`\]]+)`?\]\([^)]+\)", r"\1", s)
    return s.replace("`", "")


def changelog_to_nodes(md):
    """changelog.md → (title, Telegraph 节点)。每个 ## 段 → h4 标题 + pre 正文(等宽、保排版)。"""
    lines = md.splitlines()
    title = "master_data changelog"
    body = []
    for ln in lines:
        if ln.startswith("# ") and not ln.startswith("## "):
            title = ln[2:].strip()
        else:
            body.append(ln)
    sections, h, cur = [], None, []
    for ln in body:
        if ln.startswith("## "):
            sections.append((h, cur))
            h, cur = ln[3:].strip(), []
        else:
            cur.append(ln)
    sections.append((h, cur))
    nodes = []
    for h, b in sections:
        if h:
            nodes.append({"tag": "h4", "children": [h]})
        text = "\n".join(_clean(x) for x in b).strip("\n")
        if text:
            nodes.append({"tag": "pre", "children": [text]})
    return title, nodes


def latest_md_folder():
    base = MT / "master_data"
    fs = sorted(p for p in base.iterdir() if p.is_dir() and re.match(r"\d{4}_\d{2}_\d{2}", p.name))
    return fs[-1] if fs else None


def notify_master_data():
    folder = latest_md_folder()
    cl = (folder / "changelog.md") if folder else None
    if not cl or not cl.is_file():
        print("无 changelog、跳过")
        return
    title, nodes = changelog_to_nodes(cl.read_text(encoding="utf-8"))
    url = telegraph_page(title, nodes)
    msg = f"📊 master_data 更新 {folder.name}\n{url}"
    j = tg("sendMessage", chat_id=TG_CHAT, text=msg, disable_web_page_preview=False)
    print("master_data 通知:", "ok" if j.get("ok") else j.get("description"), "|", url)


def main():
    if not TG_TOKEN or not TG_CHAT:
        print("未配置 TELEGRAM secret、跳过通知")
        return
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "master_data":
        notify_master_data()
    else:
        print(f"未知 mode: {mode!r}")


if __name__ == "__main__":
    main()
