// tests/v2/test_schema_v2.mjs — v2 业务 JSON 字段完整性验证
// 跑: node --test tests/v2/test_schema_v2.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve(import.meta.dirname, '../../data');
const load = (n) => JSON.parse(fs.readFileSync(path.join(DATA, n), 'utf-8'));

test('characters.json schema', () => {
  const c = load('characters.json');
  assert.ok(Array.isArray(c) && c.length > 500, 'characters >= 500');
  for (const ch of c) {
    assert.ok(ch.id && ch.name && ch.rarity, `chara id=${ch.id} basic fields`);
    assert.ok(ch.states && Object.keys(ch.states).length >= 1, `chara id=${ch.id} states`);
    for (const [name, st] of Object.entries(ch.states)) {
      assert.ok(st.variant_id, `chara ${ch.id} state ${name} variant_id`);
      assert.ok(st.stats?.max_max_level && st.stats?.max_mature, `chara ${ch.id} state ${name} stats`);
    }
  }
});

test('souls.json schema', () => {
  const s = load('souls.json');
  assert.ok(s.length > 400, 'souls >= 400');
  for (const so of s) {
    assert.ok(so.id && so.name, `soul ${so.id}`);
    assert.ok(so.element_affinity && so.weapon_affinity, `soul ${so.id} affinity`);
  }
});

test('crystals.json schema', () => {
  const c = load('crystals.json');
  assert.ok(c.length > 1000, 'crystals >= 1000');
  for (const cr of c) {
    assert.ok(cr.id && cr.name, `crystal ${cr.id}`);
    assert.ok(cr.initial_value !== undefined, `crystal ${cr.id} initial_value`);
  }
});

test('bladegraphs.json schema', () => {
  const b = load('bladegraphs.json');
  assert.ok(b.length > 400, 'bg >= 400');
  for (const bg of b) {
    assert.ok(bg.id && bg.name && bg.rarity !== undefined, `bg ${bg.id}`);
  }
});

test('masou.json schema', () => {
  const m = load('masou.json');
  assert.ok(m.length > 500, 'masou >= 500');
  for (const ma of m) {
    assert.ok(ma.id && ma.weapon_base_id, `masou ${ma.id}`);
  }
});

test('senzai_table.json schema', () => {
  const s = load('senzai_table.json');
  assert.ok(typeof s === 'object' && Object.keys(s).length > 100, 'senzai > 100');
});

test('_wiki_aux.json schema', () => {
  const a = load('_wiki_aux.json');
  assert.ok(a.crystal_max_value && Object.keys(a.crystal_max_value).length > 1000);
  assert.ok(a.chara_skill_value_scaling && Object.keys(a.chara_skill_value_scaling).length > 50);
});
