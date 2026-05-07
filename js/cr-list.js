// js/cr-list.js
import { state } from './cr-state.js';
import { ELEMENT, WEAPON, BUNRUI_SHORT, BUNRUI_FILTER, CONDITION, SCOPE_SHORT,
         renderFilterToggles, renderElementFilterToggles } from '../shared/constants.js';
import { FilterCore } from '../shared/filter-core.js';
import { CRYSTAL_SPEC } from '../shared/crystal-spec.js';
import { escHtml, fmt, fmtLarge } from './utils.js';

export const initFilterToggles = () => {
  document.getElementById('f-rarity').innerHTML    = renderFilterToggles('rarity', {6:'★6',5:'★5',4:'★4',3:'★3',2:'★2',1:'★1'}, {only:[6,5,4,3,2,1]});
  document.getElementById('f-element').innerHTML   = renderElementFilterToggles('element');
  document.getElementById('f-weapon').innerHTML    = renderFilterToggles('weapon', {0:'全', ...WEAPON});
  document.getElementById('f-bunrui').innerHTML    = renderFilterToggles('bunrui', BUNRUI_FILTER);
  document.getElementById('f-scope').innerHTML     = renderFilterToggles('scope', SCOPE_SHORT);
  document.getElementById('f-condition').innerHTML = renderFilterToggles('condition', CONDITION, {skip:[0]});
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
  if (window.innerWidth > 768) return;
  const body = document.getElementById('filters-body');
  if (!body || !(body.style.display === 'flex' || body.style.display === 'block')) return;
  if (state._filtersOpenScrollY === null) return;
  if (Math.abs(window.scrollY - state._filtersOpenScrollY) < 30) return;
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

export const expandAll = () => {
  state.filteredCrystals.forEach(function(c) {
    if (state.editingId === c.id || state.expandedIds.has(c.id)) return;
    const row = document.getElementById('row-' + c.id);
    const body = document.getElementById('body-' + c.id);
    if (row && body) {
      state.expandedIds.add(c.id);
      row.classList.add('expanded');
      body.innerHTML = renderDetailBody(c);
    }
  });
}

export const collapseAll = () => {
  state.expandedIds.forEach(function(id) {
    if (state.editingId === id) return;
    const row = document.getElementById('row-' + id);
    const body = document.getElementById('body-' + id);
    if (row && body) { row.classList.remove('expanded'); body.innerHTML = ''; }
  });
  state.filteredCrystals.forEach(function(c) { if (state.editingId !== c.id) state.expandedIds.delete(c.id); });
}

export const resetFilters = () => {
  document.getElementById('search').value = '';
  Object.keys(state.filterSets).forEach(function(k) {
    state.filterSets[k].clear();
    document.querySelectorAll('#f-' + k + ' .ftog').forEach(function(b) { b.classList.remove('on'); });
  });
  applyFilters();
}

export const crystalElement = (c) => {
  const e = (c.effects||[]).find(function(e){return (e.scope===2||e.scope===3) && e.element!=null;});
  return e ? e.element : 0;
}

export const crystalWeapon = (c) => {
  const e = (c.effects||[]).find(function(e){return (e.scope===2||e.scope===3) && e.type!=null;});
  return e ? e.type : 0;
}

export const crystalScope = (c) => {
  return ((c.effects||[])[0]||{}).scope||0;
}

export const crystalCondition = (c) => {
  return ((c.effects||[])[0]||{}).condition||0;
}

export const applyFilters = () => {
  const q = document.getElementById('search').value.trim();
  state.filteredCrystals = FilterCore.applyFilters(state.allCrystals, {
    q: q,
    filters: state.filterSets,
  }, CRYSTAL_SPEC);
  const ct = state.filteredCrystals.length + ' 件';
  document.getElementById('crystal-count').textContent = ct;
  const mob = document.getElementById('crystal-count-mob');
  if (mob) mob.textContent = ct;
  state.expandedIds.clear();
  state.editingId = null;
  state.editData = null;
  renderList();
}

export const renderList = () => {
  const list = document.getElementById('crystal-list');
  if (!state.filteredCrystals.length) { list.innerHTML = '<div class="no-results">該当なし</div>'; return; }
  list.innerHTML = state.filteredCrystals.map(renderRow).join('');
}

export const fmtRowBairitu = (c) => {
  const parts = [];
  (c.effects || []).forEach(function(e) {
    if (e.bairitu_init == null && e.bairitu == null) return;
    const pfx = e.calc_type === 1 ? '+' : '×';
    const mn = e.bairitu_init, mx = e.bairitu;
    if (mn != null && mx != null && mn !== mx) parts.push(pfx + fmtLarge(mn) + '~' + fmtLarge(mx));
    else parts.push(pfx + fmtLarge(mn != null ? mn : mx));
  });
  return parts.length ? '<span class="row-bairitu">' + parts.join(' / ') + '</span>' : '';
}

export const renderRow = (c) => {
  const elem = crystalElement(c), weap = crystalWeapon(c), cond = crystalCondition(c);
  const rb = '<span class="badge r' + c.rarity + '">★' + c.rarity + '</span>';
  const eb = elem ? '<span class="badge elem-' + elem + '">' + (ELEMENT[elem] || elem) + '</span>' : '';
  const wb = weap ? '<span class="badge weapon">' + (WEAPON[weap] || weap) + '</span>' : '';
  const bt = (c.effects || []).reduce(function(acc, e) { return acc.concat(e.bunrui || []); }, [])
    .filter(function(v, i, a) { return a.indexOf(v) === i; })
    .slice(0, 2)
    .map(function(b) { return '<span class="badge bunrui-sm">' + (BUNRUI_SHORT[b] || b) + '</span>'; }).join('');
  const bc = cond ? '<span class="badge bunrui-sm">' + (CONDITION[cond] || cond) + '</span>' : '';
  const bairitu = fmtRowBairitu(c);
  const expandBtn = '<button class="expand-btn" onclick="event.stopPropagation();toggleExpand(' + c.id + ')">▾</button>';

  // Desktop: row-badges | name | bunrui+cond | bairitu | expand
  const desktopHtml =
    '<div class="cr-row-desktop">' +
      '<div class="row-badges">' + rb + eb + wb + '</div>' +
      '<div class="row-name">' + escHtml(c.name) + '</div>' +
      '<div class="row-bunrui">' + bt + bc + '</div>' +
      bairitu +
    '</div>';

  // Mobile: left(rarity+name) | right(elem+weap+cond+bunrui+bairitu)
  const mobileHtml =
    '<div class="cr-row-mobile">' +
      '<div class="bg-row-left">' + rb + '<span class="row-name">' + escHtml(c.name) + '</span></div>' +
      '<div class="bg-row-right">' + eb + wb + bc + bt + bairitu + '</div>' +
    '</div>';

  return '<div class="crystal-row" id="row-' + c.id + '">' +
    '<div class="crystal-row-hd" onclick="toggleExpand(' + c.id + ')">' +
      desktopHtml + mobileHtml + expandBtn +
    '</div>' +
    '<div class="crystal-body" id="body-' + c.id + '"></div>' +
  '</div>';
}

export const toggleExpand = (id) => {
  if (state.editingId === id) return;
  const row  = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  if (!row || !body) return;

  if (state.expandedIds.has(id)) {
    state.expandedIds.delete(id);
    row.classList.remove('expanded');
    body.innerHTML = '';
  } else {
    state.expandedIds.add(id);
    row.classList.add('expanded');
    const c = state.allCrystals.find(function(x) { return x.id === id; });
    if (c) body.innerHTML = renderDetailBody(c);
  }
}

export const scopeLabel = (e) => {
  if (e.scope === 2 || e.scope === 3) {
    if (e.element) return (ELEMENT[e.element] || '') + '属性のみ';
    if (e.type != null) {
      const t = Array.isArray(e.type) ? e.type : [e.type];
      return t.map(function(v) { return WEAPON[v] || v; }).join('/') + 'のみ';
    }
  }
  if (e.scope === 5) return escHtml(e.name || '') + 'のみ';
  return '';
}

const renderEffLine = (e) => {
  const bTags = (e.bunrui || []).map(function(b) { return '<span class="badge bunrui-sm">' + (BUNRUI_SHORT[b] || b) + '</span>'; }).join(' ');
  const scopeStr = scopeLabel(e) ? '<span class="eff-scope">' + scopeLabel(e) + '</span>' : '';
  const condStr  = e.condition ? '<span class="eff-cond">' + (CONDITION[e.condition] || '') + '</span>' : '';
  let bStr = '';
  if (e.bairitu_init != null || e.bairitu != null) {
    const unit = e.calc_type === 1 ? '' : '倍';
    const pfx  = e.calc_type === 1 ? '+' : '×';
    const mn = e.bairitu_init, mx = e.bairitu;
    const num = (mn != null && mx != null && mn !== mx)
      ? fmt(mn) + '<span class="sep">～</span>' + fmt(mx)
      : fmt(mn != null ? mn : mx);
    bStr = '<span class="eff-pfx">' + pfx + '</span><span class="eff-bairitu">' + num + '</span>' + (unit ? '<span class="eff-unit">' + unit + '</span>' : '');
  }
  return '<div class="eff-line">' + bTags + scopeStr + condStr + bStr + '</div>';
}

export const renderDetailBody = (c) => {
  const effRows = (c.effects || []).map(renderEffLine).join('');

  const fields = [];
  if (c.effect_text) fields.push(['効果',    escHtml(c.effect_text)]);
  if (effRows)       fields.push(['効果量',  '<div>' + effRows + '</div>']);
  if (c['特殊条件']) fields.push(['特殊条件', escHtml(c['特殊条件']) + ' <span style="color:var(--text2)">のみ</span>']);
  if (c['対象'])     fields.push(['対象',    escHtml(c['対象'])]);
  if (c['上限値'])   fields.push(['上限値',  escHtml(c['上限値'])]);
  if (c['入手方法']) fields.push(['入手方法', escHtml(c['入手方法'])]);

  const rows = fields.map(function(pair) {
    return '<div class="field-row"><div class="field-key">' + pair[0] + '</div><div class="field-val">' + pair[1] + '</div></div>';
  }).join('');

  return '<div class="body-left">' + rows + '</div>' +
    '<div class="body-right">' +
      '<img class="crystal-icon" src="https://img.altema.jp/bxb/kioku_kessyou/icon/' + c.id + '.jpg" onerror="this.style.display=\'none\'" alt="">' +
      '<button class="btn-edit" onclick="enterEditMode(' + c.id + ')">修正</button>' +
    '</div>';
}

