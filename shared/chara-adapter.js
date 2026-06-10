// v2 characters.json (master_tables schema) → wiki characters.json shape
// 让 main 旧版 js/render.js / js/utils.js / shared/chara-spec.js 1:1 跑起来、UI 100% 一致。
//
// Phase 7 Session 2: adaptCharaList(arr, revise) deepApply revise patch 到 master 后转 wiki shape

import { deepApply } from './revise-core.js';
//
// 核心映射:
//   v2.parameter (#JS 91 项 enum string) → wiki.bunrui (int 1-21)
//   v2.math_type ('Multiply'/'Addition'/'Repel_Percent') → wiki.calc_type (0/1/2)
//   (Set / None / NoEffect 整条 skill 跳过、不渲染)
//   v2.range ('All'/'Single'/'None') + target_element_id/weapon_type_id/weapon_base_id 直接透传到 wiki effect (不再编码 scope)
//   HP-curve prefix (Vitality_/RemHP_/Break_) → wiki.condition (1/2/3) + base parameter
//   v2.weapon_skills[] → wiki.skills[].effects[] (一 skill 一 effect、不拆 bunrui 数组)
//   v2.stats.{initial_hp,max_hp,initial_attack,...} → wiki.stats.{initial,max}.{HP,攻撃力,...}
//   v2.profile (顶层、ja-EN 双语 key) → wiki.states.{X}.profile (内嵌、日文 key)
//   v2.mp (顶层) → wiki.basic_info.保有魔力

// PARAMETER (#JS name) → wiki bunrui id
// wiki BUNRUI: 1=攻撃力 2=ブレイク力 3=BD攻撃力 4=スピード 5=攻撃モーション 6=BDゲージ
//   7=ヒット数 8=攻撃全体化 9=状態異常回避 10=HP 11=HP回復 12=防御力 13=被ダメ軽減
//   14=サファイア 15=ルビー 16=その他 17=ダメージ上限 18=ゲージ最大値
//   19=結晶枠 20=獲得EXP 21=BDヒット数
const _PARAM_TO_BUNRUI_BASE = {
  Attack: 1,
  GuardBreak: 2,
  BlazeAttack: 3,
  Speed: 4,
  MotionSpeed: 5,
  BlazeGauge: 6,
  BlazeGaugePointRate: 6,
  HitCount: 7,
  HitCountKeepDamage: 7,
  AllTarget: 8,
  Mez: 9,
  Stun: 9,
  TheWorld: 9,
  HP: 10,
  Heal: 11,
  TimeHeal: 11,
  TimeHeal_Main: 11,
  Wave_Heal: 11,
  DamageHeal: 11,
  Defense: 12,
  GuardDefense: 13,
  SapphireDrop: 14,
  Attack_Sapphire: 14,
  JustGuard_Sapphire: 14,
  RubyDrop: 15,
  DamageLimitBreak: 17,
  BlazeGaugeMaxLevel: 18,
  MaterialSlotQuantity: 19,
  UserExp: 20,
  JobExp: 20,
  MaterialExp: 20,
  EventDropRate: 20,
  WeaponArtsHitCount: 21,
  WeaponArtsHitCountKeepDamage: 21,
  Raise: 16,
  Blaze13: 16,
  ForceBreak: 16,
  Random_Attack: 16,
  SuicideAttack: 16,
  InstantDeath: 16,
  AnyElement: 16,
  BarrierInvokePermission: 16,
  Rise_AttackRate: 1,
  Rise_DefenseRate: 12,
  Wave_BlazeUP: 6,
  BlazeAbsorb: 16,
  BlazeLock: 16,
  BlazeLockPurge: 16,
  Prayer: 16,
  RateDamage: 16,
  AttackCount: 7,
  PlayerHit: 16,
  EnemyHit: 16,
  GuildBattleTimeLimit: 16,
  EventSupplyBonus: 16,
  None: 16,
  NoEffect: 16,
  Enemy_Attack: 16,
  Enemy_Defense: 16,
  Enemy_GuardBreak: 16,
  Enemy_GuardDefense: 16,
  Enemy_BlazeAttack: 16,
  JustGuard_MinDamage: 13,
  JustGuard_Heal: 11,
};

