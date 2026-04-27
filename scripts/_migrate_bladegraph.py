#!/usr/bin/env python3
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def migrate(data):
    def norm_type(t):
        if isinstance(t, list):
            return t[0] if len(t) == 1 else 0
        return t
    out = []
    for e in data:
        n = {}
        n['id']   = e['id']
        n['name'] = e['name']
        n['rea']  = e['rea']
        ts = e.get('hatsudou_start') or e.get('time_start', '')
        te = e.get('hatsudou_end')   or e.get('time_end', '')
        if ts: n['time_start'] = ts
        if te: n['time_end']   = te
        n['acquisition'] = e.get('nyushu') or e.get('acquisition', '')
        if 'illustrator' in e:
            n['illustrator'] = e['illustrator']
        n['effect'] = e.get('effect', '')
        effs = []
        for eff in e.get('effects', []):
            ef2 = dict(eff)
            if 'type' in ef2:
                ef2['type'] = norm_type(ef2['type'])
            effs.append(ef2)
        n['effects'] = effs
        out.append(n)
    return out

for fname in ['bladegraph.json', 'bladegraph_revise.json']:
    path = os.path.join(ROOT, fname)
    if not os.path.exists(path):
        print(f'skip {fname}')
        continue
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    migrated = migrate(data)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(migrated, f, ensure_ascii=False, indent=2)
    print(f'Migrated {len(migrated)} entries in {fname}')
