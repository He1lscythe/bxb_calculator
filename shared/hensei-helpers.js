// shared/hensei-helpers.js — hensei viewer UI 用辅助函数 / 等级表
//
// 跟 stats-calc 分离: 这些纯 UI 辅助 (lv slider 范围 / skill 列表渲染 / 类型解析)
// 不参与核心 stat 计算。

// ============================================================
// 等级 / 觉醒 / 熟度 — master 字段直读、表只用于 UI fallback
// ============================================================
// soul 觉醒上限 (按 rarity)
export const SOUL_AWK_MAX = { 1: 13, 2: 11, 3: 9, 4: 7, 5: 5 };

// emblem level cap (跟 rarity)
export const EMBLEM_RARITY_LV_MAX = { 1: 25, 2: 40, 3: 55, 4: 1 };

// crystal level cap (跟 rarity)
export const CRYSTAL_RARITY_LV_MAX = { 1: 10, 2: 30, 3: 80, 4: 120, 5: 160, 6: 200 };

// chara 熟度 / lv 表 — master 直读优先、表只作 UI fallback (若 master 没数据)
// master 字段: state.stats.{max_mature, initial_max_level, max_max_level}
export const JUKUDO_MAX_TBL = {
  4: { '通常': 60, '改造': 99, '極弐': 99 },
  3: { '通常': 50, '改造': 90, '極弐': 90 },
  2: { '通常': 40, '改造': 70 },
  1: { '通常': 30, '改造': 50 },
};
export const LEVEL_MAX_TBL = {
  4: { '通常': 250, '改造': 255, '極弐': 260 },
  3: { '通常': 230, '改造': 240 },
  2: { '通常': 200 },
  1: { '通常': 150 },
};
export const LEVEL_1JUK_TBL = {
  4: { '通常': 60, '改造': 70, '極弐': 80 },
  3: { '通常': 50, '改造': 60 },
  2: { '通常': 40, '改造': 45 },
  1: { '通常': 30, '改造': 35 },
};

// chara state 的熟度/Lv 上限参数 — master 直读、字段缺失才回退上面的硬编码表。
// master 会新增 state 组合(如 S/AA/A 極弐)且数值随版本调整,表跟不上;
// stats-calc(maxLevelAtMature)一直直读 master,UI 从这里取值才能跟计算一致。
export const charaLvParams = (chara, state) => {
  const r = +chara?.rarity || 0;
  const st = chara?._master?.states?.[state]?.stats || {};
  return {
    jMax: st.max_mature != null ? +st.max_mature : (JUKUDO_MAX_TBL[r]?.[state] ?? 0),
    lev1: st.initial_max_level != null ? +st.initial_max_level : (LEVEL_1JUK_TBL[r]?.[state] ?? null),
    levMax: st.max_max_level != null ? +st.max_max_level : (LEVEL_MAX_TBL[r]?.[state] ?? null),
  };
};

// ============================================================
// memory_slot (omoide) skill scaling fallback
// ============================================================
// Frida 抓 data/omoide/{base_id}.json 时 weapon_skills[].value_scaling 字段全 0 / null。
// description 含「熟度UPにつれて...」字样的 skill 真实 scaling = 0.003 / 熟度 (见 docs/hensei_calc.md)。
// 这是 Frida 数据 gap、不是 game data 真值 0。fallback 应只对「描述含熟度」的 skill 生效。
export const OMOIDE_FALLBACK_SCALING = 0.003;

export function omoideEffectiveScaling(sk) {
  if (!sk) return 0;
  if (sk.value_scaling != null && sk.value_scaling !== 0) return sk.value_scaling;
  if (sk.description && sk.description.includes('熟度')) return OMOIDE_FALLBACK_SCALING;
  return 0;
}

