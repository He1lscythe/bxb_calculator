#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""scripts/crawl_masou.py — 爬 https://altema.jp/bxb/masoulist 写 data/masou.json

Schema:
  id           : 魔装 ID（image URL から）
  name         : 魔装名
  chara_id     : 対応魔剣 ID（href /bxb/chara/{id} から）
  chara_name   : 対応魔剣名
  image        : icon URL
  effect_text  : 効果原文（複数効果は ' / ' で結合）
  effects      : classify_effect 由来 — 既存 schema と完全一致 (bunrui/scope/condition/bairitu/calc_type/bairitu_scaling, optional element/type)
  acquisition  : 入手元

実行: python scripts/crawl_masou.py [--cached]
  --cached  使用 scripts/_masou_raw.html（キャッシュ）, 無ければ fetch
"""
import json
import os
import re
import sys

import requests
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(__file__))
from classify_common import classify_effect, _val_for_bunrui, norm  # noqa: E402

URL  = 'https://altema.jp/bxb/masoulist'
CACHE = os.path.join(os.path.dirname(__file__), '_masou_raw.html')
OUT  = os.path.join(ROOT, 'data', 'masou.json')
REV  = os.path.join(ROOT, 'data', 'masou_revise.json')


def fetch_html(use_cache=False):
    if use_cache and os.path.exists(CACHE):
        return open(CACHE, encoding='utf-8').read()
    r = requests.get(URL, headers={'User-Agent': 'Mozilla/5.0 (BxB-crawl)'} , timeout=30)
    r.encoding = 'utf-8'
    with open(CACHE, 'w', encoding='utf-8') as f:
        f.write(r.text)
    return r.text


def parse_row(row):
    cells = row.find_all(['th', 'td'])
    if len(cells) < 2:
        return None
    c0, c1 = cells[0], cells[1]
    img = c0.find('img')
    src = (img.get('data-lazy-src') or img.get('src')) if img else None
    m = re.search(r'/icon/(\d+)\.jpg', src or '')
    if not m:
        return None
    masou_id = int(m.group(1))
    masou_name = c0.get_text(strip=True)

    a = c1.find('a', href=re.compile(r'/bxb/chara/\d+'))
    chara_id = None
    if a:
        m2 = re.search(r'/bxb/chara/(\d+)', a.get('href', ''))
        if m2: chara_id = int(m2.group(1))

    # cell1 children split by <br> tags into text segments
    parts = []
    for elem in c1.children:
        if getattr(elem, 'name', None) == 'br':
            continue
        txt = elem.get_text(strip=True) if hasattr(elem, 'get_text') else str(elem).strip()
        if txt:
            parts.append(txt)

    # 标签 (unicode escape — 避免 cmd 编码畸变 / 实际格式 『【…】』)
    # parts[0] = 【効果】, parts[N] = 【対象魔剣】, parts[M] = 【入手方法】
    LBL_CHARA = '【対象魔剣】'   # 【対象魔剣】
    LBL_ACQ   = '【入手方法】'   # 【入手方法】
    try:
        idx_chara_label = parts.index(LBL_CHARA)
    except ValueError:
        return None
    idx_acq_label = parts.index(LBL_ACQ) if LBL_ACQ in parts else None
    eff_parts = parts[1:idx_chara_label]
    chara_name = parts[idx_chara_label + 1] if idx_chara_label + 1 < len(parts) else ''
    if idx_acq_label is not None and idx_acq_label + 1 < len(parts):
        acq_text = parts[idx_acq_label + 1]
    else:
        acq_text = ''

    # classify each effect text into per-bunrui effect entries (chara mode → 默認 scope=1)
    effects = []
    for eff_text in eff_parts:
        cls = classify_effect(eff_text, scope_mode='chara')
        bnr = cls.get('bunrui') or []
        if not bnr:
            continue
        scope = cls.get('scope', 1)
        cond = cls.get('condition', 0)
        normed = norm(eff_text)
        for b in bnr:
            v, ct = _val_for_bunrui(normed, b)
            if v is None:
                v, ct = 1, 0
            if ct is None:
                ct = 0
            ent = {
                'bunrui': [b],
                'scope': scope,
                'condition': cond,
                'bairitu': round(float(v), 6),
                'bairitu_scaling': 0,
                'calc_type': ct,
            }
            if cls.get('element') is not None:
                ent['element'] = cls['element']
            if cls.get('weapon') is not None:
                ent['weapon'] = cls['weapon']
            effects.append(ent)

    return {
        'id': masou_id,
        'name': masou_name,
        'chara_id': chara_id,
        'chara_name': chara_name,
        'image': f'https://img.altema.jp/bxb/masou/icon/{masou_id}.jpg',
        'effect_text': ' / '.join(eff_parts),
        'effects': effects,
        'acquisition': acq_text,
    }


def main():
    use_cache = '--cached' in sys.argv
    html = fetch_html(use_cache=use_cache)
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if len(tables) < 3:
        print('ERROR: expected at least 3 tables, found', len(tables))
        sys.exit(1)
    rows = tables[2].find_all('tr')[1:]  # skip header

    parsed = []
    skipped = 0
    for r in rows:
        rec = parse_row(r)
        if rec is None:
            skipped += 1
            continue
        parsed.append(rec)
    parsed.sort(key=lambda x: x['id'])

    # validate against characters.json
    chara_data = json.load(open(os.path.join(ROOT, 'data', 'characters.json'), encoding='utf-8'))
    valid_ids = {c['id'] for c in chara_data}
    name_by_id = {c['id']: c.get('name', '') for c in chara_data}
    unmatched = [m for m in parsed if m['chara_id'] not in valid_ids]

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2)
    if not os.path.exists(REV):
        with open(REV, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False, indent=2)

    no_eff = [m for m in parsed if not m['effects']]
    by_chara = {}
    for m in parsed:
        by_chara.setdefault(m['chara_id'], []).append(m['id'])

    print(f'rows in table: {len(rows)} | parsed: {len(parsed)} | skipped: {skipped}')
    print(f'wrote {OUT}')
    print(f'unique charas covered: {len(by_chara)} / {len(valid_ids)}')
    print(f'masou with empty effects (effect text not classifiable): {len(no_eff)}')
    print(f'masou with chara_id NOT in characters.json: {len(unmatched)}')
    if unmatched:
        print('  (sample)', [(m["id"], m["chara_id"], m["chara_name"]) for m in unmatched[:5]])

    # name vs chara_name sanity check
    name_mismatch = []
    for m in parsed:
        gold = name_by_id.get(m['chara_id'])
        if gold and m['chara_name'] and m['chara_name'] != gold:
            name_mismatch.append((m['id'], m['chara_name'], gold))
    if name_mismatch:
        print(f'name mismatches (page name != characters.json name): {len(name_mismatch)}')
        for sample in name_mismatch[:3]:
            print('  ', sample)


if __name__ == '__main__':
    main()