const _HP_CURVE_PREFIX = ['Vitality_', 'RemHP_', 'Break_', 'FellDown_'];
const _PREFIX_TO_CONDITION = {
  Vitality_: 1,   // 逆窮鼠 (HP高い)
  RemHP_: 2,      // 窮鼠 (HP低い)
  Break_: 3,      // 破損
  FellDown_: 0,   // wiki 没对应 enum、置 0 (但保留 prefix 信息于 bunrui base)
};

// parameter → { bunrui, condition } — export 让其他 adapter 复用
export function paramToBunruiAndCondition(param) {
  if (param == null) return { bunrui: 16, condition: 0 };
  for (const pfx of _HP_CURVE_PREFIX) {
    if (param.startsWith(pfx)) {
      const base = param.slice(pfx.length);
      const b = _PARAM_TO_BUNRUI_BASE[base] ?? 16;
      return { bunrui: b, condition: _PREFIX_TO_CONDITION[pfx] };
    }
  }
  return { bunrui: _PARAM_TO_BUNRUI_BASE[param] ?? 16, condition: 0 };
}

// math_type → calc_type 枚举 (连续、不留空):
//   0 Multiply     → '×N'
//   1 Addition     → '+N'
//   2 Repel_Percent→ '×N %' (概率回避、value=N 表示 N% 几率全免疫)
// 跳过 (return null): None / NoEffect / Set / 未识别
//   - None/NoEffect: BD 特殊効果占位、不该作为数值效果显示
//   - Set: master 数据 chara 端无、UI 不渲染 (Phase 7 edit 若需再加回)
// export 让 soul-adapter / crystal-adapter / bg-adapter 复用
export const MATH_TYPE_TO_CALC = {
  Multiply: 0,
  Addition: 1,
  Repel_Percent: 2,
};
const _MATH_TYPE_TO_CALC = MATH_TYPE_TO_CALC;

// stats: v2 stats.{initial_hp/max_hp/...} → wiki stats.{initial,max}.{HP,攻撃力,...}
function _v2StatsToWiki(stats, hitCounts) {
  if (!stats) return null;
  const totalHit = (hitCounts || []).reduce((a, b) => a + (b || 0), 0) || 1;
  const max = {};
  const init = {};
  let hasInit = false;
  const map = [
    ['hp', 'HP'],
    ['attack', '攻撃力'],
    ['defense', '防御力'],
    ['break', 'ブレイク力'],
  ];
  for (const [vk, wk] of map) {
    const mv = stats[`max_${vk}`];
    const iv = stats[`initial_${vk}`];
    if (mv != null) max[wk] = mv;
    if (iv != null) { init[wk] = iv; hasInit = true; }
  }
  // fullhit = attack * totalHit
  if (max['攻撃力'] != null) max['フルヒット攻撃力'] = Math.floor(max['攻撃力'] * totalHit);
  if (init['攻撃力'] != null) init['フルヒット攻撃力'] = Math.floor(init['攻撃力'] * totalHit);
  const out = { max };
  if (hasInit) out.initial = init;
  return out;
}

// motion_id → モーション 名称 (master 表无、用 attack_motion_id 数字)
function _motionLabel(stateData) {
  return stateData.attack_motion_id != null ? String(stateData.attack_motion_id) : '-';
}

function _v2BasicInfo(stateData, chara) {
  return {
    'モーション': _motionLabel(stateData),
    'Hit数': Array.isArray(stateData.hit_counts) ? stateData.hit_counts : [],
    '合計Hit数': (stateData.hit_counts || []).reduce((a, b) => a + (b || 0), 0),
    '最大レベル': stateData.stats?.max_max_level ?? null,
    '最大熟度': stateData.stats?.max_mature ?? null,
    'LP': stateData.stats?.max_lp ?? null,
    '保有魔力': chara?.mp ?? null,
    '結晶スロット': stateData.stats?.initial_slot != null ? String(stateData.stats.initial_slot) : '-',
  };
}