// ============================================================
// crystal / emblem lv cap query
// ============================================================
// 字段名是 max_level (master 直供、adapter passthrough)、不是 level_max
// 缺省时按 rarity 表 fallback (历史兼容、当前 2063 个 master 全有 max_level)
export const cryLvMax = (cr) =>
  +cr?.max_level || (CRYSTAL_RARITY_LV_MAX[+cr?.rarity] ?? 1);

export const emblemLvMax = (rarity) => EMBLEM_RARITY_LV_MAX[+rarity] ?? 1;

// hensei ⚙ popover 维度可用性判定 — 跟 button 显示条件同源、避免漂移
// hasW: master.M_W_max 非 null (revise 走 cr-edit '重量' frac dropdown 填)
// hasP: master.M_P_max 非 null
// hasLv: cryLvMax(cr) > 1
// button 显示 = hasW || hasP || hasLv (任一 true 才有 popover 可开)
export const crystalDimAvailability = (cr) => {
  const m = cr?._master || {};
  return {
    hasW: m.M_W_max != null && (m.min_weight ?? 0) < (m.max_weight ?? 100),
    hasP: m.M_P_max != null && (m.min_purity ?? 0) < (m.max_purity ?? 100),
    hasLv: cr ? cryLvMax(cr) > 1 : false,
  };
};

// hensei popover slider 最小刻度。revise 没填 weight_step/purity_step 时 fallback。
//   weight: 0.1 (默认 0.1g 单位)
//   purity: 0.01 (默认 1% 内 0.01 细分)
//   lv: 1 (整数级)
export const crystalSliderStep = (m, dim) => {
  if (dim === 'weight') return m?.weight_step ?? 0.1;
  if (dim === 'purity') return m?.purity_step ?? 0.01;
  return 1;   // lv 或其他
};

// crystal master server-fold 字段 clamp:
//   M_W_max / M_P_max 数值 0-100 (frac '5/1.13' 字符串透传不 clamp)
//   其他字段透传
export const clampCrystalMasterField = (field, val) => {
  if ((field === 'M_W_max' || field === 'M_P_max') && typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(0, Math.min(100, val));
  }
  return val;
};

// crystal 因子行: 重量/純度 range (min/max) 是否显示
//   M_W_max null 或 =1 → 无 weight 缩放、min/max 都默认 100、不显示 range
//   min==max(固定重量/纯度、恒取 M_*_max)→ range 无意义、也不显示
//   M_P_max 同理
export const crystalShowWeightRange = (m) =>
  m?.M_W_max != null && m.M_W_max !== 1 && (m.min_weight ?? 0) < (m.max_weight ?? 100);
export const crystalShowPurityRange = (m) =>
  m?.M_P_max != null && m.M_P_max !== 1 && (m.min_purity ?? 0) < (m.max_purity ?? 100);

// cr-edit min_weight / min_purity 输入 placeholder
//   重量/純度 无缩放时、placeholder 显 100 (语义: 值固定 100)
//   有缩放时、显 0 (语义: range 起点)
export const crystalMinPlaceholder = (field, m) => {
  if (field === 'min_weight') return (m?.M_W_max == null || m.M_W_max === 1) ? 100 : 0;
  if (field === 'min_purity') return (m?.M_P_max == null || m.M_P_max === 1) ? 100 : 0;
  return null;
};

// M_L_max / M_W_max / M_P_max 的值可以是 number 或分式字符串 ('5/1.13')
// 缺省 / 空 / 解析失败 → 1 (不缩放)
function parseFactor(v) {
  if (v == null) return 1;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 1;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return 1;
    if (s.includes('/')) {
      const [a, b] = s.split('/');
      const na = Number(a), nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb) && nb !== 0) return na / nb;
      return 1;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 1;
  }
  return 1;
}

