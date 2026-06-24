// tests/unit/test_effect_applies.mjs
// _effectApplies edge-case 全覆盖 (2026-06-19)。
// 语义:
//   range            'Single' 仅装备者自身;'All'/缺省 全队
//   element_condition / weapon_type_condition  → 判**装备者(source)**自身属性/武器门槛 (souls「X属性装備で」)
//   target_element_id / weapon_type_id          → 判**接收方(target)**过滤 (weapons「X属性の味方」) + extra_element_id 扩展
//   weapon_base_id                              → 判**装备者(source)**那把魔剣 base id 门槛 (soul「X装備で」/ crystal·bg「Xのみ」、统一字段)
import test from 'node:test';
import assert from 'node:assert/strict';
import { _effectApplies } from '../../shared/stats-calc.js';

// chara factory: _master 带 element_id / weapon_type_id / id (+ 可选 extra_element_id)
const C = (element_id, weapon_type_id = 0, id = 0, extra = null) => ({
  _master: { element_id, weapon_type_id, id, ...(extra ? { extra_element_id: extra } : {}) },
});
const ok = (eff, tgt, src, ss = 0, ts = 0) => _effectApplies(eff, tgt, src, ss, ts);

// ============================================================
// range
// ============================================================
test('range Single: 仅装备者自身 (src===target)', () => {
  const eff = { range: 'Single' };
  assert.equal(ok(eff, C(1), C(1), 0, 0), true);   // src===target slot
  assert.equal(ok(eff, C(1), C(1), 0, 1), false);  // src !== target slot → 队友吃不到
});
test('range All / 缺省: 不按 slot 拦', () => {
  assert.equal(ok({ range: 'All' }, C(1), C(2), 0, 1), true);
  assert.equal(ok({}, C(1), C(2), 0, 1), true);          // 无 range = 不拦
  assert.equal(ok({ range: 'None' }, C(1), C(2), 0, 1), true);
});

// ============================================================
// element_condition — 装备者(source)属性门槛
// ============================================================
test('element_condition: 看装备者属性、命中才激活 (range=All)', () => {
  const eff = { range: 'All', element_condition: 5 };       // 闇装備で
  // 装备者=闇(5) → 全队(含非闇接收方)生效
  assert.equal(ok(eff, C(1 /*火接收方*/), C(5 /*闇装备者*/), 0, 1), true);
  assert.equal(ok(eff, C(5), C(5), 0, 1), true);
  // 装备者≠闇 → 不激活、即使接收方是闇也不行
  assert.equal(ok(eff, C(5 /*闇接收方*/), C(1 /*火装备者*/), 0, 1), false);
  assert.equal(ok(eff, C(1), C(2), 0, 1), false);
});
test('element_condition: range=Single 时 src===target、等价看自身', () => {
  const eff = { range: 'Single', element_condition: 5 };
  assert.equal(ok(eff, C(5), C(5), 1, 1), true);   // 自身闇 → 命中
  assert.equal(ok(eff, C(1), C(1), 1, 1), false);  // 自身火 → 不命中
});
test('element_condition=0 / 缺失: 无门槛', () => {
  assert.equal(ok({ range: 'All', element_condition: 0 }, C(1), C(2), 0, 1), true);
  assert.equal(ok({ range: 'All' }, C(1), C(2), 0, 1), true);
});

// ============================================================
// weapon_type_condition — 装备者(source)武器门槛 (语义同 element_condition)
// ============================================================
test('weapon_type_condition: 看装备者武器类型', () => {
  const eff = { range: 'All', weapon_type_condition: 3 };    // 太刀装備で (假设 3=太刀)
  assert.equal(ok(eff, C(1, 9), C(1, 3), 0, 1), true);   // 装备者武器=3 → 全队生效
  assert.equal(ok(eff, C(1, 3), C(1, 9), 0, 1), false);  // 装备者武器≠3 → 不激活 (即使接收方=3)
});
test('weapon_type_condition + element_condition: 都看装备者、需同时命中 (火属性の太刀装備で)', () => {
  const eff = { range: 'All', element_condition: 1, weapon_type_condition: 3 };
  assert.equal(ok(eff, C(2, 9), C(1, 3), 0, 1), true);   // 装备者 火+太刀 → 命中、全队生效
  assert.equal(ok(eff, C(2, 9), C(1, 9), 0, 1), false);  // 装备者火但非太刀 → 不命中
  assert.equal(ok(eff, C(2, 9), C(2, 3), 0, 1), false);  // 装备者太刀但非火 → 不命中
});

