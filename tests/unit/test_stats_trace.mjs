// tests/unit/test_stats_trace.mjs — computeStats dev trace 单测
//
// trace = hensei stat-trace modal 的数据源 (ctx.traceEnabled gate):
//   { base, damageLimitBase, hitsBase, speedBase, motionBase, stages: [{key, label, steps}] }
// step = { src, stat, op, val, before, after }
//
// 验证点:
// 1. traceEnabled 缺省 → trace=null (Pages 生产 0 开销)
// 2. trace on/off 输出 stats 完全一致 (埋点不改数值)
// 3. 各 stat 链尾 == 最终输出 (攻撃力/HP/転速/攻速/Hit/ダメ上限)
// 4. step 链连续 (steps[i].after === steps[i+1].before per stat)

import { test } from 'node:test';
import assert from 'node:assert';
import { computeStats, mkTr } from '../../shared/stats-calc.js';

// ============================================================
// mock helpers (跟 test_stats_calc.mjs 同 pattern)
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
        weapon_skills: [
          { name: 'ATK+10%', parameter: 'Attack', math_type: 'Multiply', value: 1.10, value_scaling: 0 },
          { name: 'SPD+20%', parameter: 'Speed', math_type: 'Multiply', value: 1.20, value_scaling: 0 },
          { name: 'MS+5%', parameter: 'MotionSpeed', math_type: 'Multiply', value: 1.05, value_scaling: 0 },
          { name: 'HIT+1', parameter: 'HitCount', math_type: 'Addition', value: 1, value_scaling: 0 },
          { name: 'DL×2', parameter: 'DamageLimitBreak', math_type: 'Multiply', value: 2, value_scaling: 0 },
        ],
        hit_counts: [3, 3, 14],
        motion_speed: 1.0, motion_speed2: 1.1, motion_speed3: 1.2,
        motion_durations: [0.5, 0.6, 0.7],
      },
    },
    bd_skill: { effects: [] },
    ...over,
  };
  return { _master: m, id: m.id, name: m.name };
}

function buildCtx(slots, opts = {}) {
  const allCharas = slots.filter((s) => s?.chara).map((s) => s.chara);
  const team = slots.map((s) => ({
    chara: s?.chara?.id ?? null,
    soul: null, bg: null, masou: null, crystals: [],
    tr: s?.tr || mkTr(),
  }));
  return {
    team, allCharas, allSouls: [], allBGs: [], allMasou: [], allCrystals: [],
    allGuildTitles: [], allGuildEmblems: [],
    enemy: opts.enemy || { element: 0, bk: false },
    traceEnabled: opts.traceEnabled,
  };
}

const _stepsFor = (trace, statPattern) => {
  const re = statPattern instanceof RegExp ? statPattern : null;
  const out = [];
  for (const st of trace.stages)
    for (const s of st.steps)
      if (re ? re.test(s.stat) : s.stat === statPattern) out.push(s);
  return out;
};

// ============================================================
// 1. gate
// ============================================================
test('trace: ctx.traceEnabled 缺省 → trace=null', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }]);
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.trace, null);
});

test('trace: traceEnabled=true → trace 结构齐全', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }], { traceEnabled: true });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  assert.ok(r.trace);
  assert.ok(r.trace.base);
  assert.ok(Array.isArray(r.trace.stages));
  assert.strictEqual(r.trace.damageLimitBase, 2147483647);
  assert.ok(Array.isArray(r.trace.hitsBase));
  assert.ok(typeof r.trace.speedBase === 'number');
  assert.ok(Array.isArray(r.trace.motionBase));
  // stage keys 完整
  const keys = r.trace.stages.map((s) => s.key);
  for (const k of ['s1_omoide_add', 's4a_other_mul', 's4b_soul_mul', 's5a_other_add', 's5b_soul_add', 's8_enemy_mods', 's9_hits', 's10_damage_limit', 's11_speed', 's12_motion']) {
    assert.ok(keys.includes(k), `missing stage ${k}`);
  }
});

// ============================================================
// 2. trace on/off 数值一致
// ============================================================
test('trace: on/off 不改 stats 输出', () => {
  const chara = mockChara();
  const ctxOff = buildCtx([{ chara }]);
  const ctxOn = buildCtx([{ chara }], { traceEnabled: true });
  const rOff = computeStats(chara, ctxOff.team[0].tr, 0, ctxOff);
  const rOn = computeStats(chara, ctxOn.team[0].tr, 0, ctxOn);
  assert.deepStrictEqual(rOn.stats, rOff.stats);
  assert.deepStrictEqual(rOn.hits, rOff.hits);
  assert.strictEqual(rOn.damageLimit, rOff.damageLimit);
  assert.strictEqual(rOn.speed.latestRecover, rOff.speed.latestRecover);
  assert.deepStrictEqual(rOn.motionSpeed.speeds, rOff.motionSpeed.speeds);
});