// crystal "bairitu" (display mode 显示的 lv max 时的最大効果量)
//   - 三因子任一非 null → initial × M_L_max × M_W_max × M_P_max
//   - 否则 → master.max_value (兼容 wiki_aux 来的普通结晶)
export function crystalMaxBairitu(m) {
  if (!m) return null;
  const hasFactor = m.M_L_max != null || m.M_W_max != null || m.M_P_max != null;
  if (!hasFactor) return m.max_value != null ? parseHit(m.max_value) : null;   // max_value 可为分式字符串
  const init = Number(m.initial_value) || 0;
  return init * parseFactor(m.M_L_max) * parseFactor(m.M_W_max) * parseFactor(m.M_P_max);
}

// crystal effect 实际数值 — unpacking §18.2 三因子公式 + fallback
//
// 判定 (基于 crystal 数据是否含 server-fold 参数):
//   - revise 没填 M_L_max / M_W_max / M_P_max 任一 → fallback: max_value 简单 lv 线性
//   - 至少一个填了 → 三因子公式 value = initial_value × M_L × M_W × M_P
//
// 公式 (unpacking §18.2):
//   M_L(L) = 1 + (M_L_max − 1) × (L − 1) / (max_level − 1)
//   M_W(W) = 1 + (M_W_max − 1) × (W − min_weight) / (max_weight − min_weight)
//   M_P(P) = 1 + (M_P_max − 1) × (P − min_purity) / (max_purity − min_purity)
//
// cfg 缺省值: lv = lvMax / weight = max_weight / purity = max_purity (跟 lv 一致默认满)
// 跟 stats-calc 内 crystal effect collection 用同样公式
export function crystalEffectiveValue(cr, cfg) {
  if (!cr?._master) return 0;
  const m = cr._master;
  const initV = m.initial_value ?? 0;
  const lvMax = +m.max_level || 1;
  const lv = cfg?.lv ?? lvMax;

  // fallback: 5 个三因子参数 (M_L/W/P_max) 都没填 → max_value 简单 lv 线性
  const hasFormula = m.M_L_max != null || m.M_W_max != null || m.M_P_max != null;
  if (!hasFormula) {
    const maxV = m.max_value != null ? parseHit(m.max_value) : initV;   // crystal_revise.json 的 max_value (可为分式字符串)
    const ratio = lvMax > 1 ? Math.max(0, Math.min(1, (lv - 1) / (lvMax - 1))) : 0;
    return initV + (maxV - initV) * ratio;
  }

  // 三因子公式 — M_*_max 支持小数 / 分式字符串 ('5/1.13')、parseFactor 统一展开
  const ML_max = parseFactor(m.M_L_max);
  const MW_max = parseFactor(m.M_W_max);
  const MP_max = parseFactor(m.M_P_max);
  const minW = m.min_weight ?? 0;
  const maxW = m.max_weight ?? 100;
  const minP = m.min_purity ?? 0;
  const maxP = m.max_purity ?? 100;
  const W = cfg?.weight ?? maxW;
  const P = cfg?.purity ?? maxP;
  // 固定重量/纯度约定: 显式填 min==max → 该维度不可调、恒取满值 M_*_max
  // (lv 不适用此约定: max_level=1 → ML=1 是既有语义、等级固定=初始值)
  const ML = lvMax > 1 ? 1 + ((ML_max - 1) * (lv - 1)) / (lvMax - 1) : 1;
  const MW = maxW > minW ? 1 + ((MW_max - 1) * (W - minW)) / (maxW - minW) : MW_max;
  const MP = maxP > minP ? 1 + ((MP_max - 1) * (P - minP)) / (maxP - minP) : MP_max;
  return initV * ML * MW * MP;
}

// ============================================================
// soul awakening / lv cap / level multiplier
// ============================================================
export function soulAwkMax(soul) {
  const r = +soul?.rarity || 1;
  return SOUL_AWK_MAX[r] ?? 5;
}

// soul 觉醒每 +1 → 最高等级 +5、cap 硬上限 75 (v1 main:js/stats-calc.js L199-203)
export function soulLvCap(soul, awakening) {
  const baseCap = +soul?.max_level || 0;
  const aw = Math.min(+awakening || 0, soulAwkMax(soul));
  return Math.min(75, baseCap + aw * 5);
}