// ============================================================
// target_element_id — 接收方(target)过滤
// ============================================================
test('target_element_id: 看接收方属性', () => {
  const eff = { range: 'All', target_element_id: 3 };       // 風属性の味方
  assert.equal(ok(eff, C(3), C(1), 0, 1), true);   // 接收方=風 → 吃到 (装备者属性无关)
  assert.equal(ok(eff, C(6), C(3), 0, 1), false);  // 接收方≠風 → 吃不到 (即使装备者=風)
});
test('target_element_id + extra_element_id: is_original_skill 时额外属性可接收', () => {
  const eff = { range: 'All', target_element_id: 3, is_original_skill: true };
  assert.equal(ok(eff, C(6, 0, 0, [3]), C(1), 0, 1), true);    // 無接收方、extra=[3] → 吃到
  assert.equal(ok(eff, C(6, 0, 0, [2, 4]), C(1), 0, 1), false); // extra 不含3 → 吃不到
  assert.equal(ok(eff, C(6, 0, 0, null), C(1), 0, 1), false);  // 无 extra → 吃不到
});
test('target_element_id + extra_element_id 但 is_original_skill=false: 不扩展', () => {
  const eff = { range: 'All', target_element_id: 3, is_original_skill: false };
  assert.equal(ok(eff, C(6, 0, 0, [3]), C(1), 0, 1), false);   // 非固有 skill → extra 不生效
  // is_original_skill 缺失同理
  assert.equal(ok({ range: 'All', target_element_id: 3 }, C(6, 0, 0, [3]), C(1), 0, 1), false);
});

// ============================================================
// weapon_type_id — 接收方武器过滤
// ============================================================
test('weapon_type_id: 看接收方武器', () => {
  const eff = { range: 'All', weapon_type_id: 2 };
  assert.equal(ok(eff, C(1, 2), C(1, 9), 0, 1), true);
  assert.equal(ok(eff, C(1, 5), C(1, 2), 0, 1), false);
});

// ============================================================
// weapon_base_id — 装备者(source)门槛: 装备者那把魔剣 base id == X 才激活
//   (soul「X装備で」/ crystal·bg「Xのみ」统一字段;chara≡魔剣 同一 base id 空间)
//   2026-06-24: 旧实现误比 target → All-range「装備者は X、全体に…」队友漏吃 → 改比 sm
// ============================================================
test('weapon_base_id: 跟装备者(source) id 比对、range=All 全队吃 (シュレディンガー型)', () => {
  // 装备者(source)id=1551 → 命中、即使接收方是别的魔剣 (range=All 全队吃)
  assert.equal(ok({ range: 'All', weapon_base_id: 1551 }, C(1, 0, 9999), C(1, 0, 1551), 0, 1), true);
  // 装备者 id≠1551 → 不激活、即使接收方 id 恰好==1551 (不再误判 target)
  assert.equal(ok({ range: 'All', weapon_base_id: 1551 }, C(1, 0, 1551), C(1, 0, 1002), 0, 1), false);
});
test('weapon_base_id: range=Single 时 src===target、看自身魔剣 (旧行为不变)', () => {
  assert.equal(ok({ range: 'Single', weapon_base_id: 1001 }, C(1, 0, 1001), C(1, 0, 1001), 1, 1), true);
  assert.equal(ok({ range: 'Single', weapon_base_id: 1001 }, C(1, 0, 1002), C(1, 0, 1002), 1, 1), false);
});
test('weapon_base_id=9999 哨兵: 无真实魔剣命中 → 永不激活 (装备者也不会是 9999)', () => {
  assert.equal(ok({ range: 'All', weapon_base_id: 9999 }, C(1, 0, 1551), C(1, 0, 1551), 0, 1), false);
});

// ============================================================
// 组合 / 无限定 / 顺序无关
// ============================================================
test('无任何限定: 总命中', () => {
  assert.equal(ok({ range: 'All' }, C(1, 2, 100), C(3, 4, 200), 0, 1), true);
});
test('装备者门槛 + 接收方过滤 都要满足', () => {
  // 闇装備で + 風属性の味方 (假想): 装备者闇 且 接收方風 才命中
  const eff = { range: 'All', element_condition: 5, target_element_id: 3 };
  assert.equal(ok(eff, C(3), C(5), 0, 1), true);    // 装备者闇 + 接收方風 ✓
  assert.equal(ok(eff, C(3), C(1), 0, 1), false);   // 装备者非闇 ✗
  assert.equal(ok(eff, C(6), C(5), 0, 1), false);   // 接收方非風 ✗
});
test('Single + element_condition 不命中: range 先拦 / 门槛再拦', () => {
  const eff = { range: 'Single', element_condition: 5 };
  assert.equal(ok(eff, C(5), C(5), 0, 1), false);  // 队友(src≠target) → range 先拦
  assert.equal(ok(eff, C(1), C(1), 1, 1), false);  // 自身但非闇 → 门槛拦
  assert.equal(ok(eff, C(5), C(5), 1, 1), true);   // 自身且闇 → 命中
});
