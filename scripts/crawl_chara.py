#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Altema BxB 魔剣 全量爬虫 + 技能分类 + 倍率标注 一体化脚本

用法:
  python crawl_chara.py              # 增量爬取，跳过已处理角色
  python crawl_chara.py --rerun      # 全量重新爬取

流程: 爬取 → 技能分类(bunrui/scope/condition) → 倍率标注(bairitu) → characters.json
"""

import argparse
import requests
from bs4 import BeautifulSoup, Tag
import json
import re
import time
import os
import copy
import html as htmlmod
from fractions import Fraction

import unicodedata

from classify_common import (
    ELEMENT_MAP, WEAPON_TYPE_MAP,
    CAT_TO_BUNRUI_SKILLLIST,
    classify_skill_chara,
    classify_effect,
    classify_hit_fields,
    _val_for_bunrui_bd, norm, ADD_BUNRUI,
)

# ============================================================
#  CONFIG
# ============================================================
BASE_URL       = "https://altema.jp"
CHARALIST_URL  = "https://altema.jp/bxb/charalist"
OUTPUT_FILE       = "characters.json"  # crawl progress + final output
PROGRESS_FILE     = "progress.json"
SENZAI_TABLE_FILE = "senzai_table.json"
BD_SPECIAL_FILE      = "bd_special.json"
BD_SPECIAL_DUR_FILE  = "bd_special_durations.json"
REQUEST_DELAY  = 2.0

# ============ progress.json part-level tracking ============
# 6 part に分けて、wiki から取れなかった part がある chara は次回 retry 対象。
# 完整判定：bd_skill / 潜在解放 は顶层；其他 4 つは任一 state にあれば true。
PART_KEYS = ['bd_skill', 'skills', '基本情報', 'ステータス', 'プロフィール', '潜在解放']


def _chara_parts_status(chara):
    """各 part が wiki から取れているか判定 → {part_name: bool} dict 返却."""
    states = list((chara.get('states') or {}).values())
    any_state_has = lambda k: any(bool(s.get(k)) for s in states)
    return {
        'bd_skill':    bool((chara.get('bd_skill') or {}).get('name')),
        'skills':      any_state_has('skills'),
        '基本情報':     any_state_has('basic_info'),
        'ステータス':    any_state_has('stats'),
        'プロフィール':  any_state_has('profile'),
        '潜在解放':    bool(chara.get('omoide')),
    }

# =========== 魔剣特性 tag（chara.tags = int[]） ============
# ⚠ 新 tag 在此处追加 (id 唯一、不重用)。同时改：
#   - shared/constants.js CHARA_TAG / CHARA_TAG_COLOR
#   - BD_SPECIAL_PAGES（如果有 wiki 子页面来源）
#   - _BD_SP_TEXT（如果是文本关键词扫描）
#   - tests/test_data_integrity.cjs expected key set
#   - docs/skills_schema.md tag 表
SPECIAL_LABELS = {
    1: '時止め', 2: '麻痺', 3: '強制BK',
    4: '弱体解除', 5: '高倍率バフ',
}
# Sub-pages for page-sourced special effects
BD_SPECIAL_PAGES = {
    1: 'https://altema.jp/bxb/tokitomebd',
    2: 'https://altema.jp/bxb/mahibd',
    5: 'https://altema.jp/bxb/buffbd',
}
# Text-based detection patterns for remaining tags
_BD_SP_TEXT = {
    3: re.compile(r'強制ブレイク'),
    4: re.compile(r'弱体化解除|弱体化を解除'),
}

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


def save_senzai_table(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


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
    if not result:
        return raw
    # Pad to exactly 3 stages with 0s (e.g. [3] → [3,0,0])
    while len(result) < 3:
        result.append(0)
    return result[:3]


def parse_bd_skill(table):
    rows = table.find_all("tr")
    name   = rows[0].get_text(strip=True) if len(rows) > 0 else ""
    effect = rows[1].get_text(strip=True) if len(rows) > 1 else ""
    result = {"name": name, "effect_text": effect}
    m = re.search(r'【消費レベル[：:]\s*(\d+)】', effect)
    if m:
        result["cost"] = int(m.group(1))
    return result


def parse_bd_effects(effect_text):
    """Parse BD skill effect text into structured effects list.
    Format: 【消費レベル:N】<damage part>＆<buff part>

    设计：与 souls.classify_skill_v2 / chara skills.classify_skill_chara 共用一套语义分析：
      1. split by `&` → 取 buff 部分
      2. split buff by `[、&]` → segments
      3. 每个 segment 独立 classify_effect → bunrui 集合 + scope + condition
      4. 每个 bunrui 独立调 _val_for_bunrui_bd（关键词位置 → 最近的数字 pattern）
         force_plus_n=True 因 BD 文案大量「攻撃力+1300」式加算
      5. merge pass：同 (bairitu, calc_type, scope, condition, element, type) 的 entries 合并 bunrui[]
    """
    text = unicodedata.normalize('NFKC', effect_text)
    text = re.sub(r'^【消費レベル:\d+】', '', text)
    if '&' not in text:
        return []
    buff = text.split('&', 1)[1].strip()
    if not buff:
        return []

    # Nested split: top-level 「&」 で group、内側「、」 で sub。同 group 内の「それぞれ N倍」「ともに N%UP」 等
    # 共有 bairitu は前置 sub にも適用（例 chara/980「攻撃力、防御力、モーション速度がそれぞれ2倍」）。
    top_groups = [g.strip() for g in buff.split('&') if g.strip()]

    entries = []
    for group in top_groups:
        sub_segs = [s.strip() for s in re.split(r'[、]', group) if s.strip()]
        if not sub_segs:
            continue

        # First pass: collect each sub の (bunrui, val, calc_type) と group 全体の最大 bairitu
        sub_data = []   # list of (sub_text, bunrui_list, scope, condition, element, type)
        shared_v = None
        shared_ct = None
        for sub in sub_segs:
            cls = classify_effect(sub, scope_mode='bd')
            bunruis = cls.get('bunrui', [])
            sub_data.append((sub, bunruis, cls.get('scope', 1), cls.get('condition', 0),
                              cls.get('element'), cls.get('weapon')))
            normed = norm(sub)
            for b in bunruis:
                v, ct = _val_for_bunrui_bd(normed, b)
                if v is not None and shared_v is None:
                    shared_v, shared_ct = v, ct

        # Second pass: build entries — placeholder bairitu falls back to shared_v
        for sub, bunruis, scope, condition, element, type_val in sub_data:
            normed = norm(sub)
            for b in bunruis:
                v, ct = _val_for_bunrui_bd(normed, b)
                if v is None:
                    if shared_v is not None:
                        v, ct = shared_v, shared_ct
                    else:
                        v, ct = 1, 0
                if ct is None:
                    ct = 1 if b in ADD_BUNRUI else 0
                ent = {'bunrui': [b], 'scope': scope, 'condition': condition,
                       'bairitu': round(v, 6), 'calc_type': ct}
                if element is not None: ent['element'] = element
                if type_val is not None: ent['weapon'] = type_val
                entries.append(ent)

    # Merge pass: 同非-bunrui 字段的 entries 合并 bunrui[]
    def _merge_key(e):
        return (e.get('bairitu'), e.get('calc_type'), e.get('scope'),
                e.get('condition'), e.get('element'), e.get('weapon'))
    merged = []
    for e in entries:
        k = _merge_key(e)
        for m in merged:
            if _merge_key(m) == k:
                m['bunrui'] = sorted(set(m['bunrui']) | set(e['bunrui']))
                break
        else:
            merged.append(e)

    return merged


def parse_bdhit(effect_text):
    """Extract hit count from BD effect, e.g. 'な99連ダメージ' → 99."""
    text = unicodedata.normalize('NFKC', effect_text)
    m = re.search(r'(\d+)連', text)
    return int(m.group(1)) if m else 1


def parse_bd_duration(effect_text):
    """Extract buff duration string from BD effect text.
    Returns e.g. '30s', '3wave', '数秒', or '' if no timed buff."""
    text = unicodedata.normalize('NFKC', effect_text)
    text = re.sub(r'^【消費レベル:\d+】', '', text)
    if '&' not in text:
        return ''
    buff = text.split('&', 1)[1].strip()
    if not buff:
        return ''
    m = re.search(r'(\d+)秒', buff)
    if m:
        return f"{m.group(1)}s"
    if re.search(r'数秒', buff):
        return '数秒'
    m = re.search(r'(\d+)wave', buff, re.IGNORECASE)
    if m:
        return f"{m.group(1)}wave"
    if re.search(r'wave', buff, re.IGNORECASE):
        return '1wave'
    return ''


def crawl_bd_special(session, out_dir, char_name_map=None):
    """Crawl BD special effect sub-pages and save to bd_special.json / bd_special_durations.json.
    char_name_map: {base_name: sort_id} — all entries are keyed by base character sort_id via name match.
    Returns ({char_id: [special_ids]}, {sort_id: {sid: 'Xs'}})."""
    special_map  = {}
    duration_map = {}  # {base_sort_id: {sid: 'Xs'}}
    _BRACKET = re.compile(r'[【〔（(].*?[】〕）)]')

    for sid, url in BD_SPECIAL_PAGES.items():
        resp = fetch_page(session, url)
        if not resp:
            print(f"  [bd_special] Failed to fetch {SPECIAL_LABELS[sid]}")
            continue
        soup = BeautifulSoup(resp.text, 'html.parser')
        ids_found = set()
        unresolved = 0
        for tr in soup.find_all('tr'):
            a = tr.find('a', href=re.compile(r'/bxb/chara/\d+'))
            if not a:
                continue
            m = re.search(r'/chara/(\d+)', a['href'])
            if not m:
                continue
            cid = int(m.group(1))
            ids_found.add(cid)
            cells = tr.find_all(['td', 'th'])
            # Extract duration first (format: 'NN秒')
            dur_str = None
            for cell in cells:
                dm = re.search(r'(\d+)秒', cell.get_text(strip=True))
                if dm:
                    dur_str = dm.group(1) + 's'
                    break
            if dur_str is None:
                continue  # no duration on this page type, skip
            # Resolve to base sort_id via name matching
            store_id = cid  # fallback: use page ID if no name map
            if char_name_map and cells:
                raw_name = cells[0].get_text(strip=True)
                base_name = _BRACKET.sub('', raw_name).strip()
                resolved = char_name_map.get(base_name)
                if resolved is not None:
                    store_id = resolved
                else:
                    unresolved += 1
            duration_map.setdefault(store_id, {})[sid] = dur_str
        for cid in ids_found:
            special_map.setdefault(cid, [])
            if sid not in special_map[cid]:
                special_map[cid].append(sid)
        msg = f"  [bd_special] {SPECIAL_LABELS[sid]}: {len(ids_found)} entries"
        if unresolved:
            msg += f" ({unresolved} name-unresolved, stored by page_id)"
        print(msg)
        time.sleep(REQUEST_DELAY)
    out_path = os.path.join(out_dir, BD_SPECIAL_FILE)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({str(k): sorted(v) for k, v in special_map.items()}, f, ensure_ascii=False, indent=2)
    dur_path = os.path.join(out_dir, BD_SPECIAL_DUR_FILE)
    with open(dur_path, 'w', encoding='utf-8') as f:
        json.dump({str(k): {str(sk): sv for sk, sv in v.items()} for k, v in duration_map.items()},
                  f, ensure_ascii=False, indent=2)
    return special_map, duration_map


def _parse_bairitu_num(v):
    """bairitu 値を浮動小数に正規化。分式文字列 "13/2" も対応。失敗時 None。"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        if '/' in s:
            try:
                a, b = s.split('/', 1)
                a, b = float(a), float(b)
                return a / b if b != 0 else None
            except (ValueError, ZeroDivisionError):
                return None
        try:
            return float(s)
        except ValueError:
            return None
    return None