// soul lv → stat 倍率 (v1 main:js/stats-calc.js L210-220)
//   lv ≤ rarity*10:  1 + 0.01*lv             (例: 5★ Lv 50 → 1.5)
//   lv > rarity*10:  base = 1 + 0.1*rarity   (例: 5★ → 1.5)
//                    inc  = (rarity===5 ? 0.3 : 0.1)
//                    return base + inc * (lv - rarity*10) / (75 - rarity*10)
// 例: 5★ Lv 75 (满觉醒): 1.5 + 0.3 = 1.8。4★ Lv 75: 1.4 + 0.1 = 1.5。
export function soulMultiplier(rarity, lv) {
  const r = +rarity || 1;
  const L = Math.max(1, +lv || 1);
  const maxNoAwk = r * 10;
  if (L <= maxNoAwk) return 1 + 0.01 * L;
  const base = 1 + 0.1 * r;
  const range = 75 - maxNoAwk;
  if (range <= 0) return base;
  const inc = r === 5 ? 0.3 : 0.1;
  return base + (inc * (L - maxNoAwk)) / range;
}

// ============================================================
// 元素相性 (chara vs enemy、stats-calc 用)
// 元素 K 表 跟 wiki main:js/stats-calc.js L60-90 一致、mode 三选一
// ============================================================
const ELEMENT_K_NORMAL = {
  1: { 1: 0, 2: -1, 3: 1, 4: 0, 5: 0, 6: 0 }, // 火
  2: { 1: 1, 2: 0, 3: -1, 4: 0, 5: 0, 6: 0 }, // 水
  3: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 }, // 風
  4: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0 }, // 光
  5: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0 }, // 闇
  6: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, // 無
};
const ELEMENT_K_GUILD = {
  1: { 1: 0, 2: -2, 3: 3, 4: 0, 5: 0, 6: 2 },
  2: { 1: 3, 2: 0, 3: -2, 4: 0, 5: 0, 6: 2 },
  3: { 1: -2, 2: 3, 3: 0, 4: 0, 5: 0, 6: 2 },
  4: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 3, 6: 2 },
  5: { 1: 0, 2: 0, 3: 0, 4: 3, 5: 0, 6: 2 },
  6: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3 },
};
const ELEMENT_K_GUILD_SPECIAL = {
  1: { 1: -3, 2: -3, 3: 3, 4: -3, 5: -3, 6: -3 },
  2: { 1: 3, 2: -3, 3: -3, 4: -3, 5: -3, 6: -3 },
  3: { 1: -3, 2: 3, 3: -3, 4: -3, 5: -3, 6: -3 },
  4: { 1: -3, 2: -3, 3: -3, 4: -3, 5: 3, 6: -3 },
  5: { 1: -3, 2: -3, 3: -3, 4: 3, 5: -3, 6: -3 },
  6: { 1: -3, 2: -3, 3: -3, 4: -3, 5: -3, 6: 3 },
};
export function elementMatchupMult(srcElem, tgtElem, mode) {
  if (mode === 'guildbattle') {
    const k = (ELEMENT_K_GUILD[srcElem] || {})[tgtElem] || 0;
    if (k === 3) return 15.0;
    if (k === 2) return 10.0;
    if (k === -2) return 0.1;
    return 1.0;
  }
  if (mode === 'guildbattle_special') {
    const k = (ELEMENT_K_GUILD_SPECIAL[srcElem] || {})[tgtElem] || 0;
    if (k === 3) return 15.0;
    if (k === -3) return 0.01;
    return 1.0;
  }
  // normal / default
  const k = (ELEMENT_K_NORMAL[srcElem] || {})[tgtElem] || 0;
  if (k === 1) return 2.0;
  if (k === -1) return 0.5;
  return 1.0;
}

