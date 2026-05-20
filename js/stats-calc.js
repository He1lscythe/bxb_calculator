// js/stats-calc.js — hensei.html computeStats 提取出的 stats 计算引擎 +
// 14 个常量 + 19 个 helper（Step G post-migration 完整版 — 之前是 ctx 注入、
// 现在 module-level export，hensei.html / test_calculator.mjs 都 import 用）。
//
// 设计：runtime state 通过 ctx 参数注入（数据集 + 队伍/敌方 + UI 常量）、
// helper / 表常量 都在 module scope（pure functions + lookup tables、唯一 source of truth）。
//
// ctx 接口 (14 字段 flat)：
//   数据集:    allCharas, allCrystals, allSouls, allMasou, allBGs,
//             allGuildTitles, allGuildEmblems, SENZAI_TABLE
//   队伍/敌方: team, teamSize, enemy
//   UI 常量:   SLOT_COLORS, COLOR_LABELS, IS_LOCAL_DEV
//
// Helpers / 常量参见各 `export` 定义。`_conditionFactor` 接 enemyBk 第 3 参（参数化、
// 原 hensei.html 闭包 enemy.bk）— computeStats 内调用时传 ctx.enemy.bk。
//
// Trace 行为：ctx.IS_LOCAL_DEV=true 时生成 trace; 否则 trace=null、_enterStage/_pushStep 为 no-op。
// 返回 { stats, damageLimit, hits, bdCapMax, trace? }。

import { ELEMENT, WEAPON, ELEMS_ORDER, WEAPONS_ORDER } from '../shared/constants.js';

// ===== Constants =====

export const _STAT_KEYS = ['攻撃力', '防御力', 'HP', 'ブレイク力'];
export const _BUNRUI_TO_STAT = { 1: '攻撃力', 2: 'ブレイク力', 10: 'HP', 12: '防御力' };
// chara skill name に Lv2/Lv3/Lv4/Lv5 が含まれるか（Lv50/Lv500 等は対象外）。
// hensei calc 専用：crawl 段階では effect に保存しない。
export const _LV2_5_RE = /Lv[2-5](?!\d)/;

export const SOUL_AWK_MAX = { 1: 13, 2: 11, 3: 9, 4: 7, 5: 5 };

// 紋章 rarity → 等级上限：rarity 1=25, 2=40, 3=55, 4=1
export const EMBLEM_RARITY_LV_MAX = { 1: 25, 2: 40, 3: 55, 4: 1 };

// 結晶 rarity → lv 上限。⚠ rarity 1, 2 数据待验证（rarity 3-6 已确认）。
// crystal 顶层可有 optional `level_max` 覆盖；缺省则按此表。
// 注：lv 当前 calc 不接入；常量 + helper 仅 schema 占位，为未来 lv 接入预留。
export const CRYSTAL_RARITY_LV_MAX = { 1: 10, 2: 30, 3: 80, 4: 120, 5: 160, 6: 200 };

export const JUKUDO_MAX_TBL = {
  4: { 通常: 60, 改造: 99 },
  3: { 通常: 50, 改造: 75, 極弐: 90 },
  2: { 通常: 30, 改造: 45, 極弐: 70 },
  1: { 通常: 10, 改造: 25, 極弐: 50 },
};

export const LEVEL_MAX_TBL = {
  4: { 通常: 250, 改造: 255 },
  3: { 通常: 200, 改造: 215, 極弐: 230 },
  2: { 通常: 150, 改造: 155, 極弐: 180 },
  1: { 通常: 60, 改造: 99, 極弐: 120 },
};

export const LEVEL_1JUK_TBL = {
  4: { 通常: 60, 改造: 70 },
  3: { 通常: 40, 改造: 50, 極弐: 65 },
  2: { 通常: 30, 改造: 35, 極弐: 60 },
  1: { 通常: 15, 改造: 20, 極弐: 35 },
};

export const AWAKENING_MAX_TBL = { 4: 9, 3: 14, 2: 36, 1: 24 };
export const AWAKENING_MULT_TBL = { 4: 1.43, 3: 2.42, 2: 4.45, 1: 5.37 };

// ===== 元素克制表 K[攻击方][被攻击方] =====
export const ELEMENT_K_NORMAL = {
  1: { 1: 0, 2: -1, 3: 1, 4: 0, 5: 0, 6: 0 }, // 火
  2: { 1: 1, 2: 0, 3: -1, 4: 0, 5: 0, 6: 0 }, // 水
  3: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 }, // 風
  4: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0 }, // 光
  5: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0 }, // 闇
  6: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, // 無
};

export const ELEMENT_K_GUILD = {
  1: { 1: 0, 2: -2, 3: 3, 4: 0, 5: 0, 6: 2 },
  2: { 1: 3, 2: 0, 3: -2, 4: 0, 5: 0, 6: 2 },
  3: { 1: -2, 2: 3, 3: 0, 4: 0, 5: 0, 6: 2 },
  4: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 3, 6: 2 },
  5: { 1: 0, 2: 0, 3: 0, 4: 3, 5: 0, 6: 2 },
  6: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3 },
};

export const ELEMENT_K_GUILD_SPECIAL = {
  1: { 1: -3, 2: -3, 3: 3, 4: -3, 5: -3, 6: -3 },
  2: { 1: 3, 2: -3, 3: -3, 4: -3, 5: -3, 6: -3 },
  3: { 1: -3, 2: 3, 3: -3, 4: -3, 5: -3, 6: -3 },
  4: { 1: -3, 2: -3, 3: -3, 4: -3, 5: 3, 6: -3 },
  5: { 1: -3, 2: -3, 3: -3, 4: 3, 5: -3, 6: -3 },
  6: { 1: -3, 2: -3, 3: -3, 4: -3, 5: -3, 6: 3 },
};

// ===== Pure helpers (L0: 无 helper 依赖) =====

export const _parseScaling = (v) => {
  if (v == null || v === 0 || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.indexOf('/') >= 0) {
    const parts = v.split('/').map(Number);
    return parts[1] ? parts[0] / parts[1] : 0;
  }
  return parseFloat(v) || 0;
};

// hit_per_stage* 値を数値化（"1/3" / "0.5" / 0.5 受け入れ、無効値は 0）。
export const _parseHit = (s) => {
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
};

