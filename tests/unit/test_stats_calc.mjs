// tests/unit/test_stats_calc.mjs — Phase 6.1 4-stage 公式单测
// 跑: node --test tests/unit/test_stats_calc.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import {
  computeStats,
  computeStatsBlaze,
  baseStats,
  applyStaged,
  collectEffects,
  orderServerFold,
  conditionFactor,
  baseParameter,
  repelRate,
  mkTr,
  mpRate,
  AWAKENING_MAX,
  AWAKENING_FULL_MULT,
} from '../../shared/stats-calc.js';
import { soulMultiplier, soulLvCap } from '../../shared/hensei-helpers.js';

// ============================================================
// mock helpers
// ============================================================
function mockChara(over = {}) {
  const m = {
    id: 1001, name: 'TEST', rarity: 4,
    element_id: 1, weapon_type_id: 1,
    tags: [], omoide: [],
    states: {
      '通常': {
        stats: {
          initial_hp: 6000, max_hp: 15000,
          initial_attack: 5000, max_attack: 13000,
          initial_defense: 2000, max_defense: 5000,
          initial_break: 400, max_break: 1000,
          initial_speed: 9, max_speed: 22,
          max_mature: 60, initial_max_level: 60, max_max_level: 250, max_lp: 9,
          initial_slot: 3,
        },
        weapon_skills: [],
        hit_counts: [3, 3, 14],
      },
    },
    bd_skill: { effects: [] },
    ...over,
  };
  return { _master: m, id: m.id, name: m.name };
}
function mockSoul(over = {}) {
  const m = {
    id: 100, name: 'TEST_SOUL', rarity: 5, max_level: 10,
    skills: [], element_affinity: {}, weapon_affinity: {},
    ...over,
  };
  return { _master: m, id: m.id, name: m.name };
}
function mockCrystal(over = {}) {
  const m = {
    id: 200, name: 'TEST_CR', rarity: 5, parameter: 'Attack', math_type: 'Multiply',
    initial_value: 1.01, max_value: 1.30, max_level: 20,
    element_id: 0, weapon_type_id: 0, conditional_parameter: false,
    ...over,
  };
  return { _master: m, id: m.id, name: m.name };
}
function mockBg(over = {}) {
  const m = {
    id: 300, name: 'TEST_BG', rarity: 5,
    skills: [],
    ...over,
  };
  return { _master: m, _skills: m.skills, id: m.id, name: m.name };
}
function mockMasou(over = {}) {
  return {
    id: 400, name: 'TEST_MASOU', effects: [],
    ...over,
  };
}

function buildCtx(slots, opts = {}) {
  // slots: [{chara: charaObj | null, soul, bg, masou, crystals: [{id, lv}, ...], tr}]
  // opts.enemy, opts.allGuildTitles, opts.allGuildEmblems — Phase 6.13 enemy mods 用
  const allCharas = slots.filter((s) => s?.chara).map((s) => s.chara);
  const allSouls = slots.filter((s) => s?.soul).map((s) => s.soul);
  const allBGs = slots.filter((s) => s?.bg).map((s) => s.bg);
  const allMasou = slots.filter((s) => s?.masou).map((s) => s.masou);
  const allCrystals = [];
  slots.forEach((s) => (s?.crystals || []).forEach((c) => c && allCrystals.push(c.obj)));
  const team = slots.map((s) => ({
    chara: s?.chara?.id ?? null,
    soul: s?.soul?.id ?? null,
    bg: s?.bg?.id ?? null,
    masou: s?.masou?.id ?? null,
    crystals: (s?.crystals || []).map((c) => c ? { id: c.obj.id, lv: c.lv ?? 1 } : null),
    tr: s?.tr || mkTr(),
  }));
  return {
    team, allCharas, allSouls, allBGs, allMasou, allCrystals,
    allGuildTitles: opts.allGuildTitles || [],
    allGuildEmblems: opts.allGuildEmblems || [],
    enemy: opts.enemy || { element: 0, bk: false },
  };
}

// ============================================================
// 1. baseParameter — HP-curve prefix strip
// ============================================================
test('baseParameter strip HP-curve prefix', () => {
  assert.strictEqual(baseParameter('Attack'), 'Attack');
  assert.strictEqual(baseParameter('Vitality_Attack'), 'Attack');
  assert.strictEqual(baseParameter('RemHP_Defense'), 'Defense');
  assert.strictEqual(baseParameter('Break_Attack'), 'Attack');
  assert.strictEqual(baseParameter('FellDown_Speed'), 'Speed');
  assert.strictEqual(baseParameter('Enemy_BreakAttack'), 'Attack');
});

// ============================================================
// 2. conditionFactor — HP-curve / Break / FellDown / Enemy_Break
// ============================================================
test('conditionFactor: 通常 parameter → 1', () => {
  assert.strictEqual(conditionFactor('Attack', 100, false, false), 1);
  assert.strictEqual(conditionFactor('Defense', 50, false, false), 1);
});
test('conditionFactor: Vitality_* = hp/100', () => {
  assert.strictEqual(conditionFactor('Vitality_Attack', 100, false, false), 1);
  assert.strictEqual(conditionFactor('Vitality_Attack', 50, false, false), 0.5);
  assert.strictEqual(conditionFactor('Vitality_Attack', 0, false, false), 0);
});
test('conditionFactor: RemHP_* = (100-hp)/100', () => {
  assert.strictEqual(conditionFactor('RemHP_Attack', 100, false, false), 0);
  assert.strictEqual(conditionFactor('RemHP_Attack', 30, false, false), 0.7);
  assert.strictEqual(conditionFactor('RemHP_Attack', 0, false, false), 1);
});
test('conditionFactor: Break_* hard gate at hp<=50 (含等号、unpacking §2.3 IsBreak = HpRate ≤ 0.5)', () => {
  assert.strictEqual(conditionFactor('Break_Attack', 49, false, false), 1);
  assert.strictEqual(conditionFactor('Break_Attack', 50, false, false), 1);   // 50 也算破損
  assert.strictEqual(conditionFactor('Break_Attack', 51, false, false), 0);
  assert.strictEqual(conditionFactor('Break_Attack', 100, false, false), 0);
});
test('conditionFactor: FellDown_* hard gate', () => {
  assert.strictEqual(conditionFactor('FellDown_Attack', 100, true, false), 1);
  assert.strictEqual(conditionFactor('FellDown_Attack', 100, false, false), 0);
});
test('conditionFactor: Enemy_Break* hard gate', () => {
  assert.strictEqual(conditionFactor('Enemy_BreakAttack', 100, false, true), 1);
  assert.strictEqual(conditionFactor('Enemy_BreakAttack', 100, false, false), 0);
});

