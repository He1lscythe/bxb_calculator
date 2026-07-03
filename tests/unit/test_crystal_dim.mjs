// tests/unit/test_crystal_dim.mjs — crystal hensei popover 维度可用性 + slider step + clamp 单测
//
// 覆盖近期改动 (2026-06-10):
// - cryLvMax 读 master.max_level (而非 cr.level_max 字段)
// - crystalDimAvailability: hasW/hasP/hasLv 只看 M_W_max/M_P_max/cryLvMax>1
// - crystalSliderStep: weight_step/purity_step 缺省 fallback 0.1/0.01
// - clampCrystalMasterField: M_W_max/M_P_max 数值 0-100 clamp、frac string 透传

import { test } from 'node:test';
import assert from 'node:assert';
import {
  cryLvMax,
  crystalDimAvailability,
  crystalSliderStep,
  clampCrystalMasterField,
  crystalShowWeightRange,
  crystalShowPurityRange,
  crystalMinPlaceholder,
} from '../../shared/hensei-helpers.js';

// ============================================================
// cryLvMax — 读 master.max_level (修正 level_max 拼错)
// ============================================================
test('cryLvMax: 读 cr.max_level (非 cr.level_max)', () => {
  // master 通过 adapter 透传 → cr.max_level (跟 _master.id 平行)
  assert.strictEqual(cryLvMax({ max_level: 20, rarity: 5 }), 20);
  assert.strictEqual(cryLvMax({ max_level: 1, rarity: 5 }), 1);
});

test('cryLvMax: 缺省时按 rarity 表 fallback', () => {
  // CRYSTAL_RARITY_LV_MAX = { 1:10, 2:30, 3:80, 4:120, 5:160, 6:200 }
  assert.strictEqual(cryLvMax({ rarity: 5 }), 160);
  assert.strictEqual(cryLvMax({ rarity: 1 }), 10);
});

test('cryLvMax: 错位 level_max 字段不被读 (修 bug 2026-06-10)', () => {
  // 旧 bug: 读 cr.level_max 永远 undefined → 永走 rarity fallback、忽略实际 max_level
  // 验证: 给 level_max 不影响、max_level 才生效
  const cr = { level_max: 999, rarity: 5 };   // 没 max_level
  assert.strictEqual(cryLvMax(cr), 160);       // rarity 5 fallback
});

// ============================================================
// crystalDimAvailability — ⚙ button + popover 显示条件共用
// ============================================================
test('crystalDimAvailability: M_W_max != null → hasW', () => {
  const a = crystalDimAvailability({ _master: { M_W_max: 1.13, max_level: 1 } });
  assert.deepStrictEqual(a, { hasW: true, hasP: false, hasLv: false });
});

test('crystalDimAvailability: M_P_max != null → hasP', () => {
  const a = crystalDimAvailability({ _master: { M_P_max: 1.5, max_level: 1 } });
  assert.deepStrictEqual(a, { hasW: false, hasP: true, hasLv: false });
});

test('crystalDimAvailability: max_level > 1 → hasLv', () => {
  const a = crystalDimAvailability({ _master: { max_level: 20 }, max_level: 20, rarity: 5 });
  assert.strictEqual(a.hasLv, true);
});

test('crystalDimAvailability: max_level=1 → hasLv=false (32 件 chara-only crystal)', () => {
  const cr = { _master: { max_level: 1 }, max_level: 1, rarity: 1 };
  const a = crystalDimAvailability(cr);
  assert.strictEqual(a.hasLv, false);
});

test('crystalDimAvailability: weight_step 不影响 hasW (跟 cr-edit dropdown 解耦)', () => {
  // 用户决策 2026-06-10: hasW 只看 M_W_max、weight_step 走 fallback 0.1
  const a1 = crystalDimAvailability({ _master: { M_W_max: 1.13, weight_step: null, max_level: 1 } });
  const a2 = crystalDimAvailability({ _master: { M_W_max: 1.13, weight_step: 1, max_level: 1 } });
  assert.strictEqual(a1.hasW, true);
  assert.strictEqual(a2.hasW, true);
});