// v2 profile (顶层、ja-EN 双语 key) → wiki state.profile (日文 key)
function _v2ProfileToWiki(prof) {
  if (!prof) return {};
  const out = {};
  if (prof.age) out['年齢'] = prof.age;
  if (prof.cv) out['CV'] = prof.cv;
  if (prof.height) out['身長'] = prof.height;
  if (prof.weight) out['重量'] = prof.weight;
  if (prof.three_size) out['B/W/H'] = prof.three_size;
  if (prof.like) out['好きなもの'] = prof.like;
  if (prof.dislike) out['嫌いなもの'] = prof.dislike;
  if (prof.flavor_text) out['魔剣説明'] = prof.flavor_text;
  if (prof.three_size_b != null) out['B'] = prof.three_size_b;
  if (prof.three_size_w != null) out['W'] = prof.three_size_w;
  if (prof.three_size_h != null) out['H'] = prof.three_size_h;
  return out;
}

// math_type → hit_type (utils.js fmtHitStages 用): 0=Add(+) 2=Mul(×) 3=Set(=)
const _MATH_TYPE_TO_HIT_TYPE = { Addition: 0, Multiply: 2, Set: 3 };

// HitCount 系 effect 注入 hit_per_stage / hit_per_stage_scaling / hit_type
//   chara: value=N, values=null      → hit_per_stage = [N, N, N]  (全段统一)
//   soul:  value=0, values=[a, b, c] → hit_per_stage = [a, b, c]  (按 stage 分段)
// adapter 输出 wiki shape、让 main js/utils.js fmtBairitu→fmtHitStages 0 改一行渲染。
// chara/souls/crystal/bg viewer 共用同一份 utils.js、注入字段也共用此 helper。
export function injectHitStages(eff, s) {
  if (Array.isArray(s.values) && s.values.length === 3) {
    eff.hit_per_stage = s.values.map(v => Number(v) || 0);
  } else {
    const v = Number(s.value) || 0;
    eff.hit_per_stage = [v, v, v];
  }
  const sc = Number(s.value_scaling) || 0;
  eff.hit_per_stage_scaling = [sc, sc, sc];
  eff.hit_type = _MATH_TYPE_TO_HIT_TYPE[s.math_type] ?? 0;
}

// v2 weapon_skill → wiki skill (含 effects[])。返回 null 表示该 skill 整条跳过。
// 跳过条件: parameter=NoEffect / math_type ∈ {None, Set} / math_type 未在 _MATH_TYPE_TO_CALC 表中
function _v2WeaponSkillToWiki(s) {
  if (s.parameter === 'NoEffect') return null;
  const { bunrui, condition } = paramToBunruiAndCondition(s.parameter);
  const calc_type = _MATH_TYPE_TO_CALC[s.math_type];
  if (calc_type == null) return null;
  const eff = {
    bunrui: [bunrui],
    range: s.range,             // master 原 'All' / 'Single' / 'None' 透传
    condition,
    bairitu: s.value,
    bairitu_scaling: s.value_scaling || 0,
    calc_type,
    _parameter: s.parameter,   // chara renderRightTags 用 PARAMETER_CLASS_SHORT 反查
  };
  // HitCount (bunrui=7) — 注入 stage 分段字段、让 fmtHitStages 渲染
  // WeaponArtsHitCount (bunrui=21、BD hit) 不分 stage、不注入、走普通 bairitu 路径
  if (bunrui === 7) injectHitStages(eff, s);
  // 元素 / 武器 / chara 限定 — 透传 master 字段
  if (s.target_element_id) eff.element = s.target_element_id;
  if (s.weapon_type_id) eff.weapon = s.weapon_type_id;
  if (s.weapon_base_id) eff.weapon_base_id = s.weapon_base_id;
  return {
    name: s.name || '',
    effect_text: s.description || '',
    effects: [eff],
  };
}

