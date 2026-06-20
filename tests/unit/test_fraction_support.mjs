// tests/unit/test_fraction_support.mjs
// 分式 (a/b) + 小数/整数 在 hensei 计算各消费点的覆盖 (2026-06-20)。
//
// 约定 (用户决策):
//   - 编辑保存时: 分式输入存 string ('5/1.13')、小数/整数输入存 number;空/无效 → 0。
//   - hensei 计算时: parseHit / parseFactor / chara-adapter._parseFrac 统一解析 (string→number、number 透传)。
//
// 每个消费点验证两点:
//   (a) 分式输入 === 等价小数输入 (parse 等价、保证两种存法计算一致)
//   (b) 一个锚定数值 (整数算术、无浮点歧义)
//
// 覆盖点: parseHit 基础 / chara skill Multiply / chara skill Addition / chara HitCount /
//         masou effect / crystal max_value (fallback) / crystal M_L/W/P_max (三因子) /
//         chara-adapter bairitu_scaling + hit_per_stage_scaling
import { test } from 'node:test';
import assert from 'node:assert';
import { computeStats, mkTr } from '../../shared/stats-calc.js';
import { crystalEffectiveValue, crystalMaxBairitu, parseHit } from '../../shared/hensei-helpers.js';
import { adaptCharaList } from '../../shared/chara-adapter.js';

// ============================================================
// mocks (跟 test_stats_calc.mjs 同款最小集)
// ============================================================
function mockChara(over = {}) {
  const m = {
    id: 1001, name: 'TEST', rarity: 4, element_id: 1, weapon_type_id: 1, tags: [], omoide: [],
    states: {
      '通常': {
        stats: {
          initial_hp: 6000, max_hp: 15000, initial_attack: 5000, max_attack: 13000,
          initial_defense: 2000, max_defense: 5000, initial_break: 400, max_break: 1000,
          initial_speed: 9, max_speed: 22, max_mature: 60, initial_max_level: 60,
          max_max_level: 250, max_lp: 9, initial_slot: 3,
        },
        weapon_skills: [], hit_counts: [3, 3, 14],
      },
    },
    bd_skill: { effects: [] },
    ...over,
  };
  return { _master: m, id: m.id, name: m.name };
}
function mockCrystal(over = {}) {
  const m = {
    id: 200, name: 'TEST_CR', rarity: 5, parameter: 'Attack', math_type: 'Multiply',
    initial_value: 1.0, max_value: 1.30, max_level: 2,
    element_id: 0, weapon_type_id: 0, conditional_parameter: false, ...over,
  };
  return { _master: m, id: m.id, name: m.name };
}
function mockMasou(over = {}) {
  return { id: 400, name: 'TEST_MASOU', effects: [], ...over };
}
function buildCtx(slots) {
  const allCharas = slots.filter((s) => s?.chara).map((s) => s.chara);
  const allMasou = slots.filter((s) => s?.masou).map((s) => s.masou);
  const allCrystals = [];
  slots.forEach((s) => (s?.crystals || []).forEach((c) => c && allCrystals.push(c.obj)));
  const team = slots.map((s) => ({
    chara: s?.chara?.id ?? null, soul: null, bg: null,
    masou: s?.masou?.id ?? null,
    crystals: (s?.crystals || []).map((c) => (c ? { id: c.obj.id, lv: c.lv ?? 1 } : null)),
    tr: s?.tr || mkTr(),
  }));
  return {
    team, allCharas, allSouls: [], allBGs: [], allMasou, allCrystals,
    allGuildTitles: [], allGuildEmblems: [], enemy: { element: 0, bk: false },
  };
}
const skillChara = (sk) => mockChara({
  states: { '通常': { ...mockChara()._master.states['通常'], weapon_skills: [sk] } },
});
const hitChara = (sk) => mockChara({
  states: { '通常': { ...mockChara()._master.states['通常'], hit_counts: [3, 3, 14], weapon_skills: [sk] } },
});
const runAtk = (chara, extra = {}) => {
  const ctx = buildCtx([{ chara, tr: { ...mkTr(), level: 250, jukudo: 60 }, ...extra }, null, null]);
  return computeStats(chara, ctx.team[0].tr, 0, ctx).stats['攻撃力'];
};