// ============================================================
// 3. 链尾 == 最终输出
// ============================================================
test('trace: 攻撃力链尾 == r.stats.攻撃力', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }], { traceEnabled: true });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  const steps = _stepsFor(r.trace, '攻撃力');
  assert.ok(steps.length > 0, 'ATK+10% skill 应产生至少 1 step');
  assert.ok(Math.abs(steps[steps.length - 1].after - r.stats['攻撃力']) < 1e-3);
});

test('trace: 転速链尾 ≈ r.speed.latestRecover', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }], { traceEnabled: true });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  const steps = _stepsFor(r.trace, '転速');
  assert.ok(steps.length > 0, 'SPD+20% skill 应产生至少 1 step');
  // 链是等价重演 (fold 浮点顺序差 1ulp 容差)
  assert.ok(Math.abs(steps[steps.length - 1].after - r.speed.latestRecover) < 1e-6);
});

test('trace: 攻速链尾 (各段) ≈ r.motionSpeed.speeds', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }], { traceEnabled: true });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  for (let i = 0; i < 3; i++) {
    const steps = _stepsFor(r.trace, new RegExp(`^攻速${i + 1}$`));
    assert.ok(steps.length > 0, `MS+5% 应给攻速${i + 1}产生 step`);
    assert.ok(Math.abs(steps[steps.length - 1].after - r.motionSpeed.speeds[i]) < 1e-6);
  }
});

test('trace: Hit 链尾 == r.hits (floor/max(1) 步含在链里)', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }], { traceEnabled: true });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  for (let i = 0; i < 3; i++) {
    const steps = _stepsFor(r.trace, new RegExp(`^Hit${i + 1}$`));
    assert.ok(steps.length > 0, `HIT+1 应给 Hit${i + 1} 产生 step`);
    assert.strictEqual(steps[steps.length - 1].after, r.hits[i]);
  }
});

test('trace: ダメ上限链尾 == r.damageLimit', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }], { traceEnabled: true });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  const steps = _stepsFor(r.trace, 'ダメ上限');
  assert.ok(steps.length > 0, 'DL×2 应产生 step');
  assert.strictEqual(steps[steps.length - 1].after, r.damageLimit);
});

// ============================================================
// 4. 链连续性 + src 标签
// ============================================================
test('trace: 攻撃力 step 链连续 (after === 下一步 before)', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }], { traceEnabled: true });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  const steps = _stepsFor(r.trace, '攻撃力');
  assert.strictEqual(steps[0].before, r.trace.base['攻撃力']);
  for (let i = 0; i < steps.length - 1; i++) {
    assert.strictEqual(steps[i].after, steps[i + 1].before, `step ${i}→${i + 1} 链断`);
  }
});

test('trace: step src 含 skill 名 + slot 标', () => {
  const chara = mockChara();
  const ctx = buildCtx([{ chara }], { traceEnabled: true });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  const steps = _stepsFor(r.trace, '攻撃力');
  const skillStep = steps.find((s) => s.src.includes('ATK+10%'));
  assert.ok(skillStep, 'src 应含 skill 名');
  assert.ok(skillStep.src.includes('@S1'), 'src 应含 slot 标');
});

// ============================================================
// 5. s4a/s4b 分 stage: 非 soul 类 (s4a 按 slot)、soul 类 (s4b)
// ============================================================
test('trace: s4a=非soul(slot顺)、s4b=soul、计算顺序 = stage 顺序', () => {
  const chara0 = mockChara();
  const chara1 = mockChara({ id: 1002, name: 'TEST2' });
  const soul0 = {
    _master: {
      id: 100, name: 'SOUL_A', rarity: 5, max_level: 10,
      skills: [{ name: 'SOUL_ATK', parameter: 'Attack', math_type: 'Multiply', value: 1.5 }],
      element_affinity: {}, weapon_affinity: {},
    },
    id: 100, name: 'SOUL_A',
  };
  const ctx = (() => {
    const team = [
      { chara: chara0.id, soul: soul0.id, bg: null, masou: null, crystals: [], tr: mkTr() },
      { chara: chara1.id, soul: null, bg: null, masou: null, crystals: [], tr: mkTr() },
      { chara: null, soul: null, bg: null, masou: null, crystals: [], tr: mkTr() },
    ];
    return {
      team, allCharas: [chara0, chara1], allSouls: [soul0], allBGs: [], allMasou: [], allCrystals: [],
      allGuildTitles: [], allGuildEmblems: [],
      enemy: { element: 0, bk: false },
      traceEnabled: true,
    };
  })();
  const r = computeStats(chara0, ctx.team[0].tr, 0, ctx);
  // 非 soul → s4a (按 slot 顺)、soul → s4b
  const s4a = r.trace.stages.find((s) => s.key === 's4a_other_mul');
  const s4b = r.trace.stages.find((s) => s.key === 's4b_soul_mul');
  const aSrcs = s4a.steps.filter((s) => s.stat === '攻撃力').map((s) => s.src);
  const bSrcs = s4b.steps.filter((s) => s.stat === '攻撃力').map((s) => s.src);
  assert.ok(aSrcs.every((s) => !s.includes('SOUL_ATK')), `s4a 不应含 soul: ${JSON.stringify(aSrcs)}`);
  assert.ok(bSrcs.some((s) => s.includes('SOUL_ATK')), `s4b 应含 soul: ${JSON.stringify(bSrcs)}`);
  // s4a 内 slot 顺序: @S1 在 @S2 前
  const s1Idx = aSrcs.findIndex((s) => s.includes('@S1'));
  const s2Idx = aSrcs.findIndex((s) => s.includes('@S2'));
  assert.ok(s1Idx >= 0 && s2Idx >= 0 && s1Idx < s2Idx, `slot 顺序: ${JSON.stringify(aSrcs)}`);
  // 计算顺序 = stage 顺序: s4b 第一步的 before === s4a 最后一步的 after
  const aAtk = s4a.steps.filter((s) => s.stat === '攻撃力');
  const bAtk = s4b.steps.filter((s) => s.stat === '攻撃力');
  assert.strictEqual(bAtk[0].before, aAtk[aAtk.length - 1].after, 's4a→s4b 链应连续');
});