// hensei enemy bar 硬编码倍率
export const DIFFICULTY_MULT = { Normal: 1.0, Hard: 0.1, Lunatic: 0.005 };
export const BK_RES_MULT = { normal: 3.0, high: 6.0 };
export const ADVANTAGE_WEAPON_MULT = 2.0;
// bdCapMult(n) = 1 + floor(n/2) × 0.25 (跟 wiki main 一致、整数 step 倍率)
// slider UI step=0.01 允许细滑、但公式 floor 让半 step 倍率不变 (即 n=4.5 跟 n=4 同倍率)
export function bdCapMult(n) { return 1 + Math.floor((+n || 0) / 2) * 0.25; }

// blaze_gauge_points 「A 表 base」(unpacking §1.3.3.5、力試し副本数据、61 项)
// 每项 = level i 升级需要的 BlazeGauge points 累计
// 「只魔剣 skill」pipeline 用此表: `floor(A[i] × Π chara_skill_value)`
export const BLAZE_GAUGE_POINTS_BASE_A = [
  100, 100, 100, 100, 100, 100, 100, 100, 100,
  140, 280, 419, 560, 700, 839, 979, 1120, 1260, 1400, 1539,
  1679, 1820, 1959, 2100, 2240, 2379, 2520, 2660, 2800, 2940,
  3079, 3219, 3359, 3500, 3640, 3779, 3919, 4059, 4200, 4340,
  4480, 4620, 4759, 4900, 5040, 5180, 5320, 5459, 5600, 5740,
  5880, 6020, 6159, 6299, 6439, 6580, 6719, 6859, 7000, 7139, 7280,
];

// IDEAL 表 (A 表去掉所有 ±1 修正): flat = 100 (i<9)、生长段 = 140·(i-8) (i≥9)
// 「有 BlazeGaugePointRate soul」pipeline 用此表: `floor(IDEAL[i] × Π chara_skill × Π (soul_value × L(lv)))`
export const BLAZE_GAUGE_POINTS_BASE_IDEAL = Array.from({ length: 61 }, (_, i) => (i < 9 ? 100 : 140 * (i - 8)));

// 魂等级补正 L(level) (unpacking §1.3.3.5)
//   只附在魂上 (魔剣 skill 不带)、Lv1 = 1.01、Lv2+ 系数 (线性/指数/查表) 未知
//   当前简化: 所有 lv 用 1.01 (Lv1 值近似)
export function blazeGaugeSoulLevelMult(_lv) { return 1.01; }

// bdCapFromBlazeGauge — cumsum 反查 totalGauge points 在数组中能到第几 level (小数允许)
//   blazeGaugePoints[i] = level i → i+1 升级 需要的 points (不是累计)
//   cum[i] = Σ blazeGaugePoints[0..i] (累计到 Lv i+1 所需 total)
//   找最大 N 满足 cum[N-1] ≤ totalGauge < cum[N]、bd_cap = N + (totalGauge - cum[N-1]) / pointsArr[N]
//   例 A 表 cum=[100,200,...,900,1040,...]、totalGauge=450 → bd_cap=4 + (450-400)/100 = 4.5
export function bdCapFromBlazeGauge(blazeGaugePoints, totalGauge) {
  if (!Array.isArray(blazeGaugePoints) || !blazeGaugePoints.length) return 0;
  if (!(totalGauge > 0)) return 0;
  let cum = 0;
  for (let i = 0; i < blazeGaugePoints.length; i++) {
    const step = blazeGaugePoints[i];
    if (!(step > 0)) continue;
    const next = cum + step;
    if (totalGauge < next) {
      return i + (totalGauge - cum) / step;
    }
    cum = next;
  }
  return blazeGaugePoints.length;   // 全跨完
}