// ============================================================
// 0. parseHit 基础 (分式 / 小数 / 整数 / 无效)
// ============================================================
test('parseHit: 分式 a/b → a/b', () => {
  assert.strictEqual(parseHit('1/2'), 0.5);
  assert.strictEqual(parseHit('500/113'), 500 / 113);
});
test('parseHit: 小数 / 整数 (string + number 都接受)', () => {
  assert.strictEqual(parseHit('0.05'), 0.05);
  assert.strictEqual(parseHit(0.05), 0.05);
  assert.strictEqual(parseHit('3'), 3);
  assert.strictEqual(parseHit(3), 3);
});
test('parseHit: 无效 / 除零 / 空 → 0', () => {
  assert.strictEqual(parseHit('5/0'), 0);
  assert.strictEqual(parseHit('abc'), 0);
  assert.strictEqual(parseHit(''), 0);
  assert.strictEqual(parseHit(null), 0);
  assert.strictEqual(parseHit('5/'), 0);     // 缺分母
});

// ============================================================
// 1. chara skill value_scaling — Multiply
// ============================================================
test('chara skill Multiply: 分式 "1/2" === 小数 0.5', () => {
  const mk = (vs) => skillChara({ parameter: 'Attack', math_type: 'Multiply', value: 1.0, value_scaling: vs, range: 'Single' });
  assert.strictEqual(runAtk(mk('1/2')), runAtk(mk(0.5)));
  // value 1.0 + parseHit*jukudo(60): 1 + 0.5*60 = 31 → 13000 × 31 = 403000
  assert.strictEqual(runAtk(mk('1/2')), 403000);
});

// ============================================================
// 2. chara skill value_scaling — Addition
// ============================================================
test('chara skill Addition: 分式 "60/60" === 整数 1', () => {
  const mk = (vs) => skillChara({ parameter: 'Attack', math_type: 'Addition', value: 1000, value_scaling: vs, range: 'Single' });
  assert.strictEqual(runAtk(mk('60/60')), runAtk(mk(1)));
  // value 1000 + 1*60 = 1060 → 13000 + 1060 = 14060
  assert.strictEqual(runAtk(mk('60/60')), 14060);
});

