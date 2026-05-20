// tests/test_save_edit_base.cjs — mirror shared/save-edit-base.js 核心逻辑、跑 unit test。
// 用法: node tests/test_save_edit_base.cjs
//
// 注意：本测试 mirror 而非 import（save-edit-base.js 是 ESM、本 test 是 CJS、不直接 require）。
// 跟 test_diff.cjs / test_calculator.cjs 同模式。后续 Step G 切 .mjs 时一起改。

let pass = 0,
  fail = 0;
const eq = (label, a, b) => {
  const ok =
    typeof a === 'object' && a !== null ? JSON.stringify(a) === JSON.stringify(b) : Object.is(a, b);
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${label}: got=${JSON.stringify(a)} expected=${JSON.stringify(b)}`);
  }
};
const truthy = (label, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${label}`);
  }
};

// ===== mirror shared/save-edit-base.js =====
// computeDiff mirror（简化、跟 js/diff.js 等价）
const _NOOP = Symbol('noop');
const _isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
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
  const mNullish = mval === null || mval === undefined;
  const oNullish = oval === null || oval === undefined;
  if (mNullish && oNullish) return prev != null ? null : _NOOP;
  if (mNullish) return null;
  if (oNullish) {
    if (prev != null && JSON.stringify(prev) === JSON.stringify(mval)) return _NOOP;
    return JSON.parse(JSON.stringify(mval));
  }
  if (JSON.stringify(mval) === JSON.stringify(oval)) return prev !== undefined ? null : _NOOP;
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

// mirror: saveEditSingleViewer
function saveEditSingleViewer(state, opts) {
  if (!state.editData) return { idx: -1, changed: false, id: null };
  const all = state[opts.collectionKey];
  const id = state.editData.id;
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) return { idx: -1, changed: false, id };
  const sessionChanged = JSON.stringify(state.editData) !== JSON.stringify(all[idx]);
  if (sessionChanged) {
    all[idx] = state.editData;
    const editForDiff = opts.normalizeForDiff
      ? opts.normalizeForDiff(state.editData)
      : state.editData;
    const prev = state.reviseData[id];
    const diff = computeDiff(state.originalData[id], editForDiff, prev);
    const meaningful = Object.keys(diff).some((k) => k !== 'id' && k !== 'name');
    if (meaningful) {
      state.reviseData[id] = diff;
      state.sessionReviseIds.add(id);
    } else {
      delete state.reviseData[id];
      state.sessionReviseIds.delete(id);
    }
  }
  return { idx, changed: sessionChanged, id };
}

// mirror: saveEditCharaCore
function saveEditCharaCore(state, opts) {
  if (!state.editData) return { idx: -1, changed: false, id: null };
  const id = state.editData.id;
  const idx = state.allChars.findIndex((x) => x.id === id);
  if (idx < 0) return { idx: -1, changed: false, id };
  const sessionChanged = JSON.stringify(state.editData) !== JSON.stringify(state.allChars[idx]);
  if (sessionChanged) {
    state.allChars[idx] = state.editData;
    const prevMerged = Object.assign(
      {},
      state.reviseData[id] || {},
      state.omoideReviseData[id] || {},
    );
    const diff = computeDiff(state.originalData[id], state.editData, prevMerged);
    const charDiff = { id: diff.id, name: diff.name };
    const omoideDiff = { id: diff.id, name: diff.name };
    let hasChar = false;
    let hasOmoide = false;
    for (const key in diff) {
      if (key === 'id' || key === 'name') continue;
      if (opts.OMOIDE_KEYS.has(key)) {
        omoideDiff[key] = diff[key];
        hasOmoide = true;
      } else {
        charDiff[key] = diff[key];
        hasChar = true;
      }
    }
    if (hasOmoide && omoideDiff.omoide_template != null) omoideDiff.omoide = null;
    if (hasChar) state.reviseData[id] = charDiff;
    else delete state.reviseData[id];
    if (hasOmoide) state.omoideReviseData[id] = omoideDiff;
    else delete state.omoideReviseData[id];
    state.sessionReviseIds.add(id);
  }
  return { idx, changed: sessionChanged, id };
}

// ===== Tests =====

const OMOIDE_KEYS = new Set(['omoide', 'omoide_template', 'omoide_rarity']);