_REVIVE_RE = re.compile(r'復活|蘇生')


def compute_chara_tags(chara, bd_special=None):
    """魔剣特性 tag set を計算（BD 子页面 + 効果文本扫 + skill effect 数値判定の融合）。

    ⚠ 新 tag 在この関数に detection block 追加。同時に：
      - shared/constants.js CHARA_TAG / CHARA_TAG_COLOR
      - tests/test_data_integrity.cjs EXPECTED_TAG_IDS
      - docs/skills_schema.md CHARA_TAG 表
      - SPECIAL_LABELS / BD_SPECIAL_PAGES / _BD_SP_TEXT（BD 子页面 / 文本扫源あり時）
    """
    tags = set()
    bd = chara.get('bd_skill') or {}
    bd_text = unicodedata.normalize('NFKC', bd.get('effect_text', '') or '')

    # ====== BD 子页面来源（1 時止め / 2 麻痺 / 5 BDバフ） ======
    if bd_special:
        cid = chara['id']
        sid = chara.get('sort_id', cid)
        tags.update(bd_special.get(cid, []))
        tags.update(bd_special.get(sid, []))

    # ====== BD 効果文本扫描（3 強制ブレイク / 4 弱体解除） ======
    for tid, pat in _BD_SP_TEXT.items():
        if pat.search(bd_text):
            tags.add(tid)

    # ====== chara skill effect 数値・文本判定 ======
    # 注：tag 6 AOE / 7 13倍 etc. は BD で発火させない（BD は全部 scope=1 / 高倍率なので過剰検出）
    # tag 8 回復 と tag 10 BD回復 は分離：8 は chara skill effect、10 は BD effect 内の bunrui=11。
    for state in (chara.get('states') or {}).values():
        for sk in (state.get('skills') or []):
            sk_text = sk.get('effect_text', '') or ''
            # 9 復活: effect_text に 復活 / 蘇生
            if _REVIVE_RE.search(sk_text):
                tags.add(9)
            for e in (sk.get('effects') or []):
                bunrui = e.get('bunrui') or []
                ct = e.get('calc_type', 0)
                b = _parse_bairitu_num(e.get('bairitu'))
                scope = e.get('scope', 0)
                # 6 AOE: chara skill effect の bunrui に 8（「攻撃範囲が敵全体になる」全体化）
                if 8 in bunrui:
                    tags.add(6)
                # 7 13倍: chara 通常 skill 内 bunrui=[1] + scope∈{1,2} + bairitu>=13
                # （BD は除外、calc_type 不問。高倍率 attacker buff の判定）
                if len(bunrui) == 1 and bunrui[0] == 1 and scope in (1, 2) and b is not None and b >= 13:
                    tags.add(7)
                # 8 回復（パッシブ）: chara skill effect の bunrui に 11
                if 11 in bunrui:
                    tags.add(8)
                # 11 ルビー: chara skill effect の bunrui に 15（ルビー量 UP 系 passive buff）
                if 15 in bunrui:
                    tags.add(11)
                # 12 ダメ上限: chara skill effect の bunrui に 17 + scope∈{1,2}（団体ダメ上限；BD 除外、自身 scope=0 除外）
                if 17 in bunrui and scope in (1, 2):
                    tags.add(12)
                # 13 HIT: chara 通常 skill 内 bunrui に 7 + scope∈{1,2}（団体ヒット数 UP；BD 除外）
                if 7 in bunrui and scope in (1, 2):
                    tags.add(13)
                # 14 BDHIT: chara 通常 skill 内 bunrui に 21 + scope∈{1,2}（団体 BD ヒット数 UP；BD 除外）
                if 21 in bunrui and scope in (1, 2):
                    tags.add(14)
    # BD 効果文 復活 も検出
    if _REVIVE_RE.search(bd_text):
        tags.add(9)

    # 10 BD回復: BD effect の bunrui に 11（BD 発動時の味方 HP 回復）
    for e in (bd.get('effects') or []):
        if 11 in (e.get('bunrui') or []):
            tags.add(10)

    return sorted(tags)


