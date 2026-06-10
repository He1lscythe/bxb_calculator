// tests/unit/test_revise_core.mjs — Phase 7 Session 1 sparse diff unit tests
import { test } from 'node:test';
import assert from 'node:assert';
import {
  computeDiff,
  deepApply,
  pickPatches,
  mergeRevise,
  getPath,
  setPath,
  isPlainObject,
} from '../../shared/revise-core.js';

// ============================================================
// computeDiff — basic
// ============================================================
test('computeDiff: 无变化 → undefined (无 prev)', () => {
  const orig = { tags: [1, 2], value: 1.5 };
  const mod = { tags: [1, 2], value: 1.5 };
  assert.strictEqual(computeDiff(orig, mod), undefined);
});

test('computeDiff: 标量 字段变化', () => {
  const orig = { value: 1.5 };
  const mod = { value: 2.0 };
  assert.deepStrictEqual(computeDiff(orig, mod), { value: 2.0 });
});

test('computeDiff: 字段清除 (mod undefined) → null tombstone', () => {
  const orig = { value: 1.5, name: 'x' };
  const mod = { name: 'x' };
  assert.deepStrictEqual(computeDiff(orig, mod), { value: null });
});

test('computeDiff: 嵌套 object 部分变化', () => {
  const orig = { stats: { atk: 100, def: 50 } };
  const mod = { stats: { atk: 120, def: 50 } };
  assert.deepStrictEqual(computeDiff(orig, mod), { stats: { atk: 120 } });
});

test('computeDiff: 数组用 sparse dict 编码', () => {
  const orig = { skills: [{ v: 1 }, { v: 2 }, { v: 3 }] };
  const mod = { skills: [{ v: 1 }, { v: 99 }, { v: 3 }] };
  // 只第 1 项变化、用 sparse dict
  assert.deepStrictEqual(computeDiff(orig, mod), { skills: { 1: { v: 99 } } });
});

test('computeDiff: tags 数组替换 (全 emit、用 sparse)', () => {
  const orig = { tags: [1, 2, 5] };
  const mod = { tags: [1, 3, 5] };
  // 第 1 项 2→3 变化
  assert.deepStrictEqual(computeDiff(orig, mod), { tags: { 1: 3 } });
});

// ============================================================
// computeDiff — 撤回 (prev 第三参)
// ============================================================
test('computeDiff: 撤回 — mod 改回 orig + prev 有值 → emit null', () => {
  const orig = { value: 1.5 };
  const mod = { value: 1.5 };            // 改回原值
  const prev = { value: 2.0 };           // 上次保存的修改
  assert.deepStrictEqual(computeDiff(orig, mod, prev), { value: null });
});

test('computeDiff: 撤回 — 没动过 (prev 空) → undefined 无 diff', () => {
  const orig = { value: 1.5 };
  const mod = { value: 1.5 };
  assert.strictEqual(computeDiff(orig, mod, null), undefined);
});

test('computeDiff: 撤回 — 嵌套字段撤回', () => {
  const orig = { stats: { atk: 100 } };
  const mod = { stats: { atk: 100 } };
  const prev = { stats: { atk: 120 } };
  assert.deepStrictEqual(computeDiff(orig, mod, prev), { stats: { atk: null } });
});

// ============================================================
// deepApply
// ============================================================
test('deepApply: 简单字段覆盖', () => {
  const t = { value: 1.5, name: 'x' };
  deepApply(t, { value: 2.0 });
  assert.deepStrictEqual(t, { value: 2.0, name: 'x' });
});

test('deepApply: null 删 key (tombstone)', () => {
  const t = { value: 1.5, name: 'x' };
  deepApply(t, { value: null });
  assert.deepStrictEqual(t, { name: 'x' });
});

test('deepApply: 嵌套递归', () => {
  const t = { stats: { atk: 100, def: 50 } };
  deepApply(t, { stats: { atk: 120 } });
  assert.deepStrictEqual(t, { stats: { atk: 120, def: 50 } });
});

test('deepApply: sparse array dict 应用到数组', () => {
  const t = { skills: [{ v: 1 }, { v: 2 }, { v: 3 }] };
  deepApply(t, { skills: { 1: { v: 99 } } });
  assert.deepStrictEqual(t.skills, [{ v: 1 }, { v: 99 }, { v: 3 }]);
});

test('deepApply: round-trip — diff 后 apply 等于 modified', () => {
  const orig = { tags: [1, 2], stats: { atk: 100 }, skills: [{ v: 1 }, { v: 2 }] };
  const mod = { tags: [1, 3], stats: { atk: 100 }, skills: [{ v: 1 }, { v: 99 }] };
  const patch = computeDiff(orig, mod);
  const reconstructed = JSON.parse(JSON.stringify(orig));
  deepApply(reconstructed, patch);
  assert.deepStrictEqual(reconstructed, mod);
});

// ============================================================
// pickPatches
// ============================================================
test('pickPatches: 按 ids 过滤', () => {
  const bucket = [
    { id: 1001, tags: [1] },
    { id: 1002, tags: [2] },
    { id: 1003, tags: [3] },
  ];
  const picked = pickPatches(bucket, new Set([1001, 1003]));
  assert.deepStrictEqual(picked, [
    { id: 1001, tags: [1] },
    { id: 1003, tags: [3] },
  ]);
});

test('pickPatches: ids array 也支持', () => {
  const bucket = [{ id: 1, x: 1 }, { id: 2, x: 2 }];
  assert.deepStrictEqual(pickPatches(bucket, [2]), [{ id: 2, x: 2 }]);
});

// ============================================================
// mergeRevise — master + revise → final
// ============================================================
test('mergeRevise: revise 覆盖 master 字段', () => {
  const master = [
    { id: 1001, name: 'A', tags: [], stats: { atk: 100 } },
    { id: 1002, name: 'B', tags: [], stats: { atk: 200 } },
  ];
  const revise = [
    { id: 1001, tags: [1, 5], stats: { atk: 150 } },
  ];
  const final = mergeRevise(master, revise);
  assert.deepStrictEqual(final[0], { id: 1001, name: 'A', tags: [1, 5], stats: { atk: 150 } });
  assert.deepStrictEqual(final[1], master[1]);   // 未改的保留
});

test('mergeRevise: 不修改原 master 数组 (clone)', () => {
  const master = [{ id: 1, value: 1.5 }];
  const revise = [{ id: 1, value: 2.0 }];
  mergeRevise(master, revise);
  assert.strictEqual(master[0].value, 1.5);   // master 未被修改
});

// ============================================================
// getPath / setPath
// ============================================================
test('getPath / setPath: 嵌套字段', () => {
  const o = { a: { b: { c: 42 } } };
  assert.strictEqual(getPath(o, 'a.b.c'), 42);
  setPath(o, 'a.b.c', 99);
  assert.strictEqual(o.a.b.c, 99);
});

test('setPath: 自动建 object / array', () => {
  const o = {};
  setPath(o, 'a.b.c', 1);
  assert.deepStrictEqual(o, { a: { b: { c: 1 } } });
  const o2 = {};
  setPath(o2, 'list.0.x', 5);   // 第二段 '0' 是数字 → 建 array
  assert.deepStrictEqual(o2, { list: [{ x: 5 }] });
});

console.log('\n[test_revise_core] all tests defined');
