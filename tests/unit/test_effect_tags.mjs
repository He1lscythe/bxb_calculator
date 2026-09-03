// tests/unit/test_effect_tags.mjs — shared/effect-tags.js (効果 tag 的唯一实现) 单测
// 跑: node --test tests/unit/test_effect_tags.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import {
  effectParams,
  effectScope,
  effectCondition,
  effectScopeLongLabel,
  paramBadgesHtml,
  scopeTagHtml,
  condTagHtml,
  effectTagsHtml,
  normalizeMasterEffect,
} from '../../shared/effect-tags.js';

// ============================================================
// effectParams — _parameter / _parameters (BD 折叠) 两种形态
// ============================================================
test('effectParams: _parameter 单值 / _parameters 数组 / 空', () => {
  assert.deepStrictEqual(effectParams({ _parameter: 'Attack' }), ['Attack']);
  assert.deepStrictEqual(effectParams({ _parameters: ['Attack', 'HP'] }), ['Attack', 'HP']);
  assert.deepStrictEqual(effectParams({}), []);
  assert.deepStrictEqual(effectParams(null), []);
  // _parameters 优先 (BD effect 折叠了多 parameter)
  assert.deepStrictEqual(effectParams({ _parameters: ['HP'], _parameter: 'Attack' }), ['HP']);
});

// ============================================================
// effectScope — 判定顺序: 魔剣限定 > 属性/武器限定 > range
// ============================================================
test('effectScope: weapon_base_id 优先于一切 → キャラ限', () => {
  // 同时带 element/weapon/range 也要判成 キャラ限 (魔剣限定是最强的门槛)
  const s = effectScope({ weapon_base_id: 1300, element: 1, weapon: 2, range: 'All' });
  assert.deepStrictEqual(s, { kind: 'chara', label: 'キャラ限' });
});

test('effectScope: 属性和武器同时存在 → 两个都出、用 · 连接', () => {
  // ★ 这是 utils.js / hensei dmRightTags 曾经的 bug: 只出 element、把武器限定丢了
  assert.deepStrictEqual(effectScope({ element: 3, weapon: 11 }), { kind: 'lim', label: '風·魔典' });
});

test('effectScope: 只有属性 / 只有武器', () => {
  assert.strictEqual(effectScope({ element: 1 }).label, '火');
  assert.strictEqual(effectScope({ weapon: 1 }).label, '長剣');
});

test('effectScope: 数组值 → / 连接', () => {
  assert.strictEqual(effectScope({ element: [1, 2] }).label, '火/水');
  assert.strictEqual(effectScope({ element: [1, 2], weapon: [1] }).label, '火/水·長剣');
});

test('effectScope: 无限定 → range=All 出 全、其余出 自', () => {
  assert.deepStrictEqual(effectScope({ range: 'All' }), { kind: 'all', label: '全' });
  assert.deepStrictEqual(effectScope({ range: 'Single' }), { kind: 'self', label: '自' });
  assert.deepStrictEqual(effectScope({}), { kind: 'self', label: '自' });
  // 像 masou 那样连 range 字段都没有的、也算 自
  assert.deepStrictEqual(effectScope({ _parameter: 'Attack' }), { kind: 'self', label: '自' });
  assert.deepStrictEqual(effectScope(null), { kind: 'self', label: '自' });
});

test('effectScope: element/weapon = 0 是 master 的「未设定」→ 当作无限定', () => {
  // adapter 会把 0 抹掉、实数据不会走到这里;但就算直接喂原始 master 也不该冒出「0」这种 label (防御)
  assert.deepStrictEqual(effectScope({ element: 0, range: 'All' }), { kind: 'all', label: '全' });
  assert.deepStrictEqual(effectScope({ weapon: 0 }), { kind: 'self', label: '自' });
  assert.deepStrictEqual(effectScope({ element: 0, weapon: 2 }), { kind: 'lim', label: '大剣' });
  assert.deepStrictEqual(effectScope({ element: [] }), { kind: 'self', label: '自' });
});

// ============================================================
// effectCondition — master parameter 前缀直判、含 4 倒れ / 5 敵BK状態
// ============================================================
test('effectCondition: HP 曲线 3 档', () => {
  assert.deepStrictEqual(effectCondition({ _parameter: 'Vitality_Attack' }), { id: 1, label: '逆窮鼠' });
  assert.deepStrictEqual(effectCondition({ _parameter: 'RemHP_Attack' }), { id: 2, label: '窮鼠' });
  assert.deepStrictEqual(effectCondition({ _parameter: 'Break_Attack' }), { id: 3, label: '破損' });
});

test('effectCondition: ★ FellDown_ → 倒れ / Enemy_Break* → 敵BK状態', () => {
  // 旧的 e.condition 路径下这两类会落 0、条件在 viewer 上整个看不见 (141 条)
  assert.deepStrictEqual(effectCondition({ _parameter: 'FellDown_Attack' }), { id: 4, label: '倒れ' });
  assert.deepStrictEqual(effectCondition({ _parameter: 'Enemy_BreakAttack' }), {
    id: 5,
    label: '敵BK状態',
  });
  assert.deepStrictEqual(effectCondition({ _parameter: 'Enemy_BreakDamageLimitBreak' }), {
    id: 5,
    label: '敵BK状態',
  });
});

