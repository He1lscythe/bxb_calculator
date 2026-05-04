// ===== FILTER CORE (shared) =====
// Spec-driven filter+sort engine. Each data source declares its own spec
// (in chara-spec.js / soul-spec.js / crystal-spec.js / bg-spec.js).
//
// spec shape:
//   {
//     searchFields: ['name','kana',...]  // fields to search in (string match, lowercased)
//     filters: {
//       <key>: {
//         extract: (item) => value           // for 'eq' / 'any' ops
//         op?: 'eq' | 'any'                  // default 'eq'
//         match?: (item, set) => boolean     // custom predicate (overrides op/extract)
//       }, ...
//     },
//     sortFns: {
//       <key>: (item) => number              // value used to compare
//     }
//   }
//
// state shape (caller supplies):
//   { q: string, filters: { <key>: Set }, sortKey: string, sortDesc: boolean }

(function (root) {
  function _matchesItem(item, state, spec) {
    // search query
    if (state.q) {
      const q = String(state.q).toLowerCase();
      const fields = spec.searchFields || ['name'];
      const hit = false;
      for (let i = 0; i < fields.length; i++) {
        const v = item[fields[i]];
        if (v != null && String(v).toLowerCase().indexOf(q) >= 0) { hit = true; break; }
      }
      if (!hit) return false;
    }
    // filter selections
    const filters = state.filters || {};
    const defs = spec.filters || {};
    for (const key in defs) {
      const sel = filters[key];
      if (!sel || !sel.size) continue;
      const def = defs[key];
      if (typeof def.match === 'function') {
        if (!def.match(item, sel)) return false;
      } else if (def.op === 'any') {
        const arr = def.extract(item);
        if (!Array.isArray(arr)) return false;
        const any = false;
        for (const v of sel) { if (arr.indexOf(v) >= 0) { any = true; break; } }
        if (!any) return false;
      } else {
        if (!sel.has(def.extract(item))) return false;
      }
    }
    return true;
  }

  function applyFilters(items, state, spec) {
    const result = items.filter(function (it) { return _matchesItem(it, state, spec); });
    const sortKey = state.sortKey;
    if (sortKey && spec.sortFns && spec.sortFns[sortKey]) {
      const get = spec.sortFns[sortKey];
      const desc = state.sortDesc !== false;
      result.sort(function (a, b) {
        let va = get(a), vb = get(b);
        if (va == null) va = -Infinity;
        if (vb == null) vb = -Infinity;
        return desc ? (vb - va) : (va - vb);
      });
    }
    return result;
  }

  // Toggle a value in a filter Set. Optionally update a button's .on class.
  function toggleFilterValue(set, val, btn) {
    if (set.has(val)) { set.delete(val); if (btn) btn.classList.remove('on'); }
    else              { set.add(val);    if (btn) btn.classList.add('on'); }
  }

  // Clear all filter Sets in a state.filters object
  function resetFilters(filters) {
    for (const k in filters) filters[k].clear();
  }

  root.FilterCore = {
    applyFilters: applyFilters,
    toggleFilterValue: toggleFilterValue,
    resetFilters: resetFilters,
  };
})(typeof window !== 'undefined' ? window : this);
