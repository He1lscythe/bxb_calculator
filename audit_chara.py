#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Audit character skill classifications.
Re-runs classify_skill_chara on every skill and reports:
  1. Mismatches between stored and fresh classification
  2. Suspicious patterns (scope/bunrui heuristics)
"""

import json
import os
import sys
import re
import copy
import unicodedata

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from classify_common import (
    classify_skill_chara, CAT_TO_BUNRUI_SKILLLIST,
    ELEMENT_MAP, WEAPON_TYPE_MAP,
    _detect_scope, _detect_condition, classify_effect,
    _HUSHIN, _HAISUI, _BROKEN, _HP_COST,
)

# ── Load data ───────────────────────────────────────────────────────────────
chars = json.load(open(os.path.join(BASE_DIR, 'characters_classified.json'), encoding='utf-8'))
table = json.load(open(os.path.join(BASE_DIR, 'skilllist_table.json'), encoding='utf-8'))

ELEMENT_NAMES = {v: k for k, v in ELEMENT_MAP.items()}
WEAPON_NAMES  = {v: k for k, v in WEAPON_TYPE_MAP.items()}

def fmt_elem(e):
    if e is None: return ''
    if isinstance(e, int): return ELEMENT_NAMES.get(e, str(e))
    return '/'.join(ELEMENT_NAMES.get(x, str(x)) for x in e)

def fmt_type(t):
    if t is None: return ''
    if isinstance(t, int): return WEAPON_NAMES.get(t, str(t))
    return '/'.join(WEAPON_NAMES.get(x, str(x)) for x in t)

def normalize_field(v):
    if isinstance(v, int): return [v]
    if isinstance(v, list): return sorted(v)
    return []

issues = []

for chara in chars:
    chara_name = chara.get('name', '')
    chara_id   = chara.get('id')
    for state_name, state_data in chara.get('states', {}).items():
        for skill in state_data.get('skills', []):
            sk_name = skill.get('name', '')
            effect  = skill.get('effect', '')

            # Stored values
            stored_bunrui = normalize_field(skill.get('bunrui', []))
            stored_scope  = skill.get('scope')
            stored_cond   = skill.get('condition')
            stored_eff0   = (skill.get('effects') or [{}])[0]
            stored_elem   = normalize_field(stored_eff0.get('element'))
            stored_type   = normalize_field(stored_eff0.get('type'))

            # Fresh classification
            fresh = {'name': sk_name, 'effect': effect}
            classify_skill_chara(fresh, table, CAT_TO_BUNRUI_SKILLLIST)
            fe    = (fresh.get('effects') or [{}])[0]
            fresh_bunrui = normalize_field(fe.get('bunrui', []))
            fresh_scope  = fe.get('scope')
            fresh_cond   = fe.get('condition')
            fresh_elem   = normalize_field(fe.get('element'))
            fresh_type   = normalize_field(fe.get('type'))

            reasons = []

            # ── Mismatch: bunrui changed ──────────────────────────────────
            if stored_bunrui != fresh_bunrui:
                reasons.append(f'bunrui: {stored_bunrui}→{fresh_bunrui}')

            # ── Mismatch: scope changed ───────────────────────────────────
            if stored_scope != fresh_scope:
                reasons.append(f'scope: {stored_scope}→{fresh_scope}')

            # ── Mismatch: condition changed ───────────────────────────────
            if stored_cond != fresh_cond:
                reasons.append(f'cond: {stored_cond}→{fresh_cond}')

            # ── Suspicious: fallback bunrui=[16] alone ────────────────────
            if fresh_bunrui == [16] and effect.strip():
                # Check if effect has recognizable content that 16 doesn't fit
                ekw = ['攻撃力', '防御力', 'HP', 'ヒット', 'ゲージ', 'スピード',
                       'モーション', 'ブレイク', 'サファイア', 'ルビー', 'バリア',
                       'ダメージ上限', '経験値', '回復', '復活', '結晶']
                if any(k in effect for k in ekw):
                    reasons.append('suspicious: fallback bunrui=[16] but effect has keywords')

            # ── Suspicious: scope=2 but no element or type detected ────────
            if fresh_scope == 2 and not fresh_elem and not fresh_type:
                reasons.append('suspicious: scope=2 but no element/type')

            # ── Suspicious: scope=1 but 自身/自分 in effect ────────────────
            if fresh_scope == 1:
                e_norm = unicodedata.normalize('NFKC', effect)
                if '自身' in e_norm or '自分' in e_norm:
                    reasons.append('suspicious: scope=1 but 自身/自分 in effect')

            # ── Suspicious: scope=0 but 全員/味方全体 in effect ───────────
            if fresh_scope == 0:
                e_norm = unicodedata.normalize('NFKC', effect)
                if '全員' in e_norm or '味方全体' in e_norm:
                    reasons.append('suspicious: scope=0 but 全員/味方全体 in effect')

            if reasons:
                issues.append({
                    'chara':   chara_name,
                    'id':      chara_id,
                    'state':   state_name,
                    'skill':   sk_name,
                    'effect':  effect,
                    's_bun':   stored_bunrui,
                    's_sco':   stored_scope,
                    's_cond':  stored_cond,
                    's_elem':  stored_elem,
                    's_type':  stored_type,
                    'f_bun':   fresh_bunrui,
                    'f_sco':   fresh_scope,
                    'f_cond':  fresh_cond,
                    'f_elem':  fresh_elem,
                    'f_type':  fresh_type,
                    'reasons': '; '.join(reasons),
                })

# ── Output ───────────────────────────────────────────────────────────────────
print(f"Total issues: {len(issues)}")
print()

# Group by reason type for summary
from collections import Counter
reason_counts = Counter()
for iss in issues:
    for r in iss['reasons'].split('; '):
        key = r.split(':')[0].strip()
        reason_counts[key] += 1
print("Summary by type:")
for k, v in reason_counts.most_common():
    print(f"  {k}: {v}")
print()

# Full dump to file
out_path = os.path.join(BASE_DIR, 'chara_audit.txt')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(f"Total issues: {len(issues)}\n\n")
    for iss in issues:
        f.write(f"[{iss['chara']}] ({iss['state']}) «{iss['skill']}»\n")
        f.write(f"  effect: {iss['effect']}\n")
        f.write(f"  stored: bunrui={iss['s_bun']} scope={iss['s_sco']} cond={iss['s_cond']}"
                f" elem={fmt_elem(iss['s_elem'] or None)} type={fmt_type(iss['s_type'] or None)}\n")
        f.write(f"  fresh:  bunrui={iss['f_bun']} scope={iss['f_sco']} cond={iss['f_cond']}"
                f" elem={fmt_elem(iss['f_elem'] or None)} type={fmt_type(iss['f_type'] or None)}\n")
        f.write(f"  reason: {iss['reasons']}\n\n")

print(f"Full dump: {out_path}")
