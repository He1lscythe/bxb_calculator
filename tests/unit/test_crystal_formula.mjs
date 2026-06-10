// tests/unit/test_crystal_formula.mjs — Phase 7 Session 2: crystal effective value 公式单测
//
// 覆盖:
// - fallback (M_L/W/P_max 都没填) → max_value × lv 线性插值
// - 三因子公式 (M_L_max 等填了) → initial × M_L × M_W × M_P
// - 边界值 (lv=1 / lv=lvMax / W=min / W=max / P=min / P=max)
// - cfg 缺省 (无 cfg → lv=lvMax, W=maxW, P=maxP)

import { test } from 'node:test';
import assert from 'node:assert';
import { crystalEffectiveValue } from '../../shared/hensei-helpers.js';

const mkCrystal = (master) => ({ _master: { ...master } });

// ============================================================
// fallback: M_L/W/P_max 都没填 → max_value 线性
// ============================================================
test('fallback: 无 M_*_max → max_value lv 线性 (lv=1 → init)', () => {
  const cr = mkCrystal({ initial_value: 1.01, max_value: 5.0, max_level: 20 });
  assert.strictEqual(crystalEffectiveValue(cr, { lv: 1 }), 1.01);
});

test('fallback: 无 M_*_max → max_value lv 线性 (lv=max → max_value)', () => {
  const cr = mkCrystal({ initial_value: 1.01, max_value: 5.0, max_level: 20 });
  assert.strictEqual(crystalEffectiveValue(cr, { lv: 20 }), 5.0);
});

test('fallback: lv 中间值 → 线性插值', () => {
  const cr = mkCrystal({ initial_value: 1.0, max_value: 3.0, max_level: 11 });
  // lv=6 → ratio=(6-1)/(11-1)=0.5 → 1 + (3-1)*0.5 = 2
  assert.strictEqual(crystalEffectiveValue(cr, { lv: 6 }), 2.0);
});

test('fallback: max_value=null → initial_value (840/2063 crystal 已知情况)', () => {
  const cr = mkCrystal({ initial_value: 1.01, max_value: null, max_level: 20 });
  assert.strictEqual(crystalEffectiveValue(cr, { lv: 20 }), 1.01);
});

test('fallback: cfg 缺省 → lv=lvMax', () => {
  const cr = mkCrystal({ initial_value: 1.0, max_value: 5.0, max_level: 10 });
  assert.strictEqual(crystalEffectiveValue(cr, undefined), 5.0);
  assert.strictEqual(crystalEffectiveValue(cr, {}), 5.0);
});

// ============================================================
// 三因子公式 (M_L_max 填了 → 切公式)
// ============================================================
test('三因子: 全 max → init × ML_max × MW_max × MP_max', () => {
  const cr = mkCrystal({
    initial_value: 1.0,
    max_value: null,
    max_level: 20,
    M_L_max: 2.0,
    M_W_max: 1.5,
    M_P_max: 1.2,
    min_weight: 0, max_weight: 100,
    min_purity: 0, max_purity: 100,
  });
  // lv=20 (满) W=100 P=100 → ML=2.0 / MW=1.5 / MP=1.2 → 1 × 2 × 1.5 × 1.2 = 3.6
  const v = crystalEffectiveValue(cr, { lv: 20, weight: 100, purity: 100 });
  assert.strictEqual(Math.abs(v - 3.6) < 1e-9, true);
});

test('三因子: 全 min → init × 1 × 1 × 1 = init', () => {
  const cr = mkCrystal({
    initial_value: 1.5,
    max_level: 20,
    M_L_max: 2.0,
    M_W_max: 1.5,
    M_P_max: 1.2,
    min_weight: 0, max_weight: 100,
    min_purity: 0, max_purity: 100,
  });
  // lv=1 W=0 P=0 → ML=MW=MP=1 → 1.5 × 1 × 1 × 1 = 1.5
  const v = crystalEffectiveValue(cr, { lv: 1, weight: 0, purity: 0 });
  assert.strictEqual(Math.abs(v - 1.5) < 1e-9, true);
});

