// tests/unit/test_virtual_list.mjs — virtual-list.js 关键 measure decision 单测
//
// 覆盖 bg/crystal viewer vlist 高度失准 bug 修复 (2026-06-10):
//   原 bug: 若 row 第一次 measure 凑巧 real==estimate (kindH)、cache 不写;
//   后续其他 row 测出不同 kindH、_computeLayout 给该 row 用新 kindH 当 estimate → 错位。
// 修法: real > 0 时永远 cache (shouldCache 总是 true)、kindH 漂移不再影响已测 row。

import { test } from 'node:test';
import assert from 'node:assert';
import { decideMeasure } from '../../shared/virtual-list.js';

// ============================================================
// shouldCache: real > 0 时永远 true (修 bug 关键)
// ============================================================
test('decideMeasure: real==estimate 时仍 shouldCache (修 kindH drift bug)', () => {
  // 旧 buggy 版: real == e.height 不 cache、本测试覆盖修复
  const dec = decideMeasure(187, undefined, 187);
  assert.strictEqual(dec.shouldCache, true);
});

test('decideMeasure: real != estimate → shouldCache=true + shouldRelayout=true', () => {
  const dec = decideMeasure(187, undefined, 156);
  assert.strictEqual(dec.shouldCache, true);
  assert.strictEqual(dec.shouldRelayout, true);
});

test('decideMeasure: real==estimate → shouldCache=true 但 shouldRelayout=false', () => {
  const dec = decideMeasure(187, 187, 187);
  assert.strictEqual(dec.shouldCache, true);
  assert.strictEqual(dec.shouldRelayout, false);
});

test('decideMeasure: real=0 → 全 false (offsetHeight 异常时不更新 cache)', () => {
  const dec = decideMeasure(0, 187, 187);
  assert.deepStrictEqual(dec, { shouldCache: false, shouldRelayout: false, shouldNotify: false });
});

test('decideMeasure: real<0 → 全 false', () => {
  const dec = decideMeasure(-1, 187, 187);
  assert.deepStrictEqual(dec, { shouldCache: false, shouldRelayout: false, shouldNotify: false });
});

// ============================================================
// shouldNotify: 仅 prevCached 真变化时通知 (避免重复 onMeasure callback)
// ============================================================
test('decideMeasure: 首测 (prevCached=undefined) → shouldNotify=true', () => {
  const dec = decideMeasure(187, undefined, 156);
  assert.strictEqual(dec.shouldNotify, true);
});

test('decideMeasure: real 不变 (prevCached==real) → shouldNotify=false', () => {
  // 二次 measure 同值时、不再触发 onMeasure (避免 kindH 重复 set 同值)
  const dec = decideMeasure(187, 187, 187);
  assert.strictEqual(dec.shouldNotify, false);
});

test('decideMeasure: real 变化 (prevCached != real) → shouldNotify=true', () => {
  const dec = decideMeasure(200, 187, 156);
  assert.strictEqual(dec.shouldNotify, true);
});

// ============================================================
// real == estimate 时仍须 cache (各 row 独立缓存、不随 kindH 漂移)
// ============================================================
test('real == estimate (187) 时仍 cache', () => {
  const dec = decideMeasure(187, undefined, 187);
  assert.strictEqual(dec.shouldCache, true, 'cache MUST be set even when real == estimate');
});

test('real (156) ≠ estimate (187) → cache + relayout + notify', () => {
  const dec = decideMeasure(156, undefined, 187);
  assert.strictEqual(dec.shouldCache, true);
  assert.strictEqual(dec.shouldRelayout, true);
  assert.strictEqual(dec.shouldNotify, true);
});