def _elevate_bd(chara, recal, bd_special, bd_special_durations=None):
    """Move bd_skill from per-state to character top level; compute bdhit/duration/effects/special."""
    best_bd = None
    for lbl in ['極弐', '改造', '通常']:
        bd = chara.get('states', {}).get(lbl, {}).get('bd_skill')
        if bd:
            best_bd = copy.deepcopy(bd)
            break
    if best_bd is None:
        best_bd = chara.get('bd_skill')

    if best_bd:
        effect = best_bd.get('effect_text', '')
        if recal or 'bdhit' not in best_bd:
            best_bd['bdhit'] = parse_bdhit(effect)
        if recal or 'duration' not in best_bd:
            duration = parse_bd_duration(effect)
            # Override vague "数秒" with the exact duration from the special-effect page
            if duration == '数秒' and bd_special_durations:
                cids = {chara['id'], chara.get('sort_id', chara['id'])}
                for cid in cids:
                    char_durs = bd_special_durations.get(cid, {})
                    if char_durs:
                        duration = next(iter(char_durs.values()))
                        break
            best_bd['duration'] = duration
        if recal or 'effects' not in best_bd:
            best_bd['effects'] = parse_bd_effects(effect)
        for _ent in best_bd.get('effects', []):
            if recal or 'hit_type' not in _ent:
                classify_hit_fields(effect, _ent, is_bd=True, rarity=chara.get('rarity', 4))
        # 旧 schema：bd_skill.special 已迁到 chara.tags（顶层）。保险起见 pop 任何残留。
        best_bd.pop('special', None)
        chara['bd_skill'] = best_bd
    elif 'bd_skill' in chara:
        del chara['bd_skill']

    # ============ 魔剣特性 tag 计算 → chara.tags（顶层） =============
    # recal 时 overwrite；非 recal 时与玩家既存 tags 求 union（保持 revise 手填的 tag 不丢）。
    # 検出 logic は compute_chara_tags() に集約（新 tag はそこに追加）。
    if recal or 'tags' not in chara:
        computed = compute_chara_tags(chara, bd_special)
        if recal:
            chara['tags'] = computed
        else:
            chara['tags'] = sorted(set(chara.get('tags') or []) | set(computed))

    for sd in chara.get('states', {}).values():
        sd.pop('bd_skill', None)


