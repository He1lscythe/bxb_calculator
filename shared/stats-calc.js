// shared/stats-calc.js — v2 hensei base 计算 + 跨 slot buff 累积
//
// 按 unpacking/HOWTO_battle/03_ead.md 50 步 EAD pipeline 简化实现:
// - 类 1 server fold: chara base attribute (lv/熟度/觉醒/marriage/BH/LP) — calcBaseStats
// - 类 3 client 战斗中: buff Mul/Add 池累积 (chara skill / soul skill / crystal / bg / masou)
// - HP-curve / Break / FellDown gate (沿用 wiki 公式)
// - DamageLimitBreak cap (沿用 wiki 公式)
// - Random 0.95-1.0 (EAD step 50、display avg 0.975)
//
// TODO Phase 8+ 实测精度:
// - HP-curve RemHpSkillRate/VitalitySkillRate 精确反编译公式 (现用 wiki 线性)
// - IsBlaze gate / IsBreak hard gate 精细化
// - BlazeAttack 加 Boost 链 (step 2-4 / 26-37)
// - element/weapon affinity 是否 cumulative 还是 max-only

import {
  MAX_AWAKENING, AWAKENING_FULL_MULT,
  BH_MULT_ON, BH_MULT_OFF,
  MARRIAGE_NONE, MARRIAGE_NO_FLOWER, MARRIAGE_WITH_FLOWER,
  LP_MULT_NORMAL, LP_MULT_LOW, LP_MULT_CRISIS,
} from './constants.js';

// ============================================================
// 熟度 → 等级上限 (master 字段直读)
// ============================================================
export const maxLevelAtMature = (state, mature) => {
  const im = state.stats?.initial_max_level;
  const mm = state.stats?.max_max_level;
  if (im == null || mm == null) return 0;
  return Math.min(mm, im + (mature - 1) * 5);
};

// ============================================================
// 等级 → 属性 (统一公式、含觉醒扩展)
// ============================================================
export const calcStat = ({ initial, max, max_max_level, lv, cap, rarity }) => {
  if (!max || !initial || !max_max_level) return 0;
  if (lv < 1) return 0;
  if (lv <= cap) {
    return max * (1 - (max_max_level - lv) / (max_max_level - 1) * initial / max);
  }
  const k = max * (1 - (max_max_level - cap) / (max_max_level - 1) * initial / max);
  const awk = MAX_AWAKENING[rarity] || 9;
  const full = AWAKENING_FULL_MULT[rarity] || 1.43;
  const lvOverCap = lv - cap;
  return k * (1 + lvOverCap / (awk * 5) * (full - 1));
};

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
// 結婚 / LP / BH
// ============================================================
export const getMarriageMult = (state) => {
  switch (state) {
    case 'with_flower': return MARRIAGE_WITH_FLOWER;
    case 'no_flower': return MARRIAGE_NO_FLOWER;
    default: return MARRIAGE_NONE;
  }
};

export const getLpMult = (lp, maxLp) => {
  const ratio = lp / maxLp;
  if (ratio <= 0.25) return LP_MULT_CRISIS;
  if (ratio <= 0.5) return LP_MULT_LOW;
  return LP_MULT_NORMAL;
};

// ============================================================
// effect value 含熟度 scaling
// ============================================================
export const effectValueAtMature = (effect, mature) => {
  const base = effect.value ?? 0;
  const sc = effect.value_scaling ?? 0;
  return base + mature * sc;
};

// ============================================================
// HP-curve scale (parameter prefix 决定、wiki 公式)
// ============================================================
export const hpCurveScale = (parameter, hpPercent, teamHpZero = false) => {
  const hp = Math.max(0, Math.min(1, hpPercent / 100));
  if (parameter.startsWith('Vitality_')) return hp;             // 浑身
  if (parameter.startsWith('RemHP_')) return 1 - hp;            // 背水
  if (parameter.startsWith('Break_')) return hpPercent < 50 ? 1 : 0;  // 破損
  if (parameter.startsWith('FellDown_')) return teamHpZero ? 1 : 0;   // 队友倒地
  return 1;
};

