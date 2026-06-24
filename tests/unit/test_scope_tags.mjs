// tests/unit/test_scope_tags.mjs — crystal/bg filter facet 「条件 (対象)」单测
//
// 覆盖近期改动 (2026-06-10): 删 eff.scope 全套、scopeTags 改走 c.range / c.weapon_base_id
//
// SCOPE_TAG enum: 1=自身, 2=装備セット, 3=キャラ限定
// crystal: range='All' → SET, else SELF; weapon_base_id 非空 → CHARA
// bg: skills[].range='All' → SET, else SELF; weapon_base_id 非空 → CHARA

import { test } from 'node:test';
import assert from 'node:assert';
import { crystalScopeTags, bgScopeTags } from '../../shared/parameter-class.js';

// ============================================================
// crystalScopeTags
// ============================================================
test('crystalScopeTags: range=All → SET (2)', () => {
  const tags = crystalScopeTags({ range: 'All' });
  assert.ok(tags.includes(2));
  assert.ok(!tags.includes(1));
});

test('crystalScopeTags: range 缺省 → SELF (1)', () => {
  const tags = crystalScopeTags({});
  assert.ok(tags.includes(1));
  assert.ok(!tags.includes(2));
});

test('crystalScopeTags: range=Single → SELF (1)', () => {
  const tags = crystalScopeTags({ range: 'Single' });
  assert.ok(tags.includes(1));
});

test('crystalScopeTags: weapon_base_id 非空 → CHARA (3)', () => {
  const tags = crystalScopeTags({ weapon_base_id: 1632 });
  assert.ok(tags.includes(3));
});

test('crystalScopeTags: weapon_base_id 缺省 → 无 CHARA', () => {
  const tags = crystalScopeTags({});
  assert.ok(!tags.includes(3));
});

test('crystalScopeTags: range=All + weapon_base_id → SET + CHARA', () => {
  const tags = crystalScopeTags({ range: 'All', weapon_base_id: 1632 });
  assert.ok(tags.includes(2));
  assert.ok(tags.includes(3));
  assert.ok(!tags.includes(1));
});

test('crystalScopeTags: 不再看 name 純真記憶/秘録記憶 (改走 weapon_base_id)', () => {
  // 旧逻辑: name 含 純真記憶 → tag 3。新逻辑: 只看 weapon_base_id。
  // 验证 name 不影响、只 weapon_base_id 影响。
  const t1 = crystalScopeTags({ name: 'ハテスの純真記憶' });
  assert.ok(!t1.includes(3));   // name 不影响
  const t2 = crystalScopeTags({ name: 'ハテスの純真記憶', weapon_base_id: 1632 });
  assert.ok(t2.includes(3));
});

test('crystalScopeTags: 不再看 desc 同装備セット (改走 range)', () => {
  // 旧逻辑: desc 含 '同装備セット' → tag 2。新逻辑: 只看 range。
  const t1 = crystalScopeTags({ description: '同装備セット...' });
  assert.ok(!t1.includes(2));   // desc 不影响 (range 缺省 → SELF)
  const t2 = crystalScopeTags({ description: '同装備セット...', range: 'All' });
  assert.ok(t2.includes(2));
});

// ============================================================
// bgScopeTags
// ============================================================
test('bgScopeTags: 任一 skill range=All → SET (2)', () => {
  const tags = bgScopeTags({ skills: [{ range: 'All' }] });
  assert.ok(tags.includes(2));
});

test('bgScopeTags: 任一 skill range!=All → SELF (1)', () => {
  const tags = bgScopeTags({ skills: [{ range: 'Single' }] });
  assert.ok(tags.includes(1));
});

test('bgScopeTags: 混合 range All + Single → 两 tag', () => {
  const tags = bgScopeTags({ skills: [{ range: 'All' }, { range: 'Single' }] });
  assert.ok(tags.includes(1));
  assert.ok(tags.includes(2));
});

test('bgScopeTags: weapon_base_id 非空 → CHARA (3)', () => {
  const tags = bgScopeTags({ skills: [{ range: 'All' }], weapon_base_id: 1632 });
  assert.ok(tags.includes(3));
});

test('bgScopeTags: weapon_base_id 缺省 → 无 CHARA', () => {
  const tags = bgScopeTags({ skills: [{ range: 'All' }] });
  assert.ok(!tags.includes(3));
});

test('bgScopeTags: _skills 优先 skills (adapter wiki shape 用 _skills)', () => {
  const tags = bgScopeTags({ _skills: [{ range: 'All' }], skills: [{ range: 'Single' }] });
  assert.ok(tags.includes(2));
  assert.ok(!tags.includes(1));
});