def parse_skills_table(table):
    skills = []
    rows = table.find_all("tr")
    for row in rows[1:]:
        cells = row.find_all("td")
        if len(cells) >= 2:
            name   = cells[0].get_text(strip=True)
            effect = cells[1].get_text(strip=True)
            if name or effect:
                skills.append({"name": name, "effect_text": effect})
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
#  LATENT ABILITIES — 潜在解放
# ============================================================
OMOIDE_THRESHOLDS = (
    [10, 200, 400, 700, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 9000, 11000, 13000, 15000]
    + list(range(18000, 90001, 3000))
)

_LAT_NUM_UP  = re.compile(r'が(\d+(?:,\d+)*)上昇')
_LAT_PCT_UP  = re.compile(r'が(\d+(?:\.\d+)?)%上昇')
_LAT_NUM_INC = re.compile(r'が(\d+)増加')


def _extract_bairitu_latent(syosai):
    m = _LAT_PCT_UP.search(syosai)
    if m:
        return round(1 + float(m.group(1)) / 100, 6), 0
    m = _LAT_NUM_INC.search(syosai)
    if m:
        return int(m.group(1)), 0
    m = _LAT_NUM_UP.search(syosai)
    if m:
        return int(m.group(1).replace(',', '')), 0
    return 0, 0


def _classify_latent_slot(syosai):
    condition = 0
    if '属性の魔剣' in syosai:
        bairitu, bairitu_scaling = _extract_bairitu_latent(syosai)
        return [1], 2, condition, bairitu, bairitu_scaling
    scope = 0
    if 'B.D.攻撃力' in syosai:
        bunrui = [3]
    elif '攻撃モーション速度' in syosai:
        bunrui = [5]
    elif '攻撃力' in syosai:
        bunrui = [1]
    elif '防御力' in syosai:
        bunrui = [12]
    elif 'スピード' in syosai:
        bunrui = [4]
    elif 'HP' in syosai:
        bunrui = [10]
    elif 'ブレイク力' in syosai:
        bunrui = [2]
    elif 'ダメージ上限' in syosai:
        bunrui = [17]
    elif '記憶結晶装備数' in syosai:
        bunrui = [19]
    else:
        bunrui = [16]
    bairitu, bairitu_scaling = _extract_bairitu_latent(syosai)
    return bunrui, scope, condition, bairitu, bairitu_scaling


def parse_latent(soup, senzai_table):
    """Parse 潜在解放 section. Populates senzai_table with new icons.
    Returns list of {"threshold": N, "slots": [icon_id, ...]} for all 40 fixed thresholds."""
    threshold_map = {}
    h2 = soup.find(lambda t: t.name == 'h2' and '潜在解放' in t.get_text())
    if h2:
        table = None
        for sib in h2.next_siblings:
            if not isinstance(sib, Tag):
                continue
            if sib.name == 'table':
                table = sib
                break
            if sib.name == 'h2':
                break
        if table:
            current_threshold = None
            for row in table.find_all('tr')[1:]:
                cells = row.find_all('td')
                if not cells:
                    continue
                first_text = cells[0].get_text(strip=True).replace(',', '')
                if re.match(r'^\d+$', first_text):
                    current_threshold = int(first_text)
                    threshold_map.setdefault(current_threshold, [])
                    slot_cells = cells[1:]
                else:
                    slot_cells = cells
                if current_threshold is None:
                    continue
                for cell in slot_cells:
                    raw = cell.get('data-syosai', '')
                    if not raw:
                        continue
                    try:
                        data = json.loads(htmlmod.unescape(raw))
                    except (json.JSONDecodeError, ValueError):
                        continue
                    img = cell.find('img')
                    if not img:
                        continue
                    src = img.get('data-lazy-src', img.get('src', ''))
                    m = re.search(r'/icon/(\d+)\.jpg', src)
                    if not m:
                        continue
                    icon_id = int(m.group(1))
                    key = str(icon_id)
                    if key not in senzai_table:
                        koka   = data.get('koka', '')
                        syosai = data.get('syosai', '')
                        bunrui, scope, condition, bairitu, bairitu_scaling = _classify_latent_slot(syosai)
                        senzai_table[key] = {
                            'koka':            koka,
                            'syosai':          syosai,
                            'bunrui':          bunrui,
                            'scope':           scope,
                            'condition':       condition,
                            'bairitu':         bairitu,
                            'bairitu_scaling': bairitu_scaling,
                        }
                    threshold_map[current_threshold].append(icon_id)

    return [
        {'threshold': t, 'slots': threshold_map.get(t, [])}
        for t in OMOIDE_THRESHOLDS
    ]


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
            "weapon":   d.get("type"),
            "chara_id": chara_id,
            "url":      BASE_URL + href if href else None,
        })
    print(f"Found {len(chars)} entries in list")
    return chars


