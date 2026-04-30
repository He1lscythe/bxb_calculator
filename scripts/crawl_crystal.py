#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Altema BxB 記憶結晶 crawler

用法:
  python crawl_crystal.py          # 全量抓取（单页，每次重新抓）
  python crawl_crystal.py --rerun  # 同上（接口一致用）
  python crawl_crystal.py --recal  # 同上（无分类pipeline，行为不变）
"""

import argparse, requests, json, re, os, html as htmlmod
from bs4 import BeautifulSoup
from classify_common import classify_hit_fields

CRYSTAL_ADD_BUNRUI = {6, 7, 9, 11, 16, 17, 19}

ELEMENT_MAP = {'火': 1, '水': 2, '風': 3, '光': 4, '闇': 5, '無': 6}
WEAPON_MAP  = {
    '長剣': 1, '大剣': 2, '太刀': 3, '杖棒': 4, '弓矢': 5, '連弩': 6,
    '戦斧': 7, '騎槍': 8, '投擲': 9, '拳闘': 10, '魔典': 11, '大鎌': 12,
}

_HUSHIN = re.compile(r'残HPが多いほど|HP残量が多いほど|残りHP(?:が)?多いほど|損傷率が低いほど')
_HAISUI = re.compile(r'残HPが少ないほど|HP残量が少ないほど|残りHP(?:が)?少ないほど|HPが少ないほど|損傷率が高いほど|HPを消耗するほど|HPが消耗するほど')
_BROKEN = re.compile(r'破損状態')


def detect_condition(text):
    if _BROKEN.search(text): return 3
    if _HUSHIN.search(text): return 1
    if _HAISUI.search(text): return 2
    return 0


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

    bunrui_list = d.get('bunrui', [])
    elem        = d.get('element') or 0
    buki        = d.get('buki_type') or 0
    tokushu     = fields.get('特殊条件', '')
    effect_text = fields.get('効果', '')
    scope       = compute_scope(elem, buki, effect_text, tokushu)

    txt_elem, txt_buki = extract_elem_buki(effect_text)
    condition = detect_condition(effect_text)

    effect_ent = {'bunrui': bunrui_list, 'scope': scope}
    if scope == 2:
        if txt_elem: effect_ent['element'] = txt_elem
        if txt_buki: effect_ent['type']    = txt_buki
    elif scope == 3:
        if elem: effect_ent['element'] = elem
        if buki: effect_ent['type']    = buki
    elif scope == 5:
        if tokushu: effect_ent['name'] = tokushu
    effect_ent['condition'] = condition
    if emin is not None: effect_ent['bairitu_init'] = emin
    if emax is not None: effect_ent['bairitu']      = emax
    effect_ent['calc_type'] = crystal_calc_type(bunrui_list)

    crystal = {
        'id':     d.get('id'),
        'name':   d.get('name', ''),
        'kana':   d.get('kana', ''),
        'rarity': d.get('rea'),
    }
    for k in ['効果', '効果量', '特殊条件', '対象', '上限値', '入手方法']:
        v = fields.get(k)
        if v is not None:
            crystal[k] = v
    classify_hit_fields(effect_text, effect_ent)
    crystal['effects'] = [effect_ent]
    return crystal


def main():
    parser = argparse.ArgumentParser(description="Altema BxB 記憶結晶 Crawler")
    parser.add_argument("--rerun", action="store_true", help="Full re-fetch (default behavior)")
    parser.add_argument("--recal", action="store_true", help="No-op for crystal (no pipeline)")
    parser.parse_args()

    out_path    = os.path.join(DIR, OUTPUT_FILE)
    revise_path = os.path.join(DIR, 'crystals_revise.json')

    print(f"Fetching {LIST_URL} ...")
    resp = requests.get(LIST_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup  = BeautifulSoup(resp.text, 'html.parser')
    rows  = soup.find_all('tr', class_='row')
    print(f"Found {len(rows)} rows")

    crystals = [c for row in rows if (c := parse_row(row))]
    print(f"Parsed {len(crystals)} crystals")

    def deep_update(target, patch):
        for k, v in patch.items():
            if k == 'id':
                continue
            tv = target.get(k)
            # Sparse array diff: target is list, patch is dict with all-numeric keys
            if isinstance(tv, list) and isinstance(v, dict) and v and \
                    all(isinstance(kk, str) and kk.isdigit() for kk in v.keys()):
                for ki, pi in v.items():
                    idx = int(ki)
                    if idx >= len(tv):
                        continue
                    if isinstance(pi, dict) and isinstance(tv[idx], dict):
                        deep_update(tv[idx], pi)
                    else:
                        tv[idx] = pi
            elif isinstance(v, dict) and isinstance(tv, dict):
                deep_update(tv, v)
            else:
                target[k] = v
    if os.path.exists(revise_path):
        with open(revise_path, encoding='utf-8') as f:
            revise_map = {c['id']: c for c in json.load(f)}
        if revise_map:
            idx_map = {c['id']: i for i, c in enumerate(crystals)}
            patched = 0
            for rid, record in revise_map.items():
                if rid in idx_map:
                    deep_update(crystals[idx_map[rid]], record)
                    patched += 1
                else:
                    print(f"  [revise] id={rid} not found in crystals, skipping")
            print(f"Applied {patched} revise patches")

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(crystals, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(crystals)} crystals to {OUTPUT_FILE}")


if __name__ == '__main__':
    main()
