// js/bg-list.js
import { state } from './bg-state.js';
import { ELEMENT, WEAPON, BUNRUI_SHORT, BUNRUI_FILTER, CONDITION, SCOPE_SHORT, SCOPE,
         renderFilterToggles, renderElementFilterToggles } from '../shared/constants.js';
import { FilterCore } from '../shared/filter-core.js';
import { BG_SPEC } from '../shared/bg-spec.js';
import { escHtml, ctPfx, fmtNum, fmtLarge } from './utils.js';

export const cardElement = (c) => {
  const e = (c.effects||[]).find(function(e){return e.scope===3 && e.element!=null;});
  return e ? e.element : 0;
}

export const cardWeapon = (c) => {
  const e = (c.effects||[]).find(function(e){return e.scope===3 && e.type!=null;});
  return e ? e.type : 0;
}

export const initFilterToggles = () => {
  document.getElementById('f-rarity').innerHTML    = renderFilterToggles('rarity', {5:'★5',4:'★4',3:'★3',2:'★2',1:'★1'}, {only:[5,4,3,2,1]});
  document.getElementById('f-element').innerHTML   = renderElementFilterToggles('element');
  document.getElementById('f-weapon').innerHTML    = renderFilterToggles('weapon', {0:'全', ...WEAPON});
  document.getElementById('f-bunrui').innerHTML    = renderFilterToggles('bunrui', BUNRUI_FILTER, {only:[1,2,3,4,5,10,12,14,15,16,19,20]});
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

export const expandAll = () => {
  state.filteredBG.forEach(function(c) {
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
  state.filteredBG.forEach(function(c) { if (state.editingId !== c.id) state.expandedIds.delete(c.id); });
}

export const resetFilters = () => {
  document.getElementById('search').value = '';
  Object.keys(state.filterSets).forEach(function(k) {
    state.filterSets[k].clear();
    document.querySelectorAll('#f-' + k + ' .ftog').forEach(function(b) { b.classList.remove('on'); });
  });
  applyFilters();
}

export const applyFilters = () => {
  const q = document.getElementById('search').value.trim();
  state.filteredBG = FilterCore.applyFilters(state.allBG, {
    q: q,
    filters: state.filterSets,
  }, BG_SPEC);
  const ct = state.filteredBG.length + ' 件';
  document.getElementById('bg-count').textContent = ct;
  const mob = document.getElementById('bg-count-mob');
  if (mob) mob.textContent = ct;
  state.expandedIds.clear();
  state.editingId = null;
  state.editData = null;
  renderList();
}

export const renderList = () => {
  const list = document.getElementById('bg-list');
  if (!state.filteredBG.length) { list.innerHTML = '<div class="no-results">該当なし</div>'; return; }
  list.innerHTML = state.filteredBG.map(renderRow).join('');
  if (state.bgCheckEnabled) {
    list.querySelectorAll('.bg-check-cb').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(e.target.dataset.id);
        if (e.target.checked) state.bgCheck.add(id);
        else state.bgCheck.delete(id);
        saveBgCheck();
      });
    });
  }
}

// 本地 bladegraph_check.json 写盘
const saveBgCheck = () => {
  const ids = [...state.bgCheck].sort((a, b) => a - b);
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bladegraph_check: ids }),
  }).catch(() => {});
};

export const fmtRowBairitu = (c) => {
  const e = c.effects;
  return (e && e[0].bairitu) ? '<span class="row-bairitu">' 
  + (e[0].calc_type === 1 ? '+' : '×') + fmtLarge(e[0].bairitu) + '</span>' : '';
}

