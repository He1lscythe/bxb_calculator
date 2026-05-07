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

export const _deepDiff = (oval, mval) => {
  if (mval && typeof mval === 'object' && !Array.isArray(mval) &&
      oval && typeof oval === 'object' && !Array.isArray(oval)) {
    const sub = {};
    for (const k in mval)
      if (JSON.stringify(mval[k]) !== JSON.stringify(oval[k]))
        sub[k] = _deepDiff(oval[k], mval[k]);
    return sub;
  }
  if (Array.isArray(oval) && Array.isArray(mval) && oval.length === mval.length &&
      mval.length > 0 && mval.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
    const sparse = {};
    mval.forEach((m, i) => {
      if (JSON.stringify(m) !== JSON.stringify(oval[i]))
        sparse[i] = _deepDiff(oval[i], m);
    });
    return sparse;
  }
  return JSON.parse(JSON.stringify(mval));
};

export const computeDiff = (original, modified) => {
  const diff = { id: modified.id, name: modified.name };
  for (const key in modified) {
    if (key === 'id') continue;
    if (JSON.stringify(modified[key]) !== JSON.stringify(original[key]))
      diff[key] = _deepDiff(original[key], modified[key]);
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
