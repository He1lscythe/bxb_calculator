// shared/stats-calc-v2.js — Hensei 4-stage 计算 (Phase 6.1)
//
// 按 docs/hensei_calc.md 设计:
//   base = lv × 熟度 × 觉醒  (内嵌)
//   Stage 1: omoide Add
//   Stage 2: masou Add → masou Mul → floor
//   Stage 3: other Mul  (chara_skill / crystal / bg / soul / chara_meta)
//   Stage 4: other Add  → ceil
//   Repel_Percent: 独立 status 回避率通道
//
// Effect 来源 (_source):
//   omoide      — chara.omoide[] memory slot (master 没数据、暂时空、未来 Phase 8 抓包)
//   masou       — masou.effects (装到 chara 的装备 skill)
//   chara_skill — chara state.weapon_skills (chara 自身被动 skill)
//   crystal     — 装备的 crystal effect (×6 slot)
//   bg          — 装备的 bladegraph skill
//   soul        — 装备的 soul.skills (job_skills)
//   chara_meta  — 結婚 / 燃心 / LP / MP 装備 (UI metadata 倍率)
//   soul_affinity — soul 元素/武器 相性倍率 (固定乘算)
//
// 所有 source 用 master 原 schema (parameter / math_type / value / value_scaling / range / element_id / weapon_type_id / weapon_base_id 等)
// adapter 内嵌的 _master 字段访问

import {
  soulMultiplier,
  elementMatchupMult,
  DIFFICULTY_MULT,
  BK_RES_MULT,
  ADVANTAGE_WEAPON_MULT,
  bdCapMult,
  emblemEffectiveBairitu,
  bunruiToParam,
  calcTypeToMath,
  computeBlazeGaugePoints,
  bdCapFromBlazeGauge,
  crystalEffectiveValue,
  omoideEffectiveScaling,
} from './hensei-helpers.js';

// ============================================================
// 等级 / 熟度 / 觉醒 (跟 master 字段直读)
// ============================================================
// 觉醒 (master 没 awakening 字段、跟 chara.rarity 挂钩):
//   rarity 4 (SS) → 9 次觉醒、满 ×1.43
//   rarity 3 (S)  → 14 次、       ×2.42
//   rarity 2 (AA) → 36 次、       ×4.45
//   rarity 1 (A)  → 24 次、       ×5.37
export const AWAKENING_MAX = { 4: 9, 3: 14, 2: 36, 1: 24 };
export const AWAKENING_FULL_MULT = { 4: 1.43, 3: 2.42, 2: 4.45, 1: 5.37 };

// 默认 tr (hensei UI 初始化用) — 字段名对齐 hensei.html
export function mkTr() {
  return {
    state: '通常',         // chara state
    level: 1,              // chara level
    jukudo: 1,             // 熟度 (1..max_mature)
    awakening: 0,          // 觉醒数 (0..AWAKENING_MAX[rarity])
    marriage: 0,           // 0=无 / 1=花無 / 2=花有
    moeshin: false,        // 燃心
    lp: 0,                 // LP 档 (0=満 / 1=低 / 2=危機)
    have_mp: true,
    bd_on: false,          // BD 状态 (IsBlaze gate、Phase 8 实测)
    hp: 100,               // HP%
    affinity: 0,
    omoide_picks: [],
    soul_lv: 1,
    soul_awakening: 0,
  };
}

// 熟度 → 等级上限 (master 字段直读: initial_max_level + (mature-1) × 5、cap max_max_level)
export function maxLevelAtMature(stateData, mature) {
  const im = stateData?.stats?.initial_max_level;
  const mm = stateData?.stats?.max_max_level;
  if (im == null || mm == null) return 0;
  return Math.min(mm, im + (Math.max(1, mature) - 1) * 5);
}

// chara state base stat at given lv/mature/awakening
// 公式 (用户决策、修正 wiki v1 公式 bug — 旧公式 lv=1 给 max-initial 不直观):
//   base 段 (lv ≤ cap): initial + (max - initial) * (lv - 1) / (max_max_level - 1)
//     lv=1 → initial、lv=max_max_level → max、线性插值
//   觉醒段 (lv > cap): 上式 × (1 + (lv-cap)/(awk_max*5) * (mult-1))
function _baseStatRaw(initial, max, max_max_level, lv, cap, rarity) {
  if (!max || !initial || !max_max_level) return 0;
  if (lv < 1) return 0;
  const lvBase = Math.min(lv, cap);
  const t = max_max_level > 1 ? (lvBase - 1) / (max_max_level - 1) : 0;
  const base = initial + (max - initial) * t;
  if (lv <= cap) return base;
  const awkMax = AWAKENING_MAX[rarity] || 9;
  const fullMult = AWAKENING_FULL_MULT[rarity] || 1.43;
  const lvOver = lv - cap;
  return base * (1 + lvOver / (awkMax * 5) * (fullMult - 1));
}

// chara → base stat object (HP / Attack / Defense / Break)
// tr.level (lv) / tr.jukudo (熟度) / tr.awakening (觉醒数)
export function baseStats(charaWiki, tr) {
  const m = charaWiki?._master;
  if (!m) return null;
  const stateData = m.states?.[tr.state] || Object.values(m.states || {})[0];
  if (!stateData) return null;
  const stats = stateData.stats || {};
  const cap = maxLevelAtMature(stateData, tr.jukudo || 1);
  const awkMax = AWAKENING_MAX[m.rarity] || 9;
  const effLv = Math.min(tr.level || 1, cap + (tr.awakening || 0) * 5);
  const max_max_level = stats.max_max_level;
  // base stat 已经在 server-fold (chara 创建时) 完成 floor 取整 (unpacking 01_setup.md §1.5)
  // hensei v2 客户端用 master initial_/max_ 字段重算 base、需 floor 模拟 server 行为
  return {
    HP: Math.floor(_baseStatRaw(stats.initial_hp, stats.max_hp, max_max_level, effLv, cap, m.rarity)),
    Attack: Math.floor(_baseStatRaw(stats.initial_attack, stats.max_attack, max_max_level, effLv, cap, m.rarity)),
    Defense: Math.floor(_baseStatRaw(stats.initial_defense, stats.max_defense, max_max_level, effLv, cap, m.rarity)),
    GuardBreak: Math.floor(_baseStatRaw(stats.initial_break, stats.max_break, max_max_level, effLv, cap, m.rarity)),
    Speed: Math.floor(_baseStatRaw(stats.initial_speed, stats.max_speed, max_max_level, effLv, cap, m.rarity)),
    _lv: effLv,
    _cap: cap,
    _max_lv_with_awk: cap + (tr.awakening || 0) * 5,
  };
}

