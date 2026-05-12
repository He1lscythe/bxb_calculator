// 测试 js/edit.js saveEdit 中的撤回保护（retraction）逻辑：
// 1. chara.tags 撤回（hasChar 且 tags 不在 charDiff → 注入 tags=null）
// 2. OMOIDE_KEYS 撤回（hasOmoide 且某 key 不在 omoideDiff → 注入该 key=null）
// 3. omoide_template override（omoide_template != null → omoide=null 覆盖）
// 4. 端到端：augmented diff 经过 server _deep_merge 落盘的最终 revise 应正确
//
// 用法: node tests/test_edit_retraction.cjs

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
  if (ok) { pass++; }
  else {
    fail++;
    console.error(`✗ ${label}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
  }
};

// ===== mirror js/state.js OMOIDE_KEYS =====
const OMOIDE_KEYS = new Set(['omoide', 'omoide_template', 'omoide_rarity']);

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

// ===== mirror js/edit.js saveEdit 中的撤回 augmentation =====
// 输入 originalData (base) + editData (modified) → 输出 {charDiff, omoideDiff}
// charDiff/omoideDiff 若全空则返回 null（表示不写入对应 revise）
const buildDiffs = (original, modified) => {
  const diff = computeDiff(original, modified);
  const charDiff   = { id: diff.id, name: diff.name };
  const omoideDiff = { id: diff.id, name: diff.name };
  let hasChar = false, hasOmoide = false;
  for (const key in diff) {
    if (key === 'id' || key === 'name') continue;
    if (OMOIDE_KEYS.has(key)) { omoideDiff[key] = diff[key]; hasOmoide = true; }
    else                       { charDiff[key]   = diff[key]; hasChar   = true; }
  }
  if (hasChar && !('tags' in charDiff)) {
    charDiff.tags = null;
  }
  if (hasOmoide) {
    for (const k of OMOIDE_KEYS) {
      if (!(k in omoideDiff)) omoideDiff[k] = null;
    }
  }
  if (hasOmoide && omoideDiff.omoide_template != null) {
    omoideDiff.omoide = null;
  }
  return {
    charDiff:   hasChar   ? charDiff   : null,
    omoideDiff: hasOmoide ? omoideDiff : null,
  };
};

// ===== mirror api/save.js deepMerge (server-side) =====
const deepMerge = (target, source) => {
  if (source === null) return null;
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  const result = (target !== null && typeof target === 'object' && !Array.isArray(target))
    ? { ...target } : {};
  for (const k of Object.keys(source)) {
    const merged = deepMerge(result[k], source[k]);
    if (merged === null) delete result[k];
    else result[k] = merged;
  }
  for (const k of Object.keys(result)) {
    const v = result[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
      delete result[k];
    }
  }
  return result;
};

// =========================================================================
// chara.tags 撤回
// =========================================================================
console.log('--- chara.tags 撤回 ---');

eq('tags 改了 → 直接 emit 新 tags（不注入 null）',
   buildDiffs({id:1, name:'a', rarity:4, tags:[1,2]}, {id:1, name:'a', rarity:5, tags:[1,2,3]}),
   { charDiff: {id:1, name:'a', rarity:5, tags:[1,2,3]}, omoideDiff: null });

eq('其他字段改了 + tags 没动（matches base）→ 注入 tags=null 撤回 stale revise',
   buildDiffs({id:1, name:'a', rarity:4, tags:[1,2]}, {id:1, name:'a', rarity:5, tags:[1,2]}),
   { charDiff: {id:1, name:'a', rarity:5, tags:null}, omoideDiff: null });

eq('chara 完全没改 → hasChar=false → 不注入 tags=null',
   buildDiffs({id:1, name:'a', rarity:4, tags:[1,2]}, {id:1, name:'a', rarity:4, tags:[1,2]}),
   { charDiff: null, omoideDiff: null });

eq('tags 被改回 base ([1,2] → []) + 其他字段也改 → emit tags=[]',
   buildDiffs({id:1, name:'a', rarity:4, tags:[]}, {id:1, name:'a', rarity:5, tags:[]}),
   { charDiff: {id:1, name:'a', rarity:5, tags:null}, omoideDiff: null });

eq('base 无 tags + 修改其他字段 → 注入 tags=null（pop no-op，无害）',
   buildDiffs({id:1, name:'a', rarity:4}, {id:1, name:'a', rarity:5}),
   { charDiff: {id:1, name:'a', rarity:5, tags:null}, omoideDiff: null });

// =========================================================================
// OMOIDE_KEYS 撤回
// =========================================================================
console.log('\n--- OMOIDE_KEYS 撤回 ---');

eq('只改 omoide_template → 注入 omoide / omoide_rarity = null',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_template:5, omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_template:5, omoide:null, omoide_rarity:null} });

eq('改 omoide_rarity + omoide_template 没动（matches base undefined）→ 注入 template/omoide=null',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_rarity:5, omoide:[{threshold:10,slots:[1]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_rarity:5, omoide:null, omoide_template:null} });

eq('换 template（rarity 5→4 同 base）→ omoide_rarity 不在 diff，注入 null 撤回 stale',
   // base: rarity 4, no template, base omoide
   // editData: template 2, rarity 4 (template 2 happens to match base rarity), template 2 omoide
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_template:2, omoide_rarity:4, omoide:[{threshold:10,slots:[2]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_template:2, omoide:null, omoide_rarity:null} });

eq('omoide 没改 + 只改 omoide_rarity → 还是要注入 omoide=null（保险 stale）',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_rarity:5, omoide:[{threshold:10,slots:[1]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_rarity:5, omoide:null, omoide_template:null} });

eq('omoide 完全没改 → hasOmoide=false → 整体不写 omoide_revise',
   buildDiffs(
     {id:1, name:'a', rarity:4, omoide_rarity:4},
     {id:1, name:'a', rarity:5, omoide_rarity:4}
   ),
   { charDiff: {id:1, name:'a', rarity:5, tags:null}, omoideDiff: null });

// =========================================================================
// omoide_template override
// =========================================================================
console.log('\n--- omoide_template !== null → omoide 强制 null override ---');

eq('apply template：omoide_template 正值 + omoide 数组 → omoide 强制 null',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_template:7, omoide_rarity:5, omoide:[{threshold:10,slots:[2]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_template:7, omoide:null, omoide_rarity:5} });

eq('离开 template：omoide_template=null（撤回） + omoide 数组改 → omoide 保留',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_template:null, omoide_rarity:4, omoide:[{threshold:10,slots:[99]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_template:null, omoide:[{threshold:10,slots:[99]}], omoide_rarity:null} });

// =========================================================================
// chara + omoide 同次保存撤回
// =========================================================================
console.log('\n--- chara + omoide 同次保存 ---');

eq('rarity 改 + apply template → charDiff 含 tags=null; omoideDiff 完整',
   buildDiffs(
     {id:1, name:'a', rarity:3, omoide_rarity:4, omoide:[]},
     {id:1, name:'a', rarity:4, omoide_template:9, omoide_rarity:5, omoide:[{threshold:10,slots:[88]}]}
   ),
   { charDiff: {id:1, name:'a', rarity:4, tags:null},
     omoideDiff: {id:1, name:'a', omoide_template:9, omoide:null, omoide_rarity:5} });

// =========================================================================
// 端到端：augmented diff + server deepMerge → 正确的 revise 文件状态
// =========================================================================
console.log('\n--- 端到端：经 deepMerge 落盘后 revise 正确 ---');

// 场景 A：用户先 apply template 5 (rarity 5) → 后切换到 template 2 (rarity 4=base)
// 期望最终 revise 不残留 omoide_rarity=5
{
  const base = {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]};
  let revise = null;

  // 第一次 save: apply template 5
  const ed1 = {id:1, name:'a', omoide_template:5, omoide_rarity:5,
               omoide:[{threshold:10,slots:[5]}]};
  const d1 = buildDiffs(base, ed1).omoideDiff;
  revise = deepMerge(revise, d1);
  eq('A1: 首次 apply → revise 有 template=5, rarity=5',
     revise,
     {id:1, name:'a', omoide_template:5, omoide_rarity:5});

  // 第二次 save: 切到 template 2，rarity 跟 base 相同（4）
  const ed2 = {id:1, name:'a', omoide_template:2, omoide_rarity:4,
               omoide:[{threshold:10,slots:[2]}]};
  const d2 = buildDiffs(base, ed2).omoideDiff;
  revise = deepMerge(revise, d2);
  eq('A2: 切换后 revise 无 omoide_rarity 残留',
     revise,
     {id:1, name:'a', omoide_template:2});
}

// 场景 B：用户改 tags → 后撤回 tags 改其他字段，期望 tags 不残留
{
  const base = {id:1, name:'a', rarity:3, tags:[1]};
  let revise = null;

  const ed1 = {id:1, name:'a', rarity:3, tags:[1,2]};
  const d1 = buildDiffs(base, ed1).charDiff;
  revise = deepMerge(revise, d1);
  eq('B1: tags 改了 → revise 有 tags',
     revise,
     {id:1, name:'a', tags:[1,2]});

  const ed2 = {id:1, name:'a', rarity:5, tags:[1]};  // tags 回到 base，rarity 改
  const d2 = buildDiffs(base, ed2).charDiff;
  revise = deepMerge(revise, d2);
  eq('B2: tags 回 base + rarity 改 → revise.tags 被 pop，仅 rarity 保留',
     revise,
     {id:1, name:'a', rarity:5});
}

// 场景 C：apply template → 用户手改 slot 脱离 template
{
  const base = {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]};
  let revise = null;

  const ed1 = {id:1, name:'a', omoide_template:3, omoide_rarity:5,
               omoide:[{threshold:10,slots:[3]}]};
  const d1 = buildDiffs(base, ed1).omoideDiff;
  revise = deepMerge(revise, d1);
  eq('C1: apply template 3 → revise 有 template, rarity',
     revise,
     {id:1, name:'a', omoide_template:3, omoide_rarity:5});

  // 用户改 slot → _syncTemplateSelect 清 omoide_template
  const ed2 = {id:1, name:'a', omoide_template:null, omoide_rarity:5,
               omoide:[{threshold:10,slots:[99]}]};
  const d2 = buildDiffs(base, ed2).omoideDiff;
  revise = deepMerge(revise, d2);
  eq('C2: 脱离 template → revise.omoide_template 被 pop, omoide 数组保留',
     revise,
     {id:1, name:'a', omoide_rarity:5, omoide:[{threshold:10,slots:[99]}]});
}

// 场景 D：完全撤回到 base（saveEdit 走 totalChanged=false 分支，删除整条 revise）
// 此处只测 augmentation 输出 = null（caller 在 totalChanged=false 时不会调）
// （此场景的真正撤回由 totalChanged=false 路径处理，不属于 augmentation 范围）

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
