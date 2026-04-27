#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Classify audit issues into named patterns, count each.
"""
import json, os, sys, re, unicodedata, copy
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR   = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)
from classify_common import (
    classify_skill_chara, CAT_TO_BUNRUI_SKILLLIST,
)

chars = json.load(open(os.path.join(BASE_DIR, 'characters_classified.json'), encoding='utf-8'))
table = json.load(open(os.path.join(BASE_DIR, 'skilllist_table.json'), encoding='utf-8'))

def normalize_field(v):
    if isinstance(v, int): return [v]
    if isinstance(v, list): return sorted(v)
    return []

patterns = {}  # name → list of (chara, skill, effect, stored, fresh)

def add(name, item):
    patterns.setdefault(name, []).append(item)

for chara in chars:
    cn = chara.get('name', '')
    for sn, sd in chara.get('states', {}).items():
        for skill in sd.get('skills', []):
            skn = skill.get('name', '')
            eff = skill.get('effect', '')
            s_bun = normalize_field(skill.get('bunrui', []))
            s_sco = skill.get('scope')
            s_con = skill.get('condition')

            fresh = {'name': skn, 'effect': eff}
            classify_skill_chara(fresh, table, CAT_TO_BUNRUI_SKILLLIST)
            fe = (fresh.get('effects') or [{}])[0]
            f_bun = normalize_field(fe.get('bunrui', []))
            f_sco = fe.get('scope')
            f_con = fe.get('condition')

            item = f'{cn} | {sn} | {skn} | {eff[:60]}'

            # ── Scope issues ──────────────────────────────────────────────
            if s_sco == 0 and f_sco == 1:
                enorm = unicodedata.normalize('NFKC', eff)
                if re.search(r'残HP|HP残量|損傷率|HPが少ないほど|HPが多いほど', enorm):
                    add('S-HP_cond_0→1', item)
                elif re.search(r'回避する|回避できる', enorm) and '他魔剣' not in enorm:
                    add('S-evasion_0→1', item)
                elif '復活' in enorm and '味方' not in enorm:
                    add('S-revival_0→1', item)
                elif re.search(r'属性不一致でも他魔剣|他魔剣からのスキル効果を受けられる', enorm):
                    add('S-recv_all_0→1', item)
                elif re.search(r'味方|全員|全魔剣', enorm):
                    add('S-party_stored_wrong_0→1', item)
                else:
                    add('S-other_self_0→1', item)

            elif s_sco == 0 and f_sco == 2:
                if '他魔剣からのスキル効果を受けられる' in eff:
                    add('S-recv_elem_0→2', item)
                else:
                    add('S-other_0→2', item)

            # ── Bunrui issues ─────────────────────────────────────────────
            if s_bun != f_bun:
                added   = sorted(set(f_bun) - set(s_bun))
                removed = sorted(set(s_bun) - set(f_bun))

                # B.D.コスト: stored=[6], fresh=[16]
                if 'B.D.コスト' in eff or 'BDコスト' in eff:
                    if s_bun == [6] and 16 in f_bun:
                        add('B-BDcost_6→16', item)
                    continue

                # BD攻撃力: stored=[3], fresh=[1,3]
                if ('B.D.攻撃力' in eff or 'BD攻撃力' in eff) and 1 in f_bun and 1 not in s_bun:
                    add('B-BD_atk_adds1', item)

                # ガードブレイクしやすく: stored=[16], fresh=[2,16]
                if 'ガードブレイク' in eff and 2 in f_bun and 2 not in s_bun:
                    add('B-guardbreak_adds2', item)

                # 攻撃がクリティカル / 攻撃が当たる確率 / 割合ダメージ攻撃: adds false 1
                if (re.search(r'攻撃が(クリティカル|当たる|当たらない)|割合ダメージ攻撃を', eff)
                        and 1 in f_bun and 1 not in s_bun):
                    add('B-atk_false1', item)

                # B.D.レベル上限: stored=[18], fresh=[16,18]
                if 'B.D.レベル上限' in eff and 16 in f_bun and 16 not in s_bun:
                    add('B-BD_lv_adds16', item)

                # モーション速度: stored=[5], fresh=[4,5]
                if ('モーション速度' in eff or '攻撃モーション' in eff) and 4 in f_bun and 4 not in s_bun:
                    add('B-motion_adds4', item)

                # ガード時防御力: stored=[13], fresh=[12,13]
                if re.search(r'ガード(時の|の|時)防御力', eff) and 12 in f_bun and 12 not in s_bun:
                    add('B-guard_def_adds12', item)

                # Blaze gauge: stored=[6], fresh=[6,18]
                if re.search(r'ブレイズゲージ', eff) and 18 in f_bun and 18 not in s_bun:
                    add('B-blaze_adds18', item)

                # HP%で復活: stored=[16], fresh=[11,16]
                if re.search(r'HP\d+%で復活', eff) and 11 in f_bun and 11 not in s_bun:
                    add('B-revival_adds11', item)

                # 損傷率が低いほど攻撃: stored=[16], fresh=[1]
                if '損傷率' in eff and s_bun == [16] and 1 in f_bun:
                    add('B-sonshoritsu_16→1', item)

                # BlazeLock回避 / 勇気分解回避: adds 16
                if (re.search(r'BlazeLock|勇気分解|麻痺|即死', unicodedata.normalize('NFKC', eff))
                        and '回避' in eff and 16 in f_bun and 16 not in s_bun):
                    add('B-evasion_adds16', item)

                # 味方が攻撃したルビー / 長剣味方攻撃力 → adds 1
                if (re.search(r'味方が攻撃した', eff) and 1 in f_bun and 1 not in s_bun):
                    add('B-mikata_atk_false1', item)

                # ダウン skills adding 16
                if re.search(r'ダウン', eff) and 16 in f_bun and 16 not in s_bun and not re.search(r'ガードブレイク', eff):
                    add('B-down_adds16', item)

                # lookup adds bunrui=1 to "攻撃力" text where not needed
                if (1 in f_bun and 1 not in s_bun
                        and re.search(r'攻撃力', eff)
                        and not re.search(r'B\.D\.攻撃力|BD攻撃力', eff)):
                    pass  # skip — already captured in specific categories

                # Generic: lookup adds bunrui=16
                if (16 in f_bun and 16 not in s_bun and s_bun
                        and not re.search(r'B\.D\.レベル|ガードブレイク|HP\d+%で復活|BlazeLock|勇気分解|麻痺|即死|ダウン|B\.D\.コスト|BDコスト', eff)):
                    add('B-lookup_adds16_generic', item)

            # ── Cond issues ───────────────────────────────────────────────
            if s_con != f_con:
                add(f'C-cond_{s_con}→{f_con}', item)

# ── Write summary ─────────────────────────────────────────────────────────
out = os.path.join(BASE_DIR, 'chara_audit_classify.txt')
with open(out, 'w', encoding='utf-8') as f:
    total = sum(len(v) for v in patterns.values())
    f.write(f"Total classified issue entries: {total}\n\n")
    for name, items in sorted(patterns.items(), key=lambda x: -len(x[1])):
        uniq = sorted(set(items))
        f.write(f"[{name}]  n={len(uniq)}\n")
        for it in uniq[:5]:
            f.write(f"  {it}\n")
        if len(uniq) > 5:
            f.write(f"  ... and {len(uniq)-5} more\n")
        f.write("\n")
print(f"Written to {out}")
