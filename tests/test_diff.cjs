// 测试 js/diff.js 的 computeDiff / _deepDiff（含 prevRevise + null 撤回 + 数组分支）。
// 用法: node tests/test_diff.js

let pass = 0, fail = 0;
const _sortKeys = (obj) => {
  if (Array.isArray(obj)) return obj.map(_sortKeys);
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = _sortKeys(obj[k]);
  return out;
};
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(_sortKeys(actual)) === JSON.stringify(_sortKeys(expected));
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${label}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
  }
};

// ===== mirror js/diff.js =====
const _NOOP = Symbol('noop');
const _isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

const _deepDiff = (oval, mval, prev) => {
  if (_isObj(mval) && _isObj(oval)) {
    const sub = {};
    const allKeys = new Set([...Object.keys(mval), ...Object.keys(prev || {})]);
    for (const k of allKeys) {
      const cd = _deepDiff(oval[k], mval[k], prev ? prev[k] : undefined);
      if (cd !== _NOOP) sub[k] = cd;
    }
    return Object.keys(sub).length === 0 ? _NOOP : sub;
  }
  if (Array.isArray(oval) && Array.isArray(mval) && oval.length === mval.length &&
      mval.length > 0 && mval.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
    const sparse = {};
    const indices = new Set();
    mval.forEach((m, i) => {
      if (JSON.stringify(m) !== JSON.stringify(oval[i])) indices.add(i);
    });
    if (prev && typeof prev === 'object') {
      Object.keys(prev).forEach(k => {
        const i = +k;
        if (Number.isInteger(i) && i >= 0 && i < mval.length) indices.add(i);
      });
    }
    for (const i of indices) {
      const cd = _deepDiff(oval[i], mval[i], prev ? prev[i] : undefined);
      if (cd !== _NOOP) sparse[i] = cd;
    }
    return Object.keys(sparse).length === 0 ? _NOOP : sparse;
  }
  if (JSON.stringify(mval) === JSON.stringify(oval)) {
    return prev !== undefined ? null : _NOOP;
  }
  return JSON.parse(JSON.stringify(mval));
};

const computeDiff = (original, modified, prevRevise) => {
  const diff = { id: modified.id, name: modified.name };
  const allKeys = new Set([...Object.keys(modified), ...Object.keys(prevRevise || {})]);
  for (const k of allKeys) {
    if (k === 'id' || k === 'name') continue;
    const cd = _deepDiff(original[k], modified[k], prevRevise ? prevRevise[k] : undefined);
    if (cd !== _NOOP) diff[k] = cd;
  }
  return diff;
};

// ===== Tests =====
console.log('--- computeDiff: 无 prev (向后兼容旧逻辑) ---');
eq('no diff',
   computeDiff({id:1, name:'a', x:1}, {id:1, name:'a', x:1}),
   {id:1, name:'a'});
eq('field added',
   computeDiff({id:1, name:'a', x:1}, {id:1, name:'a', x:1, y:2}),
   {id:1, name:'a', y:2});
eq('field changed',
   computeDiff({id:1, name:'a', x:1}, {id:1, name:'a', x:99}),
   {id:1, name:'a', x:99});
eq('nested field changed',
   computeDiff({id:1, name:'a', sub:{x:1, y:2}}, {id:1, name:'a', sub:{x:1, y:99}}),
   {id:1, name:'a', sub:{y:99}});

console.log('\n--- computeDiff: prev 撤回检测 ---');
eq('revert leaf to base → null',
   computeDiff(
     {id:1, name:'a', x:1},
     {id:1, name:'a', x:1},
     {id:1, name:'a', x:5}  // prev 改过 x
   ),
   {id:1, name:'a', x:null});
eq('revert nested',
   computeDiff(
     {id:1, name:'a', sub:{x:1}},
     {id:1, name:'a', sub:{x:1}},
     {id:1, name:'a', sub:{x:5}}
   ),
   {id:1, name:'a', sub:{x:null}});