test('effectCondition: 无条件 → null (不出 tag)', () => {
  assert.strictEqual(effectCondition({ _parameter: 'Attack' }), null);
  assert.strictEqual(effectCondition({}), null);
  assert.strictEqual(effectCondition(null), null);
});

// ============================================================
// HTML 层
// ============================================================
test('paramBadgesHtml: 每个 parameter 一个 bunrui-tag', () => {
  assert.strictEqual(paramBadgesHtml({ _parameter: 'Attack' }), '<span class="bunrui-tag">攻</span>');
  assert.strictEqual(
    paramBadgesHtml({ _parameters: ['Attack', 'HP'] }),
    '<span class="bunrui-tag">攻</span><span class="bunrui-tag">HP</span>',
  );
  assert.strictEqual(paramBadgesHtml({}), '');
});

test('scopeTagHtml: kind → class', () => {
  assert.strictEqual(scopeTagHtml({ weapon_base_id: 1 }), '<span class="scope-tag scope-lim">キャラ限</span>');
  assert.strictEqual(scopeTagHtml({ element: 1 }), '<span class="scope-tag scope-lim">火</span>');
  assert.strictEqual(scopeTagHtml({ range: 'All' }), '<span class="scope-tag scope-all">全</span>');
  assert.strictEqual(scopeTagHtml({}), '<span class="scope-tag scope-self">自</span>');
});

test('condTagHtml: cond-N 的 N 跟 effectCondition 的 id 一致', () => {
  assert.strictEqual(
    condTagHtml({ _parameter: 'FellDown_Attack' }),
    '<span class="cond-tag cond-4">倒れ</span>',
  );
  assert.strictEqual(
    condTagHtml({ _parameter: 'Enemy_BreakAttack' }),
    '<span class="cond-tag cond-5">敵BK状態</span>',
  );
  assert.strictEqual(condTagHtml({ _parameter: 'Attack' }), '');
});

test('effectTagsHtml: 按 分類 + scope + 条件 的顺序拼接', () => {
  assert.strictEqual(
    effectTagsHtml({ _parameter: 'Vitality_Attack', element: 1, range: 'All' }),
    '<span class="bunrui-tag">攻</span>' +
      '<span class="scope-tag scope-lim">火</span>' +
      '<span class="cond-tag cond-1">逆窮鼠</span>',
  );
});

// ============================================================
// effectScopeLongLabel — 展开详情用 (cr-list / bg-list)
// ============================================================
test('effectScopeLongLabel: 属性优先、武器用 / 连接', () => {
  assert.strictEqual(effectScopeLongLabel({ element: 1 }), '火属性のみ');
  assert.strictEqual(effectScopeLongLabel({ weapon: [1, 2] }), '長剣/大剣のみ');
  // 有属性时只出属性 (保持 cr-list/bg-list 原实现)
  assert.strictEqual(effectScopeLongLabel({ element: 1, weapon: 2 }), '火属性のみ');
  assert.strictEqual(effectScopeLongLabel({}), '');
  assert.strictEqual(effectScopeLongLabel(null), '');
});

// ============================================================
// normalizeMasterEffect — hensei 装备面板 (collectEffects の master shape)
// ============================================================
test('normalizeMasterEffect: weapons/crystals 走 target_element_id / weapon_type_id', () => {
  const w = normalizeMasterEffect(
    { range: 'All', target_element_id: 2, weapon_type_id: 3, weapon_base_id: 0 },
    'Vitality_Attack',
  );
  assert.strictEqual(w._parameter, 'Vitality_Attack');
  assert.strictEqual(w.range, 'All');
  assert.strictEqual(w.element, 2);
  assert.strictEqual(w.weapon, 3);
  assert.strictEqual(w.weapon_base_id, null);
  assert.deepStrictEqual(effectScope(w), { kind: 'lim', label: '水·太刀' });
  assert.deepStrictEqual(effectCondition(w), { id: 1, label: '逆窮鼠' });
});

test('normalizeMasterEffect: souls 的 *_condition (判装备者) 也要认', () => {
  const w = normalizeMasterEffect({ element_condition: 4, weapon_type_condition: 1 }, 'Attack');
  assert.strictEqual(w.element, 4);
  assert.strictEqual(w.weapon, 1);
  assert.strictEqual(effectScope(w).label, '光·長剣');
});

test('normalizeMasterEffect: raw 为空 (chara_meta / soul_affinity 等) 也不能炸', () => {
  const w = normalizeMasterEffect(undefined, 'Attack');
  assert.deepStrictEqual(effectScope(w), { kind: 'self', label: '自' });
  assert.strictEqual(effectCondition(w), null);
  assert.strictEqual(paramBadgesHtml(w), '<span class="bunrui-tag">攻</span>');
});
