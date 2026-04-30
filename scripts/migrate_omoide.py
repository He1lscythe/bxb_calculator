#!/usr/bin/env python3
"""Expand omoide to full 40-slot structure in all character JSON files."""
import json
import os

THRESHOLDS = (
    [10, 200, 400, 700, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 9000, 11000, 13000, 15000]
    + list(range(18000, 90001, 3000))
)
assert len(THRESHOLDS) == 40

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def normalize(chars):
    for c in chars:
        existing = {row['threshold']: row['slots'] for row in (c.get('omoide') or [])}
        c['omoide'] = [{'threshold': t, 'slots': existing.get(t, [])} for t in THRESHOLDS]


for fname, write_js in [
    ('characters.json',            True),
    ('characters_revise.json',     False),
]:
    path = os.path.join(ROOT, fname)
    if not os.path.exists(path):
        print(f'Skip (not found): {fname}')
        continue
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, list):
        print(f'Skip (not a list): {fname}')
        continue
    normalize(data)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    if write_js:
        js_path = path.replace('.json', '.js')
        with open(js_path, 'w', encoding='utf-8') as f:
            f.write('var CHARA_DATA = ')
            json.dump(data, f, ensure_ascii=False)
            f.write(';\n')
    print(f'Updated {fname}: {len(data)} characters')

print('Done.')