// ============================================================
// HP-curve / Break gate / FellDown / Enemy_Break factor
// 按 docs/hensei_calc.md 沿用 wiki 线性公式 (Phase 8 Frida 实测精化)
// ============================================================
// parameter 有 HP-curve prefix 时、按 source HP / target HP / Break / FellDown / EnemyBreak 算 factor
//   Vitality_*  → factor = hp_pct / 100
//   RemHP_*     → factor = (100 - hp_pct) / 100
//   Break_*     → factor = 1 if hp_pct <= 50 else 0  (unpacking §2.3: IsBreak = HpRate ≤ 0.5 含等号)
//   FellDown_*  → factor = 1 if 任一队友 hp=0 else 0
//   Enemy_Break*→ factor = 1 if enemy.bk else 0
// 无 prefix → factor = 1
export function conditionFactor(parameter, srcHpPct, anyTeammateZero, enemyBk) {
  if (!parameter) return 1;
  if (parameter.startsWith('Vitality_')) return Math.max(0, Math.min(1, srcHpPct / 100));
  if (parameter.startsWith('RemHP_')) return Math.max(0, Math.min(1, (100 - srcHpPct) / 100));
  if (parameter.startsWith('Break_')) return srcHpPct <= 50 ? 1 : 0;
  if (parameter.startsWith('FellDown_')) return anyTeammateZero ? 1 : 0;
  if (parameter.startsWith('Enemy_Break')) return enemyBk ? 1 : 0;
  return 1;
}

// strip HP-curve prefix + Enemy_Break prefix 得 base parameter
// Enemy_BreakAttack → Attack (本质是 Attack 倍率、走 stage 5 独立 enemy_break source)
// Enemy_BreakDefense / Enemy_BreakSpeed 等同理
const _HP_CURVE_PFX = ['Vitality_', 'RemHP_', 'Break_', 'FellDown_'];
export function baseParameter(p) {
  if (!p) return p;
  for (const pfx of _HP_CURVE_PFX) if (p.startsWith(pfx)) return p.slice(pfx.length);
  if (p.startsWith('Enemy_Break')) return p.slice('Enemy_Break'.length); // → 'Attack' / 'Defense' / 'Speed'
  return p;
}

// ============================================================
// Effect 命中检查 (target slot 是否吃此 effect)
// ============================================================
// effect 的 range / target_element_id / weapon_type_id / weapon_base_id 决定哪个 slot 吃。
function _effectApplies(eff, targetChara, srcSlot, targetSlot) {
  // range: 'All' = 装备者 + 队友 (全队)、'Single' = 仅装备者自身
  if (eff.range === 'Single' && srcSlot !== targetSlot) return false;
  // element 限定
  if (eff.element_condition || eff.target_element_id) {
    const need = eff.element_condition || eff.target_element_id;
    if (need && targetChara?._master?.element_id !== need) return false;
  }
  // weapon 限定
  if (eff.weapon_type_condition || eff.weapon_type_id) {
    const need = eff.weapon_type_condition || eff.weapon_type_id;
    if (need && targetChara?._master?.weapon_type_id !== need) return false;
  }
  // chara 限定 (weapon_base_id matches target base_id)
  if (eff.weapon_base_id) {
    if (targetChara?._master?.id !== eff.weapon_base_id) return false;
  }
  return true;
}

// hensei team slot 反查工具: team[i].chara/soul/bg/masou 都是 id (number)、crystals 是 config[]
// 反查 ctx.all{Charas,Souls,BGs,Masou,Crystals} 拿到 wiki shape 对象 (含 _master)
function _resolveSlot(slot, ctx) {
  if (!slot) return null;
  const allC = ctx?.allCharas || [];
  const allS = ctx?.allSouls || [];
  const allB = ctx?.allBGs || [];
  const allM = ctx?.allMasou || [];
  const allCr = ctx?.allCrystals || [];
  return {
    tr: slot.tr,
    chara: slot.chara != null ? allC.find((c) => c.id === slot.chara) : null,
    soul: slot.soul != null ? allS.find((s) => s.id === slot.soul) : null,
    bg: slot.bg != null ? allB.find((b) => b.id === slot.bg) : null,
    masou: slot.masou != null ? allM.find((m) => m.id === slot.masou) : null,
    crystals: (slot.crystals || [])
      .map((cc) => {
        if (!cc || cc.id == null) return null;
        const cr = allCr.find((x) => x.id === cc.id);
        if (!cr) return null;
        return { ...cr, _config: cc };
      })
      .filter(Boolean),
  };
}

