// js/diff.js — shared pure utilities for diff/patch and path access
// Imported by both characters (edit.js) and soul (soul-edit.js) etc.

export const getPath = (obj, pathStr) =>
  pathStr.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);

export const setPath = (obj, pathStr, value) => {
  const parts = pathStr.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
};

// _NOOP sentinel：表示子节点完全没变化（既无 modified 差异、也无 prev 撤回）
const _NOOP = Symbol('diff-noop');
const _isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

// 第三个参数 prev 为可选：上次提交到 staging 的 revise diff（用于侦测"撤回"）。
// 若 prev[k] 存在但 modified[k] 已退回 base，emit null 标记该字段需在 staging 删除。
// 不传 prev 时行为完全等价旧版本（向后兼容）。
export const _deepDiff = (oval, mval, prev) => {
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
    // 需要处理的 index = (mval 与 oval 不同的) ∪ (prev 涉及的)。
    // 仅看 mval !== oval 会漏掉 "prev 有值但用户已 revert 到 oval" 的 index。
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
  // 叶子或类型不匹配
  if (JSON.stringify(mval) === JSON.stringify(oval)) {
    return prev !== undefined ? null : _NOOP;
  }
  return JSON.parse(JSON.stringify(mval));
};

export const computeDiff = (original, modified, prevRevise) => {
  const diff = { id: modified.id, name: modified.name };
  const allKeys = new Set([...Object.keys(modified), ...Object.keys(prevRevise || {})]);
  for (const k of allKeys) {
    if (k === 'id' || k === 'name') continue;
    const cd = _deepDiff(original[k], modified[k], prevRevise ? prevRevise[k] : undefined);
    if (cd !== _NOOP) diff[k] = cd;
  }
  return diff;
};

export const deepApply = (target, patch) => {
  for (const k in patch) {
    if (k === 'id') continue;
    const pv = patch[k], tv = target[k];
    if (Array.isArray(tv) && pv && typeof pv === 'object' && !Array.isArray(pv) &&
        Object.keys(pv).every(kk => /^\d+$/.test(kk))) {
      for (const idx in pv) {
        const i = +idx;
        if (i >= tv.length) continue;
        const pvi = pv[idx];
        if (pvi && typeof pvi === 'object' && !Array.isArray(pvi) &&
            tv[i] && typeof tv[i] === 'object' && !Array.isArray(tv[i])) {
          deepApply(tv[i], pvi);
        } else {
          tv[i] = JSON.parse(JSON.stringify(pvi));
        }
      }
    } else if (pv !== null && typeof pv === 'object' && !Array.isArray(pv) &&
               tv !== null && typeof tv === 'object' && !Array.isArray(tv)) {
      deepApply(tv, pv);
    } else {
      target[k] = JSON.parse(JSON.stringify(pv));
    }
  }
};