// soul affinity の atk/def_effect 値を数値化。"5/4" / "1.9" / 1.9 全部受け入れ、無効値は 1。
export const _parseAff = (s) => {
  if (s == null) return 1;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 1;
  const t = String(s).trim();
  if (t === '') return 1;
  if (t.includes('/')) {
    const [n, d] = t.split('/').map(parseFloat);
    return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : 1;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 1;
};

// ===== L1 (依赖 L0) =====

// 熟度 scaling 適用：
//   jkMinus1=true (skill name に Lv2/Lv3/Lv4/Lv5) → b + (jk - 1) * s
//   それ以外（Lv6+ / Lv1 / 無 Lv 後缀 / chara 以外）→ b + jk * s
// 任意の jukudo は外側で >=1 にクランプ済み。
// b / sc 双方とも数値・分式文字列 ("1/2") を受け入れる。
export const _scaledBairitu = (b, sc, jukudo, jkMinus1 = false) => {
  const bv = _parseScaling(b);
  const s = _parseScaling(sc);
  if (!s) return bv;
  const factor = jkMinus1 ? jukudo - 1 : jukudo;
  return bv + factor * s;
};

// 乗性 delta 三次元公式（weight / purity / lv）：
//   factor_i = delta + (1 - delta) * pos     (pos ∈ [0,1])
//   ct=0/3 (mult/final-mult): eff = (baseB - 1) * factor + 1   (neutral=1)
//   ct=1/2 (add /final-add):  eff = baseB * factor             (neutral=0)
// delta 缺字段 / 空串 → factor=1 不衰减; delta=0 → 端点満衰减; step 仅 slider 颗粒度、不入公式。
export const _crystalDimFactor = (pos, deltaRaw) => {
  if (deltaRaw == null || deltaRaw === '') return 1;
  const d = _parseScaling(deltaRaw);
  if (!Number.isFinite(d)) return 1;
  if (pos == null || !Number.isFinite(pos)) return 1;
  return d + (1 - d) * pos;
};

// ===== L2 (无 helper 依赖) =====

export const emblemLvMax = (rarity) => {
  return EMBLEM_RARITY_LV_MAX[+rarity || 1] || EMBLEM_RARITY_LV_MAX[1];
};

export const cryLvMax = (cr) => +cr?.level_max || (CRYSTAL_RARITY_LV_MAX[+cr?.rarity] ?? 1);

export const elementMatchupMult = (srcElem, tgtElem, mode) => {
  if (mode === 'guildbattle') {
    const k = (ELEMENT_K_GUILD[srcElem] || {})[tgtElem] || 0;
    if (k === 3) return 15.0;
    if (k === 2) return 10.0;
    if (k === -2) return 0.1;
    return 1.0;
  }
  if (mode === 'guildbattle_special') {
    const k = (ELEMENT_K_GUILD_SPECIAL[srcElem] || {})[tgtElem] || 0;
    if (k === 3) return 15.0; // 特別版正向克制（用 ギルバト 同值）
    if (k === -3) return 0.01;
    return 1.0;
  }
  // normal / other
  const k = (ELEMENT_K_NORMAL[srcElem] || {})[tgtElem] || 0;
  if (k === 1) return 2.0;
  if (k === -1) return 0.5;
  return 1.0;
};

// soul.max_awakening が定義されてれば SOUL_AWK_MAX[r] を上書き（覚醒不可な特例魂用）
export const soulAwkMax = (soul) => {
  const ovr = soul && soul.max_awakening;
  if (ovr != null && Number.isFinite(+ovr)) return +ovr;
  const r = +(soul && soul.rarity) || 1;
  return SOUL_AWK_MAX[r] || 0;
};

// lv cap = max_level + aw*5（最多 75）。max_level は通常 rarity*10 だが、souls_revise.json で
// 上書きされた特例魂（ダイナスティ/ディシディア = 1）は自然に cap=1 + 0 = 1 に落ちる。
export const soulLvCap = (soul, awakening) => {
  const maxLv = +(soul && soul.max_level) || 0;
  const aw = Math.min(+awakening || 0, soulAwkMax(soul));
  return Math.min(75, maxLv + aw * 5);
};

// 魂等级 → 倍率加成。rarity 对应的"无觉醒最高等级" = rarity*10，超过后线性增长到 lv=75。
//   lv ≤ rarity*10:  1 + 0.01*lv
//   lv > rarity*10:  base = 1 + 0.1*rarity
//                    inc  = rarity===5 ? 0.3 : 0.1
//                    return base + inc * (lv - rarity*10) / (75 - rarity*10)
export const soulMultiplier = (rarity, lv) => {
  const r = +rarity || 1;
  const L = Math.max(1, +lv || 1);
  const maxNoAwk = r * 10;
  if (L <= maxNoAwk) return 1 + 0.01 * L;
  const base = 1 + 0.1 * r;
  const range = 75 - maxNoAwk;
  if (range <= 0) return base;
  const inc = r === 5 ? 0.3 : 0.1;
  return base + (inc * (L - maxNoAwk)) / range;
};

export const _capLevel = (chara, tr) => {
  const r = chara.rarity;
  const lev1 = LEVEL_1JUK_TBL[r]?.[tr.state];
  const levMax = LEVEL_MAX_TBL[r]?.[tr.state];
  if (lev1 == null || levMax == null) return null;
  const jMax = JUKUDO_MAX_TBL[r]?.[tr.state] ?? 1;
  const jk = Math.min(Math.max(1, tr.jukudo || 1), jMax);
  return Math.min(levMax, lev1 + (jk - 1) * 5);
};

export const _resolveCharaSkills = (c, trState) => {
  if (!c || !c.states) return [];
  let stateLabel = null,
    state = null;
  if (trState && c.states[trState]) {
    stateLabel = trState;
    state = c.states[trState];
  } else {
    for (const s of ['極弐', '改造', '通常']) {
      if (c.states[s]) {
        stateLabel = s;
        state = c.states[s];
        break;
      }
    }
  }
  if (!state) return [];
  const dead = new Set(Array.isArray(c._deleted_skills) ? c._deleted_skills : []);
  const base = (state.skills || []).filter((sk) => !dead.has(sk.name || ''));
  const added = (c._added_skills && c._added_skills[stateLabel]) || [];
  return base.concat(added);
};

export const _resolveSoulSkills = (s) => {
  if (!s) return [];
  const dead = new Set(Array.isArray(s._deleted_skills) ? s._deleted_skills : []);
  const base = (s.skills || []).filter((sk) => !dead.has(sk.name || ''));
  const added = Array.isArray(s._added_skills) ? s._added_skills : [];
  return base.concat(added);
};

export const _selfAppliesChara = (c, e) => {
  const sc = e.scope;
  if (sc === 0 || sc === 1) return true;
  if (sc === 2 || sc === 3) {
    const elem = e.element;
    const elemOK =
      elem == null || (Array.isArray(elem) ? elem.indexOf(c.element) >= 0 : elem === c.element);
    const tp = e.weapon;
    const typeOK = tp == null || (Array.isArray(tp) ? tp.indexOf(c.weapon) >= 0 : tp === c.weapon);
    return elemOK && typeOK;
  }
  return false;
};

// 元素 / 武器种匹配。useElementBuff=true 时（仅魔剣技能）拿 tgtChara.element_buff[]
// 做集合包含判定；其它来源（crystal / bladegraph / soul / guild）依然用单值 element。
export const _matchElemType = (e, tgtChara, useElementBuff) => {
  const elem = e.element;
  let elemOK;
  if (elem == null) {
    elemOK = true;
  } else {
    const reqElems = Array.isArray(elem) ? elem : [elem];
    const tgtElems =
      useElementBuff && Array.isArray(tgtChara.element_buff) && tgtChara.element_buff.length
        ? tgtChara.element_buff
        : [tgtChara.element];
    elemOK = reqElems.some((r) => tgtElems.indexOf(r) >= 0);
  }
  const tp = e.weapon;
  const typeOK =
    tp == null || (Array.isArray(tp) ? tp.indexOf(tgtChara.weapon) >= 0 : tp === tgtChara.weapon);
  return elemOK && typeOK;
};

// ===== L3 (依赖 L2 / L1) =====

export const _baseStat = (chara, tr, attr) => {
  const state = chara.states?.[tr.state];
  const stMax = state?.stats?.max?.[attr];
  if (stMax == null) return null;
  // initial / max ratio: always from 通常 state for non-通常 calculation
  const sourceState = tr.state === '通常' ? state : chara.states?.['通常'];
  const initial = sourceState?.stats?.initial?.[attr];
  const normalMax = sourceState?.stats?.max?.[attr];
  const r = chara.rarity;
  const levMax = LEVEL_MAX_TBL[r]?.[tr.state];
  const cap = _capLevel(chara, tr);
  if (cap == null || levMax == null || levMax <= 1 || initial == null || normalMax == null)
    return stMax;
  const lvBase = Math.min(tr.level || 1, cap);
  let v = stMax * (1 - (((levMax - lvBase) / (levMax - 1)) * initial) / normalMax);
  // Awakening boost when level exceeds base cap
  if ((tr.level || 1) > cap) {
    const aMax = AWAKENING_MAX_TBL[chara.rarity] || 1;
    const mult = AWAKENING_MULT_TBL[chara.rarity] || 1;
    const overLv = (tr.level || 1) - cap;
    v = v * (1 + (overLv / (aMax * 5)) * (mult - 1));
  }
  return v;
};

export const _crystalEffectiveBairitu = (cr, cfg, e) => {
  const baseB = _parseScaling(e.bairitu);
  if (!Number.isFinite(baseB)) return null;
  // weight 维度新增 weight_min 下界：pos = (weight - wMin) / (100 - wMin)
  // wMin ≥ 100（异常 case）→ wPos=null → factor=1 不衰减（防 ÷0）
  const wMin = +cr.weight_min || 0;
  const wPos = cfg.weight != null && wMin < 100 ? (cfg.weight - wMin) / (100 - wMin) : null;
  const pPos = cfg.purity != null ? cfg.purity / 100 : null;
  const maxLv = cryLvMax(cr);
  const lvVal = cfg.lv != null ? cfg.lv : maxLv;
  const lvPos = maxLv > 1 ? (lvVal - 1) / (maxLv - 1) : 1;
  const fw = _crystalDimFactor(wPos, e.weight_delta);
  const fp = _crystalDimFactor(pPos, e.purity_delta);
  const flv = _crystalDimFactor(lvPos, e.lv_delta);
  const factor = fw * fp * flv;
  if (factor === 1) return baseB;
  const ct = e.calc_type ?? 0;
  return ct === 0 || ct === 3 ? (baseB - 1) * factor + 1 : baseB * factor;
};

// Cross-slot: source (srcChara) buffs target (tgtChara). Returns true if effect e applies.
// useElementBuff=true → 魔剣技能特例，element 走 tgtChara.element_buff[]
export const _buffApplies = (srcChara, tgtChara, e, useElementBuff = false) => {
  if (!tgtChara) return false;
  const sc = e.scope;
  if (sc == null || sc === 1) return true; // 全体
  if (sc === 0) {
    return !!srcChara && srcChara.id === tgtChara.id;
  }
  if (sc === 3) {
    if (!srcChara || srcChara.id !== tgtChara.id) return false;
    return _matchElemType(e, tgtChara, useElementBuff);
  }
  if (sc === 2 || sc === 4) {
    return _matchElemType(e, tgtChara, useElementBuff);
  }
  if (sc === 5) {
    // chara 限定：精确相等のみ（substring を許すと "魔剣グラム" effect が
    // "魔剣グラム:Blaze" 等の別 chara に誤発火する。wiki 上 effect.name は
    // tgtChara.name と完全一致するのが正常 — 一致しない = wiki 表記不整合）
    const nm = e.name;
    return !!nm && tgtChara.name === nm;
  }
  return false;
};

// HP-based condition factor (multiplier on bairitu)
//   1=逆窮鼠 → linear hp%/100  (0 at 0% HP → 1 at 100% HP)
//   2=窮鼠   → linear (100-hp%)/100  (1 at 0% HP → 0 at 100% HP)
//   3=破損 → binary  (1 if hp%<50 else 0)
//   4=BK状態時 → enemy.bk ? 1 : 0（通过参数 enemyBk 传入）
//   0/null → 1
// Applied via:
//   additive: effective = bairitu * factor
//   multiplicative: effective = (bairitu - 1) * factor + 1
export const _conditionFactor = (condition, hpPct, enemyBk = false) => {
  if (!condition) return 1;
  // condition=4 (BK状態時) — 二元，依赖 enemy.bk（参数化、原 hensei.html 闭包 enemy）
  if (condition === 4) return enemyBk ? 1 : 0;
  let h = +hpPct;
  if (isNaN(h)) h = 100;
  h = Math.max(0, Math.min(100, h));
  if (condition === 1) return h / 100;
  if (condition === 2) return (100 - h) / 100;
  if (condition === 3) return h < 50 ? 1 : 0;
  return 1;
};

// ===== Default training (mkTr) — hensei module 用 =====

export const mkTr = () => ({
  state: '通常',
  jukudo: 1,
  awakening: 0,
  marriage: 0,
  moeshin: false,
  lp: 0,
  level: 1,
  hpPercent: 100,
  affinity: 0,
  omoide_picks: {},
  soul_lv: 1,
  soul_awakening: 0,
  main_weapon: true,
  bd_on: false,
});

// ===== computeStats =====

export const computeStats = (chara, tr, slotIdx, ctx) => {
  if (!chara || !tr) return null;
  // ctx 接口缩到 14 字段（数据集 + 队伍/敌方 + UI 常量）。helper / 常量 都已经在
  // module scope 通过 export const 定义、不再 ctx 注入（避免 mirror drift）。
  const {
    allCharas,
    allCrystals,
    allSouls,
    allMasou,
    allBGs,
    allGuildTitles,
    allGuildEmblems,
    SENZAI_TABLE,
    team,
    teamSize,
    enemy,
    SLOT_COLORS,
    COLOR_LABELS,
    IS_LOCAL_DEV,
  } = ctx;

  const stats = {};
  for (const attr of _STAT_KEYS) {
    const b = _baseStat(chara, tr, attr);
    stats[attr] = b != null ? b : 0;
  }
  // Init hits from chara state's basic_info
  const baseHitsRaw = chara.states?.[tr.state]?.basic_info?.['Hit数'];
  const hits = Array.isArray(baseHitsRaw) ? baseHitsRaw.slice(0, 3).map((h) => +h || 0) : [0, 0, 0];
  while (hits.length < 3) hits.push(0);
  let damageLimit = 2147483647;
  // bunrui=18（BDゲージの最大値）は 4 種 calc_type を独立に累加し、最後に合成式で max を計算：
  //   raw      = ((10 + Σadd) * (1 + Σmul) + ΣfinalAdd) * (1 + ΣfinalMul)
  //   bdCapMax = floor(raw) - 1
  // mul/finalMul は (v-1) を累加（「N倍」加性叠加で 1.5×+1.2× → 1.7× の意味）。
  // base = 10、表示時 -1（BD ゲージ上限は 0-indexed level、buff 無し floor(10)-1 = 9）。
  const acc = {
    stats,
    damageLimit,
    hits,
    bdCapAdd: 0, // ct=1（普通加算）の累加
    bdCapMul: 0, // ct=0（普通乗算）の累加：bairitu-1 を加える
    bdCapFinalAdd: 0, // ct=2（最終加算）
    bdCapFinalMul: 0, // ct=3（最終乗算）：bairitu-1 を加える
  };
  const tgt = chara;

  // ===== Trace 容器（IS_LOCAL_DEV のみ生成、それ以外は no-op）=====
  // 始終生成 / 同 pass push で必ず最終値と一致。
  let _curStage = null;
  const trace = IS_LOCAL_DEV
    ? {
        base: _STAT_KEYS.reduce((m, k) => ((m[k] = stats[k]), m), {}),
        damageLimitBase: damageLimit,
        hitsBase: hits.slice(),
        stages: [],
      }
    : null;
  const _enterStage = IS_LOCAL_DEV
    ? (key, label) => {
        _curStage = { key, label, steps: [] };
        trace.stages.push(_curStage);
      }
    : () => {};
  const _pushStep = IS_LOCAL_DEV
    ? (step) => {
        if (_curStage) _curStage.steps.push(step);
      }
    : () => {};

  // Apply one effect to acc, scaled by source HP via _conditionFactor.
  // sourceMult: 来源倍率（魂等级用），默认 1 不影响。
  // mode: 'add' (ct=1, normal additive) / 'mul' (ct=0, normal multiplicative)
  //       'final-add' (ct=2, 最終加算) / 'final-mul' (ct=3, 最終乗算)
  // 加算系（add / final-add）と乗算系（mul / final-mul）は値の適用ロジック共通、ct 過濾だけ違う。
  function _applyEf(e, srcJk, srcHp, mode, sourceMult = 1, srcLabel = '') {
    const factor = _conditionFactor(e.condition, srcHp, enemy.bk);
    const bunrui = e.bunrui || [];
    const isAddMode = mode === 'add' || mode === 'final-add';
    const isMulMode = mode === 'mul' || mode === 'final-mul';
    const _label = srcLabel || e._srcLabel || '';

    // ===== Hit 处理（bunrui 含 7）— 每步取整 =====
    // hit_type: 1/0=add (default), 2=mul, 3=set
    // hit は mode='add'/'mul' のみ処理。final-add/final-mul は hit を再走しない（hit_type=2 で乗算は十分）。
    if (bunrui.includes(7) && (mode === 'add' || mode === 'mul')) {
      const ht = e.hit_type != null ? e.hit_type : 1;
      const isHitAdd = ht === 1 || ht === 0 || ht === 3;
      const isHitMul = ht === 2;
      const hps = e.hit_per_stage || [];
      const hpss = e.hit_per_stage_scaling || [];
      if ((mode === 'add' && isHitAdd) || (mode === 'mul' && isHitMul)) {
        for (let s = 0; s < 3; s++) {
          // 新公式：base + (jukudo - 1) * scaling。分数字符列対応のため _parseHit 経由。
          const baseV = _parseHit(hps[s]) + (srcJk - 1) * _parseHit(hpss[s]);
          if (baseV === 0) continue;
          let v = baseV * sourceMult;
          const hitBefore = acc.hits[s];
          if (mode === 'add') {
            v = v * factor;
            if (ht === 3)
              acc.hits[s] = Math.floor(v); // set
            else acc.hits[s] = acc.hits[s] + Math.floor(v); // add (ht 0/1)
          } else {
            // mul: (v-1)*factor + 1，再乘到当前 hit 后取整
            v = (v - 1) * factor + 1;
            acc.hits[s] = Math.floor(acc.hits[s] * v);
          }
          _pushStep({
            src: _label,
            stat: 'Hit' + (s + 1),
            op: mode,
            val: v,
            hpFactor: factor,
            sourceMult,
            scope: e.scope,
            calc_type: e.calc_type,
            condition: e.condition,
            before: hitBefore,
            after: acc.hits[s],
          });
        }
      }
    }

    // ===== Stat / Damage Limit 处理（bunrui 含 1/2/10/12/17 等）=====
    const ct = e.calc_type ?? 1;
    if (mode === 'add' && ct !== 1) return;
    if (mode === 'mul' && ct !== 0) return;
    if (mode === 'final-add' && ct !== 2) return;
    if (mode === 'final-mul' && ct !== 3) return;
    // sourceMult（魂 lv 加成等）の適用 — ゲーム仕様：魂 lv は bairitu に直接乗算される。
    //   加算：v = bairitu * sourceMult * factor             （加える量を K 倍）
    //   乗算：v = (bairitu * sourceMult - 1) * factor + 1   （bairitu に直接乗算 →
    //                                                         condition で净增量を割引）
    // 例：bairitu=1.5（+50%UP）+ 4★ lv40 (sourceMult=1.4) + 浑身 50%血 (factor=0.5)
    //   = (1.5*1.4 - 1)*0.5 + 1 = 1.55× （+55%）
    // bairitu=1 占位 entry も soulMult を受ける — ゲーム仕様で「占位 = ×1 base に魂 lv 倍率」が乗る。
    const v0 = _scaledBairitu(e.bairitu, e.bairitu_scaling, srcJk, !!e._jkm1);
    let v;
    if (isAddMode) v = v0 * sourceMult * factor;
    else v = (v0 * sourceMult - 1) * factor + 1;
    for (const b of bunrui) {
      if (b === 7) continue; // 已在上面处理
      if (b === 17) {
        const before = acc.damageLimit;
        if (isAddMode) acc.damageLimit += v;
        else acc.damageLimit *= v;
        _pushStep({
          src: _label,
          stat: 'ダメ上限',
          op: mode,
          val: v,
          bairituRaw: e.bairitu,
          hpFactor: factor,
          sourceMult,
          scope: e.scope,
          calc_type: e.calc_type,
          condition: e.condition,
          before,
          after: acc.damageLimit,
        });
      } else if (b === 18) {
        // BDゲージ最大値：4 種 mode を独立に累加。mul/finalMul は (v-1) を加える
        // （v 自体は乗数なので、加性叠加には 1 を引いた残差を取る）。
        let beforeBD, afterBD, bdKey;
        if (mode === 'add') {
          beforeBD = acc.bdCapAdd;
          acc.bdCapAdd += v;
          afterBD = acc.bdCapAdd;
          bdKey = 'BDCap-add';
        } else if (mode === 'mul') {
          beforeBD = acc.bdCapMul;
          acc.bdCapMul += v - 1;
          afterBD = acc.bdCapMul;
          bdKey = 'BDCap-mul';
        } else if (mode === 'final-add') {
          beforeBD = acc.bdCapFinalAdd;
          acc.bdCapFinalAdd += v;
          afterBD = acc.bdCapFinalAdd;
          bdKey = 'BDCap-final-add';
        } else if (mode === 'final-mul') {
          beforeBD = acc.bdCapFinalMul;
          acc.bdCapFinalMul += v - 1;
          afterBD = acc.bdCapFinalMul;
          bdKey = 'BDCap-final-mul';
        }
        _pushStep({
          src: _label,
          stat: bdKey,
          op: mode,
          val: v,
          bairituRaw: e.bairitu,
          hpFactor: factor,
          sourceMult,
          scope: e.scope,
          calc_type: e.calc_type,
          condition: e.condition,
          before: beforeBD,
          after: afterBD,
        });
      } else {
        const stat = _BUNRUI_TO_STAT[b];
        if (!stat || acc.stats[stat] == null) continue;
        const before = acc.stats[stat];
        if (isAddMode) acc.stats[stat] += v;
        else acc.stats[stat] *= v;
        _pushStep({
          src: _label,
          stat,
          op: mode,
          val: v,
          bairituRaw: e.bairitu,
          hpFactor: factor,
          sourceMult,
          scope: e.scope,
          calc_type: e.calc_type,
          condition: e.condition,
          before,
          after: acc.stats[stat],
        });
      }
    }
  }

  // 全 _applyList 完了後の Final pass 用キュー。BD はここに push しない（skipFinal=true）。
  const finalDeferred = [];

  // Apply a list of effects with srcChara/srcHp/srcJk context: filter by buff scope,
  // then run additive pass, then multiplicative pass.
  // Condition (逆窮鼠/窮鼠/破損) scales bairitu inside _applyEf, no longer a gate.
  // sourceMult: 来源倍率（如魂的 lv 倍率），同时作用于 stat / hit。
  // useElementBuff: 仅魔剣技能 → element 走 tgt.element_buff[]；其他来源传 false。
  // skipFinal: BD effects は final pass に参加しない（BD 自体が「最後」なので）。
  function _applyList(
    effects,
    srcChara,
    srcHp,
    srcJk,
    sourceMult = 1,
    useElementBuff = false,
    skipFinal = false,
    srcLabel = '',
  ) {
    if (!effects || !effects.length) return;
    const filtered = effects.filter((e) => _buffApplies(srcChara, tgt, e, useElementBuff));
    if (!filtered.length) return;
    for (const e of filtered) _applyEf(e, srcJk, srcHp, 'add', sourceMult, srcLabel);
    for (const e of filtered) _applyEf(e, srcJk, srcHp, 'mul', sourceMult, srcLabel);
    if (!skipFinal) finalDeferred.push({ effects: filtered, srcJk, srcHp, sourceMult, srcLabel });
  }

  // ===== Stage 1: Self omoide (gated by affinity) =====
  const selfJk = Math.max(1, tr.jukudo || 1);
  const selfHp = tr.hpPercent ?? 100;
  // trace 用：threshold + koka を捕えるためインライン展開。_omoidePicksFor は外部 API として残す。
  const _picksWithLabel = [];
  {
    const aff = +tr.affinity || 0;
    const omPicks = tr.omoide_picks || {};
    (chara.omoide || []).forEach((row) => {
      if ((+row.threshold || 0) > aff) return;
      const pickedIcon = omPicks[row.threshold];
      if (pickedIcon == null) return;
      const info = SENZAI_TABLE[pickedIcon] || SENZAI_TABLE[String(pickedIcon)];
      if (info)
        _picksWithLabel.push({
          info,
          label: '思い出 thresh ' + row.threshold + ' ' + (info.koka || ''),
        });
    });
  }
  _enterStage('omoide', 'Stage 1 思い出');
  for (const p of _picksWithLabel) _applyEf(p.info, selfJk, selfHp, 'add', 1, p.label);
  for (const p of _picksWithLabel) _applyEf(p.info, selfJk, selfHp, 'mul', 1, p.label);

  // ===== Stage 2: External buffs in fixed slot order =====
  // slot s: crystals → chara skills, then souls (1..3), then bgs (1..3)
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si];
    if (!slot) continue;
    const srcChara = allCharas.find((x) => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);

    // Crystals — 乗性 delta 三次元衰减（weight / purity / lv）、step 仅 slider 颗粒度、不入公式。
    // 公式见 _crystalEffectiveBairitu / _crystalDimFactor (renderEffList 上方)。
    _enterStage('stage2-cr-s' + si, 'Stage 2 Slot' + (si + 1) + ' 記憶結晶');
    const crEffs = [];
    (slot.crystals || []).forEach((cfg) => {
      if (!cfg) return;
      const cr = allCrystals.find((x) => x.id === cfg.id);
      if (!cr) return;
      const crLabel = 'Slot' + (si + 1) + ' 結晶 ' + (cr.name || '');
      for (const e of cr.effects || []) {
        const eff = _crystalEffectiveBairitu(cr, cfg, e);
        const rawB = _parseScaling(e.bairitu);
        if (eff != null && Number.isFinite(rawB) && eff !== rawB) {
          crEffs.push({ ...e, bairitu: eff, _srcLabel: crLabel });
        } else {
          crEffs.push({ ...e, _srcLabel: crLabel });
        }
      }
    });
    _applyList(crEffs, srcChara, srcHp, srcJk);

    // Chara skills (current state, with revise) — element 匹配走 tgt.element_buff[]
    if (srcChara) {
      _enterStage(
        'stage2-ch-s' + si,
        'Stage 2 Slot' + (si + 1) + ' ' + (srcChara.name || '') + ' (魔剣 skill)',
      );
      const skills = _resolveCharaSkills(srcChara, slot.tr?.state);
      const charaEffs = [];
      // skill name に Lv2/Lv3/Lv4/Lv5 → bairitu_scaling 公式 (jk-1)*s。それ以外 jk*s。
      // _jkm1 を effect の浅 copy に注入（src データを汚染しない）。
      skills.forEach((sk) => {
        const jkm1 = _LV2_5_RE.test(sk.name || '');
        const skLabel = (srcChara.name || '') + ' ' + (sk.name || '');
        (sk.effects || []).forEach((e) => {
          const ec = { ...e, _srcLabel: skLabel };
          if (jkm1) ec._jkm1 = true;
          charaEffs.push(ec);
        });
      });
      _applyList(charaEffs, srcChara, srcHp, srcJk, 1, true);
    }

    // Masou effects（chara-bound; element 匹配走 tgt.element 直接判定，不走 element_buff[]）
    if (slot.masou != null) {
      const masou = allMasou.find((x) => x.id === slot.masou);
      if (masou) {
        _enterStage('stage2-ms-s' + si, 'Stage 2 Slot' + (si + 1) + ' 魔装 ' + (masou.name || ''));
        const msLabel = 'Slot' + (si + 1) + ' 魔装 ' + (masou.name || '');
        const msEffs = (masou.effects || []).map((e) => ({ ...e, _srcLabel: msLabel }));
        _applyList(msEffs, srcChara, srcHp, srcJk, 1, false);
      }
    }
  }
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si];
    if (!slot) continue;
    const srcChara = allCharas.find((x) => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    const soul = allSouls.find((x) => x.id === slot.soul);
    if (!soul) continue;
    _enterStage(
      'stage2-so-s' + si,
      'Stage 2 Slot' + (si + 1) + ' ' + (soul.name || '') + ' (魂 skill)',
    );
    // 魂的倍率：根据 rarity + lv 计算（task 7+8）。乘到所有 effect 的 bairitu / hit_per_stage 上。
    const soulMult = soulMultiplier(soul.rarity || 1, slot.tr?.soul_lv || 1);
    const skills = _resolveSoulSkills(soul);
    const soulEffs = [];
    skills.forEach((sk) => {
      const skLabel = (soul.name || '') + ' ' + (sk.name || '');
      (sk.effects || []).forEach((e) => soulEffs.push({ ...e, _srcLabel: skLabel }));
    });
    _applyList(soulEffs, srcChara, srcHp, srcJk, soulMult);
  }
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si];
    if (!slot) continue;
    const srcChara = allCharas.find((x) => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    const bg = allBGs.find((x) => x.id === slot.bg);
    if (!bg) continue;
    _enterStage(
      'stage2-bg-s' + si,
      'Stage 2 Slot' + (si + 1) + ' ' + (bg.name || '') + ' (心象結晶)',
    );
    const bgLabel = 'Slot' + (si + 1) + ' 心象結晶 ' + (bg.name || '');
    const bgEffs = (bg.effects || []).map((e) => ({ ...e, _srcLabel: bgLabel }));
    _applyList(bgEffs, srcChara, srcHp, srcJk);
  }

  // ===== Stage 2.5: Soul Affinity (独立乘区, self-only) =====
  // 自分の chara の element/weapon ↔ 装備した soul の affinity を引き、
  // atk_effect → 攻撃力 + ブレイク力、def_effect → 防御力 を独立に乗算。
  const mySlot = team[slotIdx];
  if (mySlot && mySlot.soul != null) {
    const mySoul = allSouls.find((x) => x.id === mySlot.soul);
    if (mySoul) {
      const elemName = ELEMS_ORDER[(chara.element || 6) - 1];
      const weapName = WEAPONS_ORDER[(chara.weapon || 1) - 1];
      const eAff = (mySoul.element_affinity || {})[elemName] || {};
      const wAff = (mySoul.weapon_affinity || {})[weapName] || {};
      const atkAff = _parseAff(eAff.atk_effect) * _parseAff(wAff.atk_effect);
      const defAff = _parseAff(eAff.def_effect) * _parseAff(wAff.def_effect);
      _enterStage('affinity', 'Stage 2.5 魂 affinity (自身)');
      const atkSrc =
        '元素 ' +
        elemName +
        ' atk ' +
        (eAff.atk_effect ?? '1') +
        ' × 武器 ' +
        weapName +
        ' atk ' +
        (wAff.atk_effect ?? '1');
      const defSrc =
        '元素 ' +
        elemName +
        ' def ' +
        (eAff.def_effect ?? '1') +
        ' × 武器 ' +
        weapName +
        ' def ' +
        (wAff.def_effect ?? '1');
      {
        const before = acc.stats['攻撃力'];
        acc.stats['攻撃力'] *= atkAff;
        _pushStep({
          src: atkSrc,
          stat: '攻撃力',
          op: 'mul',
          val: atkAff,
          before,
          after: acc.stats['攻撃力'],
        });
      }
      {
        const before = acc.stats['ブレイク力'];
        acc.stats['ブレイク力'] *= atkAff;
        _pushStep({
          src: atkSrc,
          stat: 'ブレイク力',
          op: 'mul',
          val: atkAff,
          before,
          after: acc.stats['ブレイク力'],
        });
      }
      {
        const before = acc.stats['防御力'];
        acc.stats['防御力'] *= defAff;
        _pushStep({
          src: defSrc,
          stat: '防御力',
          op: 'mul',
          val: defAff,
          before,
          after: acc.stats['防御力'],
        });
      }
    }
  }

  // ===== Stage 3: Self-only finishers (結婚 / 燃心 / LP / 主武器) =====
  _enterStage('stage3', 'Stage 3 結婚 / 燃心 / LP / 主武器');
  const mr = [1.0, 1.03, 1.05][tr.marriage] || 1;
  if (mr !== 1) {
    const mrSrc = '結婚 ' + tr.marriage + ' (×' + mr + ')';
    for (const k of _STAT_KEYS) {
      const before = acc.stats[k];
      acc.stats[k] *= mr;
      _pushStep({ src: mrSrc, stat: k, op: 'mul', val: mr, before, after: acc.stats[k] });
    }
  }
  if (tr.moeshin) {
    const before = acc.stats['攻撃力'];
    acc.stats['攻撃力'] *= 1.3;
    _pushStep({
      src: '燃心 ×1.3',
      stat: '攻撃力',
      op: 'mul',
      val: 1.3,
      before,
      after: acc.stats['攻撃力'],
    });
  }
  const lpMult = [1.0, 1.1, 1.5][tr.lp] || 1;
  if (lpMult !== 1) {
    const before = acc.stats['攻撃力'];
    acc.stats['攻撃力'] *= lpMult;
    _pushStep({
      src: 'LP ' + tr.lp + ' (×' + lpMult + ')',
      stat: '攻撃力',
      op: 'mul',
      val: lpMult,
      before,
      after: acc.stats['攻撃力'],
    });
  }
  // 主武器装備（あり=1.0 / なし=1/21）作用于 攻撃力 + ブレイク力
  const mwMult = tr.main_weapon === false ? 1 / 21 : 1.0;
  if (mwMult !== 1) {
    const mwSrc = '主武器なし (×1/21)';
    {
      const before = acc.stats['攻撃力'];
      acc.stats['攻撃力'] *= mwMult;
      _pushStep({
        src: mwSrc,
        stat: '攻撃力',
        op: 'mul',
        val: mwMult,
        before,
        after: acc.stats['攻撃力'],
      });
    }
    {
      const before = acc.stats['ブレイク力'];
      acc.stats['ブレイク力'] *= mwMult;
      _pushStep({
        src: mwSrc,
        stat: 'ブレイク力',
        op: 'mul',
        val: mwMult,
        before,
        after: acc.stats['ブレイク力'],
      });
    }
  }

  // ===== Stage 4: 敵 / 副本 / 公会 multipliers =====
  //   元素克制 / BK / 有利武器 / 難易度 / 公会役職 + 4 紋章 / 副本 BD 上限
  _enterStage('stage4-env', 'Stage 4 敵 / 副本');
  const isGuildMode = enemy.mode === 'guildbattle' || enemy.mode === 'guildbattle_special';
  // 4a. 元素克制 → 攻撃力 + ブレイク力
  const elemMult = elementMatchupMult(chara.element, enemy.element, enemy.mode);
  if (elemMult !== 1) {
    const emSrc =
      '元素克制 ' +
      (ELEMENT[chara.element] || '?') +
      '→' +
      (ELEMENT[enemy.element] || '?') +
      ' (×' +
      elemMult +
      ')';
    {
      const before = acc.stats['攻撃力'];
      acc.stats['攻撃力'] *= elemMult;
      _pushStep({
        src: emSrc,
        stat: '攻撃力',
        op: 'mul',
        val: elemMult,
        before,
        after: acc.stats['攻撃力'],
      });
    }
    {
      const before = acc.stats['ブレイク力'];
      acc.stats['ブレイク力'] *= elemMult;
      _pushStep({
        src: emSrc,
        stat: 'ブレイク力',
        op: 'mul',
        val: elemMult,
        before,
        after: acc.stats['ブレイク力'],
      });
    }
  }
  // 4b. BK状態 → 攻撃力（普通 3.0；ギルバト 高耐性 6.0）
  if (enemy.bk) {
    const bkMult = isGuildMode && enemy.bkResistance === 'high' ? 6.0 : 3.0;
    const before = acc.stats['攻撃力'];
    acc.stats['攻撃力'] *= bkMult;
    _pushStep({
      src: 'BK状態 ×' + bkMult,
      stat: '攻撃力',
      op: 'mul',
      val: bkMult,
      before,
      after: acc.stats['攻撃力'],
    });
  }
  // 4c. ギルバト/特別版 限定（有利武器 + 難易度）→ 攻撃力
  if (isGuildMode) {
    if (
      chara.weapon != null &&
      enemy.advantageWeapons &&
      enemy.advantageWeapons.has(chara.weapon)
    ) {
      const before = acc.stats['攻撃力'];
      acc.stats['攻撃力'] *= 2.0;
      _pushStep({
        src: '有利武器 ' + (WEAPON[chara.weapon] || '?') + ' ×2.0',
        stat: '攻撃力',
        op: 'mul',
        val: 2.0,
        before,
        after: acc.stats['攻撃力'],
      });
    }
    const diffMult = { Normal: 1.0, Hard: 0.1, Lunatic: 0.005 }[enemy.difficulty] ?? 1.0;
    if (diffMult !== 1) {
      const before = acc.stats['攻撃力'];
      acc.stats['攻撃力'] *= diffMult;
      _pushStep({
        src: '難易度 ' + enemy.difficulty + ' ×' + diffMult,
        stat: '攻撃力',
        op: 'mul',
        val: diffMult,
        before,
        after: acc.stats['攻撃力'],
      });
    }
  }
  // 4d. 公会役職 + 4 紋章（外部 buff，按 effects schema 应用）
  _enterStage('stage4-guild', 'Stage 4 公会役職 + 紋章');
  const guildEffects = [];
  if (isGuildMode && enemy.guildTitle != null) {
    const gt = allGuildTitles.find((g) => g.id === enemy.guildTitle);
    if (gt) {
      const gtLabel = '役職 ' + (gt.name || '');
      (gt.effects || []).forEach((e) => guildEffects.push({ ...e, _srcLabel: gtLabel }));
    }
  }
  (enemy.emblems || []).forEach((slot, s) => {
    if (slot.id == null) return;
    const em = allGuildEmblems.find((g) => g.id === slot.id);
    if (!em) return;
    if (em.guild_only && !isGuildMode) return;
    // bairitu 在配置里填的是"满级倍率"。按 level 线性插值到 1.0：
    //   bairitu(lv) = (bairitu_max - 1) * (lv - 1) / (lvMax - 1) + 1
    const lvMax = emblemLvMax(em.rarity);
    const lv = Math.max(1, Math.min(lvMax, +slot.level || 1));
    const emLabel =
      '紋章 ' + (COLOR_LABELS[SLOT_COLORS[s]] || '') + ' ' + (em.name || '') + ' lv' + lv;
    for (const e of em.effects || []) {
      const ec = Object.assign({}, e, { _srcLabel: emLabel });
      // bairitu は数値・分式文字列 ("1/2") 双方受け入れ。
      const baseB = _parseScaling(e.bairitu);
      if (lvMax > 1 && Number.isFinite(baseB) && baseB !== 0) {
        ec.bairitu = ((baseB - 1) * (lv - 1)) / (lvMax - 1) + 1;
      }
      guildEffects.push(ec);
    }
  });
  if (guildEffects.length) {
    // src=null：scope=0/3 不会应用（要 src.id===tgt.id），其他全部按 _buffApplies 走
    _applyList(guildEffects, null, 100, 1, 1);
  }
  // 4e. BDゲージ上限：enemy.bd_cap = 当前選択値（[0, _computeBdCapMax()] 範囲）。
  //     倍率 = 1 + (bd_cap // 2) * 0.25 → 攻撃力 (bunrui=1)。
  //     bunrui=18 effects は 4 種 ct を独立累加し、合成式
  //     ((10 + Σadd)*(1 + Σmul) + ΣfinalAdd)*(1 + ΣfinalMul) を floor して -1 で slot ごとに max を出し、
  //     slot 間の最大値を取って floor → slider/input の max 属性に流す。倍率公式自体には加算しない。
  const bdCap = +enemy.bd_cap || 0;
  const bdCapMult = 1 + Math.floor(bdCap / 2) * 0.25;
  if (bdCapMult !== 1) {
    _enterStage('stage4-bdcap', 'Stage 4 BDゲージ上限');
    const before = acc.stats['攻撃力'];
    acc.stats['攻撃力'] *= bdCapMult;
    _pushStep({
      src: 'BDゲージ上限 ' + bdCap + ' (×' + bdCapMult + ')',
      stat: '攻撃力',
      op: 'mul',
      val: bdCapMult,
      before,
      after: acc.stats['攻撃力'],
    });
  }

  // ===== Stage 5: Final pass — 全 normal stage 完了後に ct=2 (最終加算) → ct=3 (最終乗算) =====
  // BD は finalDeferred に入っていない（_applyList を skipFinal=true で呼ぶ）ので影響しない。
  _enterStage('final-add', 'Stage 5 Final pass (最終加算)');
  for (const it of finalDeferred) {
    for (const e of it.effects)
      _applyEf(e, it.srcJk, it.srcHp, 'final-add', it.sourceMult, it.srcLabel);
  }
  _enterStage('final-mul', 'Stage 5 Final pass (最終乗算)');
  for (const it of finalDeferred) {
    for (const e of it.effects)
      _applyEf(e, it.srcJk, it.srcHp, 'final-mul', it.sourceMult, it.srcLabel);
  }

  // ===== Stage 6: BD effects（仅 tr.bd_on === true 的 slot 触发；BD は全 final 之後に走る）=====
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si];
    if (!slot) continue;
    if (!slot.tr?.bd_on) continue;
    const srcChara = allCharas.find((x) => x.id === slot.chara) || null;
    if (!srcChara) continue;
    const bdEffs = (srcChara.bd_skill && srcChara.bd_skill.effects) || [];
    if (!bdEffs.length) continue;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    _enterStage(
      'stage6-bd-s' + si,
      'Stage 6 Slot' + (si + 1) + ' ' + (srcChara.name || '') + ' B.D.',
    );
    const bdLabel = 'Slot' + (si + 1) + ' ' + (srcChara.name || '') + ' B.D.';
    const bdEffsLabeled = bdEffs.map((e) => ({ ...e, _srcLabel: bdLabel }));
    _applyList(bdEffsLabeled, srcChara, srcHp, srcJk, 1, true, /* skipFinal */ true);
  }

  // BDゲージ最大値の合成：((10 + 普通加算) * (1 + 普通乗算) + 最終加算) * (1 + 最終乗算) → floor して -1
  const bdCapRaw =
    ((10 + acc.bdCapAdd) * (1 + acc.bdCapMul) + acc.bdCapFinalAdd) * (1 + acc.bdCapFinalMul);
  const bdCapMax = Math.floor(bdCapRaw) - 1;
  const result = { stats: acc.stats, damageLimit: acc.damageLimit, hits: acc.hits, bdCapMax };
  if (trace) result.trace = trace;
  return result;
};