// ============================================================
// 3. applyStaged — 4-stage 公式
// ============================================================
test('applyStaged: empty effects → base 不变 (但 ceil)', () => {
  const v = applyStaged(10000, 'Attack', []);
  assert.strictEqual(v, 10000);
});
test('applyStaged: omoide Add (stage 1)', () => {
  const eff = [{ _source: 'omoide', base_parameter: 'Attack', math_type: 'Addition', value: 500, condition_factor: 1 }];
  // base 10000 + 500 = 10500、floor 10500、no other → ceil 10500
  assert.strictEqual(applyStaged(10000, 'Attack', eff), 10500);
});
test('applyStaged: masou Add + Mul (stage 2 floor)', () => {
  const eff = [
    { _source: 'masou', base_parameter: 'Attack', math_type: 'Addition', value: 100, condition_factor: 1 },
    { _source: 'masou', base_parameter: 'Attack', math_type: 'Multiply', value: 1.5, condition_factor: 1 },
  ];
  // 10000 + 100 = 10100、×1.5 = 15150、floor 15150、ceil 15150
  assert.strictEqual(applyStaged(10000, 'Attack', eff), 15150);
});
test('applyStaged: masou 静的 Mul 走 s2b、server-fold floor 在后 (2026-06-10)', () => {
  // base 1001 × 1.5 = 1501.5 → s2c floor → 1501 (floor 在 mul 后、ceil 前)
  const eff = [
    { _source: 'masou', parameter: 'Attack', base_parameter: 'Attack', math_type: 'Multiply', value: 1.5, condition_factor: 1 },
  ];
  assert.strictEqual(applyStaged(1001, 'Attack', eff), 1501);
});
test('applyStaged: masou HP-curve (Vitality_) 走 s4a 非 s2b — floor 时机可区分', () => {
  // Vitality_Attack 是 client 动态、不能 server-fold:
  //   s2c floor(1001)=1001 → s4a ×1.5 = 1501.5 → 出口 ceil 1502 (若误入 s2b 会 floor 成 1501)
  const eff = [
    { _source: 'masou', parameter: 'Vitality_Attack', base_parameter: 'Attack', math_type: 'Multiply', value: 1.5, condition_factor: 1 },
  ];
  assert.strictEqual(applyStaged(1001, 'Attack', eff), 1502);
});
test('applyStaged: chara_skill Mul (stage 3)', () => {
  const eff = [{ _source: 'chara_skill', base_parameter: 'Attack', math_type: 'Multiply', value: 1.2, condition_factor: 1 }];
  // 10000 × 1.2 = 12000
  assert.strictEqual(applyStaged(10000, 'Attack', eff), 12000);
});
test('applyStaged: chara_skill Add (stage 4)', () => {
  const eff = [{ _source: 'chara_skill', base_parameter: 'Attack', math_type: 'Addition', value: 300, condition_factor: 1 }];
  assert.strictEqual(applyStaged(10000, 'Attack', eff), 10300);
});
test('applyStaged: 4 stage 全配 + floor 后 stage 3 mul', () => {
  const eff = [
    { _source: 'omoide', base_parameter: 'Attack', math_type: 'Addition', value: 500, condition_factor: 1 },
    { _source: 'masou', base_parameter: 'Attack', math_type: 'Addition', value: 100, condition_factor: 1 },
    { _source: 'masou', base_parameter: 'Attack', math_type: 'Multiply', value: 1.1, condition_factor: 1 },
    { _source: 'crystal', base_parameter: 'Attack', math_type: 'Multiply', value: 1.3, condition_factor: 1 },
    { _source: 'soul', base_parameter: 'Attack', math_type: 'Addition', value: 200, condition_factor: 1 },
  ];
  // base 10000
  // + 500 (omoide Add) = 10500
  // + 100 (masou Add) = 10600
  // × 1.1 (masou Mul) = 11660
  // floor → 11660
  // × 1.3 (crystal Mul) = 15158
  // + 200 (soul Add) = 15358
  // ceil → 15358
  assert.strictEqual(applyStaged(10000, 'Attack', eff), 15358);
});
test('applyStaged: condition_factor 衰减 Mul (stage 3)', () => {
  // Vitality_Attack ×1.5、hp=50 → factor=0.5 → effective ×1.25
  const eff = [{
    _source: 'chara_skill', base_parameter: 'Attack',
    math_type: 'Multiply', value: 1.5, condition_factor: 0.5,
  }];
  // 10000 × (1 + (1.5-1) × 0.5) = 10000 × 1.25 = 12500
  assert.strictEqual(applyStaged(10000, 'Attack', eff), 12500);
});
test('applyStaged: 多 mul 累乘 (stage 3)', () => {
  const eff = [
    { _source: 'crystal', base_parameter: 'Attack', math_type: 'Multiply', value: 1.2, condition_factor: 1 },
    { _source: 'bg', base_parameter: 'Attack', math_type: 'Multiply', value: 1.1, condition_factor: 1 },
  ];
  // 10000 × 1.2 × 1.1 = 13200
  assert.strictEqual(applyStaged(10000, 'Attack', eff), 13200);
});
test('applyStaged: filter by base_parameter (不同 stat 不串)', () => {
  const eff = [
    { _source: 'chara_skill', base_parameter: 'Defense', math_type: 'Multiply', value: 2, condition_factor: 1 },
  ];
  assert.strictEqual(applyStaged(10000, 'Attack', eff), 10000);
});

// ============================================================
// 4. repelRate — 独立通道
// ============================================================
test('repelRate: sum Repel_Percent、cap 100', () => {
  const eff = [
    { _source: 'soul', base_parameter: 'Mez', math_type: 'Repel_Percent', value: 50, condition_factor: 1 },
    { _source: 'crystal', base_parameter: 'Mez', math_type: 'Repel_Percent', value: 70, condition_factor: 1 },
  ];
  assert.strictEqual(repelRate(eff, 'Mez'), 100);  // cap
});
test('repelRate: 50 + 30 = 80', () => {
  const eff = [
    { _source: 'soul', base_parameter: 'Mez', math_type: 'Repel_Percent', value: 50, condition_factor: 1 },
    { _source: 'crystal', base_parameter: 'Mez', math_type: 'Repel_Percent', value: 30, condition_factor: 1 },
  ];
  assert.strictEqual(repelRate(eff, 'Mez'), 80);
});

// ============================================================
// 5. baseStats — lv × 熟度 × 觉醒
// ============================================================
test('baseStats: lv 1 jukudo 1 awakening 0 → initial', () => {
  const c = mockChara();
  const tr = { ...mkTr(), state: '通常', level: 1, jukudo: 1, awakening: 0 };
  const b = baseStats(c, tr);
  // 用户决策公式 (lerp):
  //   base = initial + (max - initial) × (lv - 1) / (max_max_level - 1)
  //   lv=1 → initial、lv=max_max_level → max
  // 攻撃力 lv=1: 5000 + (13000-5000) × 0/249 = 5000
  assert.strictEqual(b.Attack, 5000);
});
test('baseStats: lv max_max jukudo high → max', () => {
  const c = mockChara();
  const tr = { ...mkTr(), state: '通常', level: 250, jukudo: 60, awakening: 0 };
  const b = baseStats(c, tr);
  // lv = 250 = max_max、base = max - 0 = 13000
  // jukudo 60 → cap = min(250, 60 + 59*5) = min(250, 355) = 250
  assert.strictEqual(b.Attack, 13000);
});
test('baseStats: awakening 满 → ×AWAKENING_FULL_MULT', () => {
  const c = mockChara();
  const awkMax = AWAKENING_MAX[4]; // SS=9
  const tr = { ...mkTr(), state: '通常', level: 250 + awkMax * 5, jukudo: 60, awakening: awkMax };
  const b = baseStats(c, tr);
  // base at cap 250: 13000、then awk 满 ×1.43 = 18590
  const expected = 13000 * AWAKENING_FULL_MULT[4];
  assert.ok(Math.abs(b.Attack - expected) < 1, `expected ~${expected}, got ${b.Attack}`);
});

