#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract E3 (B.D.攻撃力 skills) and E6 (S-other_self_0→1 mixed) lists."""
import json, os, sys, re, unicodedata
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR   = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)
from classify_common import classify_skill_chara, CAT_TO_BUNRUI_SKILLLIST

chars = json.load(open(os.path.join(BASE_DIR, 'characters.json'), encoding='utf-8'))
table = json.load(open(os.path.join(BASE_DIR, 'skilllist_table.json'), encoding='utf-8'))

def normalize_field(v):
    if isinstance(v, int): return [v]
    if isinstance(v, list): return sorted(v)
    return []

e3_seen = {}   # effect_text → (chara_name, skill_name, stored_bun, fresh_bun)
e6_seen = {}   # effect_text → (chara_name, skill_name)

for chara in chars:
    cn = chara.get('name', '')
    for sn, sd in chara.get('states', {}).items():
        for skill in sd.get('skills', []):
            skn = skill.get('name', '')
            eff = skill.get('effect', '')
            s_bun = normalize_field(skill.get('bunrui', []))
            s_sco = skill.get('scope')

            fresh = {'name': skn, 'effect': eff}
            classify_skill_chara(fresh, table, CAT_TO_BUNRUI_SKILLLIST)
            fe = (fresh.get('effects') or [{}])[0]
            f_bun = normalize_field(fe.get('bunrui', []))
            f_sco = fe.get('scope')

            # E3: B.D.攻撃力 skills
            if re.search(r'B\.D\.攻撃力|BD攻撃力', eff):
                if eff not in e3_seen:
                    e3_seen[eff] = (cn, skn, s_bun, f_bun)

            # E6: S-other_self_0→1 (stored=0, fresh=1, not HP/evasion/revival/受取/味方)
            if s_sco == 0 and f_sco == 1:
                enorm = unicodedata.normalize('NFKC', eff)
                # exclude specific sub-patterns already handled
                if re.search(r'残HP|HP残量|損傷率|HPが少ないほど|HPが多いほど', enorm):
                    continue
                if re.search(r'回避する|回避できる', enorm) and '他魔剣' not in enorm:
                    continue
                if '復活' in enorm and '味方' not in enorm:
                    continue
                if re.search(r'他魔剣からのスキル効果を受けられる', enorm):
                    continue
                if re.search(r'味方|全員', enorm):
                    continue
                # this is the E6 group
                if eff not in e6_seen:
                    e6_seen[eff] = (cn, skn)

# ── Write E3 ────────────────────────────────────────────────────────────────
e3_path = os.path.join(BASE_DIR, 'e3_bd_atk.txt')
with open(e3_path, 'w', encoding='utf-8') as f:
    f.write(f"E3: B.D.攻撃力 skills  ({len(e3_seen)} unique effect texts)\n\n")
    for eff, (cn, skn, s_bun, f_bun) in sorted(e3_seen.items(), key=lambda x: x[1][0]):
        f.write(f"魔剣: {cn}\n")
        f.write(f"技能: {skn}\n")
        f.write(f"效果: {eff}\n")
        f.write(f"stored={s_bun}  fresh={f_bun}\n\n")
print(f"E3 written: {e3_path}  ({len(e3_seen)} entries)")

# ── Write E6 ────────────────────────────────────────────────────────────────
e6_path = os.path.join(BASE_DIR, 'e6_other_self.txt')
with open(e6_path, 'w', encoding='utf-8') as f:
    f.write(f"E6: scope 0→1 mixed group  ({len(e6_seen)} unique effect texts)\n\n")
    for eff, (cn, skn) in sorted(e6_seen.items(), key=lambda x: x[1][0]):
        f.write(f"魔剣: {cn}\n")
        f.write(f"技能: {skn}\n")
        f.write(f"效果: {eff}\n\n")
print(f"E6 written: {e6_path}  ({len(e6_seen)} entries)")
