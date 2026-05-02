#!/usr/bin/env python3
"""Fix omoide: rename threshold 100 → 10, copy slots from threshold 200."""
import json, os, copy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')

FILES = ['characters.json', 'characters_revise.json']


def fix(chars):
    changed = 0
    for c in chars:
        omoide = c.get('omoide')
        if not omoide:
            continue
        idx_100 = next((i for i, r in enumerate(omoide) if r['threshold'] == 100), None)
        if idx_100 is None:
            continue
        slots_200 = next((r['slots'] for r in omoide if r['threshold'] == 200), [])
        omoide[idx_100]['threshold'] = 10
        omoide[idx_100]['slots'] = copy.deepcopy(slots_200)
        changed += 1
    return changed


for fname in FILES:
    path = os.path.join(DATA_DIR, fname)
    if not os.path.exists(path):
        print(f'Skip (not found): {fname}')
        continue
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, list):
        print(f'Skip (not a list): {fname}')
        continue
    n = fix(data)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'{fname}: {n} characters fixed')

print('Done.')