eq('mixed: 一字段保留改动 + 一字段撤回',
   computeDiff(
     {id:1, name:'a', x:1, y:2},
     {id:1, name:'a', x:99, y:2},
     {id:1, name:'a', x:50, y:5}  // prev 改过 x 和 y
   ),
   {id:1, name:'a', x:99, y:null});
eq('revert without prev → 不发 null',
   computeDiff(
     {id:1, name:'a', x:1},
     {id:1, name:'a', x:1},
     undefined
   ),
   {id:1, name:'a'});

console.log('\n--- computeDiff: 数组 (sparse) ---');
const arr = (vals) => vals.map((v, i) => ({i, v}));
eq('array elem changed',
   computeDiff(
     {id:1, name:'a', skills:arr([1, 2, 3])},
     {id:1, name:'a', skills:arr([1, 99, 3])}
   ),
   {id:1, name:'a', skills:{1:{v:99}}});
eq('array elem reverted (with prev)',
   computeDiff(
     {id:1, name:'a', skills:arr([1, 2, 3])},
     {id:1, name:'a', skills:arr([1, 2, 3])},          // 跟 base 一样
     {id:1, name:'a', skills:{1:{v:99}}}              // prev 改过 [1].v
   ),
   {id:1, name:'a', skills:{1:{v:null}}});
eq('array unchanged + no prev → 不进 diff',
   computeDiff(
     {id:1, name:'a', skills:arr([1, 2, 3])},
     {id:1, name:'a', skills:arr([1, 2, 3])}
   ),
   {id:1, name:'a'});

console.log('\n--- 真实场景：soul affinity ---');
const soulBase = {
  id:22, name:'レギオン',
  element_affinity: {火:{level:-2}, 水:{level:1}}  // 没有 atk/def 字段
};
// 第一次改：atk_effect=2 ↑
const e1 = JSON.parse(JSON.stringify(soulBase));
e1.element_affinity.火.atk_effect = '2';
eq('first edit: atk 1→2',
   computeDiff(soulBase, e1, undefined),
   {id:22, name:'レギオン', element_affinity:{火:{atk_effect:'2'}}});

// 第二次：atk 2→1（撤回到默认）→ 经 normalize 后应该不含 atk
const e2 = JSON.parse(JSON.stringify(soulBase));  // 跟 base 一致（atk 已 normalize 掉）
const prev2 = {id:22, name:'レギオン', element_affinity:{火:{atk_effect:'2'}}};
eq('revert: atk 2→1 with prev',
   computeDiff(soulBase, e2, prev2),
   {id:22, name:'レギオン', element_affinity:{火:{atk_effect:null}}});

// 第三次：再加 def_effect 改动（同时撤回前次 atk）
const e3 = JSON.parse(JSON.stringify(soulBase));
e3.element_affinity.火.def_effect = '0.5';
const prev3 = prev2;
eq('mixed: 撤回 atk + 新加 def',
   computeDiff(soulBase, e3, prev3),
   {id:22, name:'レギオン',
    element_affinity:{火:{atk_effect:null, def_effect:'0.5'}}});

console.log('\n--- 真实场景：soul skills 数组撤回 ---');
const soulWithSkills = {
  id:1, name:'X',
  skills:[
    {name:'s0', effects:[{bairitu:5}]},
    {name:'s1', effects:[{bairitu:3}]}
  ]
};
// 改 skills[0].effects[0].bairitu 5→50
const ee1 = JSON.parse(JSON.stringify(soulWithSkills));
ee1.skills[0].effects[0].bairitu = 50;
eq('skill bairitu changed',
   computeDiff(soulWithSkills, ee1),
   {id:1, name:'X', skills:{0:{effects:{0:{bairitu:50}}}}});

// 改回 5 + prev 含 50 → 应 emit null
const ee2 = JSON.parse(JSON.stringify(soulWithSkills));  // 跟 base 一致
const prevEE2 = {id:1, name:'X', skills:{0:{effects:{0:{bairitu:50}}}}};
eq('skill bairitu reverted via prev (数组撤回 path)',
   computeDiff(soulWithSkills, ee2, prevEE2),
   {id:1, name:'X', skills:{0:{effects:{0:{bairitu:null}}}}});

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