// ============================================================
// 收集 effects (3 slot 所有 source、target = targetSlot)
// ============================================================
export function collectEffects(team, targetSlotIdx, ctx) {
  const collected = [];
  // 反查所有 slot 拿真实对象
  const resolvedTeam = team.map((s) => _resolveSlot(s, ctx) || { tr: null, chara: null, soul: null, bg: null, masou: null, crystals: [] });
  const target = resolvedTeam[targetSlotIdx];
  if (!target || !target.chara) return collected;
  const targetChara = target.chara;
  const tr = target.tr;
  const anyTeammateZero = resolvedTeam.some((s, i) => i !== targetSlotIdx && s?.tr?.hp === 0);
  const enemyBk = ctx?.enemy?.bk || false;

  function pushEff(srcChara, srcSlot, source, raw, opts = {}) {
    // raw is master-shape effect: {parameter, math_type, value, value_scaling, range, element_condition, weapon_type_condition, weapon_base_id, weapon_type_id, target_element_id, ...}
    if (!raw || raw.parameter === 'NoEffect') return;
    if (!_effectApplies(raw, targetChara, srcSlot, targetSlotIdx)) return;
    const param = raw.parameter;
    // Enemy_Break_* parameter 强制 _source='enemy_break'、不论原 source、走 stage 5 独立 (unpacking §3.7 step 47/48)
    if (param && param.startsWith('Enemy_Break')) source = 'enemy_break';
    const srcHp = team[srcSlot]?.tr?.hp ?? 100;
    const factor = conditionFactor(param, srcHp, anyTeammateZero, enemyBk);
    if (factor === 0) return;
    // chara skill: value_scaling × jukudo 熟度成长
    // omoide source 走 omoideEffectiveScaling fallback (Frida 抓的 value_scaling 全空、用户实测 0.003)
    const srcJk = team[srcSlot]?.tr?.jukudo || 1;
    let value;
    if (opts.valueOverride != null) {
      value = opts.valueOverride;
    } else {
      const scaling = (source === 'omoide' || source === 'omoide_mul')
        ? omoideEffectiveScaling(raw)
        : (raw.value_scaling || 0);
      value = (raw.value || 0) + (scaling * srcJk);
    }
    const entry = {
      _source: source,
      _src_slot: srcSlot,
      parameter: param,
      base_parameter: baseParameter(param),
      math_type: raw.math_type,
      value,
      condition_factor: factor,
    };
    // HitCount / AttackCount: 携带逐段 stages 数组 (master values [v0,v1,v2] 或 broadcast value)
    if (entry.base_parameter === 'HitCount' || entry.base_parameter === 'AttackCount') {
      if (Array.isArray(raw.values) && raw.values.length === 3) {
        entry._stages = raw.values.map((v) => Number(v) || 0);
      } else {
        const v = Number(value) || 0;
        entry._stages = [v, v, v];
      }
    }
    collected.push(entry);
  }

  // 遍历 3 slot (用 resolvedTeam)
  for (let i = 0; i < resolvedTeam.length; i++) {
    const slot = resolvedTeam[i];
    if (!slot?.chara) continue;
    const cMaster = slot.chara._master;
    const trSlot = slot.tr;
    if (!cMaster || !trSlot) continue;

    // 1. chara_skill (state.weapon_skills) — chara 自身被动
    const state = cMaster.states?.[trSlot.state] || Object.values(cMaster.states || {})[0];
    for (const sk of state?.weapon_skills || []) {
      pushEff(slot.chara, i, 'chara_skill', sk);
    }

    // 1b. bd_skill.effects (tr.bd_on=true 时激活、BD 释放后队伍 buff)
    // 不考虑伤害公式 (Phase 8 IsBlaze gate)、只把 effects 当普通 buff 加入
    if (trSlot.bd_on && cMaster.bd_skill?.effects) {
      for (const eff of cMaster.bd_skill.effects) {
        pushEff(slot.chara, i, 'bd_skill', eff);
      }
    }

    // 2. omoide (用户在 hensei picker 内手选、跟 wiki main:js/latent.js 一致)
    //    schema:
    //      chara._omoide_slots  = [{ affection_threshold, weapon_skills: [候选...] }, ...] (40 slot、Frida 抓包)
    //      trSlot.omoide_picks  = { [slotIdx]: skillId }  (用户在 picker 内选的)
    //    每 slot 激活条件: picks[slotIdx] != null && affection_threshold ≤ tr.affinity
    //    用户决策: Add → _source='omoide' (stage 1)、Mul → _source='omoide_mul' (stage 3)
    //    空 picks (用户未在 picker 选过) → 不激活任何 omoide buff
    const omoideSlots = slot.chara?._omoide_slots || [];
    const omoidePicks = trSlot.omoide_picks || {};
    const affection = +trSlot.affinity || 0;
    for (let oi = 0; oi < omoideSlots.length; oi++) {
      const om = omoideSlots[oi];
      const pickedId = omoidePicks[oi];
      if (pickedId == null) continue;
      if ((+om.affection_threshold || 0) > affection) continue;
      const sk = (om.weapon_skills || []).find((x) => x.id === pickedId);
      if (!sk) continue;
      const src = sk.math_type === 'Multiply' ? 'omoide_mul' : 'omoide';
      pushEff(slot.chara, i, src, sk);
    }

    // 3. soul (按 v1: sourceMult × effect.value、不分 Mul/Add)
    //   v1 main:js/stats-calc.js L766: soulMult = soulMultiplier(soul.rarity, tr.soul_lv)
    //   用户决策: mul = effect.value × soulMult、add = effect.value × soulMult (一刀切)
    if (slot.soul?._master?.skills) {
      const sMaster = slot.soul._master;
      const sourceMult = soulMultiplier(sMaster.rarity || 1, trSlot.soul_lv || 1);
      for (const sk of sMaster.skills) {
        const scaled = (sk.value || 0) * sourceMult;
        pushEff(slot.chara, i, 'soul', sk, { valueOverride: scaled });
      }
    }

    // 4. crystals (6 slot、Phase 7 Session 2: 用 crystalEffectiveValue 统一公式 + fallback)
    //   公式跟 shared/hensei-helpers.js crystalEffectiveValue 一致 (单一来源、避免漂移)
    //   cfg 三参 lv / weight / purity 都来自 cr._config (hensei UI 滑条)
    for (const cr of slot.crystals || []) {
      if (!cr?._master) continue;
      const value = crystalEffectiveValue(cr, cr._config);
      pushEff(slot.chara, i, 'crystal', {
        parameter: cr._master.parameter,
        math_type: cr._master.math_type,
        value,
        value_scaling: 0,
        range: cr._master.conditional_parameter ? 'Single' : 'All',
        target_element_id: cr._master.element_id,
        weapon_type_id: cr._master.weapon_type_id,
      }, { valueOverride: value });
    }

    // 5. bg (slot.bg._v2_skills 或 _master.skills)
    const bgSkills = slot.bg?._v2_skills || slot.bg?._master?.skills || [];
    for (const sk of bgSkills) pushEff(slot.chara, i, 'bg', sk);

    // 6. masou (slot.masou 是 single object、不是 array)
    const masouObj = Array.isArray(slot.masou) ? slot.masou : (slot.masou ? [slot.masou] : []);
    for (const ms of masouObj) {
      for (const eff of ms?.effects || []) pushEff(slot.chara, i, 'masou', eff);
    }

    // 7. chara_meta: 結婚 / 燃心 / LP / MP 装備 — 只对 target slot 自身
    if (i === targetSlotIdx) {
      const marriageMult = [1.0, 1.03, 1.05][trSlot.marriage] || 1;
      if (marriageMult !== 1) {
        for (const attr of ['Attack', 'Defense', 'HP', 'GuardBreak']) {
          collected.push({
            _source: 'chara_meta', _src_slot: i,
            parameter: attr, base_parameter: attr,
            math_type: 'Multiply', value: marriageMult, condition_factor: 1,
          });
        }
      }
      if (trSlot.moeshin) {
        collected.push({
          _source: 'chara_meta', _src_slot: i,
          parameter: 'Attack', base_parameter: 'Attack',
          math_type: 'Multiply', value: 1.3, condition_factor: 1,
        });
      }
      // LP tier 不进 effects、由 computeStats / computeStatsBlaze 入口算 lpMult 传给 applyStaged
      // (unpacking §3.5 step 4 × Total 直接层、按 IsBlaze 切表)
      const mwMult = trSlot.have_mp === false ? 1 / 21 : 1;
      if (mwMult !== 1) {
        for (const attr of ['Attack', 'GuardBreak']) {
          collected.push({
            _source: 'chara_meta', _src_slot: i,
            parameter: attr, base_parameter: attr,
            math_type: 'Multiply', value: mwMult, condition_factor: 1,
          });
        }
      }
    }

    // 8. soul_affinity (装备 soul 时、对装备者自身固定乘)
    if (i === targetSlotIdx && slot.soul?._master) {
      const elemId = cMaster.element_id;
      const weapId = cMaster.weapon_type_id;
      const elemAff = slot.soul._master.element_affinity?.[elemId];
      const weapAff = slot.soul._master.weapon_affinity?.[weapId];
      const atkMul = (elemAff?.positive_value ?? 1) * (weapAff?.positive_value ?? 1);
      const defMul = (elemAff?.negative_value ?? 1) * (weapAff?.negative_value ?? 1);
      if (atkMul !== 1) {
        for (const attr of ['Attack', 'GuardBreak']) {
          collected.push({
            _source: 'soul_affinity', _src_slot: i,
            parameter: attr, base_parameter: attr,
            math_type: 'Multiply', value: atkMul, condition_factor: 1,
          });
        }
      }
      if (defMul !== 1) {
        collected.push({
          _source: 'soul_affinity', _src_slot: i,
          parameter: 'Defense', base_parameter: 'Defense',
          math_type: 'Multiply', value: defMul, condition_factor: 1,
        });
      }
    }
  }

  // === Phase 6.13: enemy guildTitle + emblems effects (wiki schema、需转 master shape)
  // wiki effect: { bunrui: [int], scope, condition, bairitu, calc_type, element?, weapon? }
  // → 转 master: { parameter, math_type, value, range, target_element_id, weapon_type_id }
  // gate:
  //   guildTitle: isGuildMode 才生效 (mode 'guildbattle' / 'guildbattle_special')
  //   emblems: emblem.guild_only=true 时 isGuildMode 才生效、guild_only=false 全局生效
  function _pushEnemyEffect(eff, srcLabel, lvScaled) {
    const bunruiArr = Array.isArray(eff.bunrui) ? eff.bunrui : [];
    for (const b of bunruiArr) {
      const param = bunruiToParam(b);
      if (param === 'NoEffect') continue;
      const bairitu = lvScaled != null ? lvScaled : eff.bairitu;
      if (bairitu == null || bairitu === 0) continue;
      // calc_type 0/1 = Mul/Add、scope: 1=全装备 / 2=限定 / 3=自身限定 / 5=chara限定
      const range = (eff.scope === 2 || eff.scope === 3) ? 'Single' : 'All';
      collected.push({
        _source: 'enemy_buff', _src_slot: targetSlotIdx, _src_label: srcLabel,
        parameter: param, base_parameter: param,
        math_type: calcTypeToMath(eff.calc_type),
        value: bairitu, condition_factor: 1,
        range,
        target_element_id: eff.element ?? 0,
        weapon_type_id: eff.weapon ?? 0,
      });
    }
  }

  const enemy = ctx?.enemy || {};
  const mode = enemy.mode || 'normal';
  const isGuildMode = mode === 'guildbattle' || mode === 'guildbattle_special';
  // guildTitle (isGuildMode-gated)
  const allGuildTitles = ctx?.allGuildTitles || [];
  if (isGuildMode && enemy.guildTitle != null) {
    const gt = allGuildTitles.find((g) => g.id === enemy.guildTitle);
    if (gt) {
      for (const eff of (gt.effects || [])) _pushEnemyEffect(eff, 'guildTitle');
    }
  }
  // emblems[4] (per-emblem guild_only-gated)
  const allGuildEmblems = ctx?.allGuildEmblems || [];
  for (const slotEm of (enemy.emblems || [])) {
    if (!slotEm || slotEm.id == null) continue;
    const em = allGuildEmblems.find((g) => g.id === slotEm.id);
    if (!em) continue;
    if (em.guild_only && !isGuildMode) continue;       // 全局生效或 guildMode 内激活
    const lvMax = emblemLvMaxLocal(em.rarity);
    const lv = Math.max(1, Math.min(lvMax, +slotEm.level || 1));
    for (const eff of (em.effects || [])) {
      const bs = (Array.isArray(eff.bunrui) ? eff.bunrui : []);
      // 各 bunrui 独立、每 bunrui 一个 effect、共享 bairitu 缩放
      const bairituScaled = emblemEffectiveBairitu(eff.bairitu, lv, lvMax);
      // _pushEnemyEffect 处理 bunrui[] 遍历、传 bairituScaled 覆盖原值
      const scaledEff = { ...eff, bairitu: bairituScaled };
      _pushEnemyEffect(scaledEff, 'emblem');
      void bs;
    }
  }

  return collected;
}

