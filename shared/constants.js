// shared/constants.js — v2 fresh rewrite 按解包 master_tables 体系
//
// 来源: scripts/master_to_business/enums.py 的 JS 镜像
// 完全替代 wiki 时代的 BUNRUI (21 种) / SCOPE (5 种) / CONDITION (5 种) / CALC_TYPE (4 种)

// ============================================================
// MATH_TYPE — 倍率作用方式 (master math_type 字段值)
// ============================================================
export const MATH_TYPE = {
  Multiply: 'Multiply',         // 乘算 — fmul 池
  Addition: 'Addition',         // 加算 — fadd 池
  Set: 'Set',                   // 設定値 — 直接覆盖
  Repel_Percent: 'Repel_Percent', // 概率回避 — value=N 表示 N% 免疫该 parameter
  None: 'None',                 // BD 特殊効果占位 — 靠 effect_id 触发 hardcoded
};

// ============================================================
// PARAMETER (#JS) — JobSkill.Parameter 完整 91 项 (id 0-90)
// ============================================================
export const PARAMETER = {
  0: 'None',
  1: 'Attack', 2: 'Defense', 3: 'Heal', 4: 'GuardBreak', 5: 'GuardDefense',
  6: 'BlazeAttack', 7: 'Speed', 8: 'MotionSpeed', 9: 'PlayerHit', 10: 'EnemyHit',
  11: 'SapphireDrop', 12: 'Attack_Sapphire', 13: 'RubyDrop', 14: 'TimeHeal', 15: 'TimeHeal_Main',
  16: 'AttackCount', 17: 'Raise', 18: 'Mez', 19: 'Stun', 20: 'TheWorld',
  21: 'ForceBreak', 22: 'DamageHeal', 23: 'DamageLimitBreak', 24: 'BlazeLock', 25: 'AllTarget',
  26: 'SuicideAttack', 27: 'Blaze13',
  28: 'RemHP_Attack', 29: 'RemHP_Defense', 30: 'RemHP_BlazeAttack', 31: 'RemHP_PlayerHit',
  32: 'RemHP_EnemyHit', 33: 'RemHP_Speed', 34: 'RemHP_MotionSpeed', 35: 'RemHP_Sapphire',
  36: 'Vitality_Attack', 37: 'Vitality_Defense', 38: 'Vitality_BlazeAttack', 39: 'Vitality_PlayerHit',
  40: 'Vitality_EnemyHit', 41: 'Vitality_Speed', 42: 'Vitality_MotionSpeed', 43: 'Vitality_Sapphire',
  44: 'Break_Attack', 45: 'Break_Defense', 46: 'Break_BlazeAttack', 47: 'Break_PlayerHit',
  48: 'Break_EnemyHit', 49: 'Break_Speed',
  50: 'FellDown_Attack', 51: 'FellDown_Defense', 52: 'FellDown_BlazeAttack', 53: 'FellDown_PlayerHit',
  54: 'FellDown_EnemyHit', 55: 'FellDown_Speed',
  56: 'JustGuard_Sapphire', 57: 'JustGuard_MinDamage', 58: 'JustGuard_Heal',
  59: 'Wave_Heal', 60: 'Wave_BlazeUP',
  61: 'Enemy_Attack', 62: 'Enemy_Defense', 63: 'Enemy_GuardBreak', 64: 'Enemy_GuardDefense', 65: 'Enemy_BlazeAttack',
  66: 'InstantDeath', 67: 'BlazeAbsorb', 68: 'RateDamage', 69: 'BlazeLockPurge', 70: 'Random_Attack',
  71: 'WeaponArtsCost', 72: 'WeaponArtsHitCount', 73: 'WeaponArtsHitCountKeepDamage',
  74: 'HP', 75: 'HitCount', 76: 'HitCountKeepDamage', 77: 'UserExp', 78: 'AnyElement',
  79: 'BarrierInvokePermission', 80: 'BlazeGauge', 81: 'BlazeGaugePointRate', 82: 'BlazeGaugeMaxLevel',
  83: 'EventDropRate', 84: 'EventSupplyBonus', 85: 'GuildBattleTimeLimit',
  86: 'MaterialExp', 87: 'JobExp', 88: 'Prayer', 89: 'Rise_AttackRate', 90: 'Rise_DefenseRate',
};

export const PARAMETER_BY_NAME = Object.fromEntries(
  Object.entries(PARAMETER).map(([k, v]) => [v, Number(k)]),
);

export const PARAMETER_BE_ONLY = new Set([
  'RaiseBreak', 'JustGuardTime', 'CancelDebuff', 'Enemy_BreakAttack',
  'Random_Begin', 'Random_Defense', 'Random_End',
  'Condition_Begin', 'Condition_End',
  'Condition_Count_Begin', 'Condition_Count_JG_Attack', 'Condition_Count_JG_Defense', 'Condition_Count_End',
]);
export const PARAMETER_EXTENSION = new Set(['MaterialSlotQuantity', 'NoEffect']);
export const PARAMETER_ALL_NAMES = new Set([
  ...Object.values(PARAMETER), ...PARAMETER_BE_ONLY, ...PARAMETER_EXTENSION,
]);

// ============================================================
// RANGE — 技能作用范围
// ============================================================
export const RANGE = { All: 'All', Single: 'Single', None: 'None' };
export const normalizeRange = (r) => (r === 'all' ? 'All' : r);

// ============================================================
// TARGET_ELEMENT
// ============================================================
export const ELEMENT_LABEL = { 0: '', 1: '火', 2: '水', 3: '風', 4: '光', 5: '闇', 6: '無' };
export const ELEMENT_COLOR = {
  1: '#e74c3c', 2: '#3498db', 3: '#2ecc71', 4: '#f1c40f', 5: '#9b59b6', 6: '#95a5a6',
};

// ============================================================
// TARGET_WEAPON_TYPE
// ============================================================
export const WEAPON_LABEL = {
  0: '', 1: '長剣', 2: '大剣', 3: '太刀', 4: '杖棒', 5: '弓矢',
  6: '連弩', 7: '戦斧', 8: '騎槍', 9: '投擲', 10: '拳闘', 11: '魔典', 12: '大鎌',
};

// ============================================================
// RARITY
// ============================================================
export const RARITY_LABEL = { 1: 'A', 2: 'AA', 3: 'S', 4: 'SS' };
export const RARITY_ORDER = [4, 3, 2, 1];

// ============================================================
// EVOLVE
// ============================================================
export const EVOLVE_NAME = { 0: '通常', 1: '改造', 2: '極弐' };

// ============================================================
// hensei base 公式 (chara_training.md 写死表)
// max_max_level / initial_max_level / max_mature 从 master 字段直读、不在这里
// ============================================================
export const MAX_AWAKENING = { 1: 24, 2: 36, 3: 14, 4: 9 };
export const AWAKENING_FULL_MULT = { 1: 5.37, 2: 4.45, 3: 2.42, 4: 1.43 };

export const BH_MULT_ON = 1.3;
export const BH_MULT_OFF = 1.0;

export const MARRIAGE_NONE = { mult: 1.00, slot_add: 0, lp_add: 0 };
export const MARRIAGE_NO_FLOWER = { mult: 1.03, slot_add: 1, lp_add: 3 };
export const MARRIAGE_WITH_FLOWER = { mult: 1.05, slot_add: 1, lp_add: 3 };

export const LP_MULT_NORMAL = 1.0;
export const LP_MULT_LOW = 1.1;
export const LP_MULT_CRISIS = 1.5;
