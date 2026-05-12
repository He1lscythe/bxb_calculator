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

// ===== mirror js/diff.js（含 sparse-index array 分支）=====
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
  const mNullish = mval === null || mval === undefined;
  const oNullish = oval === null || oval === undefined;
  if (mNullish && oNullish) {
    return prev !== undefined && prev !== null ? null : _NOOP;
  }
  if (mNullish) return null;
  if (oNullish) return JSON.parse(JSON.stringify(mval));
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

// ===== mirror js/edit.js saveEdit（迁移到 prev-revise pattern 后）=====
// 输入 originalData (base) + editData (modified) + prevChara/prevOmoide
// 两个 revise 文件 → merged 作为 prev 传给 computeDiff → 按 OMOIDE_KEYS 拆。
// 不再有手动 tags=null / OMOIDE_KEYS null 注入；唯一保留：omoide_template != null
// 时 omoide=null 是 override 语义（不是 retraction），prev 不能替代。
const buildDiffs = (original, modified, prevChara, prevOmoide) => {
  const prevMerged = Object.assign({}, prevChara || {}, prevOmoide || {});
  const diff = computeDiff(original, modified, prevMerged);
  const charDiff   = { id: diff.id, name: diff.name };
  const omoideDiff = { id: diff.id, name: diff.name };
  let hasChar = false, hasOmoide = false;
  for (const key in diff) {
    if (key === 'id' || key === 'name') continue;
    if (OMOIDE_KEYS.has(key)) { omoideDiff[key] = diff[key]; hasOmoide = true; }
    else                       { charDiff[key]   = diff[key]; hasChar   = true; }
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
// chara.tags 撤回（prev-revise pattern）
// 迁移到 prev-revise 后，retraction 由 _deepDiff 的 prev 规则触发 — 仅当
// prev 有值且 edit 回到 base 时 emit null。无 prev 时不会乱注入 null。
// =========================================================================
console.log('--- chara.tags 撤回 ---');

eq('tags 改了（无 prev） → 直接 emit 新 tags',
   buildDiffs({id:1, name:'a', rarity:4, tags:[1,2]}, {id:1, name:'a', rarity:5, tags:[1,2,3]}),
   { charDiff: {id:1, name:'a', rarity:5, tags:[1,2,3]}, omoideDiff: null });

eq('其他字段改 + tags 没动 + 无 prev → 不 emit tags（无 stale 可撤回）',
   buildDiffs({id:1, name:'a', rarity:4, tags:[1,2]}, {id:1, name:'a', rarity:5, tags:[1,2]}),
   { charDiff: {id:1, name:'a', rarity:5}, omoideDiff: null });

eq('chara 完全没改 + 无 prev → 返回 null',
   buildDiffs({id:1, name:'a', rarity:4, tags:[1,2]}, {id:1, name:'a', rarity:4, tags:[1,2]}),
   { charDiff: null, omoideDiff: null });

eq('其他字段改 + tags 没动 + prev 有 tags=[1,2,3]（stale）→ emit tags=null 撤回',
   // base.tags=[1,2], edit.tags=[1,2] (== base), prev.tags=[1,2,3] (stale revise)
   buildDiffs(
     {id:1, name:'a', rarity:4, tags:[1,2]},
     {id:1, name:'a', rarity:5, tags:[1,2]},
     {id:1, name:'a', rarity:5, tags:[1,2,3]}   // prevChara
   ),
   { charDiff: {id:1, name:'a', rarity:5, tags:null}, omoideDiff: null });

eq('base 无 tags + 修改其他字段 + 无 prev → 不写 tags（既无 base 又无 stale）',
   buildDiffs({id:1, name:'a', rarity:4}, {id:1, name:'a', rarity:5}),
   { charDiff: {id:1, name:'a', rarity:5}, omoideDiff: null });

// =========================================================================
// OMOIDE_KEYS 撤回（prev-revise pattern）
// =========================================================================
console.log('\n--- OMOIDE_KEYS 撤回 ---');

eq('只改 omoide_template（无 prev）→ omoide 由 template-override 注入 null；rarity 没动不注入',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_template:5, omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_template:5, omoide:null} });