test('crystalDimAvailability: 全 null → 三个全 false (button 不显示)', () => {
  const a = crystalDimAvailability({ _master: { max_level: 1 }, max_level: 1, rarity: 1 });
  assert.deepStrictEqual(a, { hasW: false, hasP: false, hasLv: false });
});

test('crystalDimAvailability: cr=null 安全 (空 slot)', () => {
  const a = crystalDimAvailability(null);
  assert.deepStrictEqual(a, { hasW: false, hasP: false, hasLv: false });
});

test('crystalDimAvailability: 固定重量 min==max → hasW=false (滑条不显示、值恒 M_W_max)', () => {
  const a = crystalDimAvailability({
    _master: { M_W_max: 1.5, min_weight: 100, max_weight: 100, max_level: 1 },
  });
  assert.strictEqual(a.hasW, false);
});

test('crystalDimAvailability: 固定纯度 min==max → hasP=false', () => {
  const a = crystalDimAvailability({
    _master: { M_P_max: 1.31, min_purity: 100, max_purity: 100, max_level: 1 },
  });
  assert.strictEqual(a.hasP, false);
});

test('crystalDimAvailability: range 留空 (0/100 缺省) → hasW 不受影响', () => {
  const a = crystalDimAvailability({ _master: { M_W_max: 1.5, max_level: 1 } });
  assert.strictEqual(a.hasW, true);
});

// ============================================================
// crystalSliderStep — revise 没填 weight_step / purity_step 时 fallback
// ============================================================
test('crystalSliderStep: weight_step 设了 → 用设定值', () => {
  assert.strictEqual(crystalSliderStep({ weight_step: 1 }, 'weight'), 1);
  assert.strictEqual(crystalSliderStep({ weight_step: 25 }, 'weight'), 25);
});

test('crystalSliderStep: weight_step null → fallback 0.1', () => {
  assert.strictEqual(crystalSliderStep({ weight_step: null }, 'weight'), 0.1);
  assert.strictEqual(crystalSliderStep({}, 'weight'), 0.1);
});

test('crystalSliderStep: purity_step null → fallback 0.01', () => {
  assert.strictEqual(crystalSliderStep({ purity_step: null }, 'purity'), 0.01);
  assert.strictEqual(crystalSliderStep({}, 'purity'), 0.01);
});

test('crystalSliderStep: purity_step 设了 → 用设定值', () => {
  assert.strictEqual(crystalSliderStep({ purity_step: 25 }, 'purity'), 25);
});

test('crystalSliderStep: lv 永远 step=1', () => {
  assert.strictEqual(crystalSliderStep({}, 'lv'), 1);
});

// ============================================================
// clampCrystalMasterField — M_W_max / M_P_max 0-100 clamp
// ============================================================
test('clampCrystalMasterField: M_W_max 数值 0-100 内透传', () => {
  assert.strictEqual(clampCrystalMasterField('M_W_max', 1.13), 1.13);
  assert.strictEqual(clampCrystalMasterField('M_W_max', 100), 100);
  assert.strictEqual(clampCrystalMasterField('M_W_max', 0), 0);
});

test('clampCrystalMasterField: M_W_max 超 100 → 100', () => {
  assert.strictEqual(clampCrystalMasterField('M_W_max', 150), 100);
  assert.strictEqual(clampCrystalMasterField('M_W_max', 9999), 100);
});

test('clampCrystalMasterField: M_W_max 负 → 0', () => {
  assert.strictEqual(clampCrystalMasterField('M_W_max', -1), 0);
  assert.strictEqual(clampCrystalMasterField('M_W_max', -100), 0);
});

