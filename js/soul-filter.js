// js/soul-filter.js
import { state } from './soul-state.js';
import { RARITY, ELEMENT, WEAPON,
         renderFilterToggles, renderElementFilterToggles } from '../shared/constants.js';
import { FilterCore } from '../shared/filter-core.js';
import { SOUL_SPEC } from '../shared/soul-spec.js';
import { renderList } from './soul-render.js';

export const toggleFilters = () => {
  const body = document.getElementById('filters-body');
  const btn = document.getElementById('filter-toggle-btn');
  const open = body.style.display === 'flex' || body.style.display === 'block';
  body.style.display = open ? '' : 'flex';
  btn.textContent = open ? '▼ 絞り込み' : '▲ 絞り込み';
  state._filtersOpenScrollY = open ? null : window.scrollY;
}

export const collapseFiltersOnScroll = () => {
  if (window.innerWidth > 768) return;
  const body = document.getElementById('filters-body');
  if (!body || !(body.style.display === 'flex' || body.style.display === 'block')) return;
  if (state._filtersOpenScrollY === null) return;
  if (Math.abs(window.scrollY - state._filtersOpenScrollY) < 20) return;
  body.style.display = '';
  const btn = document.getElementById('filter-toggle-btn');
  if (btn) btn.textContent = '▼ 絞り込み';
  state._filtersOpenScrollY = null;
}

export const initFilterToggles = () => {
  document.getElementById('f-rarity').innerHTML  = renderFilterToggles('rarity', {5:'★5',4:'★4',3:'★3',2:'★2',1:'★1'}, {only:[5,4,3,2,1]});
  document.getElementById('f-element').innerHTML = renderElementFilterToggles('element', {skip:[0]});
  document.getElementById('f-type').innerHTML    = renderFilterToggles('type', WEAPON);
}

export const toggleFilter = (key, val, btn) => {
  val = Number(val);
  if (state.filterSets[key].has(val)) { state.filterSets[key].delete(val); btn.classList.remove('on'); }
  else                           { state.filterSets[key].add(val);    btn.classList.add('on'); }
  applyFilters();
}

export const toggleSortDir = () => {
  state.sortDesc = !state.sortDesc;
  document.getElementById('sort-dir').textContent = state.sortDesc ? '↓' : '↑';
  applyFilters();
}

export const resetFilters = () => {
  document.getElementById('search').value = '';
  document.getElementById('f-sort').value = 'id';
  Object.keys(state.filterSets).forEach(k => {
    state.filterSets[k].clear();
    document.querySelectorAll(`#f-${k} .ftog`).forEach(b => b.classList.remove('on'));
  });
  state.sortDesc = true;
  document.getElementById('sort-dir').textContent = '↓';
  applyFilters();
}

export const applyFilters = () => {
  const q    = document.getElementById('search').value.trim();
  const sKey = document.getElementById('f-sort').value;

  state.filteredSouls = FilterCore.applyFilters(state.allSouls, {
    q: q,
    filters: state.filterSets,
    sortKey: sKey,
    sortDesc: state.sortDesc,
  }, SOUL_SPEC);

  // Default sort fallback (by id) when sortKey not in spec
  if (!sKey || !SOUL_SPEC.sortFns[sKey]) {
    state.filteredSouls.sort((a, b) => {
      const va = a.id || 0, vb = b.id || 0;
      return state.sortDesc ? vb - va : va - vb;
    });
  }

  const ct = `${state.filteredSouls.length} 件`;
  document.getElementById('soul-count').textContent = ct;
  const mob = document.getElementById('soul-count-mob');
  if (mob) mob.textContent = ct;
  renderList();
}