const makeState = (charas = [], opts = {}) => ({
  editData: null,
  allBG: [...charas], // 借 allBG 作通用 list 名
  reviseData: {},
  originalData: charas.reduce((m, c) => ((m[c.id] = JSON.parse(JSON.stringify(c))), m), {}),
  sessionReviseIds: new Set(),
  ...opts,
});

console.log('--- saveEditSingleViewer: no session change → no revise ---');
{
  const s = makeState([{ id: 1, name: 'X', rarity: 4 }]);
  s.editData = { id: 1, name: 'X', rarity: 4 };
  const r = saveEditSingleViewer(s, { collectionKey: 'allBG' });
  eq('idx 0', r.idx, 0);
  eq('changed false', r.changed, false);
  truthy('reviseData empty', Object.keys(s.reviseData).length === 0);
  truthy('sessionReviseIds empty', s.sessionReviseIds.size === 0);
}

console.log('\n--- saveEditSingleViewer: 改字段 → diff 进 reviseData ---');
{
  const s = makeState([{ id: 1, name: 'X', rarity: 4 }]);
  s.editData = { id: 1, name: 'X', rarity: 5 };
  const r = saveEditSingleViewer(s, { collectionKey: 'allBG' });
  eq('changed true', r.changed, true);
  eq('reviseData[1] = patch', s.reviseData[1], { id: 1, name: 'X', rarity: 5 });
  truthy('sessionReviseIds has 1', s.sessionReviseIds.has(1));
}

console.log('\n--- saveEditSingleViewer: 撤回到 base + prev 有值 → emit null + 清 session ---');
{
  // 模拟：第 1 次改 rarity=5 saveEdit、第 2 次改回 4 saveEdit
  const s = makeState([{ id: 1, name: 'X', rarity: 4 }]);
  // 第 1 次
  s.editData = { id: 1, name: 'X', rarity: 5 };
  saveEditSingleViewer(s, { collectionKey: 'allBG' });
  // 第 2 次：reviseData 已有 {rarity:5}、prev != undefined、撤回回 4
  s.editData = { id: 1, name: 'X', rarity: 4 };
  const r = saveEditSingleViewer(s, { collectionKey: 'allBG' });
  eq('changed true', r.changed, true);
  // 撤回：emit null → reviseData[1].rarity = null → 但因为 meaningful = true (rarity:null 是 meaningful key)
  // → 保留 reviseData[1] 含 null 撤回标记
  eq('reviseData[1] = rarity:null retraction', s.reviseData[1], { id: 1, name: 'X', rarity: null });
  truthy('sessionReviseIds has 1', s.sessionReviseIds.has(1));
}

console.log('\n--- saveEditSingleViewer: editData 等于 base + 无 prev → 不入 revise ---');
{
  const s = makeState([{ id: 1, name: 'X', rarity: 4 }]);
  // 进入 edit 但只是 deepcopy 没改
  s.editData = JSON.parse(JSON.stringify(s.allBG[0]));
  const r = saveEditSingleViewer(s, { collectionKey: 'allBG' });
  eq('changed false (same as allBG)', r.changed, false);
  truthy('reviseData empty', !s.reviseData[1]);
}

console.log('\n--- saveEditSingleViewer: normalizeForDiff hook 生效 ---');
{
  // soul 用例：atk_effect=1 应被 normalize 掉、不进 diff
  const normalize = (s) => {
    const c = JSON.parse(JSON.stringify(s));
    if (c.element_affinity?.火?.atk_effect === '1') delete c.element_affinity.火.atk_effect;
    return c;
  };
  const s = makeState([{ id: 1, name: 'X', element_affinity: { 火: { level: -2 } } }]);
  s.editData = { id: 1, name: 'X', element_affinity: { 火: { level: -2, atk_effect: '1' } } };
  const r = saveEditSingleViewer(s, { collectionKey: 'allBG', normalizeForDiff: normalize });
  eq('changed true (editData != allBG)', r.changed, true);
  truthy('normalize → atk_effect 不进 diff', !s.reviseData[1]);
}