// ============================================================
// 3. chara HitCount value_scaling (逐段)
// ============================================================
test('chara HitCount: 分式 "60/60" === 整数 1', () => {
  const mk = (vs) => hitChara({ parameter: 'HitCount', math_type: 'Addition', value: 0, value_scaling: vs, range: 'Single' });
  const run = (vs) => {
    const c = mk(vs);
    const ctx = buildCtx([{ chara: c, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null]);
    return computeStats(c, ctx.team[0].tr, 0, ctx).hits;
  };
  assert.deepStrictEqual(run('60/60'), run(1));
  // value 0 + 1*60 = 60 → 每段 +60: [63, 63, 74]
  assert.deepStrictEqual(run('60/60'), [63, 63, 74]);
});

// ============================================================
// 4. masou effect value_scaling
// ============================================================
test('masou effect Multiply: 分式 "1/2" === 小数 0.5', () => {
  const run = (vs) => {
    const c = mockChara();
    const m = mockMasou({ effects: [{ parameter: 'Attack', math_type: 'Multiply', value: 1.0, value_scaling: vs, range: 'All' }] });
    const ctx = buildCtx([{ chara: c, masou: m, tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null]);
    return computeStats(c, ctx.team[0].tr, 0, ctx).stats['攻撃力'];
  };
  assert.strictEqual(run('1/2'), run(0.5));
  // masou Mul ×(1 + 0.5*60)=×31 → 13000 × 31 = 403000 (stage2 floor 整数)
  assert.strictEqual(run('1/2'), 403000);
});

// ============================================================
// 5. crystal max_value (fallback 线性) — 经 computeStats 全链路
// ============================================================
test('crystal max_value: 分式 "2/1" === 整数 2 (computeStats)', () => {
  const run = (mv) => {
    const c = mockChara();
    const cr = mockCrystal({ parameter: 'Attack', math_type: 'Multiply', initial_value: 1.0, max_value: mv, max_level: 2 });
    const ctx = buildCtx([{ chara: c, crystals: [{ obj: cr, lv: 2 }], tr: { ...mkTr(), level: 250, jukudo: 60 } }, null, null]);
    return computeStats(c, ctx.team[0].tr, 0, ctx).stats['攻撃力'];
  };
  assert.strictEqual(run('2/1'), run(2));
  // max_value=2 @ lv2(max): effect = 1 + (2-1)*1 = 2 → 13000 × 2 = 26000
  assert.strictEqual(run('2/1'), 26000);
});

test('crystalMaxBairitu / crystalEffectiveValue: max_value 分式 === 小数', () => {
  assert.strictEqual(crystalMaxBairitu({ max_value: '5/1.13' }), 5 / 1.13);
  assert.strictEqual(crystalMaxBairitu({ max_value: 5 / 1.13 }), 5 / 1.13);
  const frac = { _master: { initial_value: 1, max_value: '5/1.13', max_level: 10 } };
  const dec = { _master: { initial_value: 1, max_value: 5 / 1.13, max_level: 10 } };
  assert.strictEqual(crystalEffectiveValue(frac, { lv: 10 }), crystalEffectiveValue(dec, { lv: 10 }));
});

// ============================================================
// 6. crystal M_L / M_W / M_P_max (三因子) — 分式
// ============================================================
test('crystal 三因子 M_L_max: 分式 "500/113" === 小数', () => {
  const base = { initial_value: 1.0, max_level: 10, M_W_max: 1, M_P_max: 1, min_weight: 0, max_weight: 100, min_purity: 0, max_purity: 100 };
  const frac = { _master: { ...base, M_L_max: '500/113' } };
  const dec = { _master: { ...base, M_L_max: 500 / 113 } };
  const cfg = { lv: 10, weight: 100, purity: 100 };
  assert.strictEqual(crystalEffectiveValue(frac, cfg), crystalEffectiveValue(dec, cfg));
  // init 1 × ML(500/113) × 1 × 1 = 500/113
  assert.ok(Math.abs(crystalEffectiveValue(frac, cfg) - 500 / 113) < 1e-9);
});

test('crystal 三因子 M_W_max / M_P_max: 分式 === 小数', () => {
  const base = { initial_value: 1.0, max_level: 10, min_weight: 0, max_weight: 100, min_purity: 0, max_purity: 100 };
  const frac = { _master: { ...base, M_W_max: '3/2', M_P_max: '6/5' } };
  const dec = { _master: { ...base, M_W_max: 1.5, M_P_max: 1.2 } };
  const cfg = { lv: 10, weight: 100, purity: 100 };
  assert.strictEqual(crystalEffectiveValue(frac, cfg), crystalEffectiveValue(dec, cfg));
});

// ============================================================
// 7. chara-adapter — value_scaling 分式 → bairitu_scaling / hit_per_stage_scaling 解析为数字
// ============================================================
test('chara-adapter: 分式 value_scaling → wiki effect bairitu_scaling 数字 (chara detail spec 用)', () => {
  const raw = {
    id: 1, name: 'T', rarity: 4, element_id: 1, weapon_type_id: 1, tags: [],
    states: {
      '通常': {
        variant_id: 101, stats: {}, hit_counts: [1, 1, 1],
        weapon_skills: [{ id: 9001, name: 's', parameter: 'Attack', math_type: 'Multiply', value: 1.0, value_scaling: '0.3/60' }],
      },
    },
    bd_skill: { effects: [] },
  };
  const wiki = adaptCharaList([raw], [])[0];
  const eff = wiki.states['通常'].skills[0].effects[0];
  assert.strictEqual(eff.bairitu_scaling, 0.3 / 60);           // 分式 → 数字
  assert.strictEqual(typeof eff.bairitu_scaling, 'number');
});

test('chara-adapter: HitCount 分式 value_scaling → hit_per_stage_scaling 数字', () => {
  const raw = {
    id: 1, name: 'T', rarity: 4, element_id: 1, weapon_type_id: 1, tags: [],
    states: {
      '通常': {
        variant_id: 101, stats: {}, hit_counts: [1, 1, 1],
        weapon_skills: [{ id: 9002, name: 'h', parameter: 'HitCount', math_type: 'Addition', value: 0, value_scaling: '1/2' }],
      },
    },
    bd_skill: { effects: [] },
  };
  const wiki = adaptCharaList([raw], [])[0];
  const eff = wiki.states['通常'].skills[0].effects[0];
  assert.deepStrictEqual(eff.hit_per_stage_scaling, [0.5, 0.5, 0.5]);   // "1/2" → 0.5
});

console.log('\n[test_fraction_support] all tests defined');
