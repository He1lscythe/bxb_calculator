// shared/parameter-class.js — master #JS parameter → 35 类业务分类
// 整数 enum、跟 wiki bunrui 同套思路、UI 可用 renderFilterToggles (int key)

const _HP_CURVE_PFX = ['Vitality_', 'RemHP_', 'Break_', 'FellDown_'];

// master parameter name (string) → 业务 class id (int)
// HP-curve prefix strip + Sapphire→SapphireDrop 合并 (业务命名一致)
const _NAME_TO_ID = {
  Attack: 1,
  MotionSpeed: 2,
  Speed: 3,
  SapphireDrop: 4,
  Defense: 5,
  GuardBreak: 6,
  DamageLimitBreak: 7,
  BlazeAttack: 8,
  HP: 9,
  GuardDefense: 10,
  HitCount: 11,
  RubyDrop: 12,
  UserExp: 13,
  JustGuard_MinDamage: 14,
  JobExp: 15,
  EventDropRate: 16,
  MaterialExp: 17,
  AllTarget: 18,
  Wave_BlazeUP: 19,
  Wave_Heal: 20,
  BlazeAbsorb: 21,
  JustGuard_Sapphire: 22,
  BlazeGauge: 23,
  JustGuard_Heal: 24,
  HitCountKeepDamage: 25,
  InstantDeath: 26,
  Stun: 27,
  Mez: 28,
  Random_Attack: 29,
  RateDamage: 30,
  BlazeGaugeMaxLevel: 31,
  Heal: 32,
  Enemy_BreakAttack: 33,
  SuicideAttack: 34,
  NoEffect: 35,
};

export function classifyParameter(p) {
  if (!p) return 35; // NoEffect / その他
  let base = p;
  for (const pfx of _HP_CURVE_PFX) {
    if (p.startsWith(pfx)) {
      base = p.slice(pfx.length);
      break;
    }
  }
  if (base === 'Sapphire') base = 'SapphireDrop';
  return _NAME_TO_ID[base] ?? 35;
}

// class id → 日文 label (UI button 文字)、按业务出现频次 desc
export const PARAMETER_CLASS_LABEL = {
  1: '攻撃',
  2: '攻撃モーション',
  3: 'スピード',
  4: 'サファイア',
  5: '防御力',
  6: 'ブレイク力',
  7: 'ダメージ上限',
  8: 'BD攻撃',
  9: 'HP',
  10: '被ダメ軽減',
  11: 'ヒット数',
  12: 'ルビー',
  13: 'EXP',
  14: 'JG軽減',
  15: 'ソウルEXP',
  16: 'イベントドロップ',
  17: '結晶EXP',
  18: '攻撃全体化',
  19: 'waveBDゲージ',
  20: 'wave回復',
  21: '勇気分解',
  22: 'JGサファイア',
  23: '開始BDゲージ',
  24: 'JG回復',
  25: 'hit維持ダメ',
  26: '即死',
  27: '眩晕',
  28: '麻痺',
  29: '暴撃',
  30: '確率ダメ',
  31: 'BDゲージ最大',
  32: 'HP回復',
  33: '敵BK攻撃',
  34: '攻撃HP減少',
  35: 'その他',
};

// class id → 1-2 字短 label (badge / 紧凑标签用、跟旧 wiki BUNRUI_SHORT 同 pattern)
export const PARAMETER_CLASS_SHORT = {
  1:  '攻',
  2:  '速',
  3:  '転',
  4:  '蒼',
  5:  '防',
  6:  'BK',
  7:  '限',
  8:  'BD攻',
  9:  'HP',
  10: '軽減',
  11: 'hit',
  12: '紅',
  13: 'UEXP',
  14: 'JG',
  15: 'SEXP',
  16: '報',
  17: '材経',
  18: 'AOE',
  19: 'wBD',
  20: 'w回',
  21: 'BD吸',
  22: 'JG蒼',
  23: '初BD',
  24: 'JG回',
  25: '維hit',
  26: '即死',
  27: '麻痺',
  28: '魅了',
  29: '乱攻',
  30: '割合',
  31: 'BD限',
  32: '回復',
  33: '敵BK',
  34: '自殺',
  35: '他',
};

// 条件 (発動) 6 类 enum
export const COND_TRIGGER = {
  NORMAL: 0,
  VITALITY: 1,        // Vitality_*
  REMHP: 2,           // RemHP_*
  BREAK: 3,           // Break_*
  FELLDOWN: 4,        // FellDown_*
  ENEMY_BREAK: 5,     // Enemy_Break*
};
export const COND_TRIGGER_LABEL = {
  0: '通常',
  1: '逆窮鼠',
  2: '窮鼠',
  3: '破損',
  4: '倒れ',
  5: '敵ブレイク状態',
};
export function conditionTrigger(p) {
  if (!p) return 0;
  if (p.startsWith('Vitality_')) return 1;
  if (p.startsWith('RemHP_')) return 2;
  if (p.startsWith('Break_')) return 3;
  if (p.startsWith('FellDown_')) return 4;
  if (p.startsWith('Enemy_Break')) return 5;
  return 0;
}

// 条件 (対象) 3 类 — 属性/武器限定 走顶层 f-element / f-weapon 过滤、不在 scope 里重复
export const SCOPE_TAG = {
  SELF: 1,
  SET: 2,
  CHARA: 3,
};
export const SCOPE_LABEL = {
  1: '自身',
  2: '装備セット',
  3: 'キャラ限定',
};

// crystal/bg 共用统一逻辑: SELF/SET 看 range='All'、CHARA 看 chara_base_id 非空
// 两个字段都由 build_*_aux.py 注入到 *_revise.json (crystal range / chara_base_id; bg chara_base_id)
// crystal range 缺省 = Single (revise 不写)、bg skill range 来自 master 原生
export function crystalScopeTags(c) {
  const tags = [];
  if (c.range === 'All') tags.push(2);   // 装備セット (revise.range='All' 注入)
  else tags.push(1);                      // 自身 (缺省)
  if (c.chara_base_id) tags.push(3);     // キャラ限定 (revise.chara_base_id 注入)
  return tags;
}

export function bgScopeTags(b) {
  const tagsSet = new Set();
  for (const sk of (b._skills || b.skills || [])) {
    if (sk.range === 'All') tagsSet.add(2);
    else tagsSet.add(1);
  }
  if (b.chara_base_id) tagsSet.add(3);   // build_bg_aux 反查 chara_base_id → キャラ限定 facet
  return [...tagsSet];
}
