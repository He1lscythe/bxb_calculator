#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共用技能分类模块 — crawl_soul.py / crawl_chara.py 共同引用
"""

import re
import unicodedata

# ============================================================
#  ELEMENT / WEAPON MAPS
# ============================================================
ELEMENT_MAP = {'火': 1, '水': 2, '風': 3, '光': 4, '闇': 5, '無': 6}
WEAPON_TYPE_MAP = {
    '長剣': 1, '大剣': 2, '太刀': 3, '杖棒': 4, '弓矢': 5,
    '連弩': 6, '戦斧': 7, '騎槍': 8, '投擲': 9, '拳闘': 10,
    '魔典': 11, '大鎌': 12,
}
_ELEMENTS_LIST    = list(ELEMENT_MAP)
_WEAPONS_LIST     = list(WEAPON_TYPE_MAP)
_WEAPON_NAMES_PAT = '|'.join(re.escape(w) for w in _WEAPONS_LIST)

STATUS_WORDS = ['勇気分解', '即死', '麻痺', 'スタン', 'BlazeLock', '行動不能', '割合ダメージ']

_HUSHIN   = re.compile(r'残HPが多いほど|HP残量が多いほど|残りHP(?:が)?多いほど|損傷率が低いほど')
_HAISUI   = re.compile(r'残HPが少ないほど|HP残量が少ないほど|残りHP(?:が)?少ないほど|HPが少ないほど|損傷率が高いほど|HPを消耗するほど|HPが消耗するほど')
_BROKEN   = re.compile(r'破損状態')
_HP_COST  = re.compile(r'HPを.{0,6}消費|HPを.{0,6}犠牲')  # HP used as cost, not buff

# ============================================================
#  LOOKUP TABLE — altema skilllist bunrui IDs → our bunrui
#  (角色技能: https://altema.jp/bxb/skilllist)
# ============================================================
CAT_TO_BUNRUI_SKILLLIST = {
    1:  1,   # 攻撃力UP
    2:  12,  # 防御力UP
    3:  10,  # HP上昇
    4:  4,   # スピードUP
    5:  3,   # BD攻撃力UP
    6:  9,   # 即死（回避）
    7:  9,   # 勇気分解（回避）
    8:  9,   # 行動不能（回避）
    9:  9,   # 割合ダメージ（回避）
    10: 11,  # HP回復
    11: 16,  # 復活
    12: 6,   # ブレイズゲージ回復
    13: 15,  # ルビーUP
    14: 7,   # ヒット数UP
    15: 13,  # 魔導バリア強化
    16: 14,  # サファイアUP
    17: 5,   # モーション速度UP
    18: 16,  # クリティカル
    19: 8,   # 全体攻撃
    20: 16,  # 属性不一致効果
    21: 2,   # ブレイク力
    22: 9,   # 麻痺（回避）
    23: 16,  # 修理短縮
    24: 16,  # 能力低下
    25: 20,  # ソウルEXP
    26: 18,  # BDゲージ最大値UP
    27: 16,  # BDロック
    28: 16,  # スキル付与
    29: 21,  # BDヒット数UP
    30: 14,  # サファイア減少
    31: 16,  # BDコストダウン
    32: 16,  # アイテム量UP
    33: 16,  # 命中率UP
    34: 17,  # ダメージ上限UP
    35: 16,  # BDレベル上限UP
    36: 16,  # 被弾率減少
    37: 6,   # BDゲージ上昇効率UP
    38: 19,  # 記憶結晶EXPUP
    39: 16,  # 自傷
}

# ============================================================
#  LOOKUP TABLE — altema soulskill category_ids → our bunrui
#  (魂技能: https://altema.jp/bxb/soulskill)
# ============================================================
CAT_TO_BUNRUI_SOULSKILL = {
    1:1,  2:12, 3:4,  4:5,  5:3,  6:2,  7:7,  8:21,
    9:16, 10:16,11:6, 12:10,13:15,14:14,
    15:1, 16:12,17:4, 18:5, 19:2, 20:7, 21:3,
    22:21,23:16,24:16,25:10,26:15,27:14,
    28:8, 29:9, 30:9, 31:9, 32:16,33:16,34:16,
    35:13,36:9, 37:9, 38:16,39:16,40:16,41:16,
    42:20,43:11,45:16,46:16,47:17,
    # 44 = 特定の魔剣対象 → scope only, no bunrui
}

# ============================================================
#  BUNRUI VALUE EXTRACTION
# ============================================================
ADD_BUNRUI  = {6, 7, 17, 18, 19, 21}
MULT_BUNRUI = {1, 2, 3, 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 20}

BUNRUI_KEYWORDS = {
    1:  ['攻撃力', '攻撃と', '攻撃・'],
    2:  ['ブレイク力'],
    3:  ['BD攻撃力', 'B.D.攻撃力'],
    4:  ['スピード', '行動速度', '速度'],
    5:  ['モーション速度', '攻撃モーション'],
    6:  ['ブレイズゲージ', 'Bゲージ', 'BDゲージ'],
    7:  ['ヒット数', 'Hit数'],
    10: ['HP'],
    11: ['HP回復'],
    12: ['防御力'],
    13: ['魔導バリア'],
    14: ['サファイア'],
    15: ['ルビー'],
    17: ['ダメージ上限'],
    18: ['ゲージの最大値'],
    19: ['記憶結晶枠'],
    20: ['経験値'],
    21: ['B.D.ヒット', 'BDヒット'],
    # 8, 9, 16: no numeric value
}

_V_OKU_UP   = re.compile(r'(\d+(?:\.\d+)?)億アップ')
_V_MAN_UP   = re.compile(r'(\d+(?:\.\d+)?)万アップ')
_V_PCT_DOWN = re.compile(r'(\d+(?:\.\d+)?)%DOWN')
_V_PCT_UP   = re.compile(r'(\d+(?:\.\d+)?)%(?:アップ|UP|増加|増える)')
_V_MAX_BAI  = re.compile(r'最大(\d+(?:\.\d+)?)倍')
_V_BAI      = re.compile(r'(\d+(?:\.\d+)?)倍')
_V_PLUS_N   = re.compile(r'[+＋](\d+(?:\.\d+)?)')
_V_GA_UP    = re.compile(r'が(\d+(?:\.\d+)?)アップ')
_COMMA_NUM  = re.compile(r'(?<=\d),(?=\d)')


def norm(effect):
    prev = None
    while prev != effect:
        prev = effect
        effect = _COMMA_NUM.sub('', effect)
    return effect


def _find_kw_pos(text, kw, bunrui):
    """Find first keyword position, with per-bunrui filtering."""
    pos = 0
    while True:
        idx = text.find(kw, pos)
        if idx < 0:
            return -1
        if bunrui == 1:
            before = text[max(0, idx - 4):idx]
            if 'BD' in before or 'B.D.' in before:
                pos = idx + 1
                continue
            if kw == '攻撃':
                after = text[idx + len(kw):]
                if re.match(r'[力モ範時すをのだし]', after):
                    pos = idx + 1
                    continue
        if bunrui == 4 and kw == '速度':
            # skip 'モーション速度'
            before = text[max(0, idx - 5):idx]
            if 'モーション' in before:
                pos = idx + 1
                continue
        return idx


def _extract_val_from_pos(text, pos, bunrui):
    """Collect all numeric patterns from text[pos:], return the one at the earliest position."""
    seg = text[pos:]
    candidates = []

    m = _V_OKU_UP.search(seg)
    if m: candidates.append((m.start(), float(m.group(1)) * 1e8))
    m = _V_MAN_UP.search(seg)
    if m: candidates.append((m.start(), float(m.group(1)) * 1e4))
    m = _V_PCT_DOWN.search(seg)
    if m: candidates.append((m.start(), round(1 - float(m.group(1)) / 100, 6)))
    m = _V_PCT_UP.search(seg)
    if m: candidates.append((m.start(), round(1 + float(m.group(1)) / 100, 6)))
    m = _V_MAX_BAI.search(seg)
    if m: candidates.append((m.start(), float(m.group(1))))
    m = _V_BAI.search(seg)
    if m: candidates.append((m.start(), float(m.group(1))))
    if bunrui in ADD_BUNRUI:
        m = _V_PLUS_N.search(seg)
        if m: candidates.append((m.start(), float(m.group(1))))
        m = _V_GA_UP.search(seg)
        if m: candidates.append((m.start(), float(m.group(1))))

    return min(candidates, key=lambda x: x[0])[1] if candidates else None


def _val_for_bunrui(norm_eff, bunrui):
    for kw in BUNRUI_KEYWORDS.get(bunrui, []):
        idx = _find_kw_pos(norm_eff, kw, bunrui)
        if idx >= 0:
            v = _extract_val_from_pos(norm_eff, idx, bunrui)
            if v is not None:
                return v
    return None


def _bairitu_default(bunrui_list):
    if not bunrui_list:
        return 1
    for b in bunrui_list:
        if b in ADD_BUNRUI:
            return 0
    return 1


def _fmt_list(lst):
    """Convert list to single int if length==1, else keep list. None if empty."""
    if not lst:
        return None
    return lst[0] if len(lst) == 1 else lst


# ============================================================
#  SCOPE / CONDITION DETECTION
# ============================================================

# Keywords that indicate "whole equipment set / party" in soul skill texts
_SET_KW = (
    '同装備セット全体', '同装備セット',
    '装備セット全体', '装備セット全て', '装備セット',
    '同セット', 'セット全体', 'セット全て',
)


def _detect_scope(e, mode='soul'):
    """
    Detect scope, element conditions, and weapon conditions.

    mode='soul':
        No set keyword → scope=0 (self).
        Set keyword, no element/weapon → scope=1.
        Set keyword + element/weapon → scope=2.
    mode='chara':
        '自身'/'自分' (and no set keyword) → scope=0.
        Element/weapon found → scope=2.
        Otherwise → scope=1.

    Returns {'scope': int, 'elements': list[int], 'types': list[int]}
    """
    has_global = ('全員' in e or '味方全体' in e or '全魔剣' in e or
                  '編成魔剣全体' in e or '編成魔剣全て' in e)
    has_set = has_global or any(kw in e for kw in _SET_KW)

    # 風魔典 special compound: element=風 + type=魔典
    if '風魔典の' in e:
        return {'scope': 2,
                'elements': [ELEMENT_MAP['風']],
                'types':    [WEAPON_TYPE_MAP['魔典']]}

    # Detect elements — supports multiple OR-chain and bare-kanji patterns:
    #   か / ･ / 、 : OR separators
    #   属性の/を/装/全 : attribute qualifier
    #   装備 : bare "火装備で" (without 属性)
    #   の<weapon> : "闇の長剣装備" compound
    elements = []
    for elem in _ELEMENTS_LIST:
        eid = ELEMENT_MAP[elem]
        if eid not in elements:
            if re.search(
                rf'{elem}(?:か|･|、|属性(?:の|を|装|全)|装備|の(?:{_WEAPON_NAMES_PAT}))',
                e
            ):
                elements.append(eid)

    # Detect weapons — supports "魔典か杖棒装備" and "杖棒･連弩装備" OR-chaining
    types = []
    for weapon in _WEAPONS_LIST:
        wid = WEAPON_TYPE_MAP[weapon]
        if wid not in types:
            if (f'{weapon}か' in e or
                    f'{weapon}･' in e or
                    f'{weapon}装備' in e or
                    f'{weapon}の' in e):
                types.append(wid)

    has_condition = bool(elements or types)

    if mode == 'chara':
        # Self-targeting check takes priority over set keywords.
        # 同セット appears as a trigger ("when set-mate is defeated"), not a party scope.
        if '自身' in e or '自分' in e or '自攻撃力' in e:
            if not has_global:
                return {'scope': 0, 'elements': [], 'types': []}
        if has_set:
            scope = 2 if has_condition else 1
        else:
            scope = 2 if has_condition else 1
    else:  # soul
        # scope=0: no condition, no set (self unconditional)
        # scope=1: no condition, has set (all party unconditional)
        # scope=3: has condition, no set (self conditional on equipment)
        # scope=4: has condition, has set (all party conditional on equipment)
        if has_set:
            scope = 4 if has_condition else 1
        elif has_condition:
            scope = 3
        else:
            return {'scope': 0, 'elements': [], 'types': []}

    return {'scope': scope, 'elements': elements, 'types': types}


def _detect_condition(e):
    if _BROKEN.search(e): return 3
    if _HUSHIN.search(e): return 1
    if _HAISUI.search(e): return 2
    return 0


# ============================================================
#  KEYWORD SCAN — classify_effect
# ============================================================
def classify_effect(effect):
    """Keyword-scan based classification (Step 2 supplement).
    Returns empty bunrui list when nothing matches — no fallback 16 here."""
    e          = effect
    bunrui     = set()
    scope_info = _detect_scope(e, mode='soul')
    condition  = _detect_condition(e)

    if 'ダメージ上限' in e:         bunrui.add(17)
    if '記憶結晶枠' in e:           bunrui.add(19)
    if 'ゲージの最大値' in e:       bunrui.add(18)
    if 'B.D.レベル上限' in e:       bunrui.add(16)
    if 'B.D.ヒット' in e or 'BDヒット' in e:
        bunrui.add(21)
    elif 'ヒット数' in e or 'Hit数' in e:
        bunrui.add(7)
    if 'B.D.攻撃力' in e or 'BD攻撃力' in e: bunrui.add(3)
    e_no_bd = e.replace('B.D.攻撃力', '__BD__').replace('BD攻撃力', '__BD__')
    if re.search(r'攻撃(?!モーション|範囲|時|ヒット)', e_no_bd): bunrui.add(1)
    if 'ブレイク力' in e:           bunrui.add(2)
    if re.search(r'(B\.D\.|BD)ゲージの(上昇|溜)', e): bunrui.add(6)
    if re.search(r'ブレイズゲージ(が|を|の回復)', e):  bunrui.add(6)
    if 'B.D.コスト' in e:           bunrui.add(16)
    if re.search(r'バトル開始時.*ブレイズゲージ|Wave経過ごとに.*ブレイズゲージ', e): bunrui.add(6)
    if re.search(r'Bゲージ', e):    bunrui.add(6)
    # bunrui=4: スピード / 行動速度 / 速度 (excluding モーション速度)
    if 'スピード' in e or re.search(r'(?<!モーション)速度', e): bunrui.add(4)
    if '攻撃モーション' in e or 'モーション速度' in e: bunrui.add(5)
    if '攻撃範囲' in e and '全体' in e:     bunrui.add(8)
    if any(w in e for w in STATUS_WORDS) and ('無効' in e or '回避' in e): bunrui.add(9)
    if 'HP' in e and '回復' in e and not re.search(r'HP\d*%で復活', e): bunrui.add(11)
    if 'HP' in e and 11 not in bunrui and condition == 0:
        # Exclude: HP as a % condition (HP50%以下/以上/で) or HP as cost
        if not re.search(r'HP\d+(?:%以|%で|で)|HP消費|HPを.*消費', e):
            if re.search(r'HPが|HPを|HP\+|HP[^回]', e):
                bunrui.add(10)
    if re.search(r'ガード(時の|の|時)防御力|魔導バリア', e): bunrui.add(13)
    e_no_guard = re.sub(r'ガード(時の|の|時)防御力', '', e)
    if '防御力' in e_no_guard:      bunrui.add(12)
    if 'サファイア' in e:           bunrui.add(14)
    if 'ルビー' in e:               bunrui.add(15)
    if '経験値' in e:               bunrui.add(20)
    for kw in ['命中率', '復活', 'スキル効果を受けられる', '修理時間']:
        if kw in e: bunrui.add(16)
    if 'ガードブレイク' in e: bunrui.add(2)

    # No fallback 16 here — callers handle the empty case

    final_scope = scope_info['scope']
    if final_scope == 0 and (6 in bunrui or 18 in bunrui):
        final_scope = 1

    result = {'bunrui': sorted(bunrui), 'scope': final_scope, 'condition': condition}
    el = _fmt_list(scope_info['elements'])
    ty = _fmt_list(scope_info['types'])
    if el is not None: result['element'] = el
    if ty is not None: result['type']    = ty
    return result


# ============================================================
#  TWO-PASS CLASSIFICATION
# ============================================================
def classify_skill_v2(skill, lookup_table, cat_to_bunrui):
    """Two-pass classification for SOUL skills (multi-effects mode).
    Each detected bunrui becomes a separate entry in skill['effects']."""
    name       = skill.get('name', '')
    effect_raw = skill.get('effect', '')
    effect     = unicodedata.normalize('NFKC', effect_raw)  # normalized for detection
    normed     = norm(effect)

    scope_info = _detect_scope(effect, mode='soul')

    # For 代償 (sacrifice) skills: cost part (before 代償) always condition=0;
    # benefit condition detected from text after 代償 only.
    if '代償' in effect:
        daish_idx    = effect.index('代償')
        cost_text    = effect[:daish_idx]
        benefit_text = effect[daish_idx + len('代償'):]
        cost_bunruis = set(classify_effect(cost_text)['bunrui'])
        condition    = _detect_condition(benefit_text)
    else:
        cost_bunruis = set()
        condition    = _detect_condition(effect)

    def _make_entry(b):
        sc = scope_info['scope']
        if sc == 0 and b in (6, 18): sc = 1
        if sc == 3 and b in (6, 18): sc = 4
        cond = 0 if b in cost_bunruis else condition
        ent = {'bunrui': [b], 'scope': sc, 'condition': cond}
        el = _fmt_list(scope_info['elements'])
        ty = _fmt_list(scope_info['types'])
        if el is not None: ent['element'] = el
        if ty is not None: ent['type']    = ty
        v = _val_for_bunrui(normed, b)
        ent['bairitu'] = round(v, 6) if v is not None else _bairitu_default([b])
        return ent

    covered = set()
    effects = []

    # Step 1: lookup table (primary) — use raw text to match table keys
    for cat_id in lookup_table.get(name + effect_raw, []):
        b = cat_to_bunrui.get(cat_id)
        if b is None or b in covered:
            continue
        effects.append(_make_entry(b))
        covered.add(b)

    # Step 2: keyword scan supplement (no fallback 16 from classify_effect)
    for b in classify_effect(effect)['bunrui']:
        if b in covered:
            continue
        effects.append(_make_entry(b))
        covered.add(b)

    # Fallback only when both steps found nothing
    if not effects:
        effects.append({'bunrui': [16], 'scope': scope_info['scope'],
                        'condition': condition, 'bairitu': 1})

    # Veto: HP used as cost (消費/犠牲) should not appear as bunrui=10
    if _HP_COST.search(effect):
        effects = [ent for ent in effects if ent['bunrui'] != [10]]
        if not effects:
            effects.append({'bunrui': [16], 'scope': scope_info['scope'],
                            'condition': condition, 'bairitu': 1})

    skill['effects'] = effects
    return skill


def classify_skill_chara(skill, lookup_table, cat_to_bunrui):
    """Two-pass classification for CHARACTER skills (single-effects[0] mode).
    All detected bunrui are merged into a single effects[0] entry."""
    name       = skill.get('name', '')
    effect_raw = skill.get('effect', '')
    effect     = unicodedata.normalize('NFKC', effect_raw)

    scope_info = _detect_scope(effect, mode='chara')
    condition  = _detect_condition(effect)

    covered = set()

    # Step 1: lookup table (primary) — use raw text to match table keys
    for cat_id in lookup_table.get(name + effect_raw, []):
        b = cat_to_bunrui.get(cat_id)
        if b is not None:
            covered.add(b)

    # Step 2: keyword scan supplement
    for b in classify_effect(effect)['bunrui']:
        covered.add(b)

    # Fallback only when both steps found nothing
    if not covered:
        covered.add(16)

    # Veto: HP used as cost (消費/犠牲) should not appear as bunrui=10
    if _HP_COST.search(effect):
        covered.discard(10)
        if not covered:
            covered.add(16)

    # Veto: BD攻撃力 (3) subsumes 攻撃力 (1) — drop 1 when 3 is present
    if 3 in covered:
        covered.discard(1)

    final_scope = scope_info['scope']
    if final_scope == 0 and (6 in covered or 18 in covered):
        final_scope = 1

    entry = {
        'bunrui':    sorted(covered),
        'scope':     final_scope,
        'condition': condition,
    }
    el = _fmt_list(scope_info['elements'])
    ty = _fmt_list(scope_info['types'])
    if el is not None: entry['element'] = el
    if ty is not None: entry['type']    = ty

    effects = skill.setdefault('effects', [])
    if not effects:
        effects.append(entry)
    else:
        effects[0].update(entry)
    return skill
