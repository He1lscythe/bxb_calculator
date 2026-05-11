#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Altema BxB 記憶結晶 crawler

用法:
  python crawl_crystal.py          # 全量抓取（单页，每次重新抓）
  python crawl_crystal.py --rerun  # 同上（接口一致用）
  python crawl_crystal.py --recal  # 同上（无分类pipeline，行为不变）
"""

import argparse, copy, requests, json, re, os, html as htmlmod
from bs4 import BeautifulSoup
from classify_common import classify_hit_fields, classify_effect, _detect_condition as detect_condition, ADD_BUNRUI

# crystal は ADD_BUNRUI（共通の加算分類）+ crystal 固有の add 種類を union。
#   9 (回避状態異常)、11 (HP回復)、16 (その他) は crystal 文案で add 語義になる。
#   18 (BDゲージ最大値)、21 (BDヒット数) は ADD_BUNRUI 経由で含まれる（以前は漏れていた）。
CRYSTAL_ADD_BUNRUI = ADD_BUNRUI | {9, 11, 16}

ELEMENT_MAP = {'火': 1, '水': 2, '風': 3, '光': 4, '闇': 5, '無': 6}
WEAPON_MAP  = {
    '長剣': 1, '大剣': 2, '太刀': 3, '杖棒': 4, '弓矢': 5, '連弩': 6,
    '戦斧': 7, '騎槍': 8, '投擲': 9, '拳闘': 10, '魔典': 11, '大鎌': 12,
}


def extract_elem_buki(text):
    elem, buki = 0, 0
    for name, eid in ELEMENT_MAP.items():
        if name in text:
            elem = eid
            break
    for name, tid in WEAPON_MAP.items():
        if name in text:
            buki = tid
            break
    return elem, buki


def crystal_calc_type(bunrui_list):
    """0=乘算  1=加算"""
    return 1 if any(b in CRYSTAL_ADD_BUNRUI for b in bunrui_list) else 0

LIST_URL    = "https://altema.jp/bxb/kiokukessyou"
OUTPUT_FILE = "crystals.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    "Referer": "https://altema.jp/bxb/",
}
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(DIR, 'data')


def parse_jp_number(s):
    s = str(s).strip().replace(',', '').replace('，', '')
    try:
        return float(s) if '.' in s else int(s)
    except ValueError:
        pass
    total = 0.0
    for pat, mult in [
        (r'(\d+(?:\.\d+)?)億',   1e8),
        (r'(\d+(?:\.\d+)?)千万', 1e7),
        (r'(\d+(?:\.\d+)?)百万', 1e6),
        (r'(\d+(?:\.\d+)?)万',   1e4),
        (r'(\d+(?:\.\d+)?)千',   1e3),
        (r'(\d+(?:\.\d+)?)百',   1e2),
    ]:
        m = re.search(pat, s)
        if m:
            total += float(m.group(1)) * mult
            s = s[:m.start()] + s[m.end():]
    m = re.match(r'\d+(?:\.\d+)?', s.strip())
    if m:
        total += float(m.group(0))
    if total == 0:
        return None
    return int(total) if total == int(total) else round(total, 4)


def parse_effect_amount(text):
    if not text:
        return None, None
    clean = text.replace('倍', '').strip()
    parts = re.split(r'[～~]', clean)
    if len(parts) == 2:
        return parse_jp_number(parts[0].strip()), parse_jp_number(parts[1].strip())
    v = parse_jp_number(clean)
    return v, v


def parse_right_col(td):
    lines = [l.strip() for l in td.get_text('\n', strip=True).split('\n') if l.strip()]
    result, key, buf = {}, None, []
    for line in lines:
        if line.startswith('【') and '】' in line:
            if key is not None:
                result[key] = '\n'.join(buf).strip()
            key = line[line.index('【')+1 : line.index('】')]
            buf = []
        else:
            buf.append(line)
    if key is not None:
        result[key] = '\n'.join(buf).strip()
    if '特殊条件' in result:
        result['特殊条件'] = re.sub(r'\s*のみ\s*$', '', result['特殊条件']).strip()
    return result


def compute_scope(elem, buki, effect_text, tokushu):
    if tokushu:
        return 5
    if '同装備セット' in (effect_text or ''):
        txt_elem, txt_buki = extract_elem_buki(effect_text)
        if txt_elem or txt_buki:
            return 2  # all party, element/weapon condition
        return 1      # all party, no condition
    if elem or buki:
        return 3
    return 0


def _build_effect_ent(bunrui_list, scope, elem, buki, txt_elem, txt_buki, tokushu,
                       condition, emin, emax, calc_type=None, bairitu_override=None):
    """Helper: build a single effect entry."""
    ent = {'bunrui': bunrui_list, 'scope': scope}
    if scope == 2:
        if txt_elem: ent['element'] = txt_elem
        if txt_buki: ent['type']    = txt_buki
    elif scope == 3:
        if elem: ent['element'] = elem
        if buki: ent['type']    = buki
    elif scope == 5:
        if tokushu: ent['name'] = tokushu
    ent['condition'] = condition
    if emin is not None: ent['bairitu_init'] = emin
    if bairitu_override is not None:
        ent['bairitu'] = bairitu_override
    elif emax is not None:
        ent['bairitu'] = emax
    ent['calc_type'] = calc_type if calc_type is not None else crystal_calc_type(bunrui_list)
    # Placeholder default
    if ent.get('bairitu') is None:
        ent['bairitu'] = 1
        ent['calc_type'] = 0
    return ent


def parse_row(row):
    raw = htmlmod.unescape(row.get('data-contents', '{}'))
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return None
    tds = row.find_all('td')
    if len(tds) < 2:
        return None

    fields = parse_right_col(tds[1])
    emin, emax = parse_effect_amount(fields.get('効果量', ''))

    altema_bunrui = list(d.get('bunrui', []))
    elem        = d.get('element') or 0
    buki        = d.get('buki_type') or 0
    tokushu     = fields.get('特殊条件', '')
    effect_text = fields.get('効果', '')
    scope       = compute_scope(elem, buki, effect_text, tokushu)

    # Bunrui = altema labeling ∪ classify_effect text supplement
    # 修「攻撃全体化&攻撃力DOWN」缺 [1]、crystal/584・977「攻撃力DOWN」標籤 [16] 缺 [1] 等。
    # classify_effect の _find_kw_pos が「攻撃時」等の false-positive を排除済み。
    kw_bunrui = list(classify_effect(effect_text)['bunrui']) if effect_text else []
    bunrui_set = set(altema_bunrui) | set(kw_bunrui)
    bunrui_list = sorted(bunrui_set) if bunrui_set else []

    txt_elem, txt_buki = extract_elem_buki(effect_text)
    condition = detect_condition(effect_text)

    # Multi-entry split: 「ダメージ上限UP&結晶枠+N(上限N)」 形式は限+枠 二段に split。
    # 限 segment は 効果量 (emin/emax) を継承、枠 segment は inline +N を bairitu に。
    slot_match = re.search(r'結晶枠[+＋](\d+)', effect_text)
    effects = []

    if slot_match and 19 in bunrui_set:
        slot_n = int(slot_match.group(1))
        # Main segment (e.g. ダメージ上限UP) — 限/その他 stat、effect_amount を使用
        main_bunrui = sorted(bunrui_set - {19}) or [16]
        main_ent = _build_effect_ent(main_bunrui, scope, elem, buki, txt_elem, txt_buki,
                                       tokushu, condition, emin, emax)
        # Slot segment — inline +N、固定 calc_type=1
        slot_ent = _build_effect_ent([19], scope, elem, buki, txt_elem, txt_buki,
                                       tokushu, condition, None, None,
                                       calc_type=1, bairitu_override=slot_n)
        classify_hit_fields(effect_text, main_ent)
        effects = [main_ent, slot_ent]
    else:
        # Single entry path (most cases)
        ent = _build_effect_ent(bunrui_list, scope, elem, buki, txt_elem, txt_buki,
                                  tokushu, condition, emin, emax)
        classify_hit_fields(effect_text, ent)
        if 7 in (ent.get('bunrui') or []) and ent.get('hit_per_stage'):
            ent['bairitu'] = max(ent['hit_per_stage'])
        effects = [ent]

    # Merge pass: 同 (bairitu, calc_type, scope, condition, element, type, name) entries 合并 bunrui[]
    # chara/bg crawler と一致。
    def _merge_key(e):
        return (e.get('bairitu'), e.get('calc_type'), e.get('scope'),
                e.get('condition'), e.get('element'), e.get('type'), e.get('name'))
    merged = []
    for e in effects:
        k = _merge_key(e)
        for m in merged:
            if _merge_key(m) == k:
                m['bunrui'] = sorted(set(m['bunrui']) | set(e['bunrui']))
                break
        else:
            merged.append(e)
    effects = merged

    crystal = {
        'id':     d.get('id'),
        'name':   d.get('name', ''),
        'kana':   d.get('kana', ''),
        'rarity': d.get('rea'),
    }
    # '効果' is renamed to 'effect_text' on output (统一 schema); 其他 Japanese keys 保留
    for k in ['効果', '効果量', '特殊条件', '対象', '上限値', '入手方法']:
        v = fields.get(k)
        if v is not None:
            crystal['effect_text' if k == '効果' else k] = v
    crystal['effects'] = effects
    return crystal


def split_pure_memory(crystals):
    """
    「○○の純真記憶」結晶を ･攻 / ･速 二件に拡張。
    元 entry に tombstone=True + split_into=[攻id, 速id] を付け、新 2 件 (bunrui 単一化) を追加。
    ID は元 id に決定的オフセット：攻 = 元id+100000、速 = 元id+200000。
    """
    pure = [c for c in crystals if c.get('name', '').endswith('の純真記憶')]
    new_entries = []
    for c in pure:
        if not c.get('effects'):
            continue
        oid = c.get('id') or 0
        atk_id, spd_id = oid + 100000, oid + 200000
        atk = copy.deepcopy(c)
        atk['id'] = atk_id
        atk['name'] = c['name'] + '･攻'
        atk['effect_text'] = '攻撃力UP'
        atk['effects'][0]['bunrui'] = [1]
        spd = copy.deepcopy(c)
        spd['id'] = spd_id
        spd['name'] = c['name'] + '･動'
        spd['effect_text'] = '攻撃モーション速度UP'
        spd['effects'][0]['bunrui'] = [5]
        new_entries.extend([atk, spd])
        c['tombstone'] = True
        c['split_into'] = [atk_id, spd_id]
    crystals.extend(new_entries)
    if pure:
        print(f"Split {len(pure)} 純真記憶 crystals → {len(new_entries)} new entries (id +100000/+200000)")


def main():
    parser = argparse.ArgumentParser(description="Altema BxB 記憶結晶 Crawler")
    parser.add_argument("--rerun", action="store_true", help="Full re-fetch (default behavior)")
    parser.add_argument("--recal", action="store_true", help="No-op for crystal (no pipeline)")
    parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    out_path = os.path.join(DATA_DIR, OUTPUT_FILE)

    print(f"Fetching {LIST_URL} ...")
    resp = requests.get(LIST_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup  = BeautifulSoup(resp.text, 'html.parser')
    rows  = soup.find_all('tr', class_='row')
    print(f"Found {len(rows)} rows")

    crystals = [c for row in rows if (c := parse_row(row))]
    print(f"Parsed {len(crystals)} crystals")

    split_pure_memory(crystals)

    # NOTE: crystals_revise.json は recal 時に crystals.json に merge しない。
    # crystals.json は純粋な parser 出力として保ち、revise は frontend
    # (crystals.html / hensei.html) がランタイムで deepApply する。

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(crystals, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(crystals)} crystals to {OUTPUT_FILE}")


if __name__ == '__main__':
    main()