// 本地 emblem lvMax (跟 hensei-helpers.js emblemLvMax 同表、避免循环 import)
function emblemLvMaxLocal(rarity) {
  const tbl = { 1: 25, 2: 40, 3: 55, 4: 1 };
  return tbl[+rarity] ?? 1;
}

// ============================================================
// EAD pipeline apply (unpacking 03_ead.md §3.3 53 step + §3.12 取整 audit)
// ============================================================
//
// docs §3.12: 50 步 d8 链全程 double、0 中间 round。唯一 ceil 在 EAD 出口 caller get_Damage。
// 故 stage 内部不做 floor/ceil、最末才 ceil。
//
// LP/HP tier 倍率 = step 4 (在 BlazeAttack/BD-Boost 之后、其他 Mul 之前)、× Total 直接层
//   HpCheck (普通攻击):     [1.0, 1.1, 1.5, 2.0]  ← computeStats 用
//   LpCheck (Blaze 攻击): [1.0, 1.3, 2.0, 5.0]  ← computeStatsBlaze 用
//
// inline ×3 = step 51 (enemy.bk 时 Total ×= 3、跟 step 48/49 Enemy_BreakAttack 独立 gate)

// omoide_mul 来自 omoide source 的 Multiply effect
// enemy_buff = enemy bar guildTitle / emblems 的 effects (Phase 6.13、走 stage 3 Mul + stage 4 Add)
const _OTHER_SOURCES = new Set(['chara_skill', 'bd_skill', 'crystal', 'bg', 'soul', 'chara_meta', 'soul_affinity', 'omoide_mul', 'enemy_buff']);

