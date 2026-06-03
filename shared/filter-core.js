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