// ============================================================
// 6. computeStats 集成 — chara + soul + crystal effect 全走完
// ============================================================
test('computeStats: chara base only', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.ok(r);
  assert.strictEqual(r.stats['攻撃力'], 13000);
  assert.strictEqual(r.stats['HP'], 15000);
});
test('computeStats: chara + crystal Attack ×1.30', () => {
  const c = mockChara();
  const cr = mockCrystal({ parameter: 'Attack', math_type: 'Multiply', initial_value: 1.30, max_value: 1.30, max_level: 1 });
  const slots = [{
    chara: c, crystals: [{ obj: cr, lv: 1 }],
    tr: { ...mkTr(), level: 250, jukudo: 60 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000 × 1.30 = 16900
  assert.strictEqual(r.stats['攻撃力'], 16900);
});
test('computeStats: chara_meta marriage ×1.05', () => {
  const c = mockChara();
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, marriage: 2 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000 × 1.05 = 13650
  assert.strictEqual(r.stats['攻撃力'], 13650);
});
test('computeStats: chara_meta LP 危機 ×1.5', () => {
  const c = mockChara();
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, lp: 2 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000 × 1.5 = 19500
  assert.strictEqual(r.stats['攻撃力'], 19500);
});
test('computeStats: chara_meta 燃心 + LP 累乘', () => {
  const c = mockChara();
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, moeshin: true, lp: 1 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000 × 1.3 (燃心) × 1.1 (LP=1) = 18590
  assert.strictEqual(r.stats['攻撃力'], 18590);
});
test('computeStats: BD ON → bd_skill.effects 加入', () => {
  const c = mockChara({
    bd_skill: {
      effects: [
        { parameter: 'Attack', math_type: 'Multiply', value: 50, value_scaling: 0, range: 'All' },
      ],
    },
  });
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, bd_on: true },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000 × 50 = 650000
  assert.strictEqual(r.stats['攻撃力'], 650000);
});
test('computeStats: BD OFF → bd_skill.effects 不加', () => {
  const c = mockChara({
    bd_skill: {
      effects: [
        { parameter: 'Attack', math_type: 'Multiply', value: 50, value_scaling: 0, range: 'All' },
      ],
    },
  });
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, bd_on: false },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.stats['攻撃力'], 13000);
});
test('computeStats: HP-curve Vitality_Attack hp=50 → ×0.5 衰减', () => {
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        weapon_skills: [{
          parameter: 'Vitality_Attack', math_type: 'Multiply', value: 2, value_scaling: 0, range: 'Single',
        }],
      },
    },
  });
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, hp: 50 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // Vitality_Attack ×2、hp=50 → factor=0.5 → effective 1 + (2-1)×0.5 = 1.5
  // base 13000 × 1.5 = 19500
  assert.strictEqual(r.stats['攻撃力'], 19500);
});

// ============================================================
// 7. soul lv 公式 (v1 sourceMult、用户决策)
// ============================================================
test('soulMultiplier: 5★ Lv1 → 1.01', () => {
  assert.strictEqual(soulMultiplier(5, 1), 1.01);
});
test('soulMultiplier: 5★ Lv50 (maxNoAwk) → 1.5', () => {
  assert.strictEqual(soulMultiplier(5, 50), 1.5);
});
test('soulMultiplier: 5★ Lv75 (满觉醒) → 1.8', () => {
  const v = soulMultiplier(5, 75);
  assert.ok(Math.abs(v - 1.8) < 1e-9, `expected 1.8, got ${v}`);
});
test('soulMultiplier: 4★ Lv75 → 1.5', () => {
  const v = soulMultiplier(4, 75);
  assert.ok(Math.abs(v - 1.5) < 1e-9, `expected 1.5, got ${v}`);
});
test('soulLvCap: 4★ max_level=10 awakening 5 → 35; awakening 7 (rarity max) → 45', () => {
  assert.strictEqual(soulLvCap({ rarity: 4, max_level: 10 }, 5), 35);
  assert.strictEqual(soulLvCap({ rarity: 4, max_level: 10 }, 7), 45);
});
test('soulLvCap: 1★ max_level=10 awakening 13 (max) → 75 (hard cap)', () => {
  assert.strictEqual(soulLvCap({ rarity: 1, max_level: 10 }, 13), 75);
});

test('computeStats: soul effect × sourceMult (Mul 一刀切)', () => {
  const c = mockChara();
  // soul rarity 5、max_level 10、Lv 50 (maxNoAwk) → sourceMult = 1.5
  const s = mockSoul({
    rarity: 5, max_level: 10,
    skills: [
      { parameter: 'Attack', math_type: 'Multiply', value: 2.0, value_scaling: 0, range: 'All', element_condition: 0, weapon_type_condition: 0 },
    ],
  });
  const slots = [{
    chara: c, soul: s,
    tr: { ...mkTr(), level: 250, jukudo: 60, soul_lv: 50 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // soul effect.value (2) × sourceMult (1.5) = 3.0
  // base 13000 × 3.0 = 39000
  assert.strictEqual(r.stats['攻撃力'], 39000);
});

// ============================================================
// 8. LP 4 档 (unpacking §3.8)
// ============================================================
test('LP tier 3 (lp=0 残血) 普通 → ×2.0', () => {
  const c = mockChara();
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, lp: 3 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000 × 2.0 = 26000
  assert.strictEqual(r.stats['攻撃力'], 26000);
});
test('LP tier 3 + bd_on → 仍用普通表 ×2.0 (hensei 算普通攻击、不切 Blaze)', () => {
  const c = mockChara();
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, lp: 3, bd_on: true },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000 × 2.0 = 26000 (bd_on 不切表、永远普通表)
  assert.strictEqual(r.stats['攻撃力'], 26000);
});

// ============================================================
// 9. HitCount 逐段 (unpacking §17.3)
// ============================================================
test('HitCount Add: 全段 +5 → 每段 +5、其他段 0 不参与', () => {
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        hit_counts: [3, 3, 14],
        weapon_skills: [
          { parameter: 'HitCount', math_type: 'Addition', value: 5, value_scaling: 0, range: 'Single' },
        ],
      },
    },
  });
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // 每段都 +5: [3+5, 3+5, 14+5] = [8, 8, 19]
  assert.deepStrictEqual(r.hits, [8, 8, 19]);
});
test('HitCount Mul ×2 → 每段 ×2', () => {
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        hit_counts: [3, 3, 14],
        weapon_skills: [
          { parameter: 'HitCount', math_type: 'Multiply', value: 2, value_scaling: 0, range: 'Single' },
        ],
      },
    },
  });
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.deepStrictEqual(r.hits, [6, 6, 28]);
});
test('HitCount values [0, 2, 0] → 只 2撃目 +2', () => {
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        hit_counts: [3, 3, 14],
        weapon_skills: [
          { parameter: 'HitCount', math_type: 'Addition', value: 0, value_scaling: 0, values: [0, 2, 0], range: 'Single' },
        ],
      },
    },
  });
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.deepStrictEqual(r.hits, [3, 5, 14]);
});
test('HitCount base 0 段不参与 (1 段攻击 chara)', () => {
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        hit_counts: [10, 0, 0],
        weapon_skills: [
          { parameter: 'HitCount', math_type: 'Addition', value: 3, value_scaling: 0, range: 'Single' },
        ],
      },
    },
  });
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // 段 0: 10+3=13、段 1/2: 0 不参与
  assert.deepStrictEqual(r.hits, [13, 0, 0]);
});

// ============================================================
// 10. omoide Mul → stage 3 (用户决策)
// ============================================================
test('omoide Add → stage 1、Mul → stage 3 (用户 picks 2 slot)', () => {
  // 模拟 2 omoide slot、用户在 picker 各选 1 个 (Add slot 0、Mul slot 1)
  // 用户决策: 1 slot 1 effect、stats-calc 读 trSlot.omoide_picks = { slotIdx: skillId }
  const c = mockChara();
  c._omoide_slots = [
    {
      affection_threshold: 10,
      weapon_skills: [
        { id: 901, parameter: 'Attack', math_type: 'Addition', value: 500, range: 'Single' },
      ],
    },
    {
      affection_threshold: 20,
      weapon_skills: [
        { id: 902, parameter: 'Attack', math_type: 'Multiply', value: 1.5, range: 'Single' },
      ],
    },
  ];
  const slots = [{
    chara: c,
    tr: { ...mkTr(), level: 250, jukudo: 60, affinity: 100, omoide_picks: { 0: 901, 1: 902 } },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000
  // stage 1 omoide Add (slot 0 picked 901): +500 → 13500
  // stage 2 (无 masou): 13500、floor 13500
  // stage 3 other Mul (slot 1 picked 902、omoide_mul): ×1.5 = 20250
  // stage 4 (无 Add): 20250、ceil 20250
  assert.strictEqual(r.stats['攻撃力'], 20250);
});

test('omoide picks 为空 → 不激活任何 omoide buff', () => {
  // 同样的 _omoide_slots、但 tr.omoide_picks 空 → stat = base 13000
  const c = mockChara();
  c._omoide_slots = [
    { affection_threshold: 10, weapon_skills: [{ id: 901, parameter: 'Attack', math_type: 'Addition', value: 500 }] },
  ];
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, affinity: 100 },  // 无 omoide_picks
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.stats['攻撃力'], 13000);
});