// HpCheck 普通攻击表 (unpacking §3.5.3): tier 0..3
export const LP_TIER_NORMAL = [1.0, 1.1, 1.5, 2.0];
// LpCheck Blaze 攻击表 (unpacking §3.5.4): tier 0..3
export const LP_TIER_BLAZE = [1.0, 1.3, 2.0, 5.0];

// applyStaged(base, parameter, effects, opts):
//   opts.lpMult — LP tier 倍率 (普通/Blaze 入口决定)
//   opts.enemyBkX3 — enemy.bk=true 时 Total ×3 (step 51 inline)
export function applyStaged(base, parameter, effects, opts = {}) {
  const same = effects.filter((e) => e.base_parameter === parameter);
  const pick = (filter) => same.filter(filter);
  const sumAdd = (arr) => arr.reduce((s, e) => s + e.value * (e.condition_factor ?? 1), 0);
  const prodMul = (arr) => arr.reduce((p, e) => p * (1 + (e.value - 1) * (e.condition_factor ?? 1)), 1);
  const _norm = (x) => Math.round(x * 1e9) / 1e9;
  const lpMult = opts.lpMult ?? 1;
  const enemyBkX3 = opts.enemyBkX3 ? 3 : 1;

  let v = base;
  // Stage 1: omoide Add
  v += sumAdd(pick((e) => e._source === 'omoide' && e.math_type === 'Addition'));
  // Stage 2a: masou Add
  v += sumAdd(pick((e) => e._source === 'masou' && e.math_type === 'Addition'));
  // Stage 2b: masou Mul
  v *= prodMul(pick((e) => e._source === 'masou' && e.math_type === 'Multiply'));
  // Stage 3: × LP tier (step 4 位置、× Total 直接层)
  v *= lpMult;
  // Stage 4: other Mul (chara_skill/bd_skill/crystal/bg/soul/chara_meta/soul_affinity/omoide_mul)
  v *= prodMul(pick((e) => _OTHER_SOURCES.has(e._source) && e.math_type === 'Multiply'));
  // Stage 5: other Add
  v += sumAdd(pick((e) => _OTHER_SOURCES.has(e._source) && e.math_type === 'Addition'));
  // Stage 6: Enemy_Break Mul → Add (step 48/49、gate enemy.bk 在 condition_factor)
  v *= prodMul(pick((e) => e._source === 'enemy_break' && e.math_type === 'Multiply'));
  v += sumAdd(pick((e) => e._source === 'enemy_break' && e.math_type === 'Addition'));
  // Stage 7: × 3 inline (step 51、enemy.bk gate、跟 step 48/49 独立)
  v *= enemyBkX3;
  // 出口 ceil (caller get_Damage 的 frintp + fcvtps)
  return Math.ceil(_norm(v));
}

// ============================================================
// Repel_Percent 独立通道 — 不影响 stat
// ============================================================
export function repelRate(effects, parameter) {
  return Math.min(
    100,
    effects
      .filter((e) => e.base_parameter === parameter && e.math_type === 'Repel_Percent')
      .reduce((s, e) => s + e.value * (e.condition_factor ?? 1), 0),
  );
}