console.log('\n--- saveEditCharaCore: split diff 按 OMOIDE_KEYS 拆 ---');
{
  const s = makeState([{ id: 1, name: 'X', rarity: 4 }]);
  s.allChars = s.allBG;
  s.omoideReviseData = {};
  s.editData = {
    id: 1,
    name: 'X',
    rarity: 5,
    omoide: [{ threshold: 30, slots: [1] }],
    omoide_rarity: 4,
  };
  const r = saveEditCharaCore(s, { OMOIDE_KEYS });
  eq('changed true', r.changed, true);
  eq('reviseData[1] (chara 部分)', s.reviseData[1], { id: 1, name: 'X', rarity: 5 });
  eq('omoideReviseData[1] (omoide 部分)', s.omoideReviseData[1], {
    id: 1,
    name: 'X',
    omoide: [{ threshold: 30, slots: [1] }],
    omoide_rarity: 4,
  });
}

console.log('\n--- saveEditCharaCore: omoide_template != null → omoide 强制 null ---');
{
  const s = makeState([{ id: 1, name: 'X' }]);
  s.allChars = s.allBG;
  s.omoideReviseData = {};
  s.editData = {
    id: 1,
    name: 'X',
    omoide_template: 99,
    omoide: [{ threshold: 30, slots: [1] }],
  };
  saveEditCharaCore(s, { OMOIDE_KEYS });
  eq('omoide_template emit', s.omoideReviseData[1]?.omoide_template, 99);
  // omoide 被强制 null（不论 diff 算出来是啥）
  eq('omoide forced null', s.omoideReviseData[1]?.omoide, null);
}

console.log('\n--- saveEditCharaCore: 只改 omoide → reviseData 不入、omoideReviseData 入 ---');
{
  const s = makeState([{ id: 1, name: 'X' }]);
  s.allChars = s.allBG;
  s.omoideReviseData = {};
  s.editData = { id: 1, name: 'X', omoide: [{ threshold: 30, slots: [1] }] };
  saveEditCharaCore(s, { OMOIDE_KEYS });
  truthy('reviseData empty (hasChar=false)', !s.reviseData[1]);
  truthy('omoideReviseData has 1', !!s.omoideReviseData[1]);
  truthy('sessionReviseIds has 1', s.sessionReviseIds.has(1));
}

console.log('\n--- saveEditCharaCore: 撤回 omoide 到 base + prev 有值 → omoide null 撤回 ---');
{
  const s = makeState([{ id: 1, name: 'X' }]);
  s.allChars = s.allBG;
  // allChars[0] 反映 deepApply(base, omoideReviseData) 后状态、即含 omoide
  s.allChars[0] = { id: 1, name: 'X', omoide: [{ threshold: 30, slots: [1] }] };
  s.omoideReviseData = { 1: { id: 1, name: 'X', omoide: [{ threshold: 30, slots: [1] }] } };
  // editData 删了 omoide（撤回到 base：base 没 omoide）
  s.editData = { id: 1, name: 'X' };
  saveEditCharaCore(s, { OMOIDE_KEYS });
  eq('omoideReviseData[1] = omoide:null retraction', s.omoideReviseData[1], {
    id: 1,
    name: 'X',
    omoide: null,
  });
}

console.log('\n--- saveEditCharaCore: 同时撤回 chara + omoide → 两个 store 都 update ---');
{
  const s = makeState([{ id: 1, name: 'X', rarity: 4 }]);
  s.allChars = s.allBG;
  s.omoideReviseData = { 1: { id: 1, name: 'X', omoide: [{ threshold: 30, slots: [1] }] } };
  s.reviseData = { 1: { id: 1, name: 'X', rarity: 5 } };
  // editData 撤回 rarity 改动 + omoide 改动
  s.editData = { id: 1, name: 'X', rarity: 4 };
  // 注意：allChars[0] = ...rarity:5 / omoide:[...]（合并 reviseData + omoideReviseData 后的状态）
  // 实际场景下、enterEditMode 时 allChars 已含合并、editData = deepcopy(allChars)
  s.allChars[0] = {
    id: 1,
    name: 'X',
    rarity: 5,
    omoide: [{ threshold: 30, slots: [1] }],
  };
  saveEditCharaCore(s, { OMOIDE_KEYS });
  // chara: rarity 撤回 → null
  eq('reviseData[1].rarity null', s.reviseData[1]?.rarity, null);
  // omoide: omoide 撤回 → null
  eq('omoideReviseData[1].omoide null', s.omoideReviseData[1]?.omoide, null);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
