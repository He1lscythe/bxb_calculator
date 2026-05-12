// ===== Filter Core =====
// Spec-driven filter+sort engine.
// Usage: import { FilterCore } from '../shared/filter-core.js';
//
// spec shape:
//   {
//     searchFields: ['name','kana',...]
//     filters: {
//       <key>: {
//         extract?: (item) => value     // for 'eq' / 'any' / 'all' ops
//         op?: 'eq' | 'any' | 'all'    // default 'eq'
//         match?: (item, set) => bool  // overrides op/extract
//       }
//     },
//     sortFns: { <key>: (item) => number }
//   }
//
// state shape: { q, filters: { key: Set }, sortKey, sortDesc }

const _matchesItem = (item, state, spec) => {
  if (state.q) {
    const q = String(state.q).toLowerCase();
    const fields = spec.searchFields || ['name'];
    let hit = false;
    for (let i = 0; i < fields.length; i++) {
      const v = item[fields[i]];
      if (v != null && String(v).toLowerCase().indexOf(q) >= 0) { hit = true; break; }
    }
    if (!hit) return false;
  }
  const filters = state.filters || {};
  const defs    = spec.filters   || {};
  for (const key in defs) {
    const sel = filters[key];
    if (!sel || !sel.size) continue;
    const def = defs[key];
    if (typeof def.match === 'function') {
      if (!def.match(item, sel)) return false;
    } else if (def.op === 'any') {
      const arr = def.extract(item);
      if (!Array.isArray(arr)) return false;
      let any = false;
      for (const v of sel) { if (arr.indexOf(v) >= 0) { any = true; break; } }
      if (!any) return false;
    } else if (def.op === 'all') {
      // 选中的所有 value 都必须在 item 的 array 中（AND）
      const arr = def.extract(item);
      if (!Array.isArray(arr)) return false;
      for (const v of sel) { if (arr.indexOf(v) < 0) return false; }
    } else {
      if (!sel.has(def.extract(item))) return false;
    }
  }
  return true;
};

const applyFilters = (items, state, spec) => {
  const result = items.filter(it => _matchesItem(it, state, spec));
  const sortKey = state.sortKey;
  if (sortKey && spec.sortFns?.[sortKey]) {
    const get  = spec.sortFns[sortKey];
    const desc = state.sortDesc !== false;
    result.sort((a, b) => {
      let va = get(a) ?? -Infinity;
      let vb = get(b) ?? -Infinity;
      return desc ? vb - va : va - vb;
    });
  }
  return result;
};

const toggleFilterValue = (set, val, btn) => {
  if (set.has(val)) { set.delete(val); btn?.classList.remove('on'); }
  else              { set.add(val);    btn?.classList.add('on'); }
};

const resetFilters = filters => {
  for (const k in filters) filters[k].clear();
};

export const FilterCore = { applyFilters, toggleFilterValue, resetFilters };