eq('改 omoide_rarity + template 没动 + 无 prev → 只 emit rarity',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_rarity:5, omoide:[{threshold:10,slots:[1]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_rarity:5} });

eq('换 template（rarity 5→4 同 base）+ prev 有 rarity=5 stale → emit rarity=null 撤回',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_template:2, omoide_rarity:4, omoide:[{threshold:10,slots:[2]}]},
     undefined,
     {id:1, name:'a', omoide_template:5, omoide_rarity:5}   // prevOmoide
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_template:2, omoide:null, omoide_rarity:null} });

eq('omoide 没改 + 只改 omoide_rarity + 无 prev → 只 emit rarity（不注入 omoide）',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_rarity:5, omoide:[{threshold:10,slots:[1]}]}
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_rarity:5} });

eq('omoide 完全没改 → 整体不写 omoide_revise（无 prev tags 也不 emit）',
   buildDiffs(
     {id:1, name:'a', rarity:4, omoide_rarity:4},
     {id:1, name:'a', rarity:5, omoide_rarity:4}
   ),
   { charDiff: {id:1, name:'a', rarity:5}, omoideDiff: null });

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

eq('离开 template：omoide_template=null + omoide 数组改 + prev 有 template/rarity → emit 撤回',
   buildDiffs(
     {id:1, name:'a', omoide_rarity:4, omoide:[{threshold:10,slots:[1]}]},
     {id:1, name:'a', omoide_template:null, omoide_rarity:4, omoide:[{threshold:10,slots:[99]}]},
     undefined,
     {id:1, name:'a', omoide_template:5, omoide_rarity:5}   // prevOmoide
   ),
   { charDiff: null,
     omoideDiff: {id:1, name:'a', omoide_template:null, omoide:{'0':{slots:[99]}}, omoide_rarity:null} });

// =========================================================================
// chara + omoide 同次保存撤回
// =========================================================================
console.log('\n--- chara + omoide 同次保存 ---');

