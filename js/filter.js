// js/filter.js
import { state } from './state.js';
import { RARITY, ELEMENT, WEAPON, CHARA_TAG, CHARA_TAG_COLOR,
         renderFilterToggles, renderElementFilterToggles } from '../shared/constants.js';
import { FilterCore } from '../shared/filter-core.js';
import { CHARA_SPEC } from '../shared/chara-spec.js';
import { renderList } from './render.js';

export const initFilterToggles = () => {
  // document.getElementById('f-rarity').innerHTML    = renderFilterToggles('rarity', RARITY, { sort: 'desc' });
  document.getElementById('f-rarity').innerHTML    = renderFilterToggles('rarity', RARITY, { sort: 'desc' });
  document.getElementById('f-element').innerHTML    = renderElementFilterToggles('element', {only: [1,2,3,4,5,6]});
  document.getElementById('f-weapon').innerHTML      = renderFilterToggles('weapon', WEAPON);
  document.getElementById('f-tags').innerHTML = renderFilterToggles('tags', CHARA_TAG, {
    attr: function(k){ return CHARA_TAG_COLOR[k] ? ' style="color:' + CHARA_TAG_COLOR[k] + '"' : ''; }
  });
}

export const toggleFilters = () => {
  const body = document.getElementById('filters-body');
  const btn = document.getElementById('filter-toggle-btn');
  const open = body.style.display === 'flex' || body.style.display === 'block';
  body.style.display = open ? '' : 'flex';
  btn.textContent = open ? '▼ 絞り込み' : '▲ 絞り込み';
  state._filtersOpenScrollY = open ? null : window.scrollY;
}

export const collapseFiltersOnScroll = () => {
  if (window.innerWidth > 900) return;
  const body = document.getElementById('filters-body');
  if (!body || !(body.style.display === 'flex' || body.style.display === 'block')) return;
  if (state._filtersOpenScrollY === null) return;
  if (Math.abs(window.scrollY - state._filtersOpenScrollY) < 20) return;
  body.style.display = '';
  const btn = document.getElementById('filter-toggle-btn');
  if (btn) btn.textContent = '▼ 絞り込み';
  state._filtersOpenScrollY = null;
}

export const toggleFilter = (key, val, btn) => {
  if (state.filterSets[key].has(val)) { state.filterSets[key].delete(val); btn.classList.remove('on'); }
  else                           { state.filterSets[key].add(val);    btn.classList.add('on'); }
  applyFilters();
}

export const toggleSortDir = () => {
  state.sortDesc = !state.sortDesc;
  document.getElementById('sort-dir').textContent = state.sortDesc ? '↓' : '↑';
  applyFilters();
}

export const getBestState = (c) => {
  for (const s of ['極弐', '改造', '通常']) {
    if (c.states?.[s]) return c.states[s];
  }
  return null;
}

export const getSortValue = (c, key) => {
  const fn = CHARA_SPEC.sortFns[key];
  return fn ? fn(c) : null;
}

export const resetFilters = () => {
  document.getElementById('search').value = '';
  document.getElementById('f-sort').value = '';
  Object.keys(state.filterSets).forEach(k => {
    state.filterSets[k].clear();
    document.querySelectorAll(`#f-${k} .ftog`).forEach(b => b.classList.remove('on'));
  });
  applyFilters();
}

export const applyFilters = () => {
  const q = document.getElementById('search').value.trim();
  state.sortKey = document.getElementById('f-sort').value;

  state.filteredChars = FilterCore.applyFilters(state.allChars, {
    q: q,
    filters: state.filterSets,
    sortKey: state.sortKey,
    sortDesc: state.sortDesc,
  }, CHARA_SPEC);

  // Default order when no sort key: by sort_id/id (preserve existing behavior)
  if (!state.sortKey) {
    state.filteredChars.sort((a, b) => {
      const va = a.sort_id ?? a.id ?? 0;
      const vb = b.sort_id ?? b.id ?? 0;
      return state.sortDesc ? vb - va : va - vb;
    });
  }

  const ct = `${state.filteredChars.length} 件`;
  document.getElementById('char-count').textContent = ct;
  const mob = document.getElementById('char-count-mob');
  if (mob) mob.textContent = ct;
  renderList();
}