test('omoide picks 解锁 gated by affection', () => {
  // affection_threshold > tr.affinity → 即使 pick 了也不激活
  const c = mockChara();
  c._omoide_slots = [
    { affection_threshold: 5000, weapon_skills: [{ id: 901, parameter: 'Attack', math_type: 'Addition', value: 500 }] },
  ];
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, affinity: 100, omoide_picks: { 0: 901 } },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // affinity 100 < threshold 5000、slot 锁定 → 不激活
  assert.strictEqual(r.stats['攻撃力'], 13000);
});

test('omoide scaling fallback: description 含「熟度」 + value_scaling 空 → 0.003 × jukudo Mul (用户决策、不减 1)', () => {
  // 用户实测: Frida 抓 value_scaling 全空、description 含「熟度UP...」时 真值 = 0.003 / jukudo
  // 公式 jukudo 不减 1 (jukudo=1 时也有 0.003 加成)
  const c = mockChara();
  c._omoide_slots = [
    {
      affection_threshold: 0,
      weapon_skills: [
        {
          id: 901, parameter: 'Attack', math_type: 'Multiply', value: 1.5, value_scaling: null,
          description: '攻撃力UP【熟度UPにつれてさらに効果値UP】', range: 'Single',
        },
      ],
    },
  ];
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, affinity: 90000, omoide_picks: { 0: 901 } },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000 (Attack 满)
  // omoide Mul effect: value = 1.5 + 0.003 × 60 = 1.68 (jukudo 不减 1)
  // stage 3 (omoide_mul → other Mul): 13000 × 1.68 = 21840
  assert.strictEqual(r.stats['攻撃力'], 21840);
});

test('omoide scaling fallback: jukudo=1 也加 0.003 (公式 jukudo 不减 1、验证边界)', () => {
  const c = mockChara();
  c._omoide_slots = [
    {
      affection_threshold: 0,
      weapon_skills: [
        {
          id: 901, parameter: 'Attack', math_type: 'Addition', value: 1000, value_scaling: null,
          description: 'パッシブ【熟度UPにつれて...】', range: 'Single',
        },
      ],
    },
  ];
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 1, jukudo: 1, affinity: 90000, omoide_picks: { 0: 901 } },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base Attack at lv 1 jukudo 1 awakening 0 (新 lerp 公式):
  //   _baseStatRaw(initial=5000, max=13000, max_max=250, lv=1, cap=60, rarity=4):
  //     t = (1-1) / (250-1) = 0
  //     base = 5000 + (13000-5000) × 0 = 5000
  //   floor → 5000
  // omoide Add scaling fallback: value = 1000 + 0.003 × 1 = 1000.003 (jukudo 不减 1、验证 jukudo=1 时也加 0.003)
  // stage 1 omoide Add: 5000 + 1000.003 = 6000.003
  // stage 2 終 server-fold floor (2026-06-10 用户确认: base+omoide+masou 都是 server 算、返回整数) → 6000
  assert.strictEqual(r.stats['攻撃力'], 6000);
});

test('omoideEffectiveScaling helper: description 含「熟度」+ scaling null → 0.003', async () => {
  const { omoideEffectiveScaling } = await import('../../shared/hensei-helpers.js');
  assert.strictEqual(omoideEffectiveScaling({ value_scaling: null, description: '熟度UPで効果値UP' }), 0.003);
  assert.strictEqual(omoideEffectiveScaling({ value_scaling: 0, description: '熟度' }), 0.003);
  // 真值优先 (Frida 重抓后)
  assert.strictEqual(omoideEffectiveScaling({ value_scaling: 0.008, description: '熟度' }), 0.008);
  // 无熟度描述 → 0
  assert.strictEqual(omoideEffectiveScaling({ value_scaling: 0, description: '攻撃力UP' }), 0);
  assert.strictEqual(omoideEffectiveScaling({ value_scaling: null, description: '' }), 0);
  // 空 sk
  assert.strictEqual(omoideEffectiveScaling(null), 0);
});

// ============================================================
// 11. Stage 5: Enemy_Break (unpacking §3.7 step 47/48)
// ============================================================
test('computeStats: Enemy_BreakAttack Mul ×2、enemy.bk=true → Attack ×2 (stage 5 单独)', () => {
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        weapon_skills: [
          { parameter: 'Enemy_BreakAttack', math_type: 'Multiply', value: 2, value_scaling: 0, range: 'Single' },
        ],
      },
    },
  });
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 },
  }, null, null];
  const ctx = buildCtx(slots);
  ctx.enemy.bk = true;
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000、stage 6 Enemy_Break Mul ×2 = 26000、stage 7 inline ×3 (enemy.bk gate) = 78000
  assert.strictEqual(r.stats['攻撃力'], 78000);
});

test('computeStats: Enemy_BreakAttack enemy.bk=false → factor=0、不生效', () => {
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        weapon_skills: [
          { parameter: 'Enemy_BreakAttack', math_type: 'Multiply', value: 2, value_scaling: 0, range: 'Single' },
        ],
      },
    },
  });
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 },
  }, null, null];
  const ctx = buildCtx(slots);
  ctx.enemy.bk = false;
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000、Enemy_Break factor=0 跳过、应该 = 13000
  assert.strictEqual(r.stats['攻撃力'], 13000);
});

test('computeStats: Stage 6 Enemy_Break 在 Stage 5 其他 Add 之后、Stage 7 ×3 在最末', () => {
  // 顺序 (新 6 stage + inline ×3): other Add → Enemy_Break Mul → Enemy_Break Add → ×3 → ceil
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        weapon_skills: [
          { parameter: 'Attack', math_type: 'Addition', value: 1000, value_scaling: 0, range: 'Single' },              // stage 5 other Add
          { parameter: 'Enemy_BreakAttack', math_type: 'Multiply', value: 2, value_scaling: 0, range: 'Single' },     // stage 6 Mul
          { parameter: 'Enemy_BreakAttack', math_type: 'Addition', value: 500, value_scaling: 0, range: 'Single' },   // stage 6 Add
        ],
      },
    },
  });
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 },
  }, null, null];
  const ctx = buildCtx(slots);
  ctx.enemy.bk = true;
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000
  // stage 5 other Add: + 1000 = 14000
  // stage 6 enemy Mul: × 2 = 28000
  // stage 6 enemy Add: + 500 = 28500
  // stage 7 inline ×3 (enemy.bk gate): × 3 = 85500
  // ceil → 85500
  assert.strictEqual(r.stats['攻撃力'], 85500);
});

// ============================================================
// 12. Stage 3: LP × (step 4 位置、BlazeAttack 之后、其他 Mul 之前)
// ============================================================
test('computeStats: Stage 3 LP × 在 BlazeAttack 后、其他 Mul 前 (普通表 HpCheck)', () => {
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        weapon_skills: [
          { parameter: 'Attack', math_type: 'Addition', value: 1, value_scaling: 0, range: 'Single' },  // stage 5 other Add
        ],
      },
    },
  });
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, lp: 2 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base 13000
  // stage 3 LP (HpCheck tier 2): × 1.5 = 19500
  // stage 5 other Add: + 1 = 19501
  // ceil → 19501
  assert.strictEqual(r.stats['攻撃力'], 19501);
});

// ============================================================
// 13. computeStatsBlaze: BD 攻击伤害 (LpCheck 表)
// ============================================================
test('computeStatsBlaze: lp=3 残血 → LpCheck ×5.0 (vs computeStats HpCheck ×2.0)', () => {
  const c = mockChara();
  const slots = [{
    chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, lp: 3 },
  }, null, null];
  const ctx = buildCtx(slots);
  const rNormal = computeStats(c, ctx.team[0].tr, 0, ctx);
  const rBlaze = computeStatsBlaze(c, ctx.team[0].tr, 0, ctx);
  // 普通: base 13000 × 2.0 = 26000
  // BD: base 13000 × 5.0 = 65000
  assert.strictEqual(rNormal.stats['攻撃力'], 26000);
  assert.strictEqual(rBlaze.stats['攻撃力'], 65000);
  assert.strictEqual(rNormal._is_blaze, false);
  assert.strictEqual(rBlaze._is_blaze, true);
});

