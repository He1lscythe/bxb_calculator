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
  // array 分支：等长全 object → sparse index-keyed diff
  if (
    Array.isArray(oval) &&
    Array.isArray(mval) &&
    oval.length === mval.length &&
    mval.length > 0 &&
    mval.every((x) => x && typeof x === 'object' && !Array.isArray(x))
  ) {
    const sparse = {};
    const indices = new Set();
    mval.forEach((m, i) => {
      if (JSON.stringify(m) !== JSON.stringify(oval[i])) indices.add(i);
    });
    if (prev && typeof prev === 'object') {
      Object.keys(prev).forEach((k) => {
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

// ===== masou_overrides 流（chara editor 内嵌、跟 chara/cr/soul/bg 用 computeDiff + prev 对齐）=====
// 模拟 edit.js masou_overrides 块的核心逻辑（不含 patch/array dict 转换）。
// 验证：撤回到 base 时 entry 整条删（不残留 null）。
const META_KEYS = new Set(['id', 'name', 'chara_id', 'chara_name']);
function masouSaveOverride(state, mid, mergedMasou, prev) {
  // mergedMasou: state.allMasou[i] 已经合并 patch 后的状态（caller 责任）
  const orig = state.masouOriginalData[mid];
  if (!orig) return;
  const diff = computeDiff(orig, mergedMasou, prev);
  const meaningful = Object.keys(diff).some((k) => !META_KEYS.has(k));
  if (meaningful) {
    state.masouReviseData[mid] = Object.assign(
      {
        id: mid,
        name: mergedMasou.name,
        chara_id: mergedMasou.chara_id,
        chara_name: mergedMasou.chara_name,
      },
      diff,
    );
    state.masouSessionReviseIds.add(mid);
  } else {
    delete state.masouReviseData[mid];
    state.masouSessionReviseIds.delete(mid);
  }
}

const makeMasouState = (masouBase = []) => ({
  allMasou: JSON.parse(JSON.stringify(masouBase)),
  masouOriginalData: masouBase.reduce((m, x) => ((m[x.id] = JSON.parse(JSON.stringify(x))), m), {}),
  masouReviseData: {},
  masouSessionReviseIds: new Set(),
});

console.log('\n--- masou: 改 effect 字段 → sparse-dict diff 进 reviseData (带 metadata) ---');
{
  const base = [
    {
      id: 510,
      name: '白焔',
      chara_id: 1527,
      chara_name: 'バハムート=オメガ:Blaze',
      effects: [{ bunrui: [1], bairitu: 1.3, bairitu_scaling: 0 }],
    },
  ];
  const s = makeMasouState(base);
  // user 改 effects[0].bairitu_scaling 0 → 1
  s.allMasou[0] = JSON.parse(JSON.stringify(base[0]));
  s.allMasou[0].effects[0].bairitu_scaling = 1;
  masouSaveOverride(s, 510, s.allMasou[0], undefined);
  eq('reviseData[510] 含 metadata + sparse-dict diff', s.masouReviseData[510], {
    id: 510,
    name: '白焔',
    chara_id: 1527,
    chara_name: 'バハムート=オメガ:Blaze',
    effects: { 0: { bairitu_scaling: 1 } },
  });
  truthy('sessionReviseIds has 510', s.masouSessionReviseIds.has(510));
}

console.log('\n--- masou: 撤回到 base 值 → entry 整条删（不残留 null）---');
{
  const base = [
    {
      id: 510,
      name: '白焔',
      chara_id: 1527,
      chara_name: 'バハムート=オメガ:Blaze',
      effects: [{ bunrui: [1], bairitu: 1.3, bairitu_scaling: 0 }],
    },
  ];
  const s = makeMasouState(base);
  // 第 1 次：改 bairitu_scaling 0 → 1
  s.allMasou[0] = JSON.parse(JSON.stringify(base[0]));
  s.allMasou[0].effects[0].bairitu_scaling = 1;
  masouSaveOverride(s, 510, s.allMasou[0], undefined);
  truthy('第 1 次 saveEdit: reviseData[510] 存在', !!s.masouReviseData[510]);
  const prev = s.masouReviseData[510];
  // 第 2 次：撤回回 0
  s.allMasou[0].effects[0].bairitu_scaling = 0;
  masouSaveOverride(s, 510, s.allMasou[0], prev);
  // diff 应该是 {id, name, effects: {0: {bairitu_scaling: null}}}
  // meaningful check 看 'effects' (不是 META_KEYS) → meaningful=true → 仍保留 entry 含 null 撤回标记
  truthy(
    '第 2 次撤回: reviseData[510] 含 null 撤回标记',
    s.masouReviseData[510]?.effects?.[0]?.bairitu_scaling === null,
  );
  truthy('sessionReviseIds 仍含 510 (要 submit 撤回)', s.masouSessionReviseIds.has(510));
}

console.log('\n--- masou: refresh (no prev) 后撤回完成 → entry 整条删 ---');
{
  // 模拟 saveReviseCharaCore refresh 阶段（submit 成功后用无 prev 的 computeDiff 重算）
  const base = [
    {
      id: 510,
      name: '白焔',
      chara_id: 1527,
      chara_name: 'バハムート=オメガ:Blaze',
      effects: [{ bunrui: [1], bairitu: 1.3, bairitu_scaling: 0 }],
    },
  ];
  const s = makeMasouState(base);
  // allMasou 跟 base 一致（撤回后状态）
  // refresh：用无 prev 的 computeDiff、应该 diff 完全空（只 id/name）→ entry 删
  s.masouReviseData[510] = { id: 510, name: '白焔', effects: { 0: { bairitu_scaling: null } } };
  // 模拟 refresh：no prev
  const fresh = computeDiff(s.masouOriginalData[510], s.allMasou[0]);
  const meaningful = Object.keys(fresh).some((k) => !META_KEYS.has(k));
  if (meaningful) {
    s.masouReviseData[510] = Object.assign(
      {
        id: 510,
        name: s.allMasou[0].name,
        chara_id: s.allMasou[0].chara_id,
        chara_name: s.allMasou[0].chara_name,
      },
      fresh,
    );
  } else {
    delete s.masouReviseData[510];
  }
  truthy('refresh 后 reviseData[510] 整条删', !s.masouReviseData[510]);
}

console.log('\n--- masou: chara_id / chara_name 是 metadata、不影响 meaningful 判定 ---');
{
  // 即使 entry 只剩 metadata + chara_id + chara_name、也应判 meaningful=false
  const entry = { id: 510, name: '白焔', chara_id: 1527, chara_name: 'バハムート=オメガ:Blaze' };
  const meaningful = Object.keys(entry).some((k) => !META_KEYS.has(k));
  eq('metadata-only entry: meaningful=false', meaningful, false);
}

console.log('\n--- masou: 有 effects 改动时 meaningful=true ---');
{
  const entry = {
    id: 510,
    name: '白焔',
    chara_id: 1527,
    chara_name: 'バハムート=オメガ:Blaze',
    effects: { 0: { bairitu: 2 } },
  };
  const meaningful = Object.keys(entry).some((k) => !META_KEYS.has(k));
  eq('effects 改动: meaningful=true', meaningful, true);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
