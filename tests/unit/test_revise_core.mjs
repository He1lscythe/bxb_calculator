// tests/unit/test_revise_core.mjs — sparse diff unit tests
// 2026-06-19: 数组编码从 index 稀疏 → id-keyed(对象数组带 id)/ 整组替换(标量/无 id)。
import { test } from 'node:test';
import assert from 'node:assert';
import {
  computeDiff,
  deepApply,
  pickPatches,
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

// ============================================================
// computeDiff — 数组 (2026-06-19 新规则)
// ============================================================
test('computeDiff: 带 id 对象数组 → 按 id 局部 diff (key=id、非 index)', () => {
  const orig = { skills: [{ id: 10, v: 1 }, { id: 20, v: 2 }, { id: 30, v: 3 }] };
  const mod = { skills: [{ id: 10, v: 1 }, { id: 20, v: 99 }, { id: 30, v: 3 }] };
  assert.deepStrictEqual(computeDiff(orig, mod), { skills: { 20: { v: 99 } } });
});

test('computeDiff: 带 id 对象数组重排但内容相同 → 无 diff', () => {
  const orig = { skills: [{ id: 10, v: 1 }, { id: 20, v: 2 }] };
  const mod = { skills: [{ id: 20, v: 2 }, { id: 10, v: 1 }] }; // 仅顺序变
  assert.strictEqual(computeDiff(orig, mod), undefined);
});

test('computeDiff: 标量数组 (tags) → 整组替换', () => {
  const orig = { tags: [1, 2, 5] };
  const mod = { tags: [1, 3, 5] };
  assert.deepStrictEqual(computeDiff(orig, mod), { tags: [1, 3, 5] });
});

test('computeDiff: 无 id 对象数组 (masou effects) → 整组替换', () => {
  const orig = { effects: [{ p: 'A', vs: 0 }, { p: 'B', vs: 0 }] };
  const mod = { effects: [{ p: 'A', vs: 1.5 }, { p: 'B', vs: 0 }] };
  assert.deepStrictEqual(computeDiff(orig, mod), {
    effects: [{ p: 'A', vs: 1.5 }, { p: 'B', vs: 0 }],
  });
});

// ============================================================
// computeDiff — 撤回 (prev 第三参)
// ============================================================
test('computeDiff: 撤回 — mod 改回 orig + prev 有值 → emit null', () => {
  const orig = { value: 1.5 };
  const mod = { value: 1.5 };
  const prev = { value: 2.0 };
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

test('computeDiff: 撤回 — id 数组字段改回 + prev 有值 → 该 id 字段 null', () => {
  const orig = { skills: [{ id: 20, v: 2 }] };
  const mod = { skills: [{ id: 20, v: 2 }] }; // 改回
  const prev = { skills: { 20: { v: 99 } } };
  assert.deepStrictEqual(computeDiff(orig, mod, prev), { skills: { 20: { v: null } } });
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

test('deepApply: 带 id 对象数组 patch 按 id 命中', () => {
  const t = { skills: [{ id: 10, v: 1 }, { id: 20, v: 2 }, { id: 30, v: 3 }] };
  deepApply(t, { skills: { 20: { v: 99 } } });
  assert.deepStrictEqual(t.skills, [{ id: 10, v: 1 }, { id: 20, v: 99 }, { id: 30, v: 3 }]);
});

test('deepApply: id 对象数组重排后仍按 id 命中 (非 index)', () => {
  const t = { skills: [{ id: 20, v: 2 }, { id: 10, v: 1 }] }; // id20 在 index 0
  deepApply(t, { skills: { 20: { v: 99 } } });
  assert.deepStrictEqual(t.skills, [{ id: 20, v: 99 }, { id: 10, v: 1 }]);
});

test('deepApply: id 找不到 → 跳过 (不报错、不改其它)', () => {
  const t = { skills: [{ id: 10, v: 1 }] };
  deepApply(t, { skills: { 999: { v: 99 } } });
  assert.deepStrictEqual(t.skills, [{ id: 10, v: 1 }]);
});

test('deepApply: 数组值 → 整组替换 (标量 / 无 id 对象数组)', () => {
  const t = { tags: [1, 2, 5], effects: [{ p: 'A', vs: 0 }] };
  deepApply(t, { tags: [1, 3, 5], effects: [{ p: 'A', vs: 1.5 }] });
  assert.deepStrictEqual(t.tags, [1, 3, 5]);
  assert.deepStrictEqual(t.effects, [{ p: 'A', vs: 1.5 }]);
});

test('deepApply: id 数组字段 tombstone (null) → 跳过 (不删元素)', () => {
  const t = { skills: [{ id: 20, v: 2 }] };
  deepApply(t, { skills: { 20: null } });
  assert.deepStrictEqual(t.skills, [{ id: 20, v: 2 }]); // 元素保留
});

test('deepApply: round-trip — diff 后 apply 等于 modified', () => {
  const orig = {
    tags: [1, 2],
    stats: { atk: 100 },
    skills: [{ id: 10, v: 1 }, { id: 20, v: 2 }],
    effects: [{ p: 'A', vs: 0 }],
  };
  const mod = {
    tags: [1, 3],
    stats: { atk: 100 },
    skills: [{ id: 10, v: 1 }, { id: 20, v: 99 }],
    effects: [{ p: 'A', vs: 1.5 }],
  };
  const patch = computeDiff(orig, mod);
  const reconstructed = JSON.parse(JSON.stringify(orig));
  deepApply(reconstructed, patch);
  assert.deepStrictEqual(reconstructed, mod);
});

test('deepApply: round-trip — id 数组重排后 apply 仍正确 (robust)', () => {
  const orig = { skills: [{ id: 10, v: 1 }, { id: 20, v: 2 }] };
  const mod = { skills: [{ id: 10, v: 1 }, { id: 20, v: 99 }] };
  const patch = computeDiff(orig, mod); // { skills: { 20: { v: 99 } } }
  // 重排后的 master (id20 在前) 也能按 id 命中
  const reordered = { skills: [{ id: 20, v: 2 }, { id: 10, v: 1 }] };
  deepApply(reordered, patch);
  assert.deepStrictEqual(reordered.skills, [{ id: 20, v: 99 }, { id: 10, v: 1 }]);
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
  setPath(o2, 'list.0.x', 5);
  assert.deepStrictEqual(o2, { list: [{ x: 5 }] });
});

console.log('\n[test_revise_core] all tests defined');