// parameter 是否对应 target stat (按 prefix 拆出 base parameter)
export const baseParamOf = (parameter) => {
  const prefixes = ['Vitality_', 'RemHP_', 'Break_', 'FellDown_', 'Enemy_', 'Wave_', 'JustGuard_', 'Random_', 'Rise_'];
  for (const p of prefixes) {
    if (parameter.startsWith(p)) return parameter.slice(p.length);
  }
  return parameter;
};

// ============================================================
// effect filter — range / element_condition / weapon_type_condition gate
// targetSlotIdx vs sourceSlotIdx: range=Single only apply to source/self、All apply to all
// ============================================================
export const effectApplies = (effect, source, target, sourceSlotIdx, targetSlotIdx) => {
  // range gate
  if (effect.range === 'Single') {
    if (sourceSlotIdx !== targetSlotIdx) return false;
  } else if (effect.range === 'None') {
    return false;
  }
  // element condition
  const ec = effect.element_condition || effect.target_element_id || 0;
  if (ec && target?.element_id && ec !== target.element_id) return false;
  // weapon_type_condition
  const wc = effect.weapon_type_condition || effect.weapon_type_id || 0;
  if (wc && target?.weapon_type_id && wc !== target.weapon_type_id) return false;
  // weapon_base_id (chara 限定)
  if (effect.weapon_base_id && target?.id && effect.weapon_base_id !== target.id) return false;
  return true;
};

// ============================================================
// 跨 slot buff accumulation
// team: [{ chara, soul, crystals[], bg, masou, state, mature, lv, awakening, hp_percent }]
// targetSlotIdx: 0/1/2 — 算哪个 slot 的 stats
// targetParameter: 'Attack' / 'Defense' / 'HP' / 'GuardBreak' / 'Speed'
// 返回 { mul, add }
// ============================================================
export const accumulateBuffsCrossSlot = (team, targetSlotIdx, targetParameter) => {
  let mul = 1;
  let add = 0;
  const target = team[targetSlotIdx];
  if (!target?.chara) return { mul, add };
  const teamHpZero = team.some((s, i) => i !== targetSlotIdx && s?.hp_percent === 0);

  // 遍历每个 source slot 的 effects
  for (let srcIdx = 0; srcIdx < team.length; srcIdx++) {
    const src = team[srcIdx];
    if (!src) continue;
    const collectFrom = [];
    // chara state weapon_skills
    const charaState = src.chara?.states?.[src.state];
    if (charaState?.weapon_skills) {
      for (const sk of charaState.weapon_skills) collectFrom.push({ eff: sk, srcMature: src.mature });
    }
    // chara bd_skill effects (只 target slot 用)
    if (srcIdx === targetSlotIdx && src.chara?.bd_skill?.effects) {
      for (const e of src.chara.bd_skill.effects) collectFrom.push({ eff: e, srcMature: src.mature });
    }
    // soul skills
    if (src.soul?.skills) {
      for (const sk of src.soul.skills) collectFrom.push({ eff: sk, srcMature: 0 });
    }
    // bg skills
    if (src.bg?.skills) {
      for (const sk of src.bg.skills) collectFrom.push({ eff: sk, srcMature: 0 });
    }
    // crystals (each crystal is one effect)
    if (src.crystals) {
      for (const cr of src.crystals) {
        // crystal lv → value (initial→max linear interp by lv/max_level)
        const lv = cr.lv || cr.max_level || 0;
        const ratio = cr.max_level ? Math.min(1, lv / cr.max_level) : 0;
        const val = (cr.initial_value ?? 0) + ((cr.max_value ?? cr.initial_value ?? 0) - (cr.initial_value ?? 0)) * ratio;
        collectFrom.push({
          eff: { ...cr, value: val, value_scaling: 0 },
          srcMature: 0,
        });
      }
    }
    // masou effects
    if (src.masou?.effects) {
      for (const e of src.masou.effects) collectFrom.push({ eff: e, srcMature: 0 });
    }

    for (const { eff, srcMature } of collectFrom) {
      if (!eff?.parameter) continue;
      const baseParam = baseParamOf(eff.parameter);
      if (baseParam !== targetParameter) continue;
      if (!effectApplies(eff, src.chara, target.chara, srcIdx, targetSlotIdx)) continue;
      const factor = hpCurveScale(eff.parameter, src.hp_percent ?? 100, teamHpZero);
      if (factor === 0) continue;
      const v = effectValueAtMature(eff, srcMature);
      if (eff.math_type === 'Multiply') mul *= (v - 1) * factor + 1;
      else if (eff.math_type === 'Addition') add += v * factor;
      // 其他 (Set / Repel_Percent / None) 跳过、UI display 单独处理
    }
  }
  return { mul, add };
};