// v2 bd_skill → wiki bd_skill
function _v2BdSkillToWiki(bd, cost) {
  if (!bd) return null;
  // duration: effects[0].duration_value + duration
  let duration = '';
  const e0 = (bd.effects || [])[0];
  if (e0) {
    if (e0.duration === 'Wave') duration = `${Math.round(e0.duration_value || 1)}wave`;
    else if (e0.duration === 'Seconds') duration = `${Math.round(e0.duration_value || 0)}s`;
  }
  // bd effects 折叠成一条带多 bunrui[] (wiki 风格)、过滤 NoEffect/None
  const bunruiList = [];
  const v2ParamList = [];
  let bdCalc = 0;
  let bdBairitu = null;
  let bdRange = null;
  for (const e of (bd.effects || [])) {
    if (e.parameter === 'NoEffect') continue;
    const ctMaybe = _MATH_TYPE_TO_CALC[e.math_type];
    if (ctMaybe == null) continue;   // None / Set / 未识别 跳过
    const { bunrui } = paramToBunruiAndCondition(e.parameter);
    if (!bunruiList.includes(bunrui)) bunruiList.push(bunrui);
    if (!v2ParamList.includes(e.parameter)) v2ParamList.push(e.parameter);
    if (bdBairitu == null && e.value != null) {
      bdBairitu = e.value;
      bdCalc = ctMaybe;
      bdRange = e.range;
    }
  }
  const wikiBdEffects = bunruiList.length ? [{
    bunrui: bunruiList,
    range: bdRange,
    condition: 0,
    bairitu: bdBairitu ?? 0,
    calc_type: bdCalc,
    _parameters: v2ParamList,   // BD effect 多 parameter (折叠)、跟 bunruiList 平行
  }] : [];
  const cost_ = bd.cost != null ? bd.cost : cost;
  const effectText = cost_ != null
    ? `【消費レベル:${cost_}】${bd.description || ''}`
    : (bd.description || '');
  return {
    name: bd.name || '',
    cost: cost_,
    bdhit: bd.hit_count || null,
    duration,
    effect_text: effectText,
    effects: wikiBdEffects,
  };
}

export function v2CharaToWiki(c) {
  const v2States = c.states || {};
  const stateNames = Object.keys(v2States);
  // wiki id = state '通常' variant_id (6 位)、缺则 fallback 改造 / 極弐 / base*100
  const primary = v2States['通常'] || v2States['改造'] || v2States['極弐'] || Object.values(v2States)[0];
  const wikiId = primary?.variant_id ?? (c.id * 100 + 1);

  const wikiStates = {};
  for (const [sname, sd] of Object.entries(v2States)) {
    wikiStates[sname] = {
      skills: (sd.weapon_skills || []).map(_v2WeaponSkillToWiki).filter(Boolean),
      basic_info: _v2BasicInfo(sd, c),
      stats: _v2StatsToWiki(sd.stats, sd.hit_counts),
      profile: _v2ProfileToWiki(c.profile),
    };
  }

  return {
    _master: c,       // 原 master entry (hensei stats-calc 用)
    id: wikiId,
    sort_id: c.id,    // 默认 sort 用 base_id (4 位)、新角色 id 大 → desc 时排在前
    name: c.name,
    rarity: c.rarity,
    element: c.element_id,
    element_buff: [c.element_id],
    weapon: c.weapon_type_id,
    url: null,
    omoide_rarity: null,
    tags: Array.isArray(c.tags) ? c.tags : [],
    states: wikiStates,
    bd_skill: _v2BdSkillToWiki(c.bd_skill, c.bd_skill?.cost),
    omoide: [],
  };
}

// Phase 7 Session 2: 加 revise 参数、deepApply patch 合到 master 再转 wiki shape
//   revise: chara_revise.json (sparse diff、按 base_id 4 位)
export function adaptCharaList(arr, revise = []) {
  if (!Array.isArray(arr)) return [];
  const reviseById = new Map();
  for (const r of (revise || [])) {
    if (r && r.id != null) reviseById.set(r.id, r);
  }
  const merged = arr.map((c) => {
    const patch = reviseById.get(c.id);
    if (!patch) return c;
    const cloned = JSON.parse(JSON.stringify(c));
    deepApply(cloned, patch);
    return cloned;
  });
  return merged.map(v2CharaToWiki);
}
