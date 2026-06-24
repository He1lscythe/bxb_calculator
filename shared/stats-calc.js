// shared/stats-calc.js — Hensei 4-stage 计算 (Phase 6.1)
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
  parseHit,
} from './hensei-helpers.js';

// 倍率四舍五入到 5 位小数 (复刻游戏精度、用户决策 2026-06-20): ×1.894815 → ×1.89482 再乘算
const _round5 = (x) => Math.round((Number(x) || 0) * 1e5) / 1e5;

// MP rate (unpacking §3.9.1、攻撃力/ブレイク力 × rate): mp_ratio = curMp / maxMp
//   mp_ratio < 0.5 → rate = 1 − (20/21)·√(1 − 2·mp_ratio);  否则 → 1.0
//   curMp=null → 满 → rate 1;curMp=0 → 1/21 (跟旧 have_mp=false 一致)
export const mpRate = (curMp, maxMp) => {
  const max = +maxMp || 0;
  if (max <= 0) return 1;
  const cur = curMp == null ? max : Math.max(0, Math.min(max, +curMp || 0));
  const ratio = cur / max;
  return ratio >= 0.5 ? 1 : 1 - (20 / 21) * Math.sqrt(1 - 2 * ratio);
};

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
    mp: null,              // 当前 MP (null = 满);mp_ratio<0.5 时攻撃/ブレイク × _mpRate
    bd_on: false,          // BD 状态 (IsBlaze gate、Phase 8 实测)
    hp: 100,               // HP%
    affinity: 0,
    omoide_picks: [],
    soul_lv: 1,
    soul_awakening: 0,
    bd_count: null,        // BD 条数 (null → 默认取 bd_skill.cost);BD buff 倍率 = value + additional_value × bd_count
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
  // hensei 客户端用 master initial_/max_ 字段重算 base、需 floor 模拟 server 行为
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
// parameter 有 HP-curve prefix 时、按 **接收方(target)自身 HP** 算 factor (该 buff 应用到谁就看谁的 HP;
// range=All 的 HP-curve buff 从别 slot 来时、用 target 的 HP 而非 source 的、2026-06-19 修正)。
//   Vitality_*  → factor = hp_pct / 100
//   RemHP_*     → factor = (100 - hp_pct) / 100
//   Break_*     → factor = 1 if hp_pct <= 50 else 0  (unpacking §2.3: IsBreak = HpRate ≤ 0.5 含等号)
//   FellDown_*  → factor = 1 if 任一队友 hp=0 else 0
//   Enemy_Break*→ factor = 1 if enemy.bk else 0
// 无 prefix → factor = 1
export function conditionFactor(parameter, hpPct, anyTeammateZero, enemyBk) {
  if (!parameter) return 1;
  if (parameter.startsWith('Vitality_')) return Math.max(0, Math.min(1, hpPct / 100));
  if (parameter.startsWith('RemHP_')) return Math.max(0, Math.min(1, (100 - hpPct) / 100));
  if (parameter.startsWith('Break_')) return hpPct <= 50 ? 1 : 0;
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
export function _effectApplies(eff, targetChara, srcChara, srcSlot, targetSlot) {
  // range: 'All' = 装备者 + 队友 (全队)、'Single' = 仅装备者自身
  if (eff.range === 'Single' && srcSlot !== targetSlot) return false;
  const sm = srcChara?._master;    // 装备者 (source / equipper、effect 所在装备挂的魔剣)
  const tm = targetChara?._master; // 接收方 (target、正在算 stat 的魔剣)
  // *_condition (souls「X属性装備で…」): 判**装备者自身**的属性 / 武器门槛、不命中整条不激活。
  //   souls 全用 *_condition、weapons 全用 target_element_id/weapon_type_id (2026-06-19 扫描确认、语义相反)。
  //   range=Single 时 src===target、跟旧 target 判定等价;range=All 才有区别 (看装备者、非接收方)。
  if (eff.element_condition && sm?.element_id !== eff.element_condition) return false;
  if (eff.weapon_type_condition && sm?.weapon_type_id !== eff.weapon_type_condition) return false;
  // target_element_id / weapon_type_id (weapons/crystals「X属性の味方…」): 判**接收方**过滤。
  if (eff.target_element_id) {
    const need = eff.target_element_id;
    let ok = tm?.element_id === need;
    // extra_element_id (chara_revise): is_original_skill 的他魔剣 buff 可被额外属性接收
    if (!ok && eff.is_original_skill && Array.isArray(tm?.extra_element_id) && tm.extra_element_id.includes(need)) {
      ok = true;
    }
    if (!ok) return false;
  }
  if (eff.weapon_type_id && tm?.weapon_type_id !== eff.weapon_type_id) return false;
  // chara 限定 — soul: weapon_base_id (master 原生)、crystal/bg: chara_base_id (build_*_aux.py 反查 characters.json)
  // 跟 targetChara._master.id 严格比对
  const limId = eff.weapon_base_id || eff.chara_base_id;
  if (limId && tm?.id !== limId) return false;
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

// 专属条件 override: 个别魔剣技能的触发条件只在 description、master 无字段 → 手动标 skill_id → 条件类型。
// (这类技能极少;新增时往表加一行 + 在 pushEff 加对应 factor 分支。区别于通用 mpRate)
const SKILL_COND_OVERRIDE = {
  60009: 'mp_not_full', // 気高き悪食の世界樹: 魔力未満で攻撃力 ×3
};
// Rise_AttackRate 放大器生效的 source (放大「自身 loadout 的 Attack 系增益」、排除 omoide/chara_meta/soul_affinity/enemy_buff)
const _RISE_AMP_SOURCES = new Set(['chara_skill', 'crystal', 'bg', 'soul']);

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
    if (!_effectApplies(raw, targetChara, srcChara, srcSlot, targetSlotIdx)) return;
    const param = raw.parameter;
    // Enemy_Break_* parameter 强制 _source='enemy_break'、不论原 source、走 stage 5 独立 (unpacking §3.7 step 47/48)
    if (param && param.startsWith('Enemy_Break')) source = 'enemy_break';
    // HP-curve (Vitality/RemHP/Break) factor 用 TARGET 自身 HP (tr=目标 slot 的 tr);
    // range=All 的 HP-curve buff 从别 slot 来时、看接收方而非 source 的 HP。
    const tgtHp = tr?.hp ?? 100;
    let factor = conditionFactor(param, tgtHp, anyTeammateZero, enemyBk);
    // 专属条件 override (条件只在描述、master 无字段;仅 chara_skill 的指定 skill_id)
    if (source === 'chara_skill' && SKILL_COND_OVERRIDE[raw.id] === 'mp_not_full') {
      const maxMp = +srcChara?._master?.mp || 0;        // 源魔剣自身 MP 上限
      const curRaw = resolvedTeam[srcSlot]?.tr?.mp;
      const curMp = curRaw == null ? maxMp : curRaw;    // null = 满
      factor = maxMp > 0 && curMp < maxMp ? 1 : 0;       // 魔力未満 → 1 (生效)、満 → 0
    }
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
        : parseHit(raw.value_scaling);   // value_scaling 可为分式字符串 ('5/1.13')、parseHit 统一展开
      value = (raw.value || 0) + (scaling * srcJk);
    }
    // 倍率 (Multiply) 计算前先四舍五入到 5 位小数 (加算值 = 平值、不动)
    if (raw.math_type === 'Multiply') value = _round5(value);
    const entry = {
      _source: source,
      _src_slot: srcSlot,
      // trace 显示用: description (效果文) 优先、fallback name (2026-06-10 用户决策)
      _src_name: opts.srcName || raw.description || raw.name || null,
      parameter: param,
      base_parameter: baseParameter(param),
      math_type: raw.math_type,
      value,
      condition_factor: factor,
    };
    // HitCount / AttackCount: 携带逐段 stages 数组 (master values [v0,v1,v2] 或 broadcast value)
    // opts.stageMult: soul 等级倍率 (values 数组路径不走 valueOverride、单独乘;单值路径 value 已 scaled)
    if (entry.base_parameter === 'HitCount' || entry.base_parameter === 'AttackCount' || entry.base_parameter === 'HitCountKeepDamage') {
      const sm = opts.stageMult ?? 1;
      if (Array.isArray(raw.values) && raw.values.length === 3) {
        entry._stages = raw.values.map((v) => (Number(v) || 0) * sm);
      } else {
        const v = Number(value) || 0;
        entry._stages = [v, v, v];
      }
    }
    collected.push(entry);
    // HitCountKeepDamage 第二效果「减攻」: 加 B hit 的同时 Attack ×= A/(A+B)、フルヒット保持不变 (用户 2026-06-19)。
    //   A = 目标魔剣原始 hit_counts 之和 (characters.json、未经任何计算)、B = 本效果加 hit 总量 = Σ_stages。
    //   分类到 Attack、进 PSV 池 (applyStaged Stage 4 Mul、跟原 source 同 stage)。
    if (entry.base_parameter === 'HitCountKeepDamage') {
      const B = (entry._stages || []).reduce((s, x) => s + (x || 0), 0);
      const tState = targetChara?._master?.states?.[tr?.state] || Object.values(targetChara?._master?.states || {})[0];
      const A = (tState?.hit_counts || []).reduce((s, x) => s + (x || 0), 0);
      if (A > 0 && A + B > 0) {
        collected.push({
          _source: source, _src_slot: srcSlot,
          _src_name: `${entry._src_name || 'KeepDamage'} (减攻 A/(A+B))`,
          parameter: 'Attack', base_parameter: 'Attack',
          math_type: 'Multiply', value: _round5(A / (A + B)), condition_factor: factor,
        });
      }
    }
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
      // BD 条数: buff 倍率/值 = value + additional_value × bdCount (默认 bdCount = bd_skill.cost、hensei UI 可调 0..bdCapMax)
      const bdCount = trSlot.bd_count != null ? trSlot.bd_count : (cMaster.bd_skill.cost ?? 0);
      for (const eff of cMaster.bd_skill.effects) {
        const scaled = (eff.value || 0) + (eff.additional_value || 0) * bdCount;
        pushEff(slot.chara, i, 'bd_skill', eff, {
          srcName: eff.description || cMaster.bd_skill.name || 'BD',
          valueOverride: scaled,
        });
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
        // stageMult: HitCount values=[a,b,c] 数组路径也吃等级加成 (2026-06-10 用户确认)
        pushEff(slot.chara, i, 'soul', sk, { valueOverride: scaled, stageMult: sourceMult });
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
        range: cr._master.range || 'Single',   // build_crystal_aux 走 desc 同装備セット 注入 All、否则 Single 缺省
        target_element_id: cr._master.element_id,
        weapon_type_id: cr._master.weapon_type_id,
        chara_base_id: cr.chara_base_id || null,   // build_crystal_aux 走 name 純真/秘録 反查 chara id 注入
      }, { valueOverride: value, srcName: cr.name });
    }

    // 5. bg (slot.bg._skills 或 _master.skills) — bg-level chara_base_id 注入每个 skill
    const bgSkills = slot.bg?._skills || slot.bg?._master?.skills || [];
    const bgCharaId = slot.bg?.chara_base_id || null;
    for (const sk of bgSkills) {
      const skWithLimit = bgCharaId ? { ...sk, chara_base_id: bgCharaId } : sk;
      pushEff(slot.chara, i, 'bg', skWithLimit, { srcName: sk.description || slot.bg?.name });
    }

    // 6. masou (slot.masou 是 single object、不是 array)
    const masouObj = Array.isArray(slot.masou) ? slot.masou : (slot.masou ? [slot.masou] : []);
    for (const ms of masouObj) {
      for (const eff of ms?.effects || []) pushEff(slot.chara, i, 'masou', eff, { srcName: eff.effect_text || ms.name });
    }

    // 7. chara_meta: 結婚 / 燃心 / LP / MP 装備 — 只对 target slot 自身
    if (i === targetSlotIdx) {
      const marriageMult = [1.0, 1.03, 1.05][trSlot.marriage] || 1;
      if (marriageMult !== 1) {
        for (const attr of ['Attack', 'Defense', 'HP', 'GuardBreak']) {
          collected.push({
            _source: 'chara_meta', _src_slot: i, _src_name: '結婚',
            parameter: attr, base_parameter: attr,
            math_type: 'Multiply', value: marriageMult, condition_factor: 1,
          });
        }
      }
      if (trSlot.moeshin) {
        collected.push({
          _source: 'chara_meta', _src_slot: i, _src_name: '燃心',
          parameter: 'Attack', base_parameter: 'Attack',
          math_type: 'Multiply', value: 1.3, condition_factor: 1,
        });
      }
      // LP tier 不进 effects、由 computeStats / computeStatsBlaze 入口算 lpMult 传给 applyStaged
      // (unpacking §3.5 step 4 × Total 直接层、按 IsBlaze 切表)
      const mwMult = mpRate(trSlot.mp, cMaster.mp);
      if (mwMult !== 1) {
        for (const attr of ['Attack', 'GuardBreak']) {
          collected.push({
            _source: 'chara_meta', _src_slot: i, _src_name: 'MP',
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
            _source: 'soul_affinity', _src_slot: i, _src_name: 'ソウル相性',
            parameter: attr, base_parameter: attr,
            math_type: 'Multiply', value: atkMul, condition_factor: 1,
          });
        }
      }
      if (defMul !== 1) {
        collected.push({
          _source: 'soul_affinity', _src_slot: i, _src_name: 'ソウル相性',
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
      // eff.range 是 master 原 'All' / 'Single' / 'None' (adapter 透传)、缺省 'All'
      const range = eff.range === 'Single' ? 'Single' : 'All';
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

  // === Rise_AttackRate 放大器 (meta-pass、2026-06-23): 目标自身有 Rise_AttackRate (魔剣固有) →
  //     把目标「自身 loadout」(_src_slot===target) 的 Attack 系 (base_parameter==='Attack') 增益 ×V。
  //     source 限 chara_skill/crystal/bg/soul (排除 omoide「潜在Skill除く」/ chara_meta / soul_affinity / enemy_buff)。
  //     目前仅 1508 蒼き悪竜の渇欲 / 1530 もちもち (均 ×2.5)。
  const _rise = collected.find((e) => e.parameter === 'Rise_AttackRate' && e._src_slot === targetSlotIdx);
  if (_rise) {
    const V = _rise.value || 1;
    for (const e of collected) {
      if (e._src_slot !== targetSlotIdx) continue;
      if (e.base_parameter !== 'Attack' || !_RISE_AMP_SOURCES.has(e._source)) continue;
      if (e.math_type === 'Multiply') e.value = _round5(1 + (e.value - 1) * V);  // 增益部分 ×V
      else if (e.math_type === 'Addition') e.value = e.value * V;
      e._rise_amp = V; // trace 标记
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

// trace step 的来源标签 (skill/装备名@slot、fallback source key)
export const traceSrcLabel = (e) =>
  `${e._src_name || e._src_label || e._source}@S${(e._src_slot ?? 0) + 1}`;

// applyStaged(base, parameter, effects, opts):
//   opts.lpMult — LP tier 倍率 (普通/Blaze 入口决定)
//   opts.enemyBkX3 — enemy.bk=true 时 Total ×3 (step 51 inline)
//   opts.traceStages — {stageKey: stageObj} (dev trace、null=off)、opts.statLabel — trace step.stat 用 display 名
//
// 实现说明: 旧版 sumAdd/prodMul fold、为 trace 逐 effect 化。数学差异仅浮点结合顺序
// (v+(a+b) vs (v+a)+b)、出口 _norm(1e9 round)+ceil 吸收、unit test 锁行为一致。
export function applyStaged(base, parameter, effects, opts = {}) {
  const same = effects.filter((e) => e.base_parameter === parameter);
  const _norm = (x) => Math.round(x * 1e9) / 1e9;
  const lpMult = opts.lpMult ?? 1;
  const enemyBkX3 = opts.enemyBkX3 ? 3 : 1;
  const tStages = opts.traceStages || null;
  const statLabel = opts.statLabel;
  const _push = (stageKey, src, op, val, before, after) => {
    const st = tStages?.[stageKey];
    if (st) st.steps.push({ src, stat: statLabel, op, val, before, after });
  };

  let v = base;
  // 逐 effect apply: +0 / ×1 跳过 (数学严格无影响、trace 减噪)
  const addPass = (stageKey, list) => {
    for (const e of list) {
      const val = e.value * (e.condition_factor ?? 1);
      if (val === 0) continue;
      const before = v;
      v += val;
      _push(stageKey, traceSrcLabel(e), 'add', val, before, v);
    }
  };
  const mulPass = (stageKey, list) => {
    for (const e of list) {
      // 倍率先 round 到 5 位小数 (覆盖 meta/emblem 等非 collectEffects.pushEff 来源的 Mul)
      const val = 1 + (_round5(e.value) - 1) * (e.condition_factor ?? 1);
      if (val === 1) continue;
      const before = v;
      v *= val;
      _push(stageKey, traceSrcLabel(e), 'mul', val, before, v);
    }
  };

  // HP-curve / gate 前缀 (Vitality_/RemHP_/Break_/FellDown_) 是 client 动态值、不能 server-fold —
  // masou 此类 effect 不进 s2a/s2b (server-fold 段)、改走 s4a/s5a (2026-06-10 用户决策)
  const _isDynamic = (e) => /^(Vitality_|RemHP_|Break_|FellDown_)/.test(e.parameter || '');

  // Stage 1: omoide Add
  addPass('s1_omoide_add', same.filter((e) => e._source === 'omoide' && e.math_type === 'Addition'));
  // Stage 2a: masou Add (静的のみ)
  addPass('s2a_masou_add', same.filter((e) => e._source === 'masou' && e.math_type === 'Addition' && !_isDynamic(e)));
  // Stage 2b: masou Mul (静的のみ)
  mulPass('s2b_masou_mul', same.filter((e) => e._source === 'masou' && e.math_type === 'Multiply' && !_isDynamic(e)));
  // Stage 2 終: server-fold floor — base + omoide + masou 都是 server 侧算的、返回整数
  {
    const b = v;
    v = Math.floor(v);
    if (v !== b) _push('s2c_floor', 'server-fold floor', 'floor', null, b, v);
  }
  // Stage 3: × LP tier (step 4 位置、× Total 直接层)
  if (lpMult !== 1) {
    const b = v;
    v *= lpMult;
    _push('s3_lp', 'LP tier', 'mul', lpMult, b, v);
  }
  // Stage 4/5: other Mul / Add (chara_skill/bd_skill/crystal/bg/soul/chara_meta/soul_affinity/omoide_mul)
  // 顺序 (2026-06-10 用户决策、计算跟 trace 显示一致、stage 一级目录可见分类):
  //   s4a 非 soul Mul (chara/crystal/bg/魔装/meta…) → s4b ソウル Mul → s5a 非 soul Add → s5b ソウル Add
  //   各类内按 slot 升序 (stable sort、同 slot 内保持 collectEffects push 顺序)
  const _isSoulSrc = (e) => e._source === 'soul' || e._source === 'soul_affinity';
  const _isBd = (e) => e._source === 'bd_skill';
  const _bySlot = (arr) => [...arr].sort((a, b) => (a._src_slot ?? 0) - (b._src_slot ?? 0));
  // others 池 = _OTHER_SOURCES + masou 动态 (HP-curve 类、不能 server-fold)
  const others = same.filter(
    (e) => _OTHER_SOURCES.has(e._source) || (e._source === 'masou' && _isDynamic(e)),
  );
  // bd_skill 战斗时生效 → 排到 Mul/Add 池最后 (soul 之后);其余非 soul → s4a/s5a、soul → s4b/s5b
  const othersNonSoul = _bySlot(others.filter((e) => !_isSoulSrc(e) && !_isBd(e)));
  const othersSoul = _bySlot(others.filter(_isSoulSrc));
  const bdEffs = _bySlot(others.filter(_isBd));
  mulPass('s4a_other_mul', othersNonSoul.filter((e) => e.math_type === 'Multiply'));
  mulPass('s4b_soul_mul', othersSoul.filter((e) => e.math_type === 'Multiply'));
  mulPass('s4c_bd_mul', bdEffs.filter((e) => e.math_type === 'Multiply'));
  addPass('s5a_other_add', othersNonSoul.filter((e) => e.math_type === 'Addition'));
  addPass('s5b_soul_add', othersSoul.filter((e) => e.math_type === 'Addition'));
  addPass('s5c_bd_add', bdEffs.filter((e) => e.math_type === 'Addition'));
  // Stage 6: Enemy_Break Mul → Add (step 48/49、gate enemy.bk 在 condition_factor)
  mulPass('s6_enemy_break', same.filter((e) => e._source === 'enemy_break' && e.math_type === 'Multiply'));
  addPass('s6_enemy_break', same.filter((e) => e._source === 'enemy_break' && e.math_type === 'Addition'));
  // Stage 7: × 3 inline (step 51、enemy.bk gate、跟 step 48/49 独立)
  if (enemyBkX3 !== 1) {
    const b = v;
    v *= enemyBkX3;
    _push('s7_inline3', '敵BK ×3 (step51)', 'mul', enemyBkX3, b, v);
  }
  // 出口 ceil (caller get_Damage 的 frintp + fcvtps)
  const out = Math.ceil(_norm(v));
  if (out !== v) _push('s7b_ceil', '出口 ceil', 'ceil', null, v, out);
  return out;
}

// ============================================================
// Server-fold 顺序 (HP / HitCount 战前一次性 server fold、不走 EAD 分组 pipeline)
// 顺序 (2026-06-19 用户指定，复刻 server 拼 weapon_skills 数组的 block 顺序):
//   自身好感(omoide) → 自身costume(masou) →
//   各 slot[ 技能(chara_skill/bd/meta) → 结晶(crystal) → costume(masou、自身已在前面、跳过) ] →
//   各 slot bg → 各 slot soul → 其余(他 slot omoide / enemy_buff 等)
// 逐 effect 应用(不分组 Mul/Add)、对顺序敏感(HitCount 每步 clamp、HP 加算落在乘算内/外取决于位置)。
// ============================================================
export function orderServerFold(list, targetSlotIdx) {
  const taken = new Set();
  const out = [];
  const take = (pred) => {
    for (const e of list) {
      if (taken.has(e) || !pred(e)) continue;
      taken.add(e);
      out.push(e);
    }
  };
  const T = targetSlotIdx;
  take((e) => (e._source === 'omoide' || e._source === 'omoide_mul') && e._src_slot === T); // 自身好感
  take((e) => e._source === 'masou' && e._src_slot === T); // 自身costume
  for (let s = 0; s < 3; s++) {
    take((e) => (e._source === 'chara_skill' || e._source === 'chara_meta') && e._src_slot === s);
    take((e) => e._source === 'crystal' && e._src_slot === s);
    if (s !== T) take((e) => e._source === 'masou' && e._src_slot === s); // 后面位置 costume 排除自己
  }
  for (let s = 0; s < 3; s++) take((e) => e._source === 'bg' && e._src_slot === s);
  for (let s = 0; s < 3; s++) take((e) => (e._source === 'soul' || e._source === 'soul_affinity') && e._src_slot === s);
  take((e) => e._source !== 'bd_skill'); // 其余(他 slot omoide / enemy_buff 等)、bd 除外
  // bd_skill 最后: BD 战斗时(発動後)生效、排在所有 buff 之后 (用户 2026-06-20)
  take(() => true);
  return out;
}

// HP 战前 server-fold: 按 orderServerFold 顺序逐 effect 应用 (Mul 直乘、Add 直加、不分组)。
// 自身/靠前 slot 的加算因排在自身乘算之前 → 落在乘算"内";靠后 slot 的加算排在之后 → 落在"外"。
// (unpacking archive/HOWTO_hp_calc.md: max_hp = (base + Σ前置Add) × Π自身Mul + Σ后置Add、slot 顺序敏感)
export function serverFoldHP(base, effects, targetSlotIdx, opts = {}) {
  const ordered = orderServerFold(effects.filter((e) => e.base_parameter === 'HP'), targetSlotIdx);
  const st = opts.traceStages?.s_hp_fold;
  const _norm = (x) => Math.round(x * 1e9) / 1e9;
  let v = base;
  for (const e of ordered) {
    const cf = e.condition_factor ?? 1;
    const before = v;
    if (e.math_type === 'Multiply') {
      const f = 1 + (e.value - 1) * cf;
      if (f === 1) continue;
      v *= f;
      if (st) st.steps.push({ src: traceSrcLabel(e), stat: 'HP', op: 'mul', val: f, before, after: v });
    } else if (e.math_type === 'Addition') {
      const a = e.value * cf;
      if (a === 0) continue;
      v += a;
      if (st) st.steps.push({ src: traceSrcLabel(e), stat: 'HP', op: 'add', val: a, before, after: v });
    }
  }
  const out = Math.floor(_norm(v)); // server max_hp 为整数 (base 已 floor、用户决策 2026-06-19)
  if (st && out !== v) st.steps.push({ src: 'server-fold floor', stat: 'HP', op: 'floor', val: null, before: v, after: out });
  return out;
}

// HitCount 战前 server-fold (DeckHitCount、unpacking 17_hitcount.md §17.2.1/§17.8.3):
//   按 orderServerFold 顺序逐 effect、每步 cur = trunc(cur op val) (战前 fcvtzs)、每步 clamp ≥1。
//   per-step clamp 对顺序敏感、所以不分组 Mul/Add。返回各段 hit 数组。
export function serverFoldHitCount(baseHits, effects, targetSlotIdx, stHits = null) {
  const ordered = orderServerFold(
    effects.filter(
      (e) => e.base_parameter === 'HitCount' || e.base_parameter === 'AttackCount' || e.base_parameter === 'HitCountKeepDamage',
    ),
    targetSlotIdx,
  );
  return baseHits.map((baseI, stageI) => {
    if (!baseI) return 0; // 该段不存在 (chara 1-3 段攻击不固定)、不参与
    let cur = baseI;
    const hitStat = `Hit${stageI + 1}`;
    for (const e of ordered) {
      const stageVal = (e._stages?.[stageI] ?? e.value) * (e.condition_factor ?? 1);
      if (e.math_type === 'Multiply' ? stageVal === 1 : stageVal === 0) continue; // ×1 / +0 无影响
      const b = cur;
      if (e.math_type === 'Multiply') cur = Math.trunc(cur * stageVal);
      else cur = Math.trunc(cur + stageVal);
      if (cur <= 0) cur = 1; // ★ per-step clamp ≥1 (战前 §17.2.1、顺序敏感)
      if (stHits && cur !== b) {
        stHits.steps.push({
          src: traceSrcLabel(e), stat: hitStat,
          op: e.math_type === 'Multiply' ? 'mul' : 'add', val: stageVal, before: b, after: cur,
        });
      }
    }
    const out = Math.max(1, cur);
    if (stHits && out !== cur) {
      stHits.steps.push({ src: 'max(1)', stat: hitStat, op: 'max', val: null, before: cur, after: out });
    }
    return out;
  });
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

  // ===== dev trace (ctx.traceEnabled 才生成、Pages 生产路径全 no-op) =====
  // 结构跟 hensei.html stat-trace modal UI 协议一致 (base / damageLimitBase / hitsBase / stages[].steps[])
  const trace = ctx?.traceEnabled
    ? {
        base: { '攻撃力': base.Attack, '防御力': base.Defense, 'HP': base.HP, 'ブレイク力': base.GuardBreak },
        damageLimitBase: 2147483647,
        hitsBase: [],
        speedBase: base.Speed,
        motionBase: [],
        stages: [],
      }
    : null;
  const mkStage = (key, label) => {
    if (!trace) return null;
    const st = { key, label, steps: [] };
    trace.stages.push(st);
    return st;
  };
  // applyStaged 的 8 个 stage (4 stat 共享同一组、UI 按 step.stat filter)
  const traceStages = trace
    ? {
        s1_omoide_add: mkStage('s1_omoide_add', 'おもいで Add (Stage 1)'),
        s2a_masou_add: mkStage('s2a_masou_add', '魔装 Add (Stage 2a)'),
        s2b_masou_mul: mkStage('s2b_masou_mul', '魔装 Mul (Stage 2b)'),
        s2c_floor: mkStage('s2c_floor', 'server-fold floor (Stage 2 終)'),
        s3_lp: mkStage('s3_lp', 'LP tier (×Total)'),
        s4a_other_mul: mkStage('s4a_other_mul', 'Mul — chara/crystal/bg/魔装…'),
        s4b_soul_mul: mkStage('s4b_soul_mul', 'Mul — ソウル'),
        s4c_bd_mul: mkStage('s4c_bd_mul', 'Mul — BD (戦闘時)'),
        s5a_other_add: mkStage('s5a_other_add', 'Add — chara/crystal/bg/魔装…'),
        s5b_soul_add: mkStage('s5b_soul_add', 'Add — ソウル'),
        s5c_bd_add: mkStage('s5c_bd_add', 'Add — BD (戦闘時)'),
        s6_enemy_break: mkStage('s6_enemy_break', 'Enemy Break (step48/49)'),
        s7_inline3: mkStage('s7_inline3', '敵BK inline ×3 (step51)'),
        s7b_ceil: mkStage('s7b_ceil', '出口 ceil'),
        s_hp_fold: mkStage('s_hp_fold', 'HP server-fold (逐 effect 顺序)'),
      }
    : null;

  // LP tier 倍率: 按 isBlaze 选表 (unpacking §3.5)、只乘 Attack
  const lpTier = isBlaze ? LP_TIER_BLAZE : LP_TIER_NORMAL;
  const lpMult = lpTier[tr.lp] || 1;
  // step 51 inline ×3: enemy.bk=true 时 Total ×= 3 (跟 step 48/49 独立 gate)
  const enemyBkX3 = !!(ctx?.enemy?.bk);

  // applyStaged 对每个 stat 跑 (LP / inline×3 只影响 Attack、其他 stat 传 opts={})
  const optsAtk = { lpMult, enemyBkX3, traceStages, statLabel: '攻撃力' };
  const stats = {
    // HP / HitCount 走战前 server-fold (orderServerFold 顺序逐 effect)、不走 EAD 分组 pipeline。
    // 攻撃力/防御力/ブレイク力 仍走 applyStaged (in-battle EAD §3.3、Mul-then-Add 分组是逆向实证的真实顺序)。
    HP: serverFoldHP(base.HP, effects, slotIdx, { traceStages }),
    Attack: applyStaged(base.Attack, 'Attack', effects, optsAtk),
    Defense: applyStaged(base.Defense, 'Defense', effects, { traceStages, statLabel: '防御力' }),
    GuardBreak: applyStaged(base.GuardBreak, 'GuardBreak', effects, { traceStages, statLabel: 'ブレイク力' }),
  };

  // Phase 6.13: enemy bar 硬编码倍率 (element matchup / difficulty / bkRes / advWeapons / bd_cap)
  // guildTitle/emblems 已通过 collectEffects 走 stage 3/4、这里只处理硬编码字段
  const stEnemyMods = mkStage('s8_enemy_mods', '敵 mods (相性/難度等)');
  const enemyMods = _computeEnemyMods(chara, tr, ctx);
  if (enemyMods.attackMul !== 1) {
    const b = stats.Attack;
    stats.Attack = Math.ceil(stats.Attack * enemyMods.attackMul);
    if (stEnemyMods) {
      // 逐因子链式 (中间不 ceil、最后一步 after = ceil 后实际值)
      const parts = enemyMods.parts.filter((p) => p.attackMul !== 1);
      let cur = b;
      parts.forEach((p, idx) => {
        const before = cur;
        cur = idx === parts.length - 1 ? stats.Attack : cur * p.attackMul;
        stEnemyMods.steps.push({ src: p.label, stat: '攻撃力', op: 'mul', val: p.attackMul, before, after: cur });
      });
    }
  }
  if (enemyMods.bkMul !== 1) {
    const b = stats.GuardBreak;
    stats.GuardBreak = Math.ceil(stats.GuardBreak * enemyMods.bkMul);
    if (stEnemyMods) {
      const parts = enemyMods.parts.filter((p) => p.bkMul !== 1);
      let cur = b;
      parts.forEach((p, idx) => {
        const before = cur;
        cur = idx === parts.length - 1 ? stats.GuardBreak : cur * p.bkMul;
        stEnemyMods.steps.push({ src: p.label, stat: 'ブレイク力', op: 'mul', val: p.bkMul, before, after: cur });
      });
    }
  }
  const stHits = mkStage('s9_hits', 'Hit 補正');
  const stDLimit = mkStage('s10_damage_limit', 'ダメ上限 fold');
  const speed = _computeSpeed(chara, tr, slotIdx, ctx, effects, base, mkStage('s11_speed', '転速 (Speed)'));
  const motionSpeed = _computeMotionSpeed(chara, tr, effects, trace, mkStage('s12_motion', '攻速 (MotionSpeed)'));

  // hits 逐段独立 (unpacking §17.3 / v1 main:js/stats-calc.js L556-576)
  //   newHit_i = max(1, floor(base[i] × Π PSV_Mul_i + Σ PSV_Add_i))
  //   PSV 池 = chara_skill/crystal/bg/soul/omoide/omoide_mul/masou 的 HitCount/AttackCount effect
  //   BSV 池 = bd_on=true 时 bd_skill.effects 内对应 effect
  //   每 effect 的 _stages[i] 决定第 i 段 add/mul 的值
  const cMaster = chara._master;
  const stateData = cMaster?.states?.[tr.state] || Object.values(cMaster?.states || {})[0];
  const baseHits = Array.isArray(stateData?.hit_counts) ? stateData.hit_counts.slice(0, 3) : [0, 0, 0];
  while (baseHits.length < 3) baseHits.push(0);
  if (trace) trace.hitsBase = baseHits.slice();
  // hits 战前 server-fold (serverFoldHitCount: orderServerFold 顺序 + 每步 trunc + 每步 clamp ≥1、
  // unpacking 17_hitcount.md §17.2.1/§17.8.3、2026-06-19 用户确认替代旧 Mul-then-Add 分组)
  const hits = serverFoldHitCount(baseHits, effects, slotIdx, stHits);
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
    const b = damageLimit;
    if (e.math_type === 'Multiply') damageLimit *= v;
    else if (e.math_type === 'Addition') damageLimit += v;
    else continue;
    if (stDLimit) {
      stDLimit.steps.push({
        src: traceSrcLabel(e), stat: 'ダメ上限',
        op: e.math_type === 'Multiply' ? 'mul' : 'add', val: v, before: b, after: damageLimit,
      });
    }
  }
  {
    const b = damageLimit;
    damageLimit = Math.floor(damageLimit);
    if (stDLimit && damageLimit !== b) {
      stDLimit.steps.push({ src: 'floor', stat: 'ダメ上限', op: 'floor', val: null, before: b, after: damageLimit });
    }
  }

  // bdCapMax: BD ゲージ上限 max 計算 (简化、不沿用 wiki 旧 -1 / mul 累加设计)
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
    trace,
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
function _computeSpeed(chara, tr, slotIdx, ctx, effects, base, traceStage = null) {
  const recover = base.Speed;
  let mulAcc = 1;
  let addAcc = 0;
  // trace 链 (实际计算保持 fold 不动、链是等价重演: recover → ×mul... → ×partner → +add...)
  let tCur = recover;
  for (const e of effects) {
    if (e.base_parameter !== 'Speed') continue;
    if (e._source === 'enemy_break') continue;  // Enemy_BreakSpeed 不进 Speed 池 (master 无数据)
    const cf = e.condition_factor ?? 1;
    // 跟 applyStaged 公式一致: Mul 用 1+(v-1)×cf 渐进激活、Add 直接 ×cf
    if (e.math_type === 'Multiply') {
      const f = 1 + (e.value - 1) * cf;
      mulAcc *= f;
      if (traceStage && f !== 1) {
        const b = tCur;
        tCur *= f;
        traceStage.steps.push({ src: traceSrcLabel(e), stat: '転速', op: 'mul', val: f, before: b, after: tCur });
      }
    }
  }
  const team = ctx?.team || [];
  const slot = team[slotIdx];
  const partnerLv = slot?.soul != null ? (+tr.soul_lv || 0) : 0;
  const partnerFactor = partnerLv / 100 + 1;
  if (traceStage && partnerFactor !== 1) {
    const b = tCur;
    tCur *= partnerFactor;
    traceStage.steps.push({ src: `ソウル partner (lv${partnerLv}/100+1)`, stat: '転速', op: 'mul', val: partnerFactor, before: b, after: tCur });
  }
  for (const e of effects) {
    if (e.base_parameter !== 'Speed') continue;
    if (e._source === 'enemy_break') continue;
    const cf = e.condition_factor ?? 1;
    if (e.math_type === 'Addition') {
      const a = e.value * cf;
      addAcc += a;
      if (traceStage && a !== 0) {
        const b = tCur;
        tCur += a;
        traceStage.steps.push({ src: traceSrcLabel(e), stat: '転速', op: 'add', val: a, before: b, after: tCur });
      }
    }
  }
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
function _computeMotionSpeed(chara, tr, effects, trace = null, traceStage = null) {
  const cMaster = chara?._master;
  const stateData = cMaster?.states?.[tr.state] || Object.values(cMaster?.states || {})[0];
  const ms = [
    +stateData?.motion_speed || 0,
    +stateData?.motion_speed2 || 0,
    +stateData?.motion_speed3 || 0,
  ];
  if (trace) trace.motionBase = ms.slice();
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
  // trace 链 (等价重演、3 段各自: ms_i → ×mul... → +add...; 段 base=0 跳过)
  if (traceStage) {
    ms.forEach((mBase, i) => {
      if (!mBase) return;
      const stat = `攻速${i + 1}`;
      let tCur = mBase;
      for (const e of effects) {
        if (e.base_parameter !== 'MotionSpeed') continue;
        const cf = e.condition_factor ?? 1;
        if (e.math_type === 'Multiply') {
          const f = 1 + (e.value - 1) * cf;
          if (f === 1) continue;
          const b = tCur;
          tCur *= f;
          traceStage.steps.push({ src: traceSrcLabel(e), stat, op: 'mul', val: f, before: b, after: tCur });
        }
      }
      for (const e of effects) {
        if (e.base_parameter !== 'MotionSpeed') continue;
        const cf = e.condition_factor ?? 1;
        if (e.math_type === 'Addition') {
          const a = e.value * cf;
          if (a === 0) continue;
          const b = tCur;
          tCur += a;
          traceStage.steps.push({ src: traceSrcLabel(e), stat, op: 'add', val: a, before: b, after: tCur });
        }
      }
    });
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
  const parts = [];   // trace 用: 各因子明细 [{label, attackMul, bkMul}]

  // #1 element matchup (全局)
  const elemMult = elementMatchupMult(charaElem, enemy.element, mode);
  attackMul *= elemMult;
  bkMul *= elemMult;
  if (elemMult !== 1) parts.push({ label: '属性相性', attackMul: elemMult, bkMul: elemMult });

  // #4 bkResistance × bk (bk gate)
  // 注: 普通 BK ×3 已在 stage 7 inline ×3 完成 (unpacking §3.10 step 51)、不重复
  // 这里只处理 ギルバト high resistance 额外 ×2 (升级 normal ×3 → ×6、跟 wiki main L971 一致)
  if (enemy.bk && isGuildMode && enemy.bkResistance === 'high') {
    const f = BK_RES_MULT.high / BK_RES_MULT.normal;  // 6/3 = 2 (额外倍率)
    attackMul *= f;
    parts.push({ label: 'BK耐性 high (×6/×3)', attackMul: f, bkMul: 1 });
  }

  // #3 difficulty (isGuildMode-gated)
  if (isGuildMode) {
    const f = DIFFICULTY_MULT[enemy.difficulty] ?? 1.0;
    attackMul *= f;
    if (f !== 1) parts.push({ label: `難度 (${enemy.difficulty})`, attackMul: f, bkMul: 1 });
  }

  // #5 advantageWeapons (isGuildMode-gated)
  if (isGuildMode && charaWeap != null && enemy.advantageWeapons?.has?.(charaWeap)) {
    attackMul *= ADVANTAGE_WEAPON_MULT;
    parts.push({ label: '有利武器', attackMul: ADVANTAGE_WEAPON_MULT, bkMul: 1 });
  }

  // #8 bd_cap (全局)
  const bdMult = bdCapMult(enemy.bd_cap);
  attackMul *= bdMult;
  if (bdMult !== 1) parts.push({ label: `BD cap (lv${enemy.bd_cap})`, attackMul: bdMult, bkMul: 1 });

  return { attackMul, bkMul, parts };
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