test('三因子: 只 M_W_max 填了 → 切公式 (M_L_max / M_P_max 缺省 1)', () => {
  const cr = mkCrystal({
    initial_value: 1.0,
    max_level: 10,
    M_W_max: 2.0,
    // M_L_max / M_P_max 不写 → 缺省 1
    min_weight: 0, max_weight: 100,
  });
  // lv=10 W=100 → ML=1 (缺省) / MW=2 / MP=1 (缺省) → 1 × 1 × 2 × 1 = 2
  const v = crystalEffectiveValue(cr, { lv: 10, weight: 100, purity: 100 });
  assert.strictEqual(Math.abs(v - 2.0) < 1e-9, true);
});

test('三因子: weight 中间值 → 线性插值', () => {
  const cr = mkCrystal({
    initial_value: 1.0,
    max_level: 10,
    M_W_max: 3.0,
    min_weight: 0, max_weight: 100,
  });
  // W=50 → MW = 1 + (3-1) × (50-0)/(100-0) = 1 + 1 = 2.0
  const v = crystalEffectiveValue(cr, { lv: 10, weight: 50, purity: 100 });
  assert.strictEqual(Math.abs(v - 2.0) < 1e-9, true);
});

test('三因子: weight 非零 min_weight 边界', () => {
  const cr = mkCrystal({
    initial_value: 1.0,
    max_level: 10,
    M_W_max: 2.0,
    min_weight: 20, max_weight: 80,
  });
  // W=20 (min) → MW=1; W=80 (max) → MW=2; W=50 (mid) → MW=1.5
  assert.strictEqual(crystalEffectiveValue(cr, { lv: 10, weight: 20, purity: 100 }), 1.0);
  assert.strictEqual(crystalEffectiveValue(cr, { lv: 10, weight: 80, purity: 100 }), 2.0);
  assert.strictEqual(Math.abs(crystalEffectiveValue(cr, { lv: 10, weight: 50, purity: 100 }) - 1.5) < 1e-9, true);
});

test('三因子: cfg 缺省 → W=maxW, P=maxP (满)', () => {
  const cr = mkCrystal({
    initial_value: 1.0,
    max_level: 10,
    M_W_max: 2.0,
    M_P_max: 1.5,
    min_weight: 0, max_weight: 100,
    min_purity: 0, max_purity: 100,
  });
  // cfg 缺省 lv=10 (lvMax) W=100 P=100 → ML=1 / MW=2 / MP=1.5 → 1 × 2 × 1.5 = 3
  const v = crystalEffectiveValue(cr, {});
  assert.strictEqual(Math.abs(v - 3.0) < 1e-9, true);
});

// ============================================================
// 退化 case
// ============================================================
test('退化: cr._master 缺失 → 0', () => {
  assert.strictEqual(crystalEffectiveValue({}, { lv: 1 }), 0);
  assert.strictEqual(crystalEffectiveValue(null, { lv: 1 }), 0);
});

test('退化: max_level=1 → ratio=0、fallback init=max_value 时也走 init', () => {
  const cr = mkCrystal({ initial_value: 5.0, max_value: 5.0, max_level: 1 });
  assert.strictEqual(crystalEffectiveValue(cr, { lv: 1 }), 5.0);
});

test('退化: 三因子 max_weight == min_weight → MW=1 (无插值)', () => {
  const cr = mkCrystal({
    initial_value: 1.0,
    max_level: 10,
    M_W_max: 2.0,
    min_weight: 50, max_weight: 50,
  });
  // 不管 W 值都 MW=1
  assert.strictEqual(crystalEffectiveValue(cr, { lv: 10, weight: 50, purity: 100 }), 1.0);
});

console.log('\n[test_crystal_formula] all tests defined');
