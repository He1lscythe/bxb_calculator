// shared/filter-core.js — v2 通用 filter / sort utility
// 简化版、不实现 wiki 的 sparse spec 系统。
// 每 viewer 自行 import + 调 matchAll / applySort / renderToggles。

import { ELEMENT_LABEL, WEAPON_LABEL, RARITY_LABEL, RARITY_ORDER } from './constants.js';

export const rarityOptions = () => RARITY_ORDER.map((id) => ({ id, label: RARITY_LABEL[id] }));
export const elementOptions = () => [1, 2, 3, 4, 5, 6].map((id) => ({ id, label: ELEMENT_LABEL[id] }));
export const weaponTypeOptions = () => Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, label: WEAPON_LABEL[i + 1],
}));

// generic filter — state = {rarity:Set, element:Set, weapon:Set, search:str}
// fields = {rarity:'rarity', element:'element_id', weapon:'weapon_type_id'}
export const matchAll = (item, state, fields = {}) => {
  const rk = fields.rarity || 'rarity';
  const ek = fields.element || 'element_id';
  const wk = fields.weapon || 'weapon_type_id';
  if (state.rarity?.size && !state.rarity.has(item[rk])) return false;
  if (state.element?.size && !state.element.has(item[ek])) return false;
  if (state.weapon?.size && !state.weapon.has(item[wk])) return false;
  if (state.search) {
    const s = state.search.toLowerCase();
    const name = (item.name || '').toLowerCase();
    if (!name.includes(s)) return false;
  }
  return true;
};

export const renderToggles = (container, label, opts, state, onchange) => {
  if (!container) return;
  const sset = state[label] ||= new Set();
  container.innerHTML = '';
  for (const opt of opts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.className = 'ftog' + (sset.has(opt.id) ? ' active' : '');
    btn.onclick = () => {
      if (sset.has(opt.id)) sset.delete(opt.id); else sset.add(opt.id);
      btn.classList.toggle('active');
      onchange?.();
    };
    container.appendChild(btn);
  }
};

export const buildComparator = (key, dir = 'desc') => {
  const mul = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return 0;
  };
};

export const applyFilterSort = (items, state, fields, sortKey, sortDir) => {
  let out = items.filter((it) => matchAll(it, state, fields));
  if (sortKey) out = out.slice().sort(buildComparator(sortKey, sortDir));
  return out;
};

// ============================================================
// spec-driven filter — 通用 facet/sort spec、各 viewer module 用
// spec = {
//   facets: [{ key, label, options:[{id,label}], match(item, selectedIds) }],
//   sorts: [{ key, label, getter(item) -> num }],
// }
// state = { [facet.key]: Set(id), search: str, sort: 'key', dir: 'asc'|'desc' }
// ============================================================

export const applySpec = (items, spec, state) => {
  let out = items;
  // facets
  for (const f of spec.facets || []) {
    const sel = state[f.key];
    if (sel && sel.size > 0) {
      out = out.filter((it) => f.match(it, sel));
    }
  }
  // search
  if (state.search) {
    const s = state.search.toLowerCase();
    out = out.filter((it) => (it.name || '').toLowerCase().includes(s));
  }
  // sort
  if (state.sort && spec.sorts) {
    const sort = spec.sorts.find((x) => x.key === state.sort);
    if (sort) {
      const mul = state.dir === 'asc' ? 1 : -1;
      out = out.slice().sort((a, b) => (sort.getter(a) - sort.getter(b)) * mul);
    }
  }
  return out;
};

export const renderSpecFilters = (container, spec, state, onchange) => {
  if (!container) return;
  container.innerHTML = '';
  // sort dropdown
  if (spec.sorts?.length) {
    const sortBox = document.createElement('div');
    sortBox.innerHTML = `<h3>並び替え</h3><div class="row">
      <select id="sort-key" style="flex:1">${spec.sorts.map(s => `<option value="${s.key}" ${state.sort===s.key?'selected':''}>${s.label}</option>`).join('')}</select>
      <select id="sort-dir"><option value="desc" ${state.dir==='desc'?'selected':''}>↓</option><option value="asc" ${state.dir==='asc'?'selected':''}>↑</option></select>
    </div>`;
    container.appendChild(sortBox);
    sortBox.querySelector('#sort-key').onchange = (e) => { state.sort = e.target.value; onchange?.(); };
    sortBox.querySelector('#sort-dir').onchange = (e) => { state.dir = e.target.value; onchange?.(); };
  }
  // facets
  for (const f of spec.facets || []) {
    const sset = state[f.key] ||= new Set();
    const h = document.createElement('h3');
    h.textContent = f.label;
    container.appendChild(h);
    const box = document.createElement('div');
    container.appendChild(box);
    for (const opt of f.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.className = 'ftog' + (sset.has(opt.id) ? ' active' : '');
      btn.onclick = () => {
        if (sset.has(opt.id)) sset.delete(opt.id); else sset.add(opt.id);
        btn.classList.toggle('active');
        onchange?.();
      };
      box.appendChild(btn);
    }
  }
  // reset
  const reset = document.createElement('button');
  reset.textContent = 'リセット';
  reset.style.marginTop = '8px';
  reset.onclick = () => {
    for (const f of spec.facets || []) state[f.key]?.clear();
    state.search = '';
    const searchInput = document.querySelector('#search');
    if (searchInput) searchInput.value = '';
    onchange?.();
    renderSpecFilters(container, spec, state, onchange);
  };
  container.appendChild(reset);
};