def get_char_detail(session, url, senzai_table):
    resp = fetch_page(session, url)
    if not resp:
        return None, [], url
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
    latent = parse_latent(soup, senzai_table)
    return states, latent, final_url


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
_MAN_BAI         = re.compile(r'(\d+(?:\.\d+)?)万倍')                # 「100万倍」 multiplicative (chara/1561)
_PLAIN_BAI       = re.compile(r'(\d+(?:\.\d+)?)倍')
_PLUS_N          = re.compile(r'[+＋](\d+(?:\.\d+)?)')
_OKU_PLUS        = re.compile(r'[+＋](\d+(?:\.\d+)?)億')             # 「+50億」 (chara/1613)
_OKU_UP          = re.compile(r'が?(\d+(?:\.\d+)?)億(?:UP|アップ|上昇|上げる)')
_MAN_UP          = re.compile(r'が?(\d+(?:\.\d+)?)万(?:UP|アップ|上昇|上げる)')
_PCT_UP          = re.compile(r'が?(\d+(?:\.\d+)?)%(?:UP|アップ|上昇)')
_PLAIN_UP        = re.compile(r'が(\d+(?:\.\d+)?)(?:アップ|UP)')
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
    '対魔剣殲滅魔導兵器': {'bairitu': 2.0,  'bairitu_scaling': 0.015},
    'ロストメモリー':     {'bairitu': 2.66, 'bairitu_scaling': 0.013},
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


# 「最終的に / 最終的な / 最後に」 → ct=2 / 3。「な」は名詞を挟む可能性あり。
_FINAL_PLUS = re.compile(r'最(?:終的[にな]|後に)[^+＋\d]{0,8}?[+＋](\d+(?:\.\d+)?)')
_FINAL_BAI  = re.compile(r'最(?:終的[にな]|後に)[^\d]{0,8}?(\d+(?:\.\d+)?)倍')

def _effect_extract(effect, bunrui):
    """Returns (value, calc_type) or (None, None)."""
    base = effect[:effect.index('【熟度')] if '【熟度' in effect else effect

    # 「最終的に / 最後に」 → calc_type=2 (最終加算) / 3 (最終乗算)。
    # 普通の +N / N倍 より優先（同じ数字でも final 用キーワード付きなら final 扱い）。
    m = _FINAL_PLUS.search(base)
    if m:
        return float(m.group(1)), 2
    m = _FINAL_BAI.search(base)
    if m:
        return float(m.group(1)), 3

    m = _MAX_BAI.search(base)
    if m:
        return float(m.group(1)), 0

    is_add = any(b in ADD_BUNRUI or b == 21 for b in bunrui)

    # 加算系 patterns — 通常 add bunrui 用、ただし 「Xが+N」 などは mult bunrui (HP/防御力 等) でも有効。
    # 「+N億」 (chara/1613) と 「Xが+N」 (chara/1453) を全 bunrui で許可。
    m = _OKU_PLUS.search(base)
    if m:
        return float(m.group(1)) * 100_000_000, 1
    if is_add:
        m = _OKU_UP.search(base)
        if m:
            return float(m.group(1)) * 100_000_000, 1
        m = _MAN_UP.search(base)
        if m:
            return float(m.group(1)) * 10_000, 1
        m = _PLAIN_UP.search(base)
        if m:
            return float(m.group(1)), 1
        m = _MAX_GAUGE.search(effect)
        if m:
            return float(m.group(1)) / 3, 1
        if _BD_LV_ZET.search(effect):
            return 60.0, 1

    # %UP は all bunrui — 「攻撃力が30%UP」 (chara/1545) 修正。
    m = _PCT_UP.search(base)
    if m:
        return round(1 + float(m.group(1)) / 100, 6), 0

    # 「Xが+N」 / 単独 +N — all bunrui 許可 (chara/1453 の HPが+7764 修正)。
    m = _PLUS_N.search(base)
    if m:
        return float(m.group(1)), 1

    # 「N万倍」 multiplicative (chara/1561 の 100万倍 修正)、_PLAIN_BAI より先に評価.
    m = _MAN_BAI.search(base)
    if m:
        return float(m.group(1)) * 10_000, 0

    m = _PLAIN_BAI.search(base)
    if m:
        return float(m.group(1)), 0

    return None, None


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


# bairitu_scaling 用：rarity ごとの最高熟度
_RARITY_MAX_JK = {1: 50, 2: 70, 3: 90, 4: 99}

# name に Lv2/Lv3/Lv4/Lv5 を含むか（Lv6+ や Lv1 は対象外。Lv50/Lv500 は別字なので \D|$ で防ぐ）
_LV_2_5_RE = re.compile(r'Lv[2-5](?!\d)')