// ============================================================
// 顶层 computeStats / computeStatsBlaze — hensei viewer 主入口
// 兼容旧签名 (chara, tr, slotIdx, ctx) → {stats, damageLimit, hits, ...}
//
// computeStats: 普通攻击 (IsBlaze=false)、用 HpCheck LP 表 [1.0, 1.1, 1.5, 2.0]
//               UI hensei 显示这个、不管 tr.bd_on (bd_on 只影响 bd_skill.effects 加入 buff)
// computeStatsBlaze: BD 攻击伤害 (IsBlaze=true)、用 LpCheck LP 表 [1.0, 1.3, 2.0, 5.0]
//                    UI 暂不显示、给将来 BD damage 行用
// ============================================================
function _computeImpl(chara, tr, slotIdx, ctx, isBlaze) {
  if (!chara || !tr) return null;
  const team = ctx?.team || [];
  const effects = collectEffects(team, slotIdx, ctx);
  const base = baseStats(chara, tr);
  if (!base) return null;

  // LP tier 倍率: 按 isBlaze 选表 (unpacking §3.5)、只乘 Attack
  const lpTier = isBlaze ? LP_TIER_BLAZE : LP_TIER_NORMAL;
  const lpMult = lpTier[tr.lp] || 1;
  // step 51 inline ×3: enemy.bk=true 时 Total ×= 3 (跟 step 48/49 独立 gate)
  const enemyBkX3 = !!(ctx?.enemy?.bk);

  // applyStaged 对每个 stat 跑 (LP / inline×3 只影响 Attack、其他 stat 传 opts={})
  const optsAtk = { lpMult, enemyBkX3 };
  const stats = {
    HP: applyStaged(base.HP, 'HP', effects),
    Attack: applyStaged(base.Attack, 'Attack', effects, optsAtk),
    Defense: applyStaged(base.Defense, 'Defense', effects),
    GuardBreak: applyStaged(base.GuardBreak, 'GuardBreak', effects),
  };

  // Phase 6.13: enemy bar 硬编码倍率 (element matchup / difficulty / bkRes / advWeapons / bd_cap)
  // guildTitle/emblems 已通过 collectEffects 走 stage 3/4、这里只处理硬编码字段
  const enemyMods = _computeEnemyMods(chara, tr, ctx);
  if (enemyMods.attackMul !== 1) stats.Attack = Math.ceil(stats.Attack * enemyMods.attackMul);
  if (enemyMods.bkMul !== 1) stats.GuardBreak = Math.ceil(stats.GuardBreak * enemyMods.bkMul);
  const speed = _computeSpeed(chara, tr, slotIdx, ctx, effects, base);
  const motionSpeed = _computeMotionSpeed(chara, tr, effects);

  // hits 逐段独立 (unpacking §17.3 / v1 main:js/stats-calc.js L556-576)
  //   newHit_i = max(1, floor(base[i] × Π PSV_Mul_i + Σ PSV_Add_i))
  //   PSV 池 = chara_skill/crystal/bg/soul/omoide/omoide_mul/masou 的 HitCount/AttackCount effect
  //   BSV 池 = bd_on=true 时 bd_skill.effects 内对应 effect
  //   每 effect 的 _stages[i] 决定第 i 段 add/mul 的值
  const cMaster = chara._master;
  const stateData = cMaster?.states?.[tr.state] || Object.values(cMaster?.states || {})[0];
  const baseHits = Array.isArray(stateData?.hit_counts) ? stateData.hit_counts.slice(0, 3) : [0, 0, 0];
  while (baseHits.length < 3) baseHits.push(0);
  const hits = baseHits.map((baseI, stageI) => {
    if (!baseI) return 0;  // 该段不存在 (chara 1-3 段攻击不固定)、不参与
    let mulProd = 1;
    let addSum = 0;
    for (const e of effects) {
      if (e.base_parameter !== 'HitCount' && e.base_parameter !== 'AttackCount') continue;
      const stageVal = (e._stages?.[stageI] ?? e.value) * (e.condition_factor ?? 1);
      if (stageVal === 0) continue;
      if (e.math_type === 'Multiply') mulProd *= stageVal;
      else if (e.math_type === 'Addition') addSum += stageVal;
    }
    const v = Math.floor(baseI * mulProd + addSum);
    return Math.max(1, v);
  });
  const totalHits = hits.reduce((s, h) => s + h, 0);

  // damageLimit — DamageLimitBreak Mul + Add 池 fold (unpacking §9.5 / wiki main:js/stats-calc.js L559-561)
  //   damageLimit = floor(DEFAULT × ΠMul + ΣAdd)
  //   DEFAULT = 2^31-1 = 2,147,483,647 (BattleDamage..ctor 初始值)
  //   effect.value 已含 condition_factor / soul sourceMult (collectEffects pre-apply)
  const DEFAULT_LIMIT = 2147483647;
  let damageLimit = DEFAULT_LIMIT;
  for (const e of effects) {
    if (e.base_parameter !== 'DamageLimitBreak') continue;
    const cf = e.condition_factor ?? 1;
    const v = e.value * cf;
    if (e.math_type === 'Multiply') damageLimit *= v;
    else if (e.math_type === 'Addition') damageLimit += v;
  }
  damageLimit = Math.floor(damageLimit);

  // bdCapMax: BD ゲージ上限 max 計算 (v2 简化、不沿用 wiki 旧 -1 / mul 累加设计)
  //   bdCapMax = max(9, floor((9 + Σadd) × Π mul))
  //   base = 9 (默认上限、跟 UI 显示对齐、不再用 10-1 indexed)
  //   add 累加: Σ value × cf
  //   mul 累乘: Π value × cf (普通 PSV 累乘、跟 chara skill stage 3 一致)
  //   effects 池 = base_parameter === 'BlazeGaugeMaxLevel' (chara skill / crystal / bg / soul / emblem 等任意 source)
  let bdAdd = 0;
  let bdMul = 1;
  for (const e of effects) {
    if (e.base_parameter !== 'BlazeGaugeMaxLevel') continue;
    const cf = e.condition_factor ?? 1;
    if (e.math_type === 'Addition') bdAdd += e.value * cf;
    else if (e.math_type === 'Multiply') bdMul *= 1 + (e.value - 1) * cf;
  }
  const bdCapMax = Math.max(9, Math.floor((9 + bdAdd) * bdMul));

  // ========== BlazeGauge 系统 (按 user 决策正确顺序、unpacking §1.3.3.5) ==========
  // Step 1: 先算 BlazeGaugePointRate pipeline → blaze_gauge_points 数组 (每 level 升级阈值)
  //   chara/crystal/bg skill BlazeGaugePointRate Mul → charaSkillProd
  //   soul skill BlazeGaugePointRate Mul → soulRates (含 lv 给 L(level) 用)
  // Step 2: 然后累加所有 BlazeGauge points (chara skill mode 1 + mode 2)
  // Step 3: 最后用 cumsum 反查 → bd_cap level (小数允许)
  let charaSkillProd = 1;
  const soulRates = [];
  let initialBlazeGauge = 0;
  if (Array.isArray(team) && team.length) {
    const allCharasBg = ctx?.allCharas || [];
    const allSoulsBg = ctx?.allSouls || [];
    // 收集 team chara element list (用于 mode 2 count)
    const teamCharaElements = team
      .filter((s) => s?.chara != null)
      .map((s) => allCharasBg.find((c) => c.id === s.chara)?._master?.element_id)
      .filter((e) => e != null);
    // 单次 loop 同时收两类 skill
    for (const slotInfo of team) {
      if (slotInfo?.chara != null) {
        const charaObj = allCharasBg.find((c) => c.id === slotInfo.chara);
        const stateName = slotInfo.tr?.state;
        const sd = charaObj?._master?.states?.[stateName] || Object.values(charaObj?._master?.states || {})[0];
        for (const sk of (sd?.weapon_skills || [])) {
          // BlazeGaugePointRate Mul (Step 1 输入)
          if (sk.parameter === 'BlazeGaugePointRate' && sk.math_type === 'Multiply') {
            charaSkillProd *= +sk.value || 1;
          }
          // BlazeGauge Add (Step 2 输入、mode 1/2)
          if (sk.parameter === 'BlazeGauge' && sk.math_type === 'Addition') {
            const tElem = +sk.target_element_id || 0;
            if (tElem === 0) {
              initialBlazeGauge += +sk.value || 0;   // mode 1
            } else {
              // mode 2: count 队伍中 element 匹配 × value
              const cnt = teamCharaElements.filter((e) => e === tElem).length;
              initialBlazeGauge += (+sk.value || 0) * cnt;
            }
          }
        }
      }
      if (slotInfo?.soul != null) {
        const soulObj = allSoulsBg.find((s) => s.id === slotInfo.soul);
        for (const sk of (soulObj?._master?.skills || [])) {
          if (sk.parameter === 'BlazeGaugePointRate' && sk.math_type === 'Multiply') {
            soulRates.push({ value: +sk.value || 1, lv: +slotInfo.tr?.soul_lv || 1 });
          }
        }
      }
    }
  }
  // Step 1: blaze_gauge_points 数组 (按 BlazeGaugePointRate pipeline 缩放)
  const blazeGaugePoints = computeBlazeGaugePoints(charaSkillProd, soulRates);
  // Step 3: cumsum 反查 totalGauge points → bd_cap level (小数允许)
  const initialBdCap = bdCapFromBlazeGauge(blazeGaugePoints, initialBlazeGauge);

  // フルヒット
  const fullHit = Math.floor(stats.Attack * totalHits);

  return {
    stats: {
      'HP': stats.HP,
      '攻撃力': stats.Attack,
      '防御力': stats.Defense,
      'ブレイク力': stats.GuardBreak,
      'フルヒット攻撃力': fullHit,
    },
    speed,
    motionSpeed,
    damageLimit,
    bdCapMax,
    initialBlazeGauge,
    initialBdCap,
    blazeGaugePoints,
    hits,
    base,
    effects,
    _is_blaze: isBlaze,
  };
}

