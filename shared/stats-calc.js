// shared/stats-calc.js — v2 hensei base 计算 + buff 累积
//
// 范围: view-only hensei stat 模拟、按解包 master_tables + chara_training.md 公式
// 简化版 — 未完全 1:1 复刻 unpacking/HOWTO_battle/03_ead.md 的 50 步 EAD/PAD/EBD/PBD
//
// 实现:
// - hensei base attribute (max × (1 - (max_level - lv) / (max_level - 1) × initial / max))
// - 觉醒下扩展 (k × (1 + (lv - cap) / (awakening * 5) × (full_mult - 1)))
// - BH 二元 toggle (×1.3 / ×1.0)
// - 結婚 (5 项 ×1.05/1.03 + slot+1 + lp+3)
// - LP (>1/2 ×1.0 / ≤1/2 ×1.1 / ≤1/4 ×1.5、仅攻撃力)
// - buff Mul 池 + Add 池 简化累积 (parameter prefix 决定 condition factor)
//
// TODO Phase 4+ 完善:
// - HP-curve scale 精确公式 (RemHpSkillRate / VitalitySkillRate 反编译)
// - IsBlaze gate (EAD step 1+26-37 BD 链)
// - IsBreak gate (EAD step 25/46 整段跳)
// - Random ±5-10% / 0.95-1.0 抖动
// - DamageLimitBreak clamp

import {
  MAX_AWAKENING, AWAKENING_FULL_MULT,
  BH_MULT_ON, BH_MULT_OFF,
  MARRIAGE_NONE, MARRIAGE_NO_FLOWER, MARRIAGE_WITH_FLOWER,
  LP_MULT_NORMAL, LP_MULT_LOW, LP_MULT_CRISIS,
} from './constants.js';

// ============================================================
// 熟度 N → 等级上限 (chara_training.md 公式、master 字段直读)
// ============================================================
export const maxLevelAtMature = (state, mature) => {
  const im = state.stats.initial_max_level;
  const mm = state.stats.max_max_level;
  return Math.min(mm, im + (mature - 1) * 5);
};

// ============================================================
// 等级 → 属性 (统一公式、不分通常/改造)
// 属性 = max × (1 - (max_max_level - lv) / (max_max_level - 1) × initial / max)
// 觉醒下: 先取 lv=cap 算 k、再扩展 k × (1 + (lv - cap) / (max_awk * 5) × (full_mult - 1))
// ============================================================
export const calcStat = ({ initial, max, max_max_level, lv, cap, rarity }) => {
  if (lv < 1) return 0;
  if (lv <= cap) {
    // 普通区间
    return max * (1 - (max_max_level - lv) / (max_max_level - 1) * initial / max);
  }
  // 觉醒区间
  const k = max * (1 - (max_max_level - cap) / (max_max_level - 1) * initial / max);
  const awk = MAX_AWAKENING[rarity] || 9;
  const full = AWAKENING_FULL_MULT[rarity] || 1.43;
  const lvOverCap = lv - cap;
  return k * (1 + lvOverCap / (awk * 5) * (full - 1));
};

// ============================================================
// chara 5 项 base stats (lv / mature / awakening 输入)
// state = chara.states[evolve_name]
// ============================================================
export const calcBaseStats = (chara, stateKey, params) => {
  const { lv, mature, awakening = 0, rarity } = params;
  const state = chara.states?.[stateKey];
  if (!state) return null;
  const cap = maxLevelAtMature(state, mature);
  const actualLv = Math.min(lv, cap + awakening * 5);
  const base = (initialKey, maxKey) => calcStat({
    initial: state.stats[initialKey],
    max: state.stats[maxKey],
    max_max_level: state.stats.max_max_level,
    lv: actualLv,
    cap,
    rarity,
  });
  return {
    hp: base('initial_hp', 'max_hp'),
    attack: base('initial_attack', 'max_attack'),
    defense: base('initial_defense', 'max_defense'),
    break: base('initial_break', 'max_break'),
    speed: base('initial_speed', 'max_speed'),
    mature,
    lv: actualLv,
    cap,
    max_lv_with_awk: cap + awakening * 5,
  };
};

// ============================================================
// 結婚 multipler
// ============================================================
export const getMarriageMult = (state) => {
  switch (state) {
    case 'with_flower': return MARRIAGE_WITH_FLOWER;
    case 'no_flower': return MARRIAGE_NO_FLOWER;
    default: return MARRIAGE_NONE;
  }
};

