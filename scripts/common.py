# -*- coding: utf-8 -*-
"""BxB 公告归档流水线共享工具。"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

from bs4 import BeautifulSoup

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# 测试时可用 BXB_ROOT 指向沙箱目录
ROOT = Path(os.environ.get("BXB_ROOT") or Path(__file__).resolve().parent.parent)
HTML_DIR = ROOT / "html"
STATE_DIR = ROOT / "state"
R2_STAGING = ROOT / "r2-staging"

TOPICS_FILE = ROOT / "Topics.html"
BLANK_FILE = ROOT / "blank.html"

STATE_JSON = STATE_DIR / "state.json"
VERSIONS_JSON = STATE_DIR / "versions.json"
COMIC_MAP_JSON = STATE_DIR / "comic_map.json"
R2_MANIFEST = STATE_DIR / "r2_manifest.txt"
CHANGES_JSON = STATE_DIR / "changes.json"
MISSING_VIDEOS = STATE_DIR / "missing_videos.txt"

SITE = "https://bxb.grimoire.codes"
RSS_URL = SITE + "/topics/feed.rss"
OFFICIAL_BXB_ASSET = "https://bxb-asset.grimoire.codes"
OFFICIAL_GRIMOIRE = "https://grimoire.co"

# R2 公开访问地址，如 https://pub-xxxx.r2.dev（结尾不带斜杠）
R2_PUBLIC = os.environ.get("R2_PUBLIC_BASE_URL", "").rstrip("/")

JST = timezone(timedelta(hours=9))

# 官方站不带这些头会 404
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) "
        "Gecko/20100101 "
        "Firefox/138.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://bxb.grimoire.codes/",
}

COMIC_EPISODE_RE = re.compile(r"【四コマ】第\s*(\d+)\s*話")


def body_hash(raw_html):
    """原始抓取页 <body> 的归一化 sha256。csrf-token 只在 <head>，body 稳定。"""
    body = BeautifulSoup(raw_html, "lxml").body
    text = re.sub(r"\s+", " ", str(body))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_json(path, default):
    if Path(path).exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default() if callable(default) else default


def save_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_state():
    return load_json(STATE_JSON, lambda: {"latest_id": None, "last_change_at": None, "rss": {}})


def save_state(state):
    save_json(STATE_JSON, state)


def load_versions():
    return load_json(VERSIONS_JSON, dict)


def save_versions(versions):
    save_json(VERSIONS_JSON, versions)


def load_manifest():
    if R2_MANIFEST.exists():
        with open(R2_MANIFEST, "r", encoding="utf-8") as f:
            return set(line.strip() for line in f if line.strip())
    return set()


def append_manifest(keys):
    R2_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    existing = load_manifest()
    merged = sorted(existing | set(keys))
    with open(R2_MANIFEST, "w", encoding="utf-8") as f:
        f.write("\n".join(merged) + "\n")


def pubdate_to_jst(pubdate_raw):
    """RFC822 pubDate → 'yyyy/mm/dd hh:mm:ss'（JST）。"""
    dt = parsedate_to_datetime(pubdate_raw).astimezone(JST)
    return dt.strftime("%Y/%m/%d %H:%M:%S")


def now_jst_str():
    return datetime.now(JST).strftime("%Y/%m/%d %H:%M:%S")


def now_utc_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ts_compact(ts_str):
    """'2026/06/10 17:03:21' → '20260610170321'（用于版本文件名）。"""
    return re.sub(r"[/ :]", "", ts_str)


def canonical_name(num, yyyymmdd):
    return f"{num:05d}_{yyyymmdd}.html"


def version_name(canonical, ts_str):
    """'04716_20260610.html' + ts → '04716_20260610_v20260610150000.html'"""
    return canonical[:-5] + "_v" + ts_compact(ts_str) + ".html"


def write_page(path, soup):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(str(soup.prettify()))


def parse_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return BeautifulSoup(f.read(), "lxml")