def _scaling_to_json(max_val, base_val, denom):
    """Compute (max - base) / denom and return as float if terminating, else fraction string."""
    try:
        f = Fraction(str(max_val)) - Fraction(str(base_val))
        f = f / denom
        d = f.denominator
        while d % 2 == 0: d //= 2
        while d % 5 == 0: d //= 5
        return float(f) if d == 1 else f'{f.numerator}/{f.denominator}'
    except Exception:
        return round((max_val - base_val) / denom, 6)


def assign_bairitu_and_scaling(skill, rarity=4):
    """Return (bairitu, bairitu_scaling, calc_type, jk_minus_1) for a skill.

    jk_minus_1: True if name contains Lv2/Lv3/Lv4/Lv5 (calc 用 (jk-1)*s 公式、
                分母 = rarity 最高熟度 - 1)。それ以外は False (jk*s 公式、分母 = rarity 最高熟度)。
    """
    name   = skill.get('name',   '')
    effect = _norm(skill.get('effect_text', ''))
    effects = skill.get('effects', [])
    bunrui = effects[0].get('bunrui', []) if effects else []

    jk_minus_1 = bool(_LV_2_5_RE.search(name))
    rarity_max = _RARITY_MAX_JK.get(rarity, 99)
    denom      = (rarity_max - 1) if jk_minus_1 else rarity_max

    # ── 深化 skills: bairitu from base skill, scaling from 深化 table entry ──
    if '【深化】' in name:
        scaling = _table_lookup(name)
        base_name = name.replace('【深化】', '')
        bairitu = _table_lookup(base_name)
        if bairitu is None:
            bairitu, _ = _effect_extract(effect, bunrui)
        if bairitu is None:
            bairitu = _bunrui_default(bunrui, effect)
        return bairitu, (scaling if scaling is not None else 0), 0, jk_minus_1

    # ── regular bairitu ──
    v = _table_lookup(name)
    if v is not None:
        bairitu, calc_type = v, 0
    else:
        bairitu, calc_type = _effect_extract(effect, bunrui)
        if bairitu is None:
            bairitu = _bunrui_default(bunrui, effect)
            calc_type = 1 if any(b in ADD_BUNRUI for b in bunrui) else 0

    # ── scaling: 熟度 clause with explicit max → exact fraction when non-terminating ──
    max_val = _juku_max_val(effect)
    if max_val is not None:
        return bairitu, _scaling_to_json(max_val, bairitu, denom), calc_type, jk_minus_1

    # ── scaling: series table (no explicit max in effect) ──
    series = _series_lookup(name)
    if series:
        return series['bairitu'], series['bairitu_scaling'], 0, jk_minus_1

    return bairitu, 0, calc_type, jk_minus_1


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
            effect = skill.get('effect_text', '')
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
#  OMOIDE SLOT AUTO-FILL
# ============================================================
_OMOIDE_BASE = {10, 200, 400, 700, 1000}

def get_crystal_slots(char):
    for lbl in ['改造', '極弐', '通常']:
        val = char.get('states', {}).get(lbl, {}).get('basic_info', {}).get('結晶スロット')
        if val is not None:
            try:
                return int(val)
            except (ValueError, TypeError):
                pass
    return 0

def fill_omoide_slots(char, templates=None):
    """Derive rule-based omoide slots for all non-base thresholds.
    templates: dict loaded from omoide_templates.json; used for star2_high/star3_high."""
    r = char.get('omoide_rarity', 1)
    k = get_crystal_slots(char)

    omap = {}
    for row in char.get('omoide') or []:
        t = row.get('threshold')
        if t is not None:
            omap[t] = row.get('slots', [])

    star1     = omap.get(10, [])
    star2     = omap.get(400, [])
    star3_raw = omap.get(1000, [])
    if not (star1 or star2 or star3_raw):
        return

    def _s3_icon(x):
        if 54 <= x <= 64: return x + 4   # BK力 +4
        if 83 <= x <= 87: return x + 1   # 速度UP +1
        if x <= 82:       return x + 6   # 攻/防/HP/BD攻 +6
        return x                          # 88+ 特殊、不推算

    # If 1000好感 slot count differs from 400好感, it's a special slot — derive per type
    if star2 and star3_raw and len(star3_raw) != len(star2):
        star3 = [_s3_icon(x) for x in star2]
    elif star2 and not star3_raw:
        star3 = [_s3_icon(x) for x in star2]
    else:
        star3 = star3_raw

    # High variants: template override, then auto-derive star3_high per type
    star2_high = star2
    star3_high = star3
    tpl_key = char.get('omoide_template')
    if templates and tpl_key and tpl_key in templates:
        tpl = templates[tpl_key]
        if tpl.get('star3'):
            star3 = tpl['star3']
        if tpl.get('star2_high'):
            star2_high = tpl['star2_high']
        if tpl.get('star3_high'):
            star3_high = tpl['star3_high']
        elif tpl.get('star2_high'):
            star3_high = [_s3_icon(x) for x in star2_high]
        else:
            star3_high = star3

    rules = {}
    for t in [2000, 3000, 5000, 7000, 9000, 13000]:
        rules[t] = star1
    rules[4000] = star2
    rules[6000] = [92] if r == 5 else [91] if r == 4 else (star3 if k >= 3 else [93])
    rules[11000] = star3
    rules[15000] = [94, 95, 96] if r >= 4 else (star3 if k >= 4 else [93])
    for n in range(5):
        rules[18000 + 15000 * n] = star2_high
        rules[21000 + 15000 * n] = star2_high
        rules[24000 + 15000 * n] = star3_high
        rules[27000 + 15000 * n] = star2_high
        t30 = 30000 + 15000 * n
        if r == 5:   rules[t30] = [92]
        elif r == 4: rules[t30] = [91]
        elif r == 3: rules[t30] = [90]
        elif r == 2: rules[t30] = [89]
        else:        rules[t30] = star3_high if n == 0 else [88]

    for t, slots in rules.items():
        if t not in _OMOIDE_BASE and slots:
            omap[t] = slots

    char['omoide'] = [
        {'threshold': t, 'slots': omap[t]}
        for t in sorted(omap)
        if omap.get(t)
    ]


