#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Altema BxB 魔剣 全量爬虫 + 技能分类 + 倍率标注 一体化脚本

用法:
  python crawl_chara.py              # 增量爬取，跳过已处理角色
  python crawl_chara.py --rerun      # 全量重新爬取

流程: 爬取 → 技能分类(bunrui/scope/condition) → 倍率标注(bairitu) → characters_classified.json
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
    CAT_TO_BUNRUI_SKILLLIST,
    classify_skill_chara,
)

# ============================================================
#  CONFIG
# ============================================================
BASE_URL       = "https://altema.jp"
CHARALIST_URL  = "https://altema.jp/bxb/charalist"
RAW_FILE       = "characters.json"           # intermediate raw crawl output
OUTPUT_FILE    = "characters_classified.json" # final output used by index.html
PROGRESS_FILE  = "progress.json"
REQUEST_DELAY  = 2.0

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
    "Referer":         "https://altema.jp/bxb/charalist",
}

EVOLVE_LABEL = {"evolve2": "極弐", "evolve1": "改造", "evolve0": "通常"}


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
    js_path = path.replace(".json", ".js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("var CHARA_DATA = ")
        json.dump(data, f, ensure_ascii=False)
        f.write(";\n")


# ============================================================
#  CRAWL — parsing helpers
# ============================================================
def clean_stat_value(raw):
    if not raw:
        return None
    cleaned = re.sub(r"\s*[（(][^）)]*[）)]\s*", "", raw).strip()
    digits = cleaned.replace(",", "").replace("、", "").replace(" ", "")
    try:
        return int(digits)
    except ValueError:
        return cleaned if cleaned else None


def parse_hit_count(raw):
    if not raw:
        return raw
    parts = re.split(r"[,，、]", raw.replace(" ", "").replace("　", ""))
    result = []
    for p in parts:
        m = re.match(r"(\d+)", p.strip())
        if m:
            result.append(int(m.group(1)))
    return result if result else raw


def parse_bd_skill(table):
    rows = table.find_all("tr")
    name   = rows[0].get_text(strip=True) if len(rows) > 0 else ""
    effect = rows[1].get_text(strip=True) if len(rows) > 1 else ""
    result = {"name": name, "effect": effect}
    m = re.search(r'【消費レベル[：:]\s*(\d+)】', effect)
    if m:
        result["cost"] = int(m.group(1))
    return result


def parse_skills_table(table):
    skills = []
    rows = table.find_all("tr")
    for row in rows[1:]:
        cells = row.find_all("td")
        if len(cells) >= 2:
            name   = cells[0].get_text(strip=True)
            effect = cells[1].get_text(strip=True)
            if name or effect:
                skills.append({"name": name, "effect": effect})
    return skills


def parse_basic_info_table(table):
    info = {}
    STRING_KEYS = {"武器種", "モーション", "結晶スロット"}
    for row in table.find_all("tr"):
        cells = row.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        key = cells[0].get_text(strip=True)
        val = cells[-1].get_text(strip=True)
        if not key or key in ("項目", "数値"):
            continue
        if key == "Hit数":
            info[key] = parse_hit_count(val)
            if isinstance(info[key], list):
                info["合計Hit数"] = sum(info[key])
        elif key in STRING_KEYS:
            info[key] = val
        else:
            info[key] = clean_stat_value(val)
    return info


def parse_stats_table(table):
    rows = table.find_all("tr")
    if not rows:
        return {}
    header_cells = rows[0].find_all(["th", "td"])
    three_col = len(header_cells) == 3
    if three_col:
        stats = {"initial": {}, "max": {}}
        for row in rows[1:]:
            cells = row.find_all(["th", "td"])
            if len(cells) < 3:
                continue
            key = cells[0].get_text(strip=True)
            if not key:
                continue
            stats["initial"][key] = clean_stat_value(cells[1].get_text(strip=True))
            stats["max"][key]     = clean_stat_value(cells[2].get_text(strip=True))
        return stats
    else:
        max_stats = {}
        for row in rows[1:]:
            cells = row.find_all(["th", "td"])
            if len(cells) < 2:
                continue
            key = cells[0].get_text(strip=True)
            if not key:
                continue
            max_stats[key] = clean_stat_value(cells[-1].get_text(strip=True))
        return {"max": max_stats}


def parse_profile_table(table):
    profile = {}
    for row in table.find_all("tr"):
        cells = row.find_all(["th", "td"])
        if len(cells) == 2:
            k, v = cells[0].get_text(strip=True), cells[1].get_text(strip=True)
            if k:
                profile[k] = v
        elif len(cells) >= 4:
            k1, v1 = cells[0].get_text(strip=True), cells[1].get_text(strip=True)
            k2, v2 = cells[2].get_text(strip=True), cells[3].get_text(strip=True)
            if k1: profile[k1] = v1
            if k2: profile[k2] = v2
    if "B/W/H" in profile:
        parts = str(profile["B/W/H"]).split("/")
        if len(parts) == 3:
            for key, val in zip(["B", "W", "H"], parts):
                try:
                    profile[key] = int(val)
                except ValueError:
                    pass
    return profile


def _classify_table(table, header):
    if header == "ブレイズドライブ":        return "bd_skill"
    if header in ("スキル構成", "スキル"):  return "skills"
    if header == "基本情報":               return "basic_info"
    if header == "ステータス":             return "stats"
    text = " ".join(c.get_text(strip=True) for c in table.find_all(["th", "td"])[:6])
    if "スキル名" in text or "効果" in text:  return "skills"
    if "Hit数" in text or "最大レベル" in text: return "basic_info"
    if "HP" in text and "攻撃力" in text:      return "stats"
    return None


def parse_evolve_div(div):
    result = {}
    current_h = None
    for child in div.children:
        if not hasattr(child, "name") or not child.name:
            continue
        if child.name in ("h2", "h3"):
            current_h = child.get_text(strip=True)
        elif child.name == "table":
            kind = _classify_table(child, current_h)
            if kind == "bd_skill":
                result["bd_skill"] = parse_bd_skill(child)
            elif kind == "skills":
                result.setdefault("skills", [])
                result["skills"].extend(parse_skills_table(child))
            elif kind == "basic_info":
                result["basic_info"] = parse_basic_info_table(child)
            elif kind == "stats":
                result["stats"] = parse_stats_table(child)
    return result


def parse_prof_div(div):
    profile = {}
    for tbl in div.find_all("table"):
        profile.update(parse_profile_table(tbl))
    return profile


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


def get_char_list(session):
    print("Fetching character list...")
    resp = fetch_page(session, CHARALIST_URL)
    if not resp:
        raise RuntimeError("Cannot fetch character list")
    soup  = BeautifulSoup(resp.text, "html.parser")
    rows  = soup.find_all("tr", attrs={"data-chara": True})
    chars = []
    for row in rows:
        raw = htmlmod.unescape(row.get("data-chara", "{}"))
        try:
            d = json.loads(raw)
        except json.JSONDecodeError:
            continue
        link     = row.find("a", href=re.compile(r"/bxb/chara/\d+"))
        href     = link["href"] if link else None
        chara_id = re.search(r"/bxb/chara/(\d+)", href).group(1) if href else None
        name     = re.sub(r"【[^】]*】", "", d.get("name", "")).strip()
        chars.append({
            "data_id":  row.get("data-id"),
            "id":       d.get("id"),
            "name":     name,
            "rarity":   d.get("rarity"),
            "element":  d.get("element"),
            "type":     d.get("type"),
            "chara_id": chara_id,
            "url":      BASE_URL + href if href else None,
        })
    print(f"Found {len(chars)} entries in list")
    return chars


def get_char_detail(session, url):
    resp = fetch_page(session, url)
    if not resp:
        return None, url
    final_url = resp.url
    soup      = BeautifulSoup(resp.text, "html.parser")
    states    = {}
    for ev_key, label in EVOLVE_LABEL.items():
        divs = [
            d for d in soup.find_all("div", class_=True)
            if ev_key in d.get("class", []) and not any("_prof" in c for c in d.get("class", []))
        ]
        if not divs:
            continue
        merged = {}
        for div in divs:
            merged.update(parse_evolve_div(div))
        prof_key  = ev_key + "_prof"
        prof_divs = [
            d for d in soup.find_all("div", class_=True)
            if prof_key in " ".join(d.get("class", []))
        ]
        if prof_divs:
            profile = {}
            for div in prof_divs:
                profile.update(parse_prof_div(div))
            if profile:
                merged["profile"] = profile
        if merged:
            states[label] = merged
    return states, final_url


# ============================================================
#  CLASSIFY — imported from classify_common
# ============================================================
# ELEMENT_MAP, WEAPON_TYPE_MAP, CAT_TO_BUNRUI_SKILLLIST, classify_skill_chara


# ============================================================
#  BAIRITU — skill multiplier lookup + extraction
# ============================================================
SKILL_TABLE = {
    # Basic skills
    '波動':              {1:1.05, 2:1.1,   3:1.25,  4:1.5,   5:1.75,  6:2.0},
    '加護':              {1:1.05, 2:1.1,   3:1.25,  4:1.5,   5:1.75,  6:2.0},
    '秘法':              {1:1.05, 2:1.1,   3:1.25,  4:1.5,   5:1.75,  6:2.0},
    '加速回路':          {1:1.05, 2:1.1,   3:1.25,  4:1.5,   5:1.75,  6:2.0},
    '覇気':              {1:1.05, 2:1.1,   3:1.25,  4:1.5,   5:1.75,  6:2.0},
    '鼓動':              {1:1.5,  2:1.75,  3:2.0,   4:2.5,   5:3.0,   6:3.5},
    '脈動':              {1:1.15, 2:1.3,   3:1.5,   4:2.0,   5:2.33,  6:2.66},
    '魔笛':              {1:0.5,  2:0.2,   3:0.07,  4:0.025},
    '防壁':              {1:0.975,2:0.95,  3:0.875, 4:0.75},
    '資質':              {1:10,   2:50,    3:100},
    '喝采':              {1:1.5,  2:2.0,   3:3.0},
    '抱擁':              {1:1.5,  2:2.0,   3:3.0},
    '共鳴':              {1:1.5,  2:2.0,   3:3.0},
    '律動':              {5:2.0,  6:2.3},
    '奮迅':              {5:2.1,  6:2.4},
    '恩寵':              {3:1.5,  4:1.7},
    '猛追':              {4:1.8,  5:2.1},
    '渇望':              {1:0.4,  2:0.6,   3:0.8,   4:1.0},
    # Special named skills
    '狩猟神の才能':      {1:0.4,  2:0.6,   3:0.8,   4:1.0},
    '破壊神の波動':      {3:1.3,  4:1.8,   5:2.25,  6:2.55},
    '破壊神の律動':      {3:1.3,  4:1.7},
    '破壊神の咆哮':      {1:1.0,  2:2.0,   3:3.5},
    '破壊神の急襲':      {1:1.0,  2:2.0},
    '天狼神の波動':      {3:2.5,  4:3.3},
    '叛逆神の波動':      {3:2.0,  4:2.5,   5:3.3},
    '叛逆神の加速回路':  {1:1.1,  2:1.2,   3:1.3,   4:1.8,   5:2.25},
    '叛逆神の胎動':      {3:1.3,  4:1.8,   5:2.25,  6:2.6},
    '吸精神の愛撫':      {1:16,   2:32},
    '決闘神の寵愛':      {3:10,   4:12.5},
    '重圧神の資質':      {3:10,   4:12.5},
    # 深化 (per-proficiency increment)
    '波動【深化】':      {4:0.0031,  5:0.00768, 6:0.00768},
    '脈動【深化】':      {4:0.005,   5:0.005,   6:0.008},
    '覇気【深化】':      {5:0.00768, 6:0.00768},
    '鼓動【深化】':      {4:0.0072,  5:0.011},
    '加速回路【深化】':  {5:0.00768, 6:0.00768},
    '奮迅【深化】':      {5:0.00801},
}

_TABLE_KEYS = sorted(SKILL_TABLE.keys(), key=len, reverse=True)

ADD_BUNRUI  = {6, 7, 17, 18, 19}   # additive  → default 0
MULT_BUNRUI = {1,2,3,4,5,8,9,10,12,13,14,15,16,20}  # multiplicative → default 1

_LV_RE           = re.compile(r'Lv(\d+)\+?$')
_MAX_BAI         = re.compile(r'最大(\d+(?:\.\d+)?)倍')
_PLAIN_BAI       = re.compile(r'(\d+(?:\.\d+)?)倍')
_PLUS_N          = re.compile(r'[+＋](\d+(?:\.\d+)?)')
_OKU_UP          = re.compile(r'が(\d+(?:\.\d+)?)億アップ')
_MAN_UP          = re.compile(r'が(\d+(?:\.\d+)?)万アップ')
_PCT_UP          = re.compile(r'が(\d+(?:\.\d+)?)%アップ')
_PLAIN_UP        = re.compile(r'が(\d+(?:\.\d+)?)アップ')
_MAX_GAUGE       = re.compile(r'数に応じて.*最大(\d+(?:\.\d+)?)ゲージ')
_BD_LV_ZET       = re.compile(r'B\.D\.レベル上限が絶大に上昇')
# 熟度 clause max value — three unit variants
_JUKU_MAX_BAI_RE = re.compile(r'熟度.*?最大(?:約)?(\d+(?:\.\d+)?)倍')
_JUKU_MAX_OKU_RE = re.compile(r'熟度.*?最大(?:約)?(\d+(?:\.\d+)?)億')
_JUKU_MAX_MAN_RE = re.compile(r'熟度.*?最大(?:約)?(\d+(?:\.\d+)?)万')
_COMMA_IN_NUM    = re.compile(r'(?<=\d),(?=\d)')


def _norm(effect):
    """Remove commas inside numbers (e.g. 1,000,000,000 → 1000000000)."""
    prev = None
    while prev != effect:
        prev = effect
        effect = _COMMA_IN_NUM.sub('', effect)
    return effect


def _juku_max_val(effect):
    """Extract absolute max value from 熟度 clause (倍 / 億 / 万)."""
    m = _JUKU_MAX_BAI_RE.search(effect)
    if m:
        return float(m.group(1))
    m = _JUKU_MAX_OKU_RE.search(effect)
    if m:
        return float(m.group(1)) * 100_000_000
    m = _JUKU_MAX_MAN_RE.search(effect)
    if m:
        return float(m.group(1)) * 10_000
    return None

# シリーズ共通スキル: name-prefix → {bairitu, bairitu_scaling}
SERIES_TABLE = {
    '対魔剣殲滅魔導兵器': {'bairitu': 2.0, 'bairitu_scaling': 0.015},
}
_SERIES_KEYS = sorted(SERIES_TABLE.keys(), key=len, reverse=True)


def _table_lookup(name):
    m = _LV_RE.search(name)
    if not m:
        return None
    lv   = int(m.group(1))
    base = name[:m.start()]
    if base in SKILL_TABLE:
        return SKILL_TABLE[base].get(lv)
    for key in _TABLE_KEYS:
        if base == key or base.endswith(key):
            return SKILL_TABLE[key].get(lv)
    return None


def _series_lookup(name):
    for key in _SERIES_KEYS:
        if key in name:
            return SERIES_TABLE[key]
    return None


def _effect_extract(effect, bunrui):
    # Strip 熟度 clause so its 最大N倍 doesn't shadow the base value
    base = effect[:effect.index('【熟度')] if '【熟度' in effect else effect

    m = _MAX_BAI.search(base)
    if m:
        return float(m.group(1))

    is_add = any(b in ADD_BUNRUI or b == 21 for b in bunrui)
    if is_add:
        m = _OKU_UP.search(base)
        if m:
            return float(m.group(1)) * 100_000_000
        m = _MAN_UP.search(base)
        if m:
            return float(m.group(1)) * 10_000
        m = _PCT_UP.search(base)
        if m:
            return round(1 + float(m.group(1)) / 100, 6)
        m = _PLAIN_UP.search(base)
        if m:
            return float(m.group(1))
        m = _PLUS_N.search(base)
        if m:
            return float(m.group(1))
        m = _MAX_GAUGE.search(effect)   # gauge pattern uses full effect
        if m:
            return float(m.group(1)) / 3
        if _BD_LV_ZET.search(effect):
            return 60.0

    m = _PLAIN_BAI.search(base)
    if m:
        return float(m.group(1))

    return None


def _bunrui_default(bunrui, effect):
    if not bunrui:
        return 1
    if 21 in bunrui:
        m = _PLUS_N.search(effect)
        if m:
            return float(m.group(1))
        m = _PLAIN_UP.search(effect)
        if m:
            return float(m.group(1))
        return 1
    for b in bunrui:
        if b in ADD_BUNRUI:
            return 0
    return 1


def assign_bairitu_and_scaling(skill):
    """Return (bairitu, bairitu_scaling) for a skill."""
    name   = skill.get('name',   '')
    effect = _norm(skill.get('effect', ''))
    effects = skill.get('effects', [])
    bunrui = effects[0].get('bunrui', []) if effects else []

    # ── 深化 skills: bairitu from base skill, scaling from 深化 table entry ──
    if '【深化】' in name:
        scaling = _table_lookup(name)
        base_name = name.replace('【深化】', '')
        bairitu = _table_lookup(base_name)
        if bairitu is None:
            bairitu = _effect_extract(effect, bunrui)
        if bairitu is None:
            bairitu = _bunrui_default(bunrui, effect)
        return bairitu, (scaling if scaling is not None else 0)

    # ── regular bairitu ──
    v = _table_lookup(name)
    if v is not None:
        bairitu = v
    else:
        v = _effect_extract(effect, bunrui)
        bairitu = v if v is not None else _bunrui_default(bunrui, effect)

    # ── scaling: 熟度 clause with explicit max → (max - base) / 99 ──
    max_val = _juku_max_val(effect)
    if max_val is not None:
        return bairitu, round((max_val - bairitu) / 99, 6)

    # ── scaling: series table (no explicit max in effect) ──
    series = _series_lookup(name)
    if series:
        return series['bairitu'], series['bairitu_scaling']

    return bairitu, 0


# ============================================================
#  ELEMENT BUFF — which element-targeted buffs this chara can receive
# ============================================================
_ELEM_BUFF_TRIGGER = re.compile(r'他魔剣からのスキル効果を受けられる')
_ALL_ELEMENTS = sorted(ELEMENT_MAP.values())  # [1,2,3,4,5,6]


def _compute_element_buff(chara):
    own_elem = chara.get('element')
    if own_elem is None:
        return
    buff_set = {own_elem}
    result = _ALL_ELEMENTS
    for state_data in chara.get('states', {}).values():
        for skill in state_data.get('skills', []):
            effect = skill.get('effect', '')
            if not _ELEM_BUFF_TRIGGER.search(effect):
                continue
            if '属性不一致でも' in effect:
                buff_set = set(_ALL_ELEMENTS)
                break
            for elem_name, elem_id in ELEMENT_MAP.items():
                if f'{elem_name}属性' in effect:
                    buff_set.add(elem_id)
    result = sorted(buff_set)

    # reinsert element_buff immediately after 'element' to preserve key order
    if 'element_buff' not in chara or list(chara).index('element_buff') != list(chara).index('element') + 1:
        new_chara = {}
        for k, v in chara.items():
            if k == 'element_buff':
                continue
            new_chara[k] = v
            if k == 'element':
                new_chara['element_buff'] = result
        if 'element_buff' not in new_chara:
            new_chara['element_buff'] = result
        chara.clear()
        chara.update(new_chara)
    else:
        chara['element_buff'] = result


# ============================================================
#  PIPELINE — classify + bairitu in-place
# ============================================================
def apply_pipeline(characters, chara_ids=None):
    """Apply classify + bairitu to skills in-place.
    chara_ids: set of character IDs to process; None means process all."""
    table_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skilllist_table.json')
    skilllist_table = {}
    if os.path.exists(table_path):
        with open(table_path, encoding='utf-8') as f:
            skilllist_table = json.load(f)
    else:
        print("Warning: skilllist_table.json not found, using keyword scan only")

    count = 0
    for chara in characters:
        if chara_ids is not None and chara['id'] not in chara_ids:
            continue
        for state_data in chara.get('states', {}).values():
            for skill in state_data.get('skills', []):
                classify_skill_chara(skill, skilllist_table, CAT_TO_BUNRUI_SKILLLIST)
                effects = skill.get('effects', [])
                if not effects:
                    continue
                e = effects[0]
                # Sync top-level classification fields from effects[0]
                skill['bunrui']    = e.get('bunrui', [])
                skill['scope']     = e.get('scope', 0)
                skill['condition'] = e.get('condition', 0)
                b, s = assign_bairitu_and_scaling(skill)
                if 'bairitu' not in e:
                    e['bairitu'] = b
                if 'bairitu_scaling' not in e:
                    e['bairitu_scaling'] = s
        _compute_element_buff(chara)
        count += 1
    return characters, count


# ============================================================
#  MAIN
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="Altema BxB 魔剣 Crawler + Classifier")
    parser.add_argument("--rerun", action="store_true",
                        help="Re-scrape all characters from scratch")
    parser.add_argument("--recal", action="store_true",
                        help="Recalculate skill classification for all characters without re-scraping")
    args = parser.parse_args()

    if args.rerun:
        mode = "FULL RERUN"
    elif args.recal:
        mode = "incremental crawl + RECALCULATE ALL"
    else:
        mode = "incremental"
    print("=" * 60)
    print("Altema BxB 魔剣 Crawler + Skill Classifier + Bairitu")
    print("Mode:", mode)
    print("=" * 60)

    out_dir       = os.path.dirname(os.path.abspath(__file__))
    raw_path      = os.path.join(out_dir, RAW_FILE)
    output_path   = os.path.join(out_dir, OUTPUT_FILE)
    progress_path = os.path.join(out_dir, PROGRESS_FILE)

    if args.rerun:
        completed  = set()
        saved_ids  = set()
        characters = []
        if os.path.exists(progress_path):
            os.remove(progress_path)
    else:
        progress   = load_json(progress_path, {"completed_data_ids": [], "saved_chara_ids": []})
        completed  = set(progress["completed_data_ids"])
        characters = load_json(raw_path, [])
        saved_ids  = set(c["id"] for c in characters)

    print(f"Already saved: {len(characters)} characters")
    char_index = {c["id"]: i for i, c in enumerate(characters)}

    revise_path = os.path.join(out_dir, "characters_revise.json")
    revise_map  = {c["id"]: c for c in load_json(revise_path, [])}
    if revise_map:
        print(f"Revise overrides: {len(revise_map)} entries")
        changed = 0
        for rid, record in revise_map.items():
            if rid in char_index:
                characters[char_index[rid]] = dict(record)
                changed += 1
            else:
                char_index[rid] = len(characters)
                characters.append(dict(record))
                saved_ids.add(rid)
                changed += 1
        if changed:
            save_json(raw_path, characters)
            print(f"Revise applied: {changed} characters updated")

    session = requests.Session()

    try:
        char_list = get_char_list(session)
        pending   = char_list if args.rerun else [c for c in char_list if c["data_id"] not in completed]
        print(f"Pending: {len(pending)}")

        updated_ids = set()
        if not pending:
            print("No new characters — running classifier on existing data...")
        else:
            for i, c in enumerate(pending):
                print(f"\n[{i+1}/{len(pending)}] {c['name']} ({c['url']})")
                try:
                    list_id = int(c["chara_id"] or c["id"] or 0)

                    if list_id in revise_map:
                        record = dict(revise_map[list_id])
                        record.setdefault("sort_id", list_id)
                        if list_id in char_index:
                            characters[char_index[list_id]] = record
                        else:
                            char_index[list_id] = len(characters)
                            characters.append(record)
                        saved_ids.add(list_id)
                        updated_ids.add(list_id)
                        completed.add(c["data_id"])
                        print(f"  [revise] id={list_id}")
                        save_json(progress_path, {"completed_data_ids": list(completed), "saved_chara_ids": list(saved_ids)})
                        save_json(raw_path, characters)
                        continue

                    states, final_url = get_char_detail(session, c["url"])
                    m        = re.search(r"/bxb/chara/(\d+)", final_url)
                    final_id = int(m.group(1)) if m else int(c["chara_id"] or c["id"] or 0)

                    if final_id in revise_map:
                        record = dict(revise_map[final_id])
                        record.setdefault("sort_id", list_id)
                        if final_id in char_index:
                            characters[char_index[final_id]] = record
                        else:
                            char_index[final_id] = len(characters)
                            characters.append(record)
                        saved_ids.add(final_id)
                        updated_ids.add(final_id)
                        completed.add(c["data_id"])
                        print(f"  [revise] id={final_id} (after redirect)")
                        save_json(progress_path, {"completed_data_ids": list(completed), "saved_chara_ids": list(saved_ids)})
                        save_json(raw_path, characters)
                        time.sleep(REQUEST_DELAY)
                        continue

                    if final_id in saved_ids and not args.rerun:
                        existing_idx = char_index.get(final_id)
                        if existing_idx is not None and states:
                            existing_states = set(characters[existing_idx].get("states", {}).keys())
                            gained = set(states.keys()) - existing_states
                            if gained:
                                print(f"  UPDATE: new states {gained}")
                                characters[existing_idx]["states"] = states
                                characters[existing_idx]["url"]    = final_url
                                updated_ids.add(final_id)
                            else:
                                print(f"  skip: id={final_id} already saved")
                        else:
                            print(f"  skip: id={final_id} already saved")
                    else:
                        record = {
                            "id":      final_id,
                            "sort_id": list_id,
                            "name":    c["name"],
                            "rarity":  c["rarity"],
                            "element": c["element"],
                            "type":    c["type"],
                            "url":     final_url,
                            "states":  states or {},
                        }
                        if final_id in char_index:
                            characters[char_index[final_id]] = record
                        else:
                            char_index[final_id] = len(characters)
                            characters.append(record)
                        saved_ids.add(final_id)
                        updated_ids.add(final_id)
                        print(f"  saved states: {list(states.keys()) if states else []}")

                    completed.add(c["data_id"])
                    save_json(progress_path, {"completed_data_ids": list(completed), "saved_chara_ids": list(saved_ids)})
                    save_json(raw_path, characters)
                    time.sleep(REQUEST_DELAY)

                except requests.exceptions.HTTPError as e:
                    code = e.response.status_code
                    if code in (429, 403):
                        print(f"\nRate limited (HTTP {code}). Saving and stopping.")
                        save_json(progress_path, {"completed_data_ids": list(completed), "saved_chara_ids": list(saved_ids)})
                        save_json(raw_path, characters)
                        print(f"Progress saved. Completed: {len(completed)}")
                        return
                    raise
                except Exception as e:
                    print(f"  error: {e}")
                    save_json(progress_path, {"completed_data_ids": list(completed), "saved_chara_ids": list(saved_ids)})
                    save_json(raw_path, characters)
                    raise

        # ── Phase 2: classify + bairitu ──
        pipeline_ids = None if (args.rerun or args.recal) else updated_ids
        scope_label  = "all" if pipeline_ids is None else f"{len(pipeline_ids)} updated"
        print("\n" + "=" * 60)
        print(f"Applying skill classification and bairitu ({scope_label})...")
        for c in characters:
            if "sort_id" not in c:
                c["sort_id"] = c.get("id", 0)
        characters.sort(key=lambda x: x.get("sort_id", x.get("id", 0)), reverse=True)
        output, count = apply_pipeline(copy.deepcopy(characters), pipeline_ids)
        save_json(output_path, output)
        print(f"Done! {len(output)} characters saved to {OUTPUT_FILE} ({count} recalculated)")

    except KeyboardInterrupt:
        print("\nInterrupted. Saving progress...")
        save_json(progress_path, {"completed_data_ids": list(completed), "saved_chara_ids": list(saved_ids)})
        characters.sort(key=lambda x: x.get("sort_id", x.get("id", 0)), reverse=True)
        save_json(raw_path, characters)
        print(f"Saved {len(completed)} completed, {len(characters)} characters.")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