test('computeStatsBlaze: lp=1 + bd_on 不影响表选择 (bd_on 只 toggle bd_skill.effects)', () => {
  const c = mockChara();
  // bd_on 任意值、computeStats 用普通表、computeStatsBlaze 用 LpCheck 表
  const slotsA = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, lp: 1, bd_on: false } }, null, null];
  const slotsB = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, lp: 1, bd_on: true } }, null, null];
  const ctxA = buildCtx(slotsA);
  const ctxB = buildCtx(slotsB);
  // computeStats: 不管 bd_on、永远 HpCheck tier 1 = ×1.1
  assert.strictEqual(computeStats(c, ctxA.team[0].tr, 0, ctxA).stats['攻撃力'], 14300);  // 13000 × 1.1
  assert.strictEqual(computeStats(c, ctxB.team[0].tr, 0, ctxB).stats['攻撃力'], 14300);  // 13000 × 1.1
  // computeStatsBlaze: 不管 bd_on、永远 LpCheck tier 1 = ×1.3
  assert.strictEqual(computeStatsBlaze(c, ctxA.team[0].tr, 0, ctxA).stats['攻撃力'], 16900);  // 13000 × 1.3
  assert.strictEqual(computeStatsBlaze(c, ctxB.team[0].tr, 0, ctxB).stats['攻撃力'], 16900);
});

// ============================================================
// 12. Speed (転速、unpacking §7.6.1)
//     latestRecover = add_acc + (PartnerLevel/100 + 1) × mul_acc × recover
// ============================================================
function _addSpeedSkills(c, skills) {
  const m = c._master;
  m.states['通常'].weapon_skills = skills;
  return c;
}

test('Speed: 无 effect → latestRecover = recover (= base.Speed)', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base.Speed = max_speed=22 (lv 满) → latestRecover = 22 (无 soul、partnerFactor=1.0)
  assert.strictEqual(Math.round(r.speed.latestRecover), 22);
});

test('Speed × Mul ×2 → latestRecover = recover × 2', () => {
  const c = _addSpeedSkills(mockChara(), [
    { parameter: 'Speed', math_type: 'Multiply', value: 2.0, range: 'Single' },
  ]);
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(Math.round(r.speed.latestRecover), 44);  // 22 × 2
});

test('Speed + Add 10 → latestRecover = recover + 10', () => {
  const c = _addSpeedSkills(mockChara(), [
    { parameter: 'Speed', math_type: 'Addition', value: 10, range: 'Single' },
  ]);
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(Math.round(r.speed.latestRecover), 32);  // 22 + 10
});

test('Speed + partner soul Lv 50 → ×1.5 partnerFactor', () => {
  const c = mockChara();
  const s = mockSoul({ max_level: 50, skills: [] });
  const slots = [{
    chara: c, soul: s,
    tr: { ...mkTr(), level: 250, jukudo: 60, soul_lv: 50 },
  }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // partnerFactor = 50/100 + 1 = 1.5、latestRecover = 1.5 × 22 = 33
  assert.strictEqual(Math.round(r.speed.latestRecover), 33);
});

test('Speed cooldownFrames = max(1, ceil(6000/latestRecover)) + setFrames=1 (unpacking §8.6.2 条件 B)', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base.Speed = 22 → cooldown = ceil(6000/22) = ceil(272.7) = 273fr、setFrames = 1fr (Begin→IsWait set)
  assert.strictEqual(r.speed.cooldownFrames, 273);
  assert.strictEqual(r.speed.setFrames, 1);
});

test('Speed cooldown 下限 1fr (latestRecover ≥ 6000 时 progress 一帧跨 100、§8.6.2)', () => {
  const c = _addSpeedSkills(mockChara(), [
    { parameter: 'Speed', math_type: 'Multiply', value: 10000, range: 'Single' },  // 巨大 recover
  ]);
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // recover = 22 × 10000 = 220000 ≥ 6000、ceil(6000/220000) = 1、下限 1fr
  assert.strictEqual(r.speed.cooldownFrames, 1);
});

test('Break_Speed gate by HP (HP=50 触发、HP=51 不触发)', () => {
  const c = _addSpeedSkills(mockChara(), [
    { parameter: 'Break_Speed', math_type: 'Multiply', value: 2.0, range: 'Single' },
  ]);
  const slotsHi = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, hp: 51 } }, null, null];
  const slotsLo = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, hp: 50 } }, null, null];
  const rHi = computeStats(c, buildCtx(slotsHi).team[0].tr, 0, buildCtx(slotsHi));
  const rLo = computeStats(c, buildCtx(slotsLo).team[0].tr, 0, buildCtx(slotsLo));
  assert.strictEqual(Math.round(rHi.speed.latestRecover), 22);  // 不触发
  assert.strictEqual(Math.round(rLo.speed.latestRecover), 44);  // 触发 ×2
});

// ============================================================
// 13. MotionSpeed (攻速、unpacking §8.7)
//     effective_motion_speed_i = motion_speed_i × boost_mul_acc + boost_add_acc
// ============================================================
// 注: r.motionSpeed = { speeds: [m1, m2, m3], durationsMs: [ms1, ms2, ms3] }
// durationsMs 需 chara state.motion_durations (npc_motions.json)、test mockChara 默认 0、durationsMs 全 0
// 单测只验 speeds (倍率)
test('MotionSpeed: 无 effect → speeds = [m1, m2, m3] 原值', () => {
  const c = mockChara();
  c._master.states['通常'].motion_speed = 4;
  c._master.states['通常'].motion_speed2 = 4;
  c._master.states['通常'].motion_speed3 = 1;
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.deepStrictEqual(r.motionSpeed.speeds, [4, 4, 1]);
});

test('MotionSpeed × Mul ×1.5 → speeds × 1.5', () => {
  const c = _addSpeedSkills(mockChara(), [
    { parameter: 'MotionSpeed', math_type: 'Multiply', value: 1.5, range: 'Single' },
  ]);
  c._master.states['通常'].motion_speed = 4;
  c._master.states['通常'].motion_speed2 = 4;
  c._master.states['通常'].motion_speed3 = 1;
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.deepStrictEqual(r.motionSpeed.speeds.map((v) => +v.toFixed(2)), [6, 6, 1.5]);
});

test('MotionSpeed 段下限 2fr (含 +1 register、§8.6.2 条件 A floor)', () => {
  const c = mockChara();
  c._master.states['通常'].motion_speed = 100;   // 巨大 motion_speed → effective < 1fr
  c._master.states['通常'].motion_speed2 = 100;
  c._master.states['通常'].motion_speed3 = 100;
  c._master.states['通常'].motion_durations = [1.3333, 2.2, 3.375];
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // 1 + max(1, ceil(dur×60/speed)):
  // ceil(1.3333×60/100)=1 → 1+max(1,1)=2
  // ceil(2.2×60/100)=2 → 1+max(1,2)=3
  // ceil(3.375×60/100)=3 → 1+max(1,3)=4
  assert.deepStrictEqual(r.motionSpeed.durationsFrames, [2, 3, 4]);
});

test('MotionSpeed durationsFrames = 1 + max(1, ceil(dur×60/speed)) (§8.6.2 条件 A)', () => {
  const c = mockChara();
  c._master.states['通常'].motion_speed = 4;
  c._master.states['通常'].motion_speed2 = 2;
  c._master.states['通常'].motion_speed3 = 1;
  c._master.states['通常'].motion_durations = [1.3333, 2.2, 3.375];   // sec
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // 1 + max(1, ceil(dur×60/speed)):
  // 1 + ceil(1.3333×60/4)=1+20=21
  // 1 + ceil(2.2×60/2)=1+66=67
  // 1 + ceil(3.375×60/1)=1+203=204
  assert.deepStrictEqual(r.motionSpeed.durationsFrames, [21, 67, 204]);
});