export const renderRow = (c) => {
  const rb = '<span class="badge r' + c.rarity + '">★' + c.rarity + '</span>';
  const ce = cardElement(c), cw = cardWeapon(c);
  const eb = ce ? '<span class="badge elem-' + ce + '">' + (ELEMENT[ce]||ce) + '</span>' : '';
  const wb = cw ? '<span class="badge weapon">' + (WEAPON[cw]||cw) + '</span>' : '';
  const hasScope5 = (c.effects||[]).some(function(e){return e.scope===5;});
  const s5b = hasScope5 ? '<span class="badge scope5">キャラ限</span>' : '';
  const timeb = c.time_start ? '<span class="badge time">時間</span>' : '';
  // all unique bunrui
  const bt = (c.effects||[]).reduce(function(acc,e){return acc.concat(e.bunrui||[]);}, [])
    .filter(function(v,i,a){return a.indexOf(v)===i;})
    .map(function(b){return '<span class="badge bunrui-sm">'+(BUNRUI_SHORT[b]||b)+'</span>';}).join('');
  // first non-zero condition
  const cond = (c.effects||[]).map(function(e){return e.condition||0;}).find(function(v){return v>0;}) || 0;
  const cb = cond ? '<span class="cond-tag cond-' + cond + '">' + (CONDITION[cond]||'') + '</span>' : '';
  const bairitu = fmtRowBairitu(c);
  const expandBtn = '<button class="expand-btn" onclick="event.stopPropagation();toggleExpand(' + c.id + ')">▾</button>';
  const checkCb = state.bgCheckEnabled
    ? '<input type="checkbox" class="bg-check-cb" data-id="' + c.id + '"'
      + (state.bgCheck.has(c.id) ? ' checked' : '') + ' onclick="event.stopPropagation()">'
    : '';

  // Desktop: row-badges | check | name | bunrui+cond | bairitu | expand
  const desktopHtml =
    '<div class="bg-row-desktop">' +
      '<div class="row-badges">' + rb + eb + wb + s5b + timeb + '</div>' +
      checkCb +
      '<div class="row-name">' + escHtml(c.name) + '</div>' +
      '<div class="row-bunrui">' + bt + cb + '</div>' +
      bairitu +
    '</div>';

  // Mobile: left(rarity+check+name) | right(elem+weap+cond+bunrui+bairitu)
  const mobileHtml =
    '<div class="bg-row-mobile">' +
      '<div class="bg-row-left">' + rb + checkCb + '<span class="row-name">' + escHtml(c.name) + '</span></div>' +
      '<div class="bg-row-right">' + eb + wb + cb + bt + bairitu + '</div>' +
    '</div>';

  return '<div class="bg-row" id="row-' + c.id + '">' +
    '<div class="bg-row-hd" onclick="toggleExpand(' + c.id + ')">' +
      desktopHtml + mobileHtml + expandBtn +
    '</div>' +
    '<div class="bg-body" id="body-' + c.id + '"></div>' +
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
    const c = state.allBG.find(function(x){return x.id===id;});
    if (c) body.innerHTML = renderDetailBody(c);
  }
}

export const scopeLabel = (e) => {
  if (e.scope === 3) {
    if (e.element) return ELEMENT[e.element] + '属性のみ';
    if (e.type != null) {
      const t = Array.isArray(e.type) ? e.type : [e.type];
      return t.map(function(v){return WEAPON[v]||v;}).join('/') + 'のみ';
    }
  }
  if (e.scope === 5) return escHtml(e.name||'') + 'のみ';
  return '';
}

export const renderDetailBody = (c) => {
  const effRows = (c.effects||[]).map(function(e, i) {
    const bTags = (e.bunrui||[]).map(function(b){return '<span class="badge bunrui-sm">'+(BUNRUI_SHORT[b]||b)+'</span>';}).join(' ');
    const condStr = e.condition ? '<span class="eff-cond">'+(CONDITION[e.condition]||'')+'</span>' : '';
    const scopeStr = scopeLabel(e) ? '<span class="eff-scope">'+scopeLabel(e)+'</span>' : '';
    const bStr = e.bairitu != null
      ? '<span class="eff-pfx">' + ctPfx(e.calc_type) + '</span><span class="eff-bairitu">' + fmtNum(e.bairitu) + '</span>'
      : '';
    return '<div class="eff-line">' + bTags + condStr + scopeStr + bStr + '</div>';
  }).join('');

  const fields = [];
  fields.push(['効果', escHtml(c.effect_text||'')]);
  fields.push(['効果量', '<div>' + effRows + '</div>']);
  if (c.time_start) {
    fields.push(['時間', escHtml(c.time_start + '～' + c.time_end)]);
  }
  fields.push(['入手方法', escHtml(c.acquisition||'')]);
  if (c.illustrator) fields.push(['イラスト', escHtml(c.illustrator)]);

  const rows = fields.map(function(p) {
    return '<div class="field-row"><div class="field-key">'+p[0]+'</div><div class="field-val">'+p[1]+'</div></div>';
  }).join('');

  return '<div class="body-left">' + rows + '</div>' +
    '<div class="body-right">' +
      '<img class="bg-icon" src="https://img.altema.jp/bxb/blade_graph/icon/' + c.id + '.jpg" onerror="this.style.display=\'none\'" alt="">' +
      '<button class="btn-edit" onclick="enterEditMode(' + c.id + ')">修正</button>' +
    '</div>';
}