// ============================================================
// Speed / MotionSpeed — unpacking 07_speed.md / 08_motion_speed.md
// ============================================================
// unpacking §7.6.1:
//   latestRecover = add_acc + (PartnerLevel/100 + 1) × mul_acc × recover
//   - recover    = chara base speed (按 lv 缩放、base.Speed)
//   - mul_acc    = Σ Speed Mul fold (init 1.0、含 Vitality/RemHP/Break/FellDown_Speed × HP-curve factor)
//   - add_acc    = Σ Speed Add fold (init 0.0)
//   - PartnerLevel = 装的 soul lv (未装 → 0、factor = 1.0)
// returns { latestRecover, cooldownFrames, setFrames }
// unpacking §8.6.2 条件 B:
//   cooldownFrames = max(1, ceil(6000 / latestRecover))   // §8.6 frame 9 IsWait v=1→v=0
//                  当 latestRecover ≥ 6000 → 1fr (progress 一帧跨 100)
//                  注: 等价于 ceil(100 × 60 / latestRecover) 总 cooldown 时长 100/recover 秒 × 60fps
// setFrames = 1 (§8.6 frame 8 Begin→IsWait set、Speed 系一部分、固定)
// 注: §8.6 总 10 帧含 2fr Unity BT 调度 (Combo→Begin + 起手)、跟 chara 无关、不计入此函数
function _computeSpeed(chara, tr, slotIdx, ctx, effects, base) {
  const recover = base.Speed;
  let mulAcc = 1;
  let addAcc = 0;
  for (const e of effects) {
    if (e.base_parameter !== 'Speed') continue;
    if (e._source === 'enemy_break') continue;  // Enemy_BreakSpeed 不进 Speed 池 (master 无数据)
    const cf = e.condition_factor ?? 1;
    // 跟 applyStaged 公式一致: Mul 用 1+(v-1)×cf 渐进激活、Add 直接 ×cf
    if (e.math_type === 'Multiply') mulAcc *= 1 + (e.value - 1) * cf;
    else if (e.math_type === 'Addition') addAcc += e.value * cf;
  }
  const team = ctx?.team || [];
  const slot = team[slotIdx];
  const partnerLv = slot?.soul != null ? (+tr.soul_lv || 0) : 0;
  const partnerFactor = partnerLv / 100 + 1;
  const latestRecover = addAcc + partnerFactor * mulAcc * recover;
  const cooldownFrames = latestRecover > 0
    ? Math.max(1, Math.ceil(6000 / latestRecover))
    : 0;
  return { latestRecover, cooldownFrames, setFrames: 1 };
}