test('Vitality_MotionSpeed × HP (HP=100 满激活 speeds 大、HP=0 不激活)', () => {
  const c = _addSpeedSkills(mockChara(), [
    { parameter: 'Vitality_MotionSpeed', math_type: 'Multiply', value: 2.0, range: 'Single' },
  ]);
  c._master.states['通常'].motion_speed = 4;
  c._master.states['通常'].motion_speed2 = 4;
  c._master.states['通常'].motion_speed3 = 1;
  const slots100 = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, hp: 100 } }, null, null];
  const slots0 = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60, hp: 0 } }, null, null];
  const r100 = computeStats(c, buildCtx(slots100).team[0].tr, 0, buildCtx(slots100));
  const r0 = computeStats(c, buildCtx(slots0).team[0].tr, 0, buildCtx(slots0));
  // 公式: mulAcc *= 1 + (value-1) × cf
  // HP=100 cf=1: mulAcc = 1 + (2-1)*1 = 2.0、speeds = [8, 8, 2]
  // HP=0 cf=0: mulAcc = 1 + (2-1)*0 = 1.0、speeds = [4, 4, 1]
  assert.ok(r100.motionSpeed.speeds[0] > r0.motionSpeed.speeds[0], 'HP=100 speeds > HP=0');
  assert.deepStrictEqual(r100.motionSpeed.speeds, [8, 8, 2]);
  assert.deepStrictEqual(r0.motionSpeed.speeds, [4, 4, 1]);
});

// ============================================================
// 14. Phase 6.13: enemy bar 字段接 stats-calc (element / mode / difficulty / bkRes / advWeapons / guildTitle / emblems / bd_cap)
// ============================================================
// mockChara element_id=1 (火) / weapon_type_id=1 (长剣)
test('enemy element matchup: 火 vs 水 mode=normal → ×0.5 Attack', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots, { enemy: { element: 2, bk: false, mode: 'normal' } });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // base Attack 13000 × 0.5 = 6500
  assert.strictEqual(r.stats['攻撃力'], 6500);
});

test('enemy element matchup: 火 vs 風 mode=normal → ×2.0 Attack + BK', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots, { enemy: { element: 3, bk: false, mode: 'normal' } });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.stats['攻撃力'], 26000);   // 13000 × 2
  assert.strictEqual(r.stats['ブレイク力'], 2000); // 1000 × 2
});

test('enemy element matchup: 火 vs 風 mode=guildbattle → ×15.0 Attack', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots, { enemy: { element: 3, bk: false, mode: 'guildbattle', difficulty: 'Normal' } });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.stats['攻撃力'], 13000 * 15);  // 195000
});

test('enemy mode=normal 时 difficulty / advWeapons / guildTitle 全 ignored', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const advWeaponsSet = new Set([1]);  // chara weapon_type_id=1
  const ctx = buildCtx(slots, {
    enemy: {
      element: 6, bk: false, mode: 'normal',
      difficulty: 'Hard',                    // 应被忽略
      advantageWeapons: advWeaponsSet,        // 应被忽略
      guildTitle: 999,                        // 应被忽略
    },
    allGuildTitles: [{ id: 999, effects: [{ bunrui: [1], scope: 1, condition: 0, bairitu: 2.0, calc_type: 0 }] }],
  });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // normal mode 时 element=6 vs 6 K=0 → ×1、bd_cap=0 → 1 + 0 = 1、其他 ignored
  assert.strictEqual(r.stats['攻撃力'], 13000);
});

test('enemy difficulty Hard guildbattle → Attack × 0.1', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots, {
    enemy: { element: 4, bk: false, mode: 'guildbattle', difficulty: 'Hard' },
  });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // element 火(1) vs 光(4) guildbattle K=0 → ×1.0、difficulty Hard ×0.1
  // 13000 × 1 × 0.1 = 1300
  assert.strictEqual(r.stats['攻撃力'], 1300);
});

test('enemy bk + bkResistance high + guildbattle → 额外 ×2 (合计 ×6)', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctxNorm = buildCtx(slots, {
    enemy: { element: 6, bk: true, mode: 'guildbattle', difficulty: 'Normal', bkResistance: 'normal' },
  });
  const ctxHigh = buildCtx(slots, {
    enemy: { element: 6, bk: true, mode: 'guildbattle', difficulty: 'Normal', bkResistance: 'high' },
  });
  // normal: 13000 × 15 (element 6vs6 guildbattle K=3) × 3 (stage 7 inline) = 585000
  // high: 同样 × 额外 ×2 = 1170000
  const rN = computeStats(c, ctxNorm.team[0].tr, 0, ctxNorm);
  const rH = computeStats(c, ctxHigh.team[0].tr, 0, ctxHigh);
  assert.strictEqual(rH.stats['攻撃力'], rN.stats['攻撃力'] * 2);
});

test('enemy advantageWeapons (chara weapon ∈ set) + guildbattle → Attack × 2.0', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctxNo = buildCtx(slots, {
    enemy: { element: 6, bk: false, mode: 'guildbattle', difficulty: 'Normal', advantageWeapons: new Set([99]) },
  });
  const ctxYes = buildCtx(slots, {
    enemy: { element: 6, bk: false, mode: 'guildbattle', difficulty: 'Normal', advantageWeapons: new Set([1]) },
  });
  const rNo = computeStats(c, ctxNo.team[0].tr, 0, ctxNo);
  const rYes = computeStats(c, ctxYes.team[0].tr, 0, ctxYes);
  assert.strictEqual(rYes.stats['攻撃力'], rNo.stats['攻撃力'] * 2);
});

test('enemy bd_cap=4 → Attack × 1.5 (1 + floor(4/2)×0.25)', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx0 = buildCtx(slots, { enemy: { element: 6, bk: false, mode: 'normal', bd_cap: 0 } });
  const ctx4 = buildCtx(slots, { enemy: { element: 6, bk: false, mode: 'normal', bd_cap: 4 } });
  const r0 = computeStats(c, ctx0.team[0].tr, 0, ctx0);
  const r4 = computeStats(c, ctx4.team[0].tr, 0, ctx4);
  assert.strictEqual(r0.stats['攻撃力'], 13000);
  assert.strictEqual(r4.stats['攻撃力'], 19500);   // 13000 × 1.5
});

test('enemy bd_cap=4.5 → 跟 bd_cap=4 同倍率 (floor 公式 floor(4.5/2)=2)', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots, { enemy: { element: 6, bk: false, mode: 'normal', bd_cap: 4.5 } });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // floor(4.5/2) = 2、1 + 2×0.25 = 1.5、13000 × 1.5 = 19500
  assert.strictEqual(r.stats['攻撃力'], 19500);
});

test('enemy guildTitle effects[] (guildbattle) → Attack ×1.5', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots, {
    enemy: { element: 6, bk: false, mode: 'guildbattle', difficulty: 'Normal', guildTitle: 100 },
    allGuildTitles: [{
      id: 100, name: 'test',
      effects: [{ bunrui: [1], scope: 1, condition: 0, bairitu: 1.5, calc_type: 0 }],
    }],
  });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // element 火(1) vs 無(6) guildbattle K=2 → ×10、guildTitle Attack Mul ×1.5
  // 13000 × 10 × 1.5 = 195000
  assert.strictEqual(r.stats['攻撃力'], 195000);
});

test('emblem guild_only=false 在 mode=normal 时也生效 (全局)', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots, {
    enemy: {
      element: 6, bk: false, mode: 'normal',
      emblems: [{ id: 200, level: 25 }, null, null, null],
    },
    allGuildEmblems: [{
      id: 200, name: 'test', guild_only: false, rarity: 1,  // rarity=1 lvMax=25
      effects: [{ bunrui: [1], scope: 1, condition: 0, bairitu: 1.0625, calc_type: 0 }],
    }],
  });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // bairitu lv=25 max=25 → 1.0625 (满级)、Attack Mul × 1.0625
  assert.strictEqual(r.stats['攻撃力'], Math.ceil(13000 * 1.0625));
});