// ============================================================
// LP multipler
// ============================================================
export const getLpMult = (lp, max_lp) => {
  const ratio = lp / max_lp;
  if (ratio <= 0.25) return LP_MULT_CRISIS;
  if (ratio <= 0.5) return LP_MULT_LOW;
  return LP_MULT_NORMAL;
};

// ============================================================
// effect value 含 mature scaling
// value_at_N = value + N × value_scaling
// ============================================================
export const effectValueAtMature = (effect, mature) => {
  const base = effect.value ?? 0;
  const sc = effect.value_scaling ?? 0;
  return base + mature * sc;
};

// ============================================================
// HP-curve scale (parameter prefix 决定)
// TODO Phase 4+ 实测精确公式
// ============================================================
export const hpCurveScale = (parameter, hpPercent) => {
  const hp = Math.max(0, Math.min(1, hpPercent / 100));
  if (parameter.startsWith('Vitality_')) return hp;
  if (parameter.startsWith('RemHP_')) return 1 - hp;
  if (parameter.startsWith('Break_')) return hpPercent < 50 ? 1 : 0;  // 简化、严格应是 IsBreak gate
  if (parameter.startsWith('FellDown_')) return hp === 0 ? 1 : 0;
  return 1;
};

// ============================================================
// effect → contribution 简化版
// Multiply: × value
// Addition: + value
// Repel_Percent: 概率回避、view-only 当作 (1 - value%) base value 显示
// None: 跳过 (BD effect_id 触发)
// ============================================================
export const applyEffect = (parameter, mathType, value, condFactor = 1) => {
  if (mathType === 'Multiply') return { mul: (value - 1) * condFactor + 1, add: 0 };
  if (mathType === 'Addition') return { mul: 1, add: value * condFactor };
  if (mathType === 'Set') return { set: value };
  return { mul: 1, add: 0 };
};

// ============================================================
// Mul 池 + Add 池累积、return final = (base × Π mul) + Σ add
// effects: [{ parameter, math_type, value, value_scaling, ...condition fields }]
// hpPercent: 0-100、决定 HP-curve scale
// 简化: 不实现 IsBlaze gate / IsBreak hard gate / Random / final clamp
// ============================================================
export const accumulateBuffs = (effects, mature, hpPercent, targetParameter) => {
  let mul = 1;
  let add = 0;
  for (const eff of effects || []) {
    if (eff.parameter !== targetParameter
        && !eff.parameter.endsWith('_' + targetParameter)
        && !targetParameter.endsWith('_' + eff.parameter)) {
      continue;
    }
    const factor = hpCurveScale(eff.parameter, hpPercent);
    const v = effectValueAtMature(eff, mature);
    const contrib = applyEffect(eff.parameter, eff.math_type, v, factor);
    if (contrib.mul !== undefined) mul *= contrib.mul;
    if (contrib.add !== undefined) add += contrib.add;
  }
  return { mul, add };
};

// ============================================================
// final stats — chara base + 結婚 + BH + LP + buff (简化)
// 仅 attack 路径完整、其他 parameter 类似套
// ============================================================
export const calcHenseiStats = (chara, stateKey, params) => {
  const {
    lv, mature, awakening = 0, rarity,
    marriage = 'none',
    bh_on = true,
    lp = 999, max_lp = 9,
    buff_effects = [],
    hp_percent = 100,
  } = params;

  const base = calcBaseStats(chara, stateKey, { lv, mature, awakening, rarity });
  if (!base) return null;

  const mar = getMarriageMult(marriage);
  const bh = bh_on ? BH_MULT_ON : BH_MULT_OFF;
  const lpMult = getLpMult(lp, max_lp + mar.lp_add);

  // 5 项 (攻防 HP BK speed) 都吃結婚倍率
  const finalize = (key, extraMult = 1) => {
    const baseVal = base[key];
    const buff = accumulateBuffs(buff_effects, mature, hp_percent, paramFromKey(key));
    return Math.floor((baseVal * mar.mult * extraMult * buff.mul + buff.add));
  };

  return {
    hp: finalize('hp'),
    attack: finalize('attack', bh * lpMult),
    defense: finalize('defense'),
    break: finalize('break'),
    speed: finalize('speed'),
    mature: base.mature,
    lv: base.lv,
    max_lv_with_awk: base.max_lv_with_awk,
    cap: base.cap,
    bh, marriage_mult: mar.mult, lp_mult: lpMult,
  };
};

// helper: stat key → master parameter name
const paramFromKey = (k) => ({
  hp: 'HP', attack: 'Attack', defense: 'Defense', break: 'GuardBreak', speed: 'Speed',
}[k] || k);