test('clampCrystalMasterField: M_P_max 同样 clamp', () => {
  assert.strictEqual(clampCrystalMasterField('M_P_max', 150), 100);
  assert.strictEqual(clampCrystalMasterField('M_P_max', -5), 0);
  assert.strictEqual(clampCrystalMasterField('M_P_max', 2.5), 2.5);
});

test('clampCrystalMasterField: 分式字符串透传 (frac 形态保留语义)', () => {
  assert.strictEqual(clampCrystalMasterField('M_W_max', '5/1.13'), '5/1.13');
  assert.strictEqual(clampCrystalMasterField('M_P_max', '999/9'), '999/9');
});

test('clampCrystalMasterField: 其他字段不 clamp (M_L_max / max_value)', () => {
  assert.strictEqual(clampCrystalMasterField('M_L_max', 500), 500);
  assert.strictEqual(clampCrystalMasterField('max_value', 999), 999);
});

test('clampCrystalMasterField: null/undefined 透传', () => {
  assert.strictEqual(clampCrystalMasterField('M_W_max', null), null);
  assert.strictEqual(clampCrystalMasterField('M_P_max', undefined), undefined);
});

// ============================================================
// crystalShowWeightRange / crystalShowPurityRange — display body 因子行内 min/max 显示判定
// ============================================================
test('crystalShowWeightRange: M_W_max>1 → true (有缩放、min/max 有意义)', () => {
  assert.strictEqual(crystalShowWeightRange({ M_W_max: 1.13 }), true);
  assert.strictEqual(crystalShowWeightRange({ M_W_max: 5 }), true);
});

test('crystalShowWeightRange: M_W_max=1 → false (无缩放、min/max 固定 100)', () => {
  assert.strictEqual(crystalShowWeightRange({ M_W_max: 1 }), false);
});

test('crystalShowWeightRange: M_W_max=null/缺省 → false', () => {
  assert.strictEqual(crystalShowWeightRange({}), false);
  assert.strictEqual(crystalShowWeightRange({ M_W_max: null }), false);
  assert.strictEqual(crystalShowWeightRange(null), false);
});

test('crystalShowPurityRange: M_P_max>1 → true', () => {
  assert.strictEqual(crystalShowPurityRange({ M_P_max: 1.5 }), true);
});

test('crystalShowPurityRange: M_P_max=1 → false', () => {
  assert.strictEqual(crystalShowPurityRange({ M_P_max: 1 }), false);
});

test('crystalShowPurityRange: M_P_max=null → false', () => {
  assert.strictEqual(crystalShowPurityRange({}), false);
  assert.strictEqual(crystalShowPurityRange(null), false);
});

// ============================================================
// crystalMinPlaceholder — edit form 输入 placeholder
// ============================================================
test('crystalMinPlaceholder: min_weight + M_W_max 无缩放 → 100', () => {
  assert.strictEqual(crystalMinPlaceholder('min_weight', { M_W_max: 1 }), 100);
  assert.strictEqual(crystalMinPlaceholder('min_weight', {}), 100);
  assert.strictEqual(crystalMinPlaceholder('min_weight', null), 100);
});

test('crystalMinPlaceholder: min_weight + M_W_max>1 → 0 (range 起点)', () => {
  assert.strictEqual(crystalMinPlaceholder('min_weight', { M_W_max: 1.13 }), 0);
});

test('crystalMinPlaceholder: min_purity + M_P_max=1 → 100', () => {
  assert.strictEqual(crystalMinPlaceholder('min_purity', { M_P_max: 1 }), 100);
});

test('crystalMinPlaceholder: min_purity + M_P_max>1 → 0', () => {
  assert.strictEqual(crystalMinPlaceholder('min_purity', { M_P_max: 1.5 }), 0);
});

test('crystalMinPlaceholder: 其他字段 → null (不干预)', () => {
  assert.strictEqual(crystalMinPlaceholder('max_weight', { M_W_max: 1 }), null);
  assert.strictEqual(crystalMinPlaceholder('M_W_max', {}), null);
});