test('emblem guild_only=true 在 mode=normal 时不生效', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const emblem = {
    id: 200, name: 'test', guild_only: true, rarity: 1,
    effects: [{ bunrui: [1], scope: 1, condition: 0, bairitu: 2.0, calc_type: 0 }],
  };
  const ctxN = buildCtx(slots, {
    enemy: { element: 6, bk: false, mode: 'normal', emblems: [{ id: 200, level: 25 }, null, null, null] },
    allGuildEmblems: [emblem],
  });
  const ctxG = buildCtx(slots, {
    enemy: { element: 6, bk: false, mode: 'guildbattle', difficulty: 'Normal', emblems: [{ id: 200, level: 25 }, null, null, null] },
    allGuildEmblems: [emblem],
  });
  const rN = computeStats(c, ctxN.team[0].tr, 0, ctxN);
  const rG = computeStats(c, ctxG.team[0].tr, 0, ctxG);
  // normal mode: emblem 不生效、Attack = 13000 (element 火 vs 無 K=0)
  assert.strictEqual(rN.stats['攻撃力'], 13000);
  // guildbattle: element 火(1) vs 無(6) K=2 → ×10 + emblem Attack ×2 = 13000 × 10 × 2 = 260000
  assert.strictEqual(rG.stats['攻撃力'], 260000);
});

test('emblem level scaling 中间值 → 线性插值 bairitu', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const emblem = {
    id: 200, name: 'test', guild_only: false, rarity: 1,  // lvMax=25
    effects: [{ bunrui: [1], scope: 1, condition: 0, bairitu: 1.50, calc_type: 0 }],  // 满级 ×1.5
  };
  // lv 13 (中点)、bairitu_eff = (1.5-1) × (13-1) / (25-1) + 1 = 0.5 × 12 / 24 + 1 = 1.25
  const ctx = buildCtx(slots, {
    enemy: { element: 6, bk: false, mode: 'normal', emblems: [{ id: 200, level: 13 }, null, null, null] },
    allGuildEmblems: [emblem],
  });
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.stats['攻撃力'], Math.ceil(13000 * 1.25));   // 16250
});

// ============================================================
// 15. BlazeGaugeMaxLevel → bdCapMax (wiki main:js/stats-calc.js L444-449)
//     bdCapMax = max(9, floor((10 + Σadd) × (1 + Σmul)) - 1)
// ============================================================
test('bdCapMax: 无 BlazeGaugeMaxLevel skill → 默认 9', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.bdCapMax, 9);
});

test('bdCapMax: chara skill BlazeGaugeMaxLevel Add +13 → floor((9+13)×1) = 22 (chara 1658 实测)', () => {
  const c = mockChara();
  c._master.states['通常'].weapon_skills = [
    { id: 90002, name: 'Masterpiece', parameter: 'BlazeGaugeMaxLevel', math_type: 'Addition', value: 13, range: 'Single' },
  ];
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // (9 + 13) × 1 = 22、floor 22
  assert.strictEqual(r.bdCapMax, 22);
});

test('bdCapMax: chara skill BlazeGaugeMaxLevel Mul ×1.5 → floor(9×1.5) = 13', () => {
  const c = mockChara();
  c._master.states['通常'].weapon_skills = [
    { id: 90003, name: 'test', parameter: 'BlazeGaugeMaxLevel', math_type: 'Multiply', value: 1.5, range: 'Single' },
  ];
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // (9 + 0) × 1.5 = 13.5、floor 13
  assert.strictEqual(r.bdCapMax, 13);
});

test('bdCapMax: Mul + Add 组合 → floor((9+5)×1.5) = 21', () => {
  const c = mockChara();
  c._master.states['通常'].weapon_skills = [
    { id: 1, parameter: 'BlazeGaugeMaxLevel', math_type: 'Addition', value: 5, range: 'Single' },
    { id: 2, parameter: 'BlazeGaugeMaxLevel', math_type: 'Multiply', value: 1.5, range: 'Single' },
  ];
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // (9 + 5) × 1.5 = 21、floor 21
  assert.strictEqual(r.bdCapMax, 21);
});

test('bdCapMax: 负 buff (Mul ×0.5) 不能掉破 9 默认 (max(9, _) 保底)', () => {
  const c = mockChara();
  c._master.states['通常'].weapon_skills = [
    { id: 1, parameter: 'BlazeGaugeMaxLevel', math_type: 'Multiply', value: 0.5, range: 'Single' },  // 减半
  ];
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // (9 + 0) × 0.5 = 4.5、floor 4、max(9, 4) = 9
  assert.strictEqual(r.bdCapMax, 9);
});

// ============================================================
// 16. 初始 BlazeGauge (chara skill parameter=BlazeGauge、mode 1 直接 / mode 2 队伍属性 count)
// ============================================================
test('initialBlazeGauge mode 1 (target_element_id=0): chara 装 skill +100 → +1 gauge', () => {
  const c = mockChara();
  c._master.states['通常'].weapon_skills = [
    { id: 92501, parameter: 'BlazeGauge', math_type: 'Addition', value: 100, range: 'Single', target_element_id: 0 },
  ];
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.initialBlazeGauge, 100);
  assert.strictEqual(r.initialBdCap, 1);
});

test('initialBlazeGauge mode 2 (target_element_id=1): 队伍 3 火 chara × 150 = 450 → 4.5 gauge (不 floor)', () => {
  const c1 = mockChara({ id: 1001, element_id: 1 });   // 火
  c1._master.states['通常'].weapon_skills = [
    { id: 80598, parameter: 'BlazeGauge', math_type: 'Addition', value: 150, range: 'All', target_element_id: 1 },
  ];
  const c2 = mockChara({ id: 1002, element_id: 1 });   // 火 (空 skill)
  c2._master.states['通常'].weapon_skills = [];
  const c3 = mockChara({ id: 1003, element_id: 1 });   // 火 (空 skill)
  c3._master.states['通常'].weapon_skills = [];
  const slots = [
    { chara: c1, tr: { ...mkTr(), level: 250, jukudo: 60 } },
    { chara: c2, tr: { ...mkTr(), level: 250, jukudo: 60 } },
    { chara: c3, tr: { ...mkTr(), level: 250, jukudo: 60 } },
  ];
  const ctx = buildCtx(slots);
  const r = computeStats(c1, ctx.team[0].tr, 0, ctx);
  // mode 2: 3 火 chara × 150 = 450
  assert.strictEqual(r.initialBlazeGauge, 450);
  assert.strictEqual(r.initialBdCap, 4.5);  // 不 floor、保留小数
});

test('initialBlazeGauge mode 2: 队伍只 1 火 (其他水) → 150 × 1 = 150 → 1 gauge', () => {
  const c1 = mockChara({ id: 1001, element_id: 1 });   // 火
  c1._master.states['通常'].weapon_skills = [
    { id: 80598, parameter: 'BlazeGauge', math_type: 'Addition', value: 150, range: 'All', target_element_id: 1 },
  ];
  const c2 = mockChara({ id: 1002, element_id: 2 });   // 水
  c2._master.states['通常'].weapon_skills = [];
  const slots = [
    { chara: c1, tr: { ...mkTr(), level: 250, jukudo: 60 } },
    { chara: c2, tr: { ...mkTr(), level: 250, jukudo: 60 } },
    null,
  ];
  const ctx = buildCtx(slots);
  const r = computeStats(c1, ctx.team[0].tr, 0, ctx);
  // mode 2: 只 1 火 (c1 自己)、150 × 1 = 150
  assert.strictEqual(r.initialBlazeGauge, 150);
  assert.strictEqual(r.initialBdCap, 1.5);   // 150/100 = 1.5、不 floor
});