// ============================================================
// soul element_affinity / weapon_affinity (两者都乘算、无序)
// 应用 positive (己方该元素/武器) vs negative (敵方该元素) 看 unpacking docs
// ============================================================
export const soulAffinityMult = (soul, chara, targetParameter) => {
  if (!soul || !chara) return 1;
  let m = 1;
  // element_affinity[chara.element_id] positive (己方 attack)
  const ea = soul.element_affinity?.[String(chara.element_id)];
  if (ea?.positive_value) m *= ea.positive_value;
  // weapon_affinity[chara.weapon_type_id]
  const wa = soul.weapon_affinity?.[String(chara.weapon_type_id)];
  if (wa?.positive_value) m *= wa.positive_value;
  return m;
};

// ============================================================
// Random rate (EAD step 50): 0.95-1.0 单边、avg 0.975
// ============================================================
export const RANDOM_RATE_AVG = 0.975;
export const RANDOM_RATE_MIN = 0.95;
export const RANDOM_RATE_MAX = 1.0;

// ============================================================
// DamageLimitBreak — 沿用 wiki ダメージ上限 cap 公式
// base = 2^31 - 1 = 2147483647
// 加成: 完整 buff 链中 parameter='DamageLimitBreak' 的 effect (累加 + 累乘)
// ============================================================
export const DAMAGE_LIMIT_BASE = 2147483647;
export const calcDamageLimit = (team, targetSlotIdx) => {
  const { mul, add } = accumulateBuffsCrossSlot(team, targetSlotIdx, 'DamageLimitBreak');
  return Math.floor(DAMAGE_LIMIT_BASE * mul + add);
};

// ============================================================
// final stats — 类 1 server fold + 类 3 client buff
// team = [{ chara, soul, crystals[], bg, masou, state, mature, lv, awakening, hp_percent, marriage, bh_on, lp, max_lp }] × 3
// ============================================================
export const calcHenseiStats = (team, targetSlotIdx) => {
  const t = team[targetSlotIdx];
  if (!t?.chara) return null;
  const c = t.chara;
  const base = calcBaseStats(c, t.state, {
    lv: t.lv || 1, mature: t.mature || 1, awakening: t.awakening || 0, rarity: c.rarity,
  });
  if (!base) return null;
  const mar = getMarriageMult(t.marriage || 'none');
  const bh = t.bh_on === false ? BH_MULT_OFF : BH_MULT_ON;
  const lpMult = getLpMult(t.lp ?? 999, (c.states?.[t.state]?.stats?.max_lp || 9) + mar.lp_add);
  const affMult = soulAffinityMult(t.soul, c, 'Attack');

  const finalize = (key, extra = 1) => {
    const baseVal = base[key];
    const param = paramFromKey(key);
    const { mul, add } = accumulateBuffsCrossSlot(team, targetSlotIdx, param);
    return Math.floor((baseVal * mar.mult * extra * mul + add));
  };

  return {
    hp: finalize('hp'),
    attack: finalize('attack', bh * lpMult * affMult),
    defense: finalize('defense'),
    break: finalize('break'),
    speed: finalize('speed'),
    damage_limit: calcDamageLimit(team, targetSlotIdx),
    mature: base.mature, lv: base.lv, cap: base.cap, max_lv_with_awk: base.max_lv_with_awk,
    bh, marriage_mult: mar.mult, lp_mult: lpMult, affinity_mult: affMult,
    random_avg: RANDOM_RATE_AVG,
    random_range: [RANDOM_RATE_MIN, RANDOM_RATE_MAX],
  };
};

const paramFromKey = (k) => ({
  hp: 'HP', attack: 'Attack', defense: 'Defense', break: 'GuardBreak', speed: 'Speed',
}[k] || k);
