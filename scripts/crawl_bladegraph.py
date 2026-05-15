#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Altema BxB ブレードグラフ (Heart Crystal) crawler

用法:
  python crawl_bladegraph.py          # 增量：只添加 bladegraphs.json 中没有的新 ID
  python crawl_bladegraph.py --recal  # 全量重新解析（重新抓页面）
  python crawl_bladegraph.py --rerun  # 同上（接口一致用）
"""

import argparse
import json
import re
import time
import os
import html as htmlmod

import requests
from bs4 import BeautifulSoup

from classify_common import classify_effect, _V_PCT_UP, _V_PCT_DOWN

# ============================================================
#  CONFIG
# ============================================================
PAGE_URL      = "https://altema.jp/bxb/bladegraph"
OUTPUT_FILE   = "bladegraphs.json"
REQUEST_DELAY = 2.0

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT       = os.path.dirname(SCRIPT_DIR)
DATA_DIR   = os.path.join(ROOT, 'data')

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
    "Referer":         "https://altema.jp/bxb/",
}

# ============================================================
#  BUNRUI MAPPING  (Altema bunrui ID → internal bunrui ID)
# ============================================================
ALTEMA_BUNRUI_MAP = {
    1:  1,   # 攻撃力
    2:  12,  # 防御力
    3:  4,   # スピード
    4:  10,  # HP
    5:  15,  # ルビー
    6:  14,  # サファイア
    7:  5,   # モーション速度
    8:  3,   # BD攻撃力
    9:  20,  # 魔剣使いEXP
    10: 2,   # ブレイク力
    11: 20,  # ソウルEXP
    12: 19,  # 記憶結晶EXP
    13: 19,  # 記憶結晶EXP
}

# ============================================================
#  ELEMENT / WEAPON KEYWORD TABLES (for scope detection)
# ============================================================
ELEMENT_NAMES = {'火', '水', '風', '光', '闇', '無'}
WEAPON_NAMES  = {
    '長剣', '大剣', '太刀', '杖棒', '弓矢', '連弩',
    '戦斧', '騎槍', '投擲', '拳闘', '魔典', '大鎌',
}

# zokusei index → element name (for dc['zokusei'] scope mapping)
ZOKUSEI_ELEM_MAP = {1: '火', 2: '水', 3: '風', 4: '光', 5: '闇', 6: '無'}

# weapon type string → internal scope code
# scope = 3 + weapon index  (using same ordering as weapon list)
WEAPON_TYPE_LIST = ['長剣', '大剣', '太刀', '杖棒', '弓矢', '連弩',
                    '戦斧', '騎槍', '投擲', '拳闘', '魔典', '大鎌']

# ============================================================
#  NETWORK
# ============================================================
def fetch_page(url, max_retries=3):
    session = requests.Session()
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
#  PARSE  —  second <td> text sections
# ============================================================
def parse_second_td(td):
    """Parse the second <td> which contains sections separated by <hr>.

    The td has inline 【label】 tags mixed with content. Structure after splitting by <hr>:
      section 0: 【name】【レア度】★N  (ignored, taken from data-contents)
      section 1: 【効果】<effect text>  [+【発動条件】... line]
      section 2: 【入手方法】<newline><nyushu text>
      section 3: 【イラスト】<illustrator>  (optional)

    Returns dict with keys: effect, nyushu, illustrator (may be absent).
    """
    # Replace <hr> with a unique sentinel so we can split on it
    SENTINEL = "\x00HR\x00"
    for hr in td.find_all("hr"):
        hr.replace_with(SENTINEL)

    full_text = td.get_text("\n")
    sections  = [s.strip() for s in full_text.split(SENTINEL)]

    def strip_labels(text):
        """Remove known 【label】 prefixes; preserve restriction brackets like 【〇〇のみ】."""
        return _KNOWN_LABELS_RE.sub('', text).strip()

    result = {}

    # Section 1: effect (+ optional 発動条件)
    if len(sections) >= 2:
        raw = sections[1].strip()
        lines = [l.strip() for l in raw.split("\n") if l.strip()]
        effect_parts = []
        for line in lines:
            # Skip 発動条件 lines (time/condition info already in data-contents)
            if '【発動条件】' in line or line.startswith('発動条件'):
                continue
            cleaned = strip_labels(line)
            if cleaned:
                effect_parts.append(cleaned)
        result["effect_text"] = " ".join(effect_parts).strip()

    # Section 2: acquisition
    if len(sections) >= 3:
        raw = sections[2].strip()
        lines = [l.strip() for l in raw.split("\n") if l.strip()]
        acq_parts = []
        for line in lines:
            cleaned = strip_labels(line)
            if cleaned:
                acq_parts.append(cleaned)
        result["acquisition"] = " ".join(acq_parts).strip()

    # Section 3: illustrator (optional)
    if len(sections) >= 4:
        raw = sections[3].strip()
        lines = [l.strip() for l in raw.split("\n") if l.strip()]
        illust_parts = []
        for line in lines:
            cleaned = strip_labels(line)
            if cleaned:
                illust_parts.append(cleaned)
        v = " ".join(illust_parts).strip()
        if v:
            result["illustrator"] = v

    return result


# ============================================================
#  EFFECT PARSING
# ============================================================
_KNOWN_LABELS_RE = re.compile(r'【(?:効果|発動条件|入手方法|イラスト|レア度)】')

_SCOPE_BRACKET_RE = re.compile(
    r'[【\[](.+?)のみ[】\]]'  # 【〇〇のみ】 or [〇〇のみ]
    r'|'
    r'[（(](.+?)のみ[）)]'   # （〇〇のみ） or (〇〇のみ)
)

# 「装備セット全体」/「セット全体」等关键词 → 单段 effect 强制 scope=1（覆盖 element/weapon 限制）
_SET_WHOLE_RE = re.compile(r'(?:装備)?セット全[体員]')


def detect_scope(dc, effect_text):
    """Determine scope and restriction metadata.

    Returns (scope, element_val, type_val, char_name):
      scope=0: no restriction
      scope=1: 装備セット全体（即在 parse_effects 里按段判定后覆盖）
      scope=3: element or weapon restriction → element_val (int) or type_val (int or [int,...])
      scope=5: character name restriction → char_name (str)
    """
    types_raw = dc.get('type', [])
    zokusei_raw = dc.get('zokusei', 0)
    zokusei = zokusei_raw[0] if isinstance(zokusei_raw, list) else zokusei_raw

    if types_raw:
        type_ints = [int(t) for t in types_raw]
        if len(type_ints) == 1:
            return 3, None, type_ints[0], None
        else:
            return 0, None, None, None  # multiple weapon types → wiki error, treat as unrestricted

    if zokusei and zokusei != 0:
        return 3, zokusei, None, None

    # Check bracket pattern for character name
    for m in _SCOPE_BRACKET_RE.finditer(effect_text):
        inner = (m.group(1) or m.group(2) or "").strip()
        if not inner:
            continue
        if inner in ELEMENT_NAMES or inner in WEAPON_NAMES:
            continue
        return 5, None, None, inner

    return 0, None, None, None


# 与 classify_common.py / crawl_crystal.py 保持一致
_HUSHIN_BG = re.compile(r'残(?:り)?HP(?:が)?多いほど|HP残量が多いほど|損傷率が低いほど')
_HAISUI_BG = re.compile(r'残(?:り)?HP(?:が)?(?:少な|低)いほど|HP残量が少ないほど|HPが(?:少な|低)いほど|損傷率が高いほど|HPを?消耗するほど')
_BROKEN_BG = re.compile(r'破損状態')
_BK_TRIG_BG = re.compile(r'敵ブレイク状態|敵がブレイク(?:時|状態|中)|(?<!ガード)ブレイク時')


def detect_condition(segment):
    """0=none, 1=浑身, 2=背水, 3=破損, 4=敵BK時"""
    if _BROKEN_BG.search(segment):  return 3
    if _HUSHIN_BG.search(segment):  return 1
    if _HAISUI_BG.search(segment):  return 2
    if _BK_TRIG_BG.search(segment): return 4
    return 0


def extract_bairitu(segment):
    """Return (bairitu_float, calc_type). All bladegraph effects are calc_type=0.
    Uses _V_PCT_UP/_V_PCT_DOWN from classify_common (handles both 半角 % and 全角 ％)."""
    m = _V_PCT_UP.search(segment)
    if m:
        return round(1 + float(m.group(1)) / 100, 6), 0
    m = _V_PCT_DOWN.search(segment)
    if m:
        return round(1 - float(m.group(1)) / 100, 6), 0
    return 1.0, 0


def match_bunrui_in_seg(segment):
    """Return list of internal bunrui IDs for a single effect segment.
    Delegates to classify_common.classify_effect (shared with chara/soul/crystal).
    Falls back to [16] when no keyword matches."""
    result = classify_effect(segment)['bunrui']
    return result if result else [16]


def parse_effects(dc, effect_text):
    """Parse effect_text into a list of effects entries."""
    if not effect_text:
        return []

    base_scope, base_elem, base_type, base_name = detect_scope(dc, effect_text)

    segments = [s.strip() for s in effect_text.split(' & ') if s.strip()]
    if not segments:
        segments = [effect_text.strip()]

    effects = []
    for seg in segments:
        # 「装備セット全体」keyword → 该段强制 scope=1，覆盖 base 的 element/weapon 限制
        if _SET_WHOLE_RE.search(seg):
            scope     = 1
            elem      = None
            type_val  = None
            char_name = None
        else:
            scope     = base_scope
            elem      = base_elem
            type_val  = base_type
            char_name = base_name

        condition          = detect_condition(seg)
        bairitu, calc_type = extract_bairitu(seg)
        bunrui_list        = match_bunrui_in_seg(seg)

        for b in bunrui_list:
            entry = {
                "bunrui":    [b],
                "scope":     scope,
                "condition": condition,
                "bairitu":   bairitu,
                "calc_type": calc_type,
            }
            if elem is not None:
                entry["element"] = elem
            if type_val is not None:
                entry["weapon"] = type_val
            if scope == 5 and char_name:
                entry["name"] = char_name
            effects.append(entry)

    # Merge pass: 同 (bairitu, calc_type, scope, condition, element, type, name) entries 合并 bunrui[]
    # 跟 crawl_chara.py 行为一致
    def _merge_key(e):
        return (e.get('bairitu'), e.get('calc_type'), e.get('scope'),
                e.get('condition'), e.get('element'), e.get('weapon'), e.get('name'))
    merged = []
    for e in effects:
        k = _merge_key(e)
        for m in merged:
            if _merge_key(m) == k:
                m['bunrui'] = sorted(set(m['bunrui']) | set(e['bunrui']))
                break
        else:
            merged.append(e)

    return merged


# ============================================================
#  ROW PARSER
# ============================================================
def parse_row(row):
    raw = htmlmod.unescape(row.get('data-contents', '{}'))
    try:
        dc = json.loads(raw)
    except json.JSONDecodeError:
        return None

    entry_id = dc.get('id')
    if not entry_id:
        return None

    tds = row.find_all('td')
    if len(tds) < 2:
        return None

    td_info = parse_second_td(tds[1])
    effect_text = td_info.get('effect_text', '')

    # Unwrap single-element list fields
    rea_raw = dc.get('rea')
    rarity  = rea_raw[0] if isinstance(rea_raw, list) else rea_raw

    effects = parse_effects(dc, effect_text)

    ts = dc.get('hatsudou_start', '')
    te = dc.get('hatsudou_end', '')

    # Rebuild with desired field order
    ordered = {
        "id":          entry_id,
        "name":        dc.get('name', ''),
        "rarity":      rarity,
    }
    if ts: ordered["time_start"] = ts
    if te: ordered["time_end"]   = te
    ordered["acquisition"] = td_info.get('acquisition', '')
    if 'illustrator' in td_info:
        ordered["illustrator"] = td_info["illustrator"]
    ordered["effect_text"] = effect_text
    ordered["effects"] = effects

    return ordered


# ============================================================
#  MAIN
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="Altema BxB ブレードグラフ Crawler")
    parser.add_argument("--recal", action="store_true",
                        help="Re-parse all entries (re-fetch page)")
    parser.add_argument("--rerun", action="store_true",
                        help="Same as --recal (for interface consistency)")
    args = parser.parse_args()

    full_mode = args.recal or args.rerun

    os.makedirs(DATA_DIR, exist_ok=True)
    out_path = os.path.join(DATA_DIR, OUTPUT_FILE)

    # Load existing data
    existing = {}
    if os.path.exists(out_path) and not full_mode:
        with open(out_path, encoding='utf-8') as f:
            existing_list = json.load(f)
        existing = {e['id']: e for e in existing_list}
        print(f"Loaded {len(existing)} existing entries from {OUTPUT_FILE}")

    # Fetch page
    print("Fetching bladegraph page...")
    resp = fetch_page(PAGE_URL)
    if not resp:
        raise RuntimeError("Failed to fetch bladegraph page after retries")

    soup = BeautifulSoup(resp.text, 'html.parser')
    rows = soup.find_all('tr', class_='row')
    print(f"Found {len(rows)} entries")

    # Parse rows
    parsed = {}
    for row in rows:
        entry = parse_row(row)
        if entry:
            parsed[entry['id']] = entry

    # Merge: full_mode → use all parsed; else add only new IDs
    if full_mode:
        merged = dict(parsed)
    else:
        merged = dict(existing)
        new_count = 0
        for eid, entry in parsed.items():
            if eid not in merged:
                merged[eid] = entry
                new_count += 1
        print(f"Added {new_count} new entries")

    entries = list(merged.values())

    # NOTE: bladegraphs_revise.json は recal 時に bladegraphs.json に merge しない。
    # bladegraphs.json は純粋な parser 出力として保ち、revise は frontend
    # (bladegraphs.html / hensei.html) がランタイムで deepApply する。

    # Safety fill: ensure all effects entries have calc_type
    for entry in entries:
        for eff in entry.get('effects', []):
            if 'calc_type' not in eff:
                eff['calc_type'] = 0

    # Sort by id descending (newest first)
    entries.sort(key=lambda e: e.get('id', 0), reverse=True)

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(entries)} entries to {OUTPUT_FILE}")


if __name__ == '__main__':
    main()