// unpacking §8.7:
//   effective_motion_speed_i = motion_speed_i × boost_mul_acc + boost_add_acc
//   - motion_speed_1/2/3 = master state.motion_speed / motion_speed2 / motion_speed3
//   - boost_mul_acc = Σ MotionSpeed Mul fold (init 1.0、含 HP-curve gate)
//   - boost_add_acc = Σ MotionSpeed Add fold (init 0.0)
// unpacking §8.4: clip authored duration_sec (state.motion_durations) / effective → 实际段时长
// 游戏 60fps、最终调度按帧、所以转 frames = ceil(dur/spd × 60) — 即使 40ms 也会 ceil 到 3fr
// 返 { speeds: [effective_m1, m2, m3] 倍率, durationsFrames: [整数帧数] }
function _computeMotionSpeed(chara, tr, effects) {
  const cMaster = chara?._master;
  const stateData = cMaster?.states?.[tr.state] || Object.values(cMaster?.states || {})[0];
  const ms = [
    +stateData?.motion_speed || 0,
    +stateData?.motion_speed2 || 0,
    +stateData?.motion_speed3 || 0,
  ];
  // clip authored duration (秒、build_characters.py inline from data/_npc_motions.json)
  const durs = Array.isArray(stateData?.motion_durations) ? stateData.motion_durations : [0, 0, 0];
  let mulAcc = 1;
  let addAcc = 0;
  for (const e of effects) {
    if (e.base_parameter !== 'MotionSpeed') continue;
    const cf = e.condition_factor ?? 1;
    // 跟 applyStaged 公式一致
    if (e.math_type === 'Multiply') mulAcc *= 1 + (e.value - 1) * cf;
    else if (e.math_type === 'Addition') addAcc += e.value * cf;
  }
  const speeds = ms.map((v) => v * mulAcc + addAcc);
  // unpacking §8.6.2 条件 A:
  //   frames_per_segment = 1 (register) + max(1, ceil(effective_clip_seconds × 60))
  //   effective_clip_seconds = clip_dur / motion_speed
  // 即每段 = max(2, ceil(dur × 60 / speed) + 1) — 最小 2fr (motion_speed → ∞ 时 floor 命中)
  const durationsFrames = speeds.map((spd, i) => {
    const d = +durs[i];
    if (!spd || !d) return 0;
    return 1 + Math.max(1, Math.ceil((d / spd) * 60));
  });
  return { speeds, durationsFrames };
}

// ============================================================
// Phase 6.13: enemy bar 硬编码倍率 (element matchup / difficulty / bkRes / advWeapons / bd_cap)
// element / bd_cap 全局生效；difficulty / bkRes-high / advWeapons 仅 isGuildMode 生效
// 返 { attackMul, bkMul } — 在 _computeImpl 内乘到 Attack / GuardBreak (stage 后、UI 显示前)
// guildTitle/emblems 不在此处、走 collectEffects 注入 enemy_buff source
// ============================================================
function _computeEnemyMods(chara, tr, ctx) {
  const enemy = ctx?.enemy || {};
  const mode = enemy.mode || 'normal';
  const isGuildMode = mode === 'guildbattle' || mode === 'guildbattle_special';
  const cMaster = chara?._master;
  const charaElem = cMaster?.element_id;
  const charaWeap = cMaster?.weapon_type_id;

  let attackMul = 1;
  let bkMul = 1;

  // #1 element matchup (全局)
  const elemMult = elementMatchupMult(charaElem, enemy.element, mode);
  attackMul *= elemMult;
  bkMul *= elemMult;

  // #4 bkResistance × bk (bk gate)
  // 注: 普通 BK ×3 已在 stage 7 inline ×3 完成 (unpacking §3.10 step 51)、不重复
  // 这里只处理 ギルバト high resistance 额外 ×2 (升级 normal ×3 → ×6、跟 wiki main L971 一致)
  if (enemy.bk && isGuildMode && enemy.bkResistance === 'high') {
    attackMul *= BK_RES_MULT.high / BK_RES_MULT.normal;  // 6/3 = 2 (额外倍率)
  }

  // #3 difficulty (isGuildMode-gated)
  if (isGuildMode) {
    attackMul *= DIFFICULTY_MULT[enemy.difficulty] ?? 1.0;
  }

  // #5 advantageWeapons (isGuildMode-gated)
  if (isGuildMode && charaWeap != null && enemy.advantageWeapons?.has?.(charaWeap)) {
    attackMul *= ADVANTAGE_WEAPON_MULT;
  }

  // #8 bd_cap (全局)
  attackMul *= bdCapMult(enemy.bd_cap);

  return { attackMul, bkMul };
}

// 普通攻击 stats (HpCheck LP 表) — hensei UI 当前显示这个
export function computeStats(chara, tr, slotIdx, ctx) {
  return _computeImpl(chara, tr, slotIdx, ctx, false);
}

// BD 攻击伤害 stats (LpCheck LP 表) — UI 暂不显示、内部 API
export function computeStatsBlaze(chara, tr, slotIdx, ctx) {
  return _computeImpl(chara, tr, slotIdx, ctx, true);
}

// 兼容旧导出 (UI 侧若直接用)
export const _STAT_KEYS = ['HP', '攻撃力', '防御力', 'ブレイク力'];

// ============================================================
// PAD step 3 Defense chain — 公式映射 (unpacking 19_defense.md §19.12)
// ============================================================
// hensei 防御力 = s10 (玩家防御吸收量、damage units) = base × Π Mul + Σ Add
// = applyStaged(base.Defense, 'Defense', effects)
// 用户决策:
//   - 只显示玩家防御值 (s10)、不算被打时最终伤害
//   - SwapAttackDefense=true 模式 (剑魂特殊玩法) 不考虑、所有 chain 按 swap=false (正常对战)
