#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One-off migration: crystals.json + crystals_revise.json field restructuring

Changes:
  - Remove top-level element, buki_type
  - Replace effects[].jyoken with effects[].scope
  - Add element/type/name to effects entries where applicable

Scope mapping:
  特殊条件 present             → scope=5  (name = 特殊条件 value)
  同装備セット in 効果          → scope=2
  element!=0 or buki_type!=0  → scope=3  (element and/or type added)
  otherwise                   → scope=0
"""

import json, os

CRYSTAL_ADD_BUNRUI = {6, 7, 9, 11, 16, 17, 19}


def crystal_calc_type(bunrui_list):
    return 1 if any(b in CRYSTAL_ADD_BUNRUI for b in bunrui_list) else 0


def compute_scope(elem, buki, effect_text, tokushu):
    if tokushu:
        return 5
    if '同装備セット' in (effect_text or ''):
        return 2
    if elem or buki:
        return 3
    return 0


def migrate_new_format(c):
    """Migrate entry that already has effects[] array (current crystals.json format)."""
    elem = c.pop('element', 0) or 0
    buki = c.pop('buki_type', 0) or 0
    effect_text = c.get('効果', '')
    tokushu = c.get('特殊条件', '')
    scope = compute_scope(elem, buki, effect_text, tokushu)

    new_effects = []
    for eff in c.get('effects', []):
        eff.pop('jyoken', None)

        new_eff = {'bunrui': eff.get('bunrui', [])}
        new_eff['scope'] = scope
        if scope == 3:
            if elem: new_eff['element'] = elem
            if buki: new_eff['type'] = buki
        elif scope == 5:
            if tokushu: new_eff['name'] = tokushu
        if eff.get('effect_min') is not None: new_eff['effect_min'] = eff['effect_min']
        if eff.get('effect_max') is not None: new_eff['effect_max'] = eff['effect_max']
        if eff.get('or'): new_eff['or'] = True
        new_eff['calc_type'] = eff.get('calc_type', crystal_calc_type(eff.get('bunrui', [])))
        new_effects.append(new_eff)

    c['effects'] = new_effects
    return c


def migrate_old_format(c, ref_entry=None):
    """Migrate old-format entry (flat bunrui/jyoken/effect_min/effect_max, no effects[])."""
    elem    = c.pop('element', 0) or 0
    buki    = c.pop('buki_type', 0) or 0
    c.pop('jyoken', None)
    bunrui  = c.pop('bunrui', [])
    emin    = c.pop('effect_min', None)
    emax    = c.pop('effect_max', None)
    or_flag = c.pop('or', None)

    effect_text = c.get('効果', '')
    tokushu     = c.get('特殊条件', '')
    scope = compute_scope(elem, buki, effect_text, tokushu)

    eff = {'bunrui': bunrui}
    eff['scope'] = scope
    if scope == 3:
        if elem: eff['element'] = elem
        if buki: eff['type'] = buki
    elif scope == 5:
        if tokushu: eff['name'] = tokushu
    if emin is not None: eff['effect_min'] = emin
    if emax is not None: eff['effect_max'] = emax
    # recover 'or' from reference entry if not present in old format
    if or_flag:
        eff['or'] = True
    elif ref_entry:
        ref_eff = (ref_entry.get('effects') or [{}])[0]
        if ref_eff.get('or'):
            eff['or'] = True
    eff['calc_type'] = crystal_calc_type(bunrui)

    c['effects'] = [eff]
    return c


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # ── crystals.json ────────────────────────────────────────────────
    crystals_path = os.path.join(root, 'crystals.json')
    with open(crystals_path, encoding='utf-8') as f:
        crystals = json.load(f)

    ref_map = {c['id']: c for c in crystals}

    count = 0
    for c in crystals:
        if 'effects' in c:
            migrate_new_format(c)
            count += 1

    with open(crystals_path, 'w', encoding='utf-8') as f:
        json.dump(crystals, f, ensure_ascii=False, indent=2)
    print(f'Migrated {count} crystals in crystals.json')

    # ── crystals_revise.json ─────────────────────────────────────────
    revise_path = os.path.join(root, 'crystals_revise.json')
    if not os.path.exists(revise_path):
        print('crystals_revise.json not found, skipping')
        return

    with open(revise_path, encoding='utf-8') as f:
        revises = json.load(f)

    for c in revises:
        ref = ref_map.get(c['id'])
        if 'effects' in c:
            migrate_new_format(c)
        else:
            migrate_old_format(c, ref)

    with open(revise_path, 'w', encoding='utf-8') as f:
        json.dump(revises, f, ensure_ascii=False, indent=2)
    print(f'Migrated {len(revises)} entries in crystals_revise.json')


if __name__ == '__main__':
    main()