// computeBlazeGaugePoints — unpacking §1.3.3.5 pipeline:
//   有 soul rate skill 时 → IDEAL 表 pipeline (A 表 ±1 修正被旁路)
//   只 chara skill 时    → A 表 pipeline
//   都无时               → A 表 base 不变
// 入参:
//   charaSkillProd: Π chara/crystal/bg skill BlazeGaugePointRate value (Mul)
//   soulRates:      [{value, lv}, ...] 每个含 BlazeGaugePointRate skill 的 soul (level=tr.soul_lv)
export function computeBlazeGaugePoints(charaSkillProd, soulRates) {
  const hasSoulRate = Array.isArray(soulRates) && soulRates.length > 0;
  if (hasSoulRate) {
    let prod = charaSkillProd;
    for (const { value, lv } of soulRates) prod *= value * blazeGaugeSoulLevelMult(lv);
    return BLAZE_GAUGE_POINTS_BASE_IDEAL.map((p) => Math.floor(p * prod));
  }
  return BLAZE_GAUGE_POINTS_BASE_A.map((p) => Math.floor(p * (charaSkillProd || 1)));
}

// emblem level scaling (wiki main:js/stats-calc.js L1041-1047)
// bairitu_eff = (bairitu_max - 1) * (lv - 1) / (lvMax - 1) + 1
export function emblemEffectiveBairitu(bairitu, lv, lvMax) {
  const b = +bairitu;
  if (!Number.isFinite(b) || b === 0) return b || 0;
  if (lvMax <= 1) return b;
  const cl = Math.max(1, Math.min(lvMax, +lv || 1));
  return ((b - 1) * (cl - 1)) / (lvMax - 1) + 1;
}

// wiki bunrui → master parameter (反查、emblem effect schema 用 wiki bunrui)
// emblem master 数据用 wiki bunrui[1] 数字、需转 master parameter name 才能给 collectEffects 用
// 仅常见显示 stat (Attack/Defense/HP/GuardBreak)、其他归 NoEffect (collectEffects 跳过)
const _BUNRUI_TO_PARAM = {
  1: 'Attack', 2: 'GuardBreak', 3: 'BlazeAttack', 4: 'Speed', 5: 'MotionSpeed',
  6: 'BlazeGauge', 7: 'HitCount', 10: 'HP', 11: 'Heal', 12: 'Defense',
  13: 'GuardDefense', 14: 'SapphireDrop', 17: 'DamageLimitBreak', 21: 'WeaponArtsHitCount',
};
export function bunruiToParam(b) { return _BUNRUI_TO_PARAM[b] || 'NoEffect'; }
const _CALC_TYPE_TO_MATH = { 0: 'Multiply', 1: 'Addition', 2: 'Repel_Percent' };
export function calcTypeToMath(c) { return _CALC_TYPE_TO_MATH[c] || 'Multiply'; }

// ============================================================
// chara / soul skill 列表 (UI render 用、tombstone + add 处理)
// chara state.weapon_skills (master) + chara._added_skills / _deleted_skills (edit)
// ============================================================
export function resolveCharaSkills(charaWiki, stateName) {
  const cMaster = charaWiki?._master;
  if (!cMaster) return [];
  const state = cMaster.states?.[stateName] || Object.values(cMaster.states || {})[0];
  return state?.weapon_skills || [];
}

export function resolveSoulSkills(soulWiki) {
  return soulWiki?._master?.skills || [];
}

// ============================================================
// 数值解析 helper (UI 用、容错"5/99" 分数式)
// ============================================================
export function parseHit(s) {
  if (s == null) return 0;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  const t = String(s).trim();
  if (t === '') return 0;
  if (t.includes('/')) {
    const [n, d] = t.split('/').map(parseFloat);
    return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : 0;
  }
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : 0;
}

export function parseAff(s) {
  if (s == null) return 1;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 1;
  const t = String(s).trim();
  if (t === '') return 1;
  if (t.includes('/')) {
    const [n, d] = t.split('/').map(parseFloat);
    return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : 1;
  }
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : 1;
}