test('initialBlazeGauge mode 1 + mode 2 混合: +100 (mode 1) + 2×150 (mode 2、2 火) = 400', () => {
  const c1 = mockChara({ id: 1001, element_id: 1 });
  c1._master.states['通常'].weapon_skills = [
    { id: 92501, parameter: 'BlazeGauge', math_type: 'Addition', value: 100, range: 'Single', target_element_id: 0 },
    { id: 80598, parameter: 'BlazeGauge', math_type: 'Addition', value: 150, range: 'All', target_element_id: 1 },
  ];
  const c2 = mockChara({ id: 1002, element_id: 1 });
  c2._master.states['通常'].weapon_skills = [];
  const slots = [
    { chara: c1, tr: { ...mkTr(), level: 250, jukudo: 60 } },
    { chara: c2, tr: { ...mkTr(), level: 250, jukudo: 60 } },
    null,
  ];
  const ctx = buildCtx(slots);
  const r = computeStats(c1, ctx.team[0].tr, 0, ctx);
  // mode 1: 100、mode 2: 2 火 × 150 = 300、合 400
  assert.strictEqual(r.initialBlazeGauge, 400);
  assert.strictEqual(r.initialBdCap, 4);  // 400/100=4 整数、无小数
});

test('initialBlazeGauge 无 BlazeGauge skill → 0', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.initialBlazeGauge, 0);
  assert.strictEqual(r.initialBdCap, 0);
});

// ============================================================
// 17. BlazeGaugePointRate pipeline (unpacking §1.3.3.5)
// ============================================================
test('blazeGaugePoints: 无 rate skill → A 表 base 不变', () => {
  const c = mockChara();
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.blazeGaugePoints[0], 100);   // A[0]
  assert.strictEqual(r.blazeGaugePoints[9], 140);   // A[9] (生长段起点)
  assert.strictEqual(r.blazeGaugePoints[11], 419);  // A[11] (140·3 - 1 = ±1 修正)
});

test('blazeGaugePoints: 只 chara skill Mul ×0.5 → A 表 × 0.5、floor', () => {
  const c = mockChara();
  c._master.states['通常'].weapon_skills = [
    { id: 80440, parameter: 'BlazeGaugePointRate', math_type: 'Multiply', value: 0.5, range: 'Single' },
  ];
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // floor(A[i] × 0.5): floor(100×0.5)=50、floor(140×0.5)=70、floor(419×0.5)=209
  assert.strictEqual(r.blazeGaugePoints[0], 50);
  assert.strictEqual(r.blazeGaugePoints[9], 70);
  assert.strictEqual(r.blazeGaugePoints[11], 209);
});

test('blazeGaugePoints: 有 soul rate skill ×0.25 → 切到 IDEAL 表 (无 ±1 修正)', () => {
  const c = mockChara();
  const soul = mockSoul({
    skills: [{ id: 1, parameter: 'BlazeGaugePointRate', math_type: 'Multiply', value: 0.25, range: 'Single' }],
  });
  const slots = [{ chara: c, soul, tr: { ...mkTr(), level: 250, jukudo: 60, soul_lv: 1 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // IDEAL: i=11 → 140·3 = 420 (无 -1 修正)、× 0.25 × L(1)=1.01 = 420 × 0.2525 = 106.05 → floor 106
  assert.strictEqual(r.blazeGaugePoints[11], Math.floor(420 * 0.25 * 1.01));
  // i=0: 100 × 0.2525 = 25.25 → floor 25
  assert.strictEqual(r.blazeGaugePoints[0], 25);
});

test('initialBdCap: cumsum 反查 totalGauge > 900 时不再是 /100 (Lv 10+ 阈值变 140/280/...)', () => {
  const c = mockChara();
  // 加 12 个 BlazeGauge skill 各 +100 = 1200 BlazeGauge points
  c._master.states['通常'].weapon_skills = Array.from({ length: 12 }, (_, i) => ({
    id: 1000 + i, parameter: 'BlazeGauge', math_type: 'Addition', value: 100, range: 'Single', target_element_id: 0,
  }));
  const slots = [{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // A 表 cum=[100,200,...,900 (i=8),1040 (i=9),1320 (i=10),...]
  // totalGauge=1200 在 cum[9]=1040 和 cum[10]=1320 之间
  // bd_cap = 10 + (1200-1040)/280 = 10 + 0.5714... ≈ 10.571
  assert.strictEqual(r.initialBlazeGauge, 1200);
  // bd_cap 应≈ 10.57、不是 1200/100=12
  assert.ok(r.initialBdCap > 10 && r.initialBdCap < 11, `expected 10..11、got ${r.initialBdCap}`);
});

test('blazeGaugePoints: chara ×0.5 + soul ×0.5 混合 → IDEAL × 0.5 × 0.5 × 1.01', () => {
  const c = mockChara();
  c._master.states['通常'].weapon_skills = [
    { id: 1, parameter: 'BlazeGaugePointRate', math_type: 'Multiply', value: 0.5, range: 'Single' },
  ];
  const soul = mockSoul({
    skills: [{ id: 2, parameter: 'BlazeGaugePointRate', math_type: 'Multiply', value: 0.5, range: 'Single' }],
  });
  const slots = [{ chara: c, soul, tr: { ...mkTr(), level: 250, jukudo: 60, soul_lv: 1 } }, null, null];
  const ctx = buildCtx(slots);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  // IDEAL i=0: 100 × 0.5 × 0.5 × 1.01 = 25.25 → floor 25
  assert.strictEqual(r.blazeGaugePoints[0], 25);
  // i=9: 140 × 0.2525 = 35.35 → floor 35
  assert.strictEqual(r.blazeGaugePoints[9], 35);
});

// ============================================================
// 倍率 round5 (2026-06-20): 所有 Multiply 倍率计算前先四舍五入到 5 位小数
// ============================================================
test('倍率 round5: Multiply 1.894815 → 用 1.89482 (DamageLimit floor×2^31 放大可见)', () => {
  // DamageLimit = floor((2^31-1) × Π倍率)、base 巨大 + floor 不 ceil → 5 位舍入差异可观测
  const c = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        weapon_skills: [
          { parameter: 'DamageLimitBreak', math_type: 'Multiply', value: 1.894815, value_scaling: 0, range: 'Single' },
        ],
      },
    },
  });
  const ctx = buildCtx([{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null]);
  const r = computeStats(c, ctx.team[0].tr, 0, ctx);
  const DEFAULT = 2147483647;
  assert.strictEqual(r.damageLimit, Math.floor(DEFAULT * 1.89482));       // round5 后
  assert.notStrictEqual(r.damageLimit, Math.floor(DEFAULT * 1.894815));   // ≠ 未 round 的全精度
});

// ============================================================
// bd_skill 战斗时生效 → server-fold 顺序排最后 (2026-06-20)
// ============================================================
test('orderServerFold: bd_skill 排在所有 buff 最后 (战斗时生效、在 魂/bg/结晶 之后)', () => {
  const mk = (src, slot = 0) => ({ _source: src, _src_slot: slot, base_parameter: 'HitCount' });
  const list = [mk('bd_skill'), mk('chara_skill'), mk('soul'), mk('crystal'), mk('bg'), mk('omoide')];
  const ordered = orderServerFold(list, 0);
  assert.strictEqual(ordered[ordered.length - 1]._source, 'bd_skill', 'bd 必须是最后一个');
  const bdIdx = ordered.findIndex((e) => e._source === 'bd_skill');
  for (const s of ['soul', 'bg', 'crystal', 'chara_skill', 'omoide']) {
    assert.ok(ordered.findIndex((e) => e._source === s) < bdIdx, `${s} 应排在 bd 之前`);
  }
});

// ============================================================
// MP rate (§3.9.1、2026-06-21): 攻撃力/ブレイク力 × rate
// ============================================================
test('mpRate: ratio≥0.5→1、ratio 0→1/21、null→满、maxMp 0→1', () => {
  assert.strictEqual(mpRate(null, 230), 1);            // null = 满 (默认)
  assert.strictEqual(mpRate(230, 230), 1);             // ratio 1
  assert.strictEqual(mpRate(115, 230), 1);             // ratio 0.5 边界
  assert.ok(Math.abs(mpRate(0, 230) - 1 / 21) < 1e-9);  // ratio 0 → 1/21 (旧 have_mp=false)
  assert.ok(Math.abs(mpRate(57.5, 230) - (1 - (20 / 21) * Math.sqrt(0.5))) < 1e-9); // ratio 0.25
  assert.strictEqual(mpRate(100, 0), 1);               // 无 mp 数据 → 1
});

console.log('\n[test_stats_calc] all tests defined');