// ============================================================
// 6. hits 序贯 floor + soul values 数组等级加成 (2026-06-10 用户实测)
// ============================================================
test('hits: 每步 floor 后再做下一步 (非一次性 fold)', () => {
  // base hit 3、chara skill Mul ×1.5 → floor(4.5)=4、再 Add +0.9 → floor(4.9)=4
  // 旧 fold 公式: floor(3×1.5+0.9) = floor(5.4) = 5 — 行为不同、锁新值
  const chara = mockChara();
  chara._master.states['通常'].weapon_skills = [
    { name: 'HITx1.5', parameter: 'HitCount', math_type: 'Multiply', value: 1.5, value_scaling: 0 },
    { name: 'HIT+0.9', parameter: 'HitCount', math_type: 'Addition', value: 0.9, value_scaling: 0 },
  ];
  const ctx = buildCtx([{ chara }]);
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  assert.strictEqual(r.hits[0], 4, '逐步 floor: floor(floor(3×1.5)+0.9) = 4 (旧 fold 是 5)');
});

test('hits: soul values=[a,b,c] 数组吃 soulMultiplier', () => {
  // 5★ soul lv50 → soulMultiplier = 1.5; values=[2,0,0] Addition → 段1 +2×1.5=+3 → floor(3+3)=6
  const chara = mockChara({
    states: {
      '通常': {
        ...mockChara()._master.states['通常'],
        weapon_skills: [],
      },
    },
  });
  const soul = {
    _master: {
      id: 101, name: 'HIT_SOUL', rarity: 5, max_level: 10,
      skills: [{ name: 'SOUL_HIT', parameter: 'HitCount', math_type: 'Addition', value: 0, values: [2, 0, 0] }],
      element_affinity: {}, weapon_affinity: {},
    },
    id: 101, name: 'HIT_SOUL',
  };
  const tr = { ...mkTr(), soul_lv: 50 };
  const team = [{ chara: chara.id, soul: soul.id, bg: null, masou: null, crystals: [], tr }];
  const ctx = {
    team, allCharas: [chara], allSouls: [soul], allBGs: [], allMasou: [], allCrystals: [],
    allGuildTitles: [], allGuildEmblems: [],
    enemy: { element: 0, bk: false },
  };
  const r = computeStats(chara, team[0].tr, 0, ctx);
  assert.strictEqual(r.hits[0], 6, 'values[0]=2 × soulMult 1.5 = +3 → 3+3=6 (未缩放则 5)');
});

// ============================================================
// 7. enemy mods stage (element matchup)
// ============================================================
test('trace: enemy element matchup 进 s8_enemy_mods、链尾 == 显示值', () => {
  const chara = mockChara();   // element_id=1
  // enemy element 相克 chara → elemMult ≠ 1 (elementMatchupMult(1, 2, 'normal'))
  const ctx = buildCtx([{ chara }], { traceEnabled: true, enemy: { element: 3, bk: false } });
  const r = computeStats(chara, ctx.team[0].tr, 0, ctx);
  const s8 = r.trace.stages.find((s) => s.key === 's8_enemy_mods');
  const atkSteps = s8.steps.filter((s) => s.stat === '攻撃力');
  if (atkSteps.length) {
    // 最后一步 after = ceil 后实际显示值
    assert.strictEqual(atkSteps[atkSteps.length - 1].after, r.stats['攻撃力']);
  }
});