eq('rarity 改 + apply template（无 prev）→ charDiff 仅 rarity; omoideDiff 含 template/rarity',
   buildDiffs(
     {id:1, name:'a', rarity:3, omoide_rarity:4, omoide:[]},
     {id:1, name:'a', rarity:4, omoide_template:9, omoide_rarity:5, omoide:[{threshold:10,slots:[88]}]}
   ),
   { charDiff: {id:1, name:'a', rarity:4},
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

  // 第二次 save: 切到 template 2，rarity 跟 base 相同（4）— 传 prev=revise(=A1 状态)
  const ed2 = {id:1, name:'a', omoide_template:2, omoide_rarity:4,
               omoide:[{threshold:10,slots:[2]}]};
  const d2 = buildDiffs(base, ed2, undefined, revise).omoideDiff;
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
  // prev=revise(=B1 状态)：触发 prev 撤回机制 emit tags=null
  const d2 = buildDiffs(base, ed2, revise).charDiff;
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

  // 用户改 slot → _syncTemplateSelect 清 omoide_template — 传 prev=revise(=C1 状态)
  const ed2 = {id:1, name:'a', omoide_template:null, omoide_rarity:5,
               omoide:[{threshold:10,slots:[99]}]};
  const d2 = buildDiffs(base, ed2, undefined, revise).omoideDiff;
  revise = deepMerge(revise, d2);
  // 注：omoide diff 走 sparse-index 分支（数组元素都是 object 触发），所以
  // revise.omoide 落盘成 sparse-index 形式（`{"0": {slots:[99]}}`）。这跟
  // 实际 omoide_revise.json 的 sparse-index 形态一致。
  eq('C2: 脱离 template → revise.omoide_template 被 pop, omoide 改动以 sparse-index 形式存',
     revise,
     {id:1, name:'a', omoide_rarity:5, omoide:{'0':{slots:[99]}}});
}

// 场景 D：完全撤回到 base（saveEdit 走 totalChanged=false 分支，删除整条 revise）
// 此处只测 augmentation 输出 = null（caller 在 totalChanged=false 时不会调）
// （此场景的真正撤回由 totalChanged=false 路径处理，不属于 augmentation 范围）

// =========================================================================
// soul.tags 撤回（prev-revise 机制 + 空数组 normalize）
//
// soul-edit.js saveEdit 与 chara 不同：传 prevRevise 第 3 参，由 _deepDiff
// 的 prev 撤回规则原生 emit null。+ `_normalizeAffinityForDiff` 把空 tags
// 数组当作 base 同状态处理（防止 revise 残留 `tags: []` 空字段）。
// =========================================================================
console.log('\n--- soul.tags 撤回（prev-revise + 空数组 normalize）---');

// mirror soul-edit.js _normalizeAffinityForDiff 的 tags 部分
const _normalizeSoul = (s) => {
  const c = JSON.parse(JSON.stringify(s));
  if (Array.isArray(c.tags) && c.tags.length === 0) delete c.tags;
  return c;
};
// mirror soul-edit.js saveEdit 主流程（不含 _normalizeAffinityForDiff 的 affinity 部分）
const soulSave = (base, edit, prev) => {
  const norm = _normalizeSoul(edit);
  const diff = computeDiff(base, norm, prev);
  const meaningful = Object.keys(diff).some(k => k !== 'id' && k !== 'name');
  return meaningful ? diff : null;   // null = 整条 revise entry 被删除
};

eq('S1: base 无 tags → 添加 tags → revise 含 tags',
   soulSave({id:1, name:'a'}, {id:1, name:'a', tags:[1,2]}, undefined),
   {id:1, name:'a', tags:[1,2]});

eq('S2: revise.tags=[1,2] → 用户清空（editData.tags=[]） → normalize 后 diff vs prev 撤回，emit tags=null',
   soulSave(
     {id:1, name:'a'},
     {id:1, name:'a', tags:[]},
     {id:1, name:'a', tags:[1,2]}
   ),
   {id:1, name:'a', tags:null});

eq('S3: base 无 tags + edit 也无 tags + 无 prev → 完全空，revise entry 整体不写入',
   soulSave({id:1, name:'a'}, {id:1, name:'a'}, undefined),
   null);

eq('S4: base 无 tags + editData.tags=[] + 无 prev → normalize 后无 tags，整 entry 不写入',
   soulSave({id:1, name:'a'}, {id:1, name:'a', tags:[]}, undefined),
   null);

// 注：「revise=edit=[1]」path 在生产由 saveEdit 的 sessionChanged 守卫拦截（不调 computeDiff），
// 不属于 soulSave 测试范围。

eq('S5: revise.tags=[1,2] → edit 改为 [3] → diff emit 新值',
   soulSave(
     {id:1, name:'a'},
     {id:1, name:'a', tags:[3]},
     {id:1, name:'a', tags:[1,2]}
   ),
   {id:1, name:'a', tags:[3]});

eq('S6: revise=undefined + edit 加 [1] + 再清空 [] → S1 后跟 S2 模式',
   soulSave(
     {id:1, name:'a'},
     {id:1, name:'a', tags:[]},
     {id:1, name:'a', tags:[1]}
   ),
   {id:1, name:'a', tags:null});

// 端到端：soulSave 输出 + server deepMerge → 落盘的 revise 形状正确
console.log('\n--- soul 端到端：经 deepMerge 落盘 ---');
{
  const base = {id:1, name:'a'};
  let revise = null;

  // T1: 添加 tags
  const d1 = soulSave(base, {id:1, name:'a', tags:[1,2]}, revise);
  revise = deepMerge(revise, d1);
  eq('T1: 添加 → revise 有 tags',
     revise,
     {id:1, name:'a', tags:[1,2]});

  // T2: 全清空 → revise 应不含 tags 字段（但 entry 本身保留 id/name 框架，由后端按需删 entry）
  const d2 = soulSave(base, {id:1, name:'a', tags:[]}, revise);
  revise = deepMerge(revise, d2);
  eq('T2: 全清空 → revise pop tags（仅 id/name 残留，无 tags 空数组）',
     revise,
     {id:1, name:'a'});
}

// =========================================================================
// bladegraph 撤回（prev-revise pattern 迁移）
//
// bg-edit.js saveEdit 已迁移到 soul 同款 3-arg computeDiff + meaningful 判定。
// 无需 normalize（bg 无明显默认值），无字段分流，pattern 最纯净。
// =========================================================================
console.log('\n--- bladegraph 撤回（prev-revise pattern）---');

// mirror bg-edit.js saveEdit 主流程
const bgSave = (base, edit, prev) => {
  const diff = computeDiff(base, edit, prev);
  const meaningful = Object.keys(diff).some(k => k !== 'id' && k !== 'name');
  return meaningful ? diff : null;
};

eq('B1: base 无 X → 加 X → revise 含 X',
   bgSave({id:1, name:'a'}, {id:1, name:'a', element:1}, undefined),
   {id:1, name:'a', element:1});

eq('B2: revise.element=1 → 用户改回 base（无 element）→ 撤回 emit element=null',
   bgSave(
     {id:1, name:'a'},
     {id:1, name:'a'},
     {id:1, name:'a', element:1}
   ),
   {id:1, name:'a', element:null});

eq('B3: 完全无差异 + 无 prev → null（整 entry 不写入）',
   bgSave({id:1, name:'a'}, {id:1, name:'a'}, undefined),
   null);

eq('B4: 多字段改 + partial 撤回 + 部分保留',
   // base 有 element/weapon、editData 把 element 改回 base 值（1）、weapon 改成新值（5）
   bgSave(
     {id:1, name:'a', element:1, weapon:2},
     {id:1, name:'a', element:1, weapon:5},
     {id:1, name:'a', element:3, weapon:9}             // prev 之前两者都改过
   ),
   {id:1, name:'a', element:null, weapon:5});

eq('B5: effects 数组 sparse — 改 effect[1] 的 bairitu，effect[0] 不动',
   bgSave(
     {id:1, name:'a', effects:[{bunrui:[1],bairitu:100},{bunrui:[2],bairitu:200}]},
     {id:1, name:'a', effects:[{bunrui:[1],bairitu:100},{bunrui:[2],bairitu:999}]},
     undefined
   ),
   {id:1, name:'a', effects:{'1':{bairitu:999}}});

eq('B6: effects 数组 — 用户撤回 sparse 改动 → prev.effects[1].bairitu=999 → emit null 撤回',
   bgSave(
     {id:1, name:'a', effects:[{bunrui:[1],bairitu:100},{bunrui:[2],bairitu:200}]},
     {id:1, name:'a', effects:[{bunrui:[1],bairitu:100},{bunrui:[2],bairitu:200}]},
     {id:1, name:'a', effects:{'1':{bairitu:999}}}
   ),
   {id:1, name:'a', effects:{'1':{bairitu:null}}});

// 端到端：多次 save → 经 deepMerge 落盘 → revise 形状正确
console.log('\n--- bladegraph 端到端：多次 save + deepMerge 落盘 ---');
{
  const base = {id:1, name:'a'};
  let revise = null;

  // BG-E1: 加 element
  const d1 = bgSave(base, {id:1, name:'a', element:1}, revise);
  revise = deepMerge(revise, d1);
  eq('BG-E1: 加 element → revise 含 element',
     revise, {id:1, name:'a', element:1});

  // BG-E2: 撤回 element（用户保存「无变更」状态；prev 是 revise）
  const d2 = bgSave(base, {id:1, name:'a'}, revise);
  revise = deepMerge(revise, d2);
  eq('BG-E2: 撤回 → revise.element pop（剩 id/name 框架）',
     revise, {id:1, name:'a'});
}

// =========================================================================
// crystal 撤回（prev-revise pattern 迁移）
//
// cr-edit.js saveEdit 与 bladegraph 同结构：3-arg computeDiff + meaningful 判定。
// 特殊：crystal UI handler 在用户清字段时显式 e.X = null（不是 delete），让 diff
// 直接捕获用户的「清除」意图；这与 prev-revise 自动撤回叠加，对 base 已有字段的
// 撤回与新增 / 清除场景都正确。
// =========================================================================
console.log('\n--- crystal 撤回（prev-revise pattern）---');

const crystalSave = (base, edit, prev) => {
  const diff = computeDiff(base, edit, prev);
  const meaningful = Object.keys(diff).some(k => k !== 'id' && k !== 'name');
  return meaningful ? diff : null;
};

eq('C1: base 有 element=1 + scope=3 → 改 scope=0（UI 同步清 element=null）→ diff emit scope=0, element=null',
   // base.element=1, scope=3；edit 改 scope=0 + element=null（cr-edit UI 联动写 null）
   crystalSave(
     {id:1, name:'a', effects:[{scope:3, element:1, bairitu:1}]},
     {id:1, name:'a', effects:[{scope:0, element:null, bairitu:1}]},
     undefined
   ),
   {id:1, name:'a', effects:{'0':{scope:0, element:null}}});

eq('C2: revise 有 {scope:0, element:null} → 用户重新设 element=2 + scope 改回 base=3',
   crystalSave(
     {id:1, name:'a', effects:[{scope:3, element:1, bairitu:1}]},
     {id:1, name:'a', effects:[{scope:3, element:2, bairitu:1}]},
     {id:1, name:'a', effects:{'0':{scope:0, element:null}}}   // 上一次 revise 的状态
   ),
   // element=2 emit 新值；scope 回 base=3 但 prev 有 scope=0 stale → emit scope:null 撤回
   {id:1, name:'a', effects:{'0':{scope:null, element:2}}});

eq('C3: 完全无差异 + 无 prev → null（不写 revise）',
   crystalSave(
     {id:1, name:'a', effects:[{scope:0, bairitu:1}]},
     {id:1, name:'a', effects:[{scope:0, bairitu:1}]},
     undefined
   ),
   null);

eq('C4: weight_step 撤回：base 无 weight_step → edit 设置 0.5 + delta=0.1 → emit 两者',
   crystalSave(
     {id:1, name:'a', effects:[{bunrui:[1], bairitu:1}]},
     {id:1, name:'a', weight_step:0.5, effects:[{bunrui:[1], bairitu:1, weight_delta:0.1}]},
     undefined
   ),
   {id:1, name:'a', weight_step:0.5, effects:{'0':{weight_delta:0.1}}});

eq('C5: revise 有 weight_step=0.5 → 用户清空（设 null）→ prev 撤回 emit null',
   crystalSave(
     {id:1, name:'a', effects:[{bunrui:[1], bairitu:1}]},
     {id:1, name:'a', weight_step:null, effects:[{bunrui:[1], bairitu:1, weight_delta:null}]},
     {id:1, name:'a', weight_step:0.5, effects:{'0':{weight_delta:0.1}}}
   ),
   {id:1, name:'a', weight_step:null, effects:{'0':{weight_delta:null}}});

// 端到端：crystal 多次 save → deepMerge 落盘
console.log('\n--- crystal 端到端：多次 save + deepMerge 落盘 ---');
{
  const base = {id:1, name:'a', effects:[{scope:3, element:1, bairitu:1}]};
  let revise = null;

  // CR-E1: 改 scope=0 + element 自动清
  const d1 = crystalSave(base,
    {id:1, name:'a', effects:[{scope:0, element:null, bairitu:1}]},
    revise);
  revise = deepMerge(revise, d1);
  eq('CR-E1: scope=0 + element=null → revise effects.0.scope=0（element 被 server pop）',
     revise, {id:1, name:'a', effects:{'0':{scope:0}}});

  // CR-E2: 改回 base（scope=3 + element=1）
  const d2 = crystalSave(base, base, revise);
  revise = deepMerge(revise, d2);
  eq('CR-E2: 改回 base → revise.effects 全 pop（仅剩 id/name 框架）',
     revise, {id:1, name:'a'});
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