# ============================================================
#  PIPELINE — classify + bairitu in-place
# ============================================================
def apply_pipeline(characters, chara_ids=None, recal=False, bd_special=None, bd_special_durations=None):
    """Apply classify + bairitu to skills in-place; elevate bd_skill to character top level.
    chara_ids: set of character IDs for skill processing; None means all.
    recal: if True, always overwrite existing values.
    bd_special: {char_id: [special_ids]} from page crawl.
    bd_special_durations: {char_id: {sid: 'Xs'}} from page crawl."""
    table_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '_lookup', 'skilllist_table.json')
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
                b, s, ct, _jkm1 = assign_bairitu_and_scaling(skill, rarity=chara.get('rarity', 4))
                if recal or 'bairitu' not in e:
                    e['bairitu'] = b
                if recal or 'bairitu_scaling' not in e:
                    e['bairitu_scaling'] = s
                if recal or 'calc_type' not in e:
                    e['calc_type'] = ct
                # 旧バージョンが書き込んだ bairitu_scaling_minus_jk_1 をクリーンアップ。
                # 現在は hensei calc 側で skill.name から判定するので effect には保存しない。
                if 'bairitu_scaling_minus_jk_1' in e:
                    del e['bairitu_scaling_minus_jk_1']
                if recal or 'hit_type' not in e:
                    classify_hit_fields(skill.get('effect_text', ''), e, rarity=chara.get('rarity', 4))
        _compute_element_buff(chara)
        count += 1

    # Elevate bd_skill to character top level for ALL characters
    for chara in characters:
        _elevate_bd(chara, recal, bd_special, bd_special_durations)

    # Set omoide_rarity (never overwrite manually-set values like 限定SS=5)
    _OR_MAP = {4: 4, 3: 3, 2: 2, 1: 1}
    for chara in characters:
        if 'omoide_rarity' not in chara:
            chara['omoide_rarity'] = _OR_MAP.get(chara.get('rarity'), 1)

    # Fill derived omoide slots for all characters
    templates_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'omoide_templates.json')
    omoide_templates = load_json(templates_path, {})
    for chara in characters:
        fill_omoide_slots(chara, omoide_templates)

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

    project_root       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir            = os.path.join(project_root, 'data')
    os.makedirs(out_dir, exist_ok=True)
    output_path        = os.path.join(out_dir, OUTPUT_FILE)
    progress_path      = os.path.join(out_dir, PROGRESS_FILE)
    senzai_table_path  = os.path.join(out_dir, SENZAI_TABLE_FILE)
    bd_special_path    = os.path.join(out_dir, BD_SPECIAL_FILE)
    bd_special_dur_path = os.path.join(out_dir, BD_SPECIAL_DUR_FILE)
    senzai_table       = load_json(senzai_table_path, {})

    if args.rerun:
        completed    = set()
        saved_ids    = set()
        characters   = []
        parts_status = {}
        if os.path.exists(progress_path):
            os.remove(progress_path)
    else:
        progress     = load_json(progress_path, {"completed_data_ids": [], "saved_chara_ids": [], "parts": {}})
        completed    = set(progress.get("completed_data_ids", []))
        characters   = load_json(output_path, [])
        saved_ids    = set(c["id"] for c in characters)
        parts_status = progress.get("parts", {}) or {}
        # Migration：旧 progress.json 没 parts 字段 → 从 characters.json 推断
        if not parts_status and characters:
            print("Migrating progress.json: computing parts status from characters.json...")
            parts_status = {str(c["id"]): _chara_parts_status(c) for c in characters}

    print(f"Already saved: {len(characters)} characters")
    char_index = {c["id"]: i for i, c in enumerate(characters)}

    def _save_progress():
        save_json(progress_path, {
            "completed_data_ids": list(completed),
            "saved_chara_ids":    list(saved_ids),
            "parts":              parts_status,
        })

    revise_path = os.path.join(out_dir, "characters_revise.json")
    revise_map  = {c["id"]: c for c in load_json(revise_path, [])}
    if revise_map:
        print(f"Revise diffs loaded: {len(revise_map)} entries (will apply after classification)")
        # Migrate old revise entries: move states.xxx.bd_skill → top-level bd_skill
        migrated = False
        for r in revise_map.values():
            states = r.get('states', {})
            best_bd = None
            for lbl in ['極弐', '改造', '通常']:
                bd = states.get(lbl, {}).pop('bd_skill', None)
                if bd and best_bd is None:
                    best_bd = bd
            if best_bd and 'bd_skill' not in r:
                r['bd_skill'] = best_bd
                migrated = True
        if migrated:
            with open(revise_path, 'w', encoding='utf-8') as f:
                json.dump(list(revise_map.values()), f, ensure_ascii=False, indent=2)
            print("  Migrated characters_revise.json: moved bd_skill to character level")

    session = requests.Session()

    # Load BD special from cache; re-crawl on --recal/--rerun
    bd_special = {}
    bd_special_durations = {}
    if args.rerun or args.recal:
        # Build name→sort_id map: exact match + suffix fallback for abbreviated page names
        _bracket_re = re.compile(r'[【〔（(].*?[】〕）)]')
        char_name_map = {}
        for c in characters:
            base = _bracket_re.sub('', c['name']).strip()
            sid  = c.get('sort_id', c['id'])
            char_name_map[base] = sid  # exact
        # Suffix map: key = any suffix of a base name (>= 4 chars) that isn't already a key
        _suffix_map = {}
        for full_name, sid in char_name_map.items():
            for i in range(1, len(full_name)):
                suf = full_name[i:]
                if len(suf) >= 4 and suf not in char_name_map:
                    if suf in _suffix_map and _suffix_map[suf] != sid:
                        _suffix_map[suf] = None  # ambiguous
                    elif suf not in _suffix_map:
                        _suffix_map[suf] = sid
        # Merge unambiguous suffix entries
        for suf, sid in _suffix_map.items():
            if sid is not None and suf not in char_name_map:
                char_name_map[suf] = sid
        print("\nCrawling BD special effect pages...")
        bd_special, bd_special_durations = crawl_bd_special(session, out_dir,
                                                             char_name_map=char_name_map)
        print(f"BD special: {len(bd_special)} characters with special effects")
    elif os.path.exists(bd_special_path):
        raw_sp = load_json(bd_special_path, {})
        bd_special = {int(k): v for k, v in raw_sp.items()}
        if os.path.exists(bd_special_dur_path):
            raw_dur = load_json(bd_special_dur_path, {})
            bd_special_durations = {int(k): {int(sk): sv for sk, sv in v.items()}
                                    for k, v in raw_dur.items()}
        print(f"BD special loaded from cache: {len(bd_special)} entries")

    try:
        char_list = get_char_list(session)

        # pending 判定：未抓 OR 已抓但 part 缺失 → 重抓
        def _should_skip(c):
            if args.rerun:
                return False
            if c["data_id"] not in completed:
                return False  # 未抓
            list_id = int(c.get("chara_id") or c.get("id") or 0)
            rec_idx = char_index.get(list_id)
            if rec_idx is None:
                return False  # 找不到 record → 重抓
            status = parts_status.get(str(characters[rec_idx]["id"]))
            if not status or not all(status.get(k, False) for k in PART_KEYS):
                return False  # part 缺失 → 重抓
            return True

        pending = [c for c in char_list if not _should_skip(c)]
        retry_count = sum(1 for c in pending if c["data_id"] in completed)
        print(f"Pending: {len(pending)} ({retry_count} retry due to missing parts)")

        updated_ids = set()
        if not pending:
            print("No new characters — running classifier on existing data...")
        else:
            for i, c in enumerate(pending):
                print(f"\n[{i+1}/{len(pending)}] {c['name']} ({c['url']})")
                try:
                    list_id = int(c["chara_id"] or c["id"] or 0)

                    states, latent, final_url = get_char_detail(session, c["url"], senzai_table)
                    m        = re.search(r"/bxb/chara/(\d+)", final_url)
                    final_id = int(m.group(1)) if m else int(c["chara_id"] or c["id"] or 0)

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
                            if latent:
                                characters[existing_idx]["omoide"] = latent
                        else:
                            print(f"  skip: id={final_id} already saved")
                    else:
                        record = {
                            "id":      final_id,
                            "sort_id": list_id,
                            "name":    c["name"],
                            "rarity":  c["rarity"],
                            "element": c["element"],
                            "weapon":  c["weapon"],
                            "url":     final_url,
                            "states":  states or {},
                            "omoide":  latent,
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
                    # update part status (record may be the just-saved one or the existing-updated one)
                    rec = characters[char_index[final_id]] if final_id in char_index else None
                    if rec is not None:
                        parts_status[str(final_id)] = _chara_parts_status(rec)
                        missing = [k for k, v in parts_status[str(final_id)].items() if not v]
                        if missing:
                            print(f"  ⚠ wiki missing parts: {missing} (next run will retry)")
                    _save_progress()
                    save_json(output_path, characters)
                    time.sleep(REQUEST_DELAY)

                except requests.exceptions.HTTPError as e:
                    code = e.response.status_code
                    if code in (429, 403):
                        print(f"\nRate limited (HTTP {code}). Saving and stopping.")
                        _save_progress()
                        save_json(output_path, characters)
                        print(f"Progress saved. Completed: {len(completed)}")
                        return
                    raise
                except Exception as e:
                    print(f"  error: {e}")
                    _save_progress()
                    save_json(output_path, characters)
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
        output, count = apply_pipeline(copy.deepcopy(characters), pipeline_ids,
                                       recal=(args.recal or args.rerun), bd_special=bd_special,
                                       bd_special_durations=bd_special_durations)

        # NOTE: characters_revise.json は recal 時に characters.json に merge しない。
        # characters.json は純粋な parser 出力として保ち、revise は frontend
        # (characters.html / hensei.html) がランタイムで deepApply する。

        save_json(output_path, output)
        save_senzai_table(senzai_table_path, senzai_table)
        print(f"Done! {len(output)} characters saved to {OUTPUT_FILE} ({count} recalculated)")
        print(f"Senzai table: {len(senzai_table)} icons in {SENZAI_TABLE_FILE}")

    except KeyboardInterrupt:
        print("\nInterrupted. Saving progress...")
        _save_progress()
        characters.sort(key=lambda x: x.get("sort_id", x.get("id", 0)), reverse=True)
        save_json(output_path, characters)
        print(f"Saved {len(completed)} completed, {len(characters)} characters.")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
