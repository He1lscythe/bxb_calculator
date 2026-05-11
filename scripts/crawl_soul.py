#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Altema BxB ソウル 全量爬虫 + 技能分类 一体化脚本

用法:
  python crawl_soul.py              # 增量爬取，跳过已处理
  python crawl_soul.py --rerun      # 全量重新爬取

流程: 爬取 → 技能分类(bunrui/scope/condition) → 倍率标注(bairitu) → souls.json
"""

import argparse
import requests
from bs4 import BeautifulSoup
import json
import re
import time
import os
import copy
import html as htmlmod

from classify_common import (
    ELEMENT_MAP, WEAPON_TYPE_MAP,
    CAT_TO_BUNRUI_SOULSKILL,
    ADD_BUNRUI,
    classify_effect, classify_skill_v2,
    classify_hit_fields,
    norm as _norm_common,
)

# ============================================================
#  CONFIG
# ============================================================
BASE_URL       = "https://altema.jp"
SOULLIST_URL   = "https://altema.jp/bxb/soullist"
OUTPUT_FILE    = "souls.json"
PROGRESS_FILE  = "soul_progress.json"
REQUEST_DELAY  = 2.0

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
    "Referer":         "https://altema.jp/bxb/soullist",
}

ELEMENTS = ['火', '水', '風', '光', '闇', '無']
WEAPONS  = ['長剣', '大剣', '太刀', '杖棒', '弓矢', '連弩', '戦斧', '騎槍', '投擲', '拳闘', '魔典', '大鎌']

AFFINITY_TEXT = {
    '超苦手': -2,
    '苦手':   -1,
    '普通':    0,
    '得意':    1,
    '超得意':  2,
}


# ============================================================
#  I/O HELPERS
# ============================================================
def load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================================
#  CRAWL — network
# ============================================================
def fetch_page(session, url, max_retries=3):
    for attempt in range(max_retries):
        try:
            resp = session.get(url, headers=HEADERS, timeout=30, allow_redirects=True)
            resp.raise_for_status()
            return resp
        except requests.exceptions.RequestException as e:
            print(f"  request failed (attempt {attempt+1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
    return None


# ============================================================
#  SOULLIST — parse list page
# ============================================================
def get_soul_list(session):
    print("Fetching soul list...")
    resp = fetch_page(session, SOULLIST_URL)
    if not resp:
        raise RuntimeError("Cannot fetch soul list")
    soup  = BeautifulSoup(resp.text, "html.parser")
    rows  = soup.find_all("tr", attrs={"data-soul": True})
    souls = []
    for row in rows:
        raw = htmlmod.unescape(row.get("data-soul", "{}"))
        try:
            d = json.loads(raw)
        except json.JSONDecodeError:
            continue
        soul_id = d.get("id")
        if not soul_id:
            continue
        souls.append({
            "id":    soul_id,
            "name":  d.get("name", ""),
            "kana":  d.get("kana", ""),
            "class": d.get("class"),
            "url":   f"{BASE_URL}/bxb/soul/{soul_id}",
        })
    print(f"Found {len(souls)} souls in list")
    return souls


# ============================================================
#  SOUL DETAIL — parse detail page
# ============================================================
def _parse_affinity_table(table, keys):
    """Parse element or weapon affinity table.
    Structure alternates: row of <th> keys, then row of <td> values."""
    result = {}
    key_row = None
    for row in table.find_all("tr"):
        ths = row.find_all("th")
        tds = row.find_all("td")
        if ths and not tds:
            key_row = [th.get_text(strip=True) for th in ths]
        elif tds and key_row:
            val_row = [td.get_text(strip=True) for td in tds]
            for k, v in zip(key_row, val_row):
                if k in keys:
                    result[k] = {"level": AFFINITY_TEXT.get(v, 0)}
            key_row = None
    # fill missing keys with default 普通
    for k in keys:
        if k not in result:
            result[k] = {"level": 0}
    return result


def _parse_skills_table(table):
    """Parse skill list from スキル構成 table.
    Each <td> has 【skill name】<br>effect text."""
    skills = []
    for tr in table.find_all("tr"):
        td = tr.find("td")
        if not td:
            continue
        # Replace <br> with newline sentinel before get_text
        for br in td.find_all("br"):
            br.replace_with("\n")
        # Do NOT use strip=True — it collapses newlines
        parts = [p.strip() for p in td.get_text().split("\n") if p.strip()]
        name   = parts[0] if parts else ""
        effect = parts[1] if len(parts) > 1 else ""
        if name or effect:
            skills.append({"name": name, "effect_text": effect})
    return skills


def get_soul_detail(session, soul_id, url):
    resp = fetch_page(session, url)
    if not resp:
        return None
    soup = BeautifulSoup(resp.text, "html.parser")
    detail = {}

    # ── name from h2 "XXXの基本情報" ──
    for h2 in soup.find_all("h2"):
        t = h2.get_text(strip=True)
        if "の基本情報" in t:
            detail["name"] = t.replace("の基本情報", "").strip()
            break

    # ── basic info: stars, max_level ──
    for h in soup.find_all(["h2", "h3"]):
        if "基本情報" in h.get_text():
            tbl = h.find_next_sibling("table")
            if tbl:
                # table has th/td pairs: クラス | ★... | 最大レベル | 50
                cells = tbl.find_all(["th", "td"])
                i = 0
                while i < len(cells) - 1:
                    k = cells[i].get_text(strip=True)
                    v = cells[i + 1].get_text(strip=True)
                    if k == "クラス":
                        detail["rarity"] = v.count("★")
                    elif k == "最大レベル":
                        try:
                            detail["max_level"] = int(v)
                        except ValueError:
                            detail["max_level"] = None
                    i += 1
            break

    # ── element affinity ──
    for h in soup.find_all(["h2", "h3"]):
        if "属性相性" in h.get_text():
            tbl = h.find_next_sibling("table")
            if tbl:
                detail["element_affinity"] = _parse_affinity_table(tbl, ELEMENTS)
            break

    # ── weapon affinity ──
    for h in soup.find_all(["h2", "h3"]):
        if "得意武器" in h.get_text():
            tbl = h.find_next_sibling("table")
            if tbl:
                detail["weapon_affinity"] = _parse_affinity_table(tbl, WEAPONS)
            break

    # ── skills ──
    detail["skills"] = []
    for h in soup.find_all(["h2", "h3"]):
        if "スキル構成" in h.get_text():
            tbl = h.find_next_sibling("table")
            if tbl:
                detail["skills"] = _parse_skills_table(tbl)
            break

    # ── acquisition ──
    detail["acquisition"] = {}
    for h in soup.find_all(["h2", "h3"]):
        if "入手" in h.get_text():
            tbl = h.find_next_sibling("table")
            if tbl:
                for row in tbl.find_all("tr"):
                    cells = row.find_all(["th", "td"])
                    if len(cells) >= 2:
                        k = cells[0].get_text(strip=True)
                        v = cells[1].get_text(strip=True)
                        if k:
                            detail["acquisition"][k] = v
            break

    return detail


# ============================================================
#  BAIRITU — soul skill multiplier extraction (soul-specific)
# ============================================================
MULT_BUNRUI = {1, 2, 3, 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 20}

_MAX_BAI     = re.compile(r'最大(\d+(?:\.\d+)?)倍')
_PLAIN_BAI   = re.compile(r'(\d+(?:\.\d+)?)倍')
_PLUS_N      = re.compile(r'[+＋](\d+(?:\.\d+)?)')
_OKU_UP      = re.compile(r'が(\d+(?:\.\d+)?)億アップ')
_MAN_UP      = re.compile(r'が(\d+(?:\.\d+)?)万アップ')
_PCT_UP_GA   = re.compile(r'が(\d+(?:\.\d+)?)%アップ')
_PCT_UP_ANY  = re.compile(r'(\d+(?:\.\d+)?)%UP')   # soul-style: "77%UP"
_PLAIN_UP    = re.compile(r'が(\d+(?:\.\d+)?)アップ')


def _norm(effect):
    return _norm_common(effect)


def _extract_bairitu(effect, bunrui):
    base = effect[:effect.index('【熟度')] if '【熟度' in effect else effect

    m = _MAX_BAI.search(base)
    if m:
        return float(m.group(1))

    is_add = any(b in ADD_BUNRUI for b in bunrui)
    if is_add:
        m = _OKU_UP.search(base)
        if m:
            return float(m.group(1)) * 100_000_000
        m = _MAN_UP.search(base)
        if m:
            return float(m.group(1)) * 10_000
        m = _PCT_UP_GA.search(base)
        if m:
            return round(1 + float(m.group(1)) / 100, 6)
        m = _PLAIN_UP.search(base)
        if m:
            return float(m.group(1))
        m = _PLUS_N.search(base)
        if m:
            return float(m.group(1))

    m = _PLAIN_BAI.search(base)
    if m:
        return float(m.group(1))

    # soul-specific: "77%UP" without が
    m = _PCT_UP_ANY.search(base)
    if m:
        return round(1 + float(m.group(1)) / 100, 6)

    return None


def _bairitu_default(bunrui):
    if not bunrui:
        return 1
    for b in bunrui:
        if b in ADD_BUNRUI:
            return 0
    return 1


def assign_bairitu(skill):
    effect = _norm(skill.get('effect_text', ''))
    effects = skill.get('effects', [])
    bunrui  = effects[0].get('bunrui', []) if effects else []

    v = _extract_bairitu(effect, bunrui)
    bairitu = v if v is not None else _bairitu_default(bunrui)
    return bairitu


# classify_skill_v2 and all lookup/keyword logic imported from classify_common


# ============================================================
#  PIPELINE
# ============================================================


def apply_pipeline(souls, soul_ids=None):
    """Classify skills and assign bairitu.
    soul_ids: set of soul IDs to process; None means process all souls."""
    table_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '_lookup', 'soulskill_table.json')
    soulskill_table = {}
    if os.path.exists(table_path):
        with open(table_path, encoding='utf-8') as f:
            soulskill_table = json.load(f)
    else:
        print("Warning: soulskill_table.json not found, using keyword scan only")

    count = 0
    for soul in souls:
        if soul_ids is not None and soul['id'] not in soul_ids:
            continue
        for skill in soul.get('skills', []):
            classify_skill_v2(skill, soulskill_table, CAT_TO_BUNRUI_SOULSKILL)
            eff_text = skill.get('effect_text', '')
            for ent in skill.get('effects', []):
                classify_hit_fields(eff_text, ent)
        count += 1
    return souls, count


# ============================================================
#  MAIN
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="Altema BxB ソウル Crawler + Classifier")
    parser.add_argument("--rerun", action="store_true", help="Re-scrape all souls from scratch")
    parser.add_argument("--recal", action="store_true", help="Recalculate skill classification for all souls without re-scraping")
    args = parser.parse_args()

    if args.rerun:
        mode = "FULL RERUN"
    elif args.recal:
        mode = "incremental crawl + RECALCULATE ALL"
    else:
        mode = "incremental"
    print("=" * 60)
    print("Altema BxB ソウル Crawler + Skill Classifier")
    print("Mode:", mode)
    print("=" * 60)

    project_root  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir       = os.path.join(project_root, 'data')
    os.makedirs(out_dir, exist_ok=True)
    output_path   = os.path.join(out_dir, OUTPUT_FILE)
    progress_path = os.path.join(out_dir, PROGRESS_FILE)

    if args.rerun:
        completed = set()
        souls     = []
        if os.path.exists(progress_path):
            os.remove(progress_path)
    else:
        progress  = load_json(progress_path, {"completed_ids": []})
        completed = set(progress["completed_ids"])
        souls     = load_json(output_path, [])

    soul_index = {s["id"]: i for i, s in enumerate(souls)}
    print(f"Already saved: {len(souls)} souls")

    session = requests.Session()

    try:
        soul_list = get_soul_list(session)
        pending   = soul_list if args.rerun else [s for s in soul_list if s["id"] not in completed]
        print(f"Pending: {len(pending)}")

        updated_ids = set()
        for i, item in enumerate(pending):
            sid  = item["id"]
            url  = item["url"]
            name = item["name"]
            print(f"\n[{i+1}/{len(pending)}] {name} ({url})")
            try:
                detail = get_soul_detail(session, sid, url)
                if detail is None:
                    print("  failed to fetch, skipping")
                    continue

                record = {
                    "id":          sid,
                    "name":        detail.get("name") or name,
                    "kana":        item.get("kana", ""),
                    "rarity":      detail.get("rarity"),
                    "max_level":   detail.get("max_level"),
                    "url":         url,
                    "image":       f"https://img.altema.jp/bxb/soul/banner/{sid}.jpg",
                    "element": sorted([ELEMENT_MAP[k] for k, v in detail.get("element_affinity", {}).items() if v.get("level", 0) >= 1]),
                    "type":    sorted([WEAPON_TYPE_MAP[k] for k, v in detail.get("weapon_affinity", {}).items() if v.get("level", 0) >= 1]),
                    "element_affinity": detail.get("element_affinity", {}),
                    "weapon_affinity":  detail.get("weapon_affinity", {}),
                    "skills":      detail.get("skills", []),
                    "acquisition": detail.get("acquisition", {}),
                }

                if sid in soul_index:
                    souls[soul_index[sid]] = record
                else:
                    soul_index[sid] = len(souls)
                    souls.append(record)

                updated_ids.add(sid)
                completed.add(sid)
                save_json(progress_path, {"completed_ids": list(completed)})
                save_json(output_path, souls)
                print(f"  saved: {len(record['skills'])} skills")
                time.sleep(REQUEST_DELAY)

            except requests.exceptions.HTTPError as e:
                code = e.response.status_code
                if code in (429, 403):
                    print(f"\nRate limited (HTTP {code}). Saving and stopping.")
                    save_json(progress_path, {"completed_ids": list(completed)})
                    save_json(output_path, souls)
                    print(f"Progress saved. Completed: {len(completed)}")
                    return
                raise
            except Exception as e:
                print(f"  error: {e}")
                save_json(progress_path, {"completed_ids": list(completed)})
                save_json(output_path, souls)
                raise

        # ── Phase 2: classify + bairitu ──
        pipeline_ids = None if (args.rerun or args.recal) else updated_ids
        scope_label  = "all" if pipeline_ids is None else f"{len(pipeline_ids)} updated"
        print("\n" + "=" * 60)
        print(f"Applying skill classification and bairitu ({scope_label})...")
        output, count = apply_pipeline(copy.deepcopy(souls), pipeline_ids)

        # NOTE: souls_revise.json は recal 時に souls.json に merge しない。
        # souls.json は純粋な parser 出力として保ち、revise は frontend (soul.html /
        # hensei.html) がランタイムで deepApply する。
        # 旧実装は recal で revise を souls.json に焼き込んでいたが、これだと souls.json
        # が手動編集データで汚染される（編集を削っても次の recal まで残る、source-of-truth が
        # 不明確になる）ため除去した。

        # Fill in any effects entries still missing calc_type
        for soul in output:
            for sk in soul.get('skills', []):
                for ent in sk.get('effects', []):
                    if 'calc_type' not in ent:
                        b_list = ent.get('bunrui', [])
                        ent['calc_type'] = 1 if any(b in ADD_BUNRUI for b in b_list) else 0

        save_json(output_path, output)
        print(f"Done! {len(output)} souls saved to {OUTPUT_FILE} ({count} recalculated)")

    except KeyboardInterrupt:
        print("\nInterrupted. Saving progress...")
        save_json(progress_path, {"completed_ids": list(completed)})
        save_json(output_path, souls)
        print(f"Saved {len(completed)} completed, {len(souls)} souls.")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
