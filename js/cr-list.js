// js/cr-list.js
import { state } from './cr-state.js';
import {
  ELEMENT,
  WEAPON,
  CONDITION,
  renderFilterToggles,
  renderElementFilterToggles,
} from '../shared/constants.js';
import {
  PARAMETER_CLASS_LABEL,
  PARAMETER_CLASS_SHORT,
  COND_TRIGGER_LABEL,
  SCOPE_LABEL,
  classifyParameter,
} from '../shared/parameter-class.js';
import { FilterCore } from '../shared/filter-core.js';
import { CRYSTAL_SPEC, crystalImageSrc } from '../shared/crystal-spec.js';
import { crystalShowWeightRange, crystalShowPurityRange } from '../shared/hensei-helpers.js';
import { escHtml, fmt, fmtLarge } from './utils.js';
import { VirtualList } from '../shared/virtual-list.js';

let _vlist = null;

// kind-wise estimate (测量第一个 row 后更新、未测 row 用 estimate 跟实际更接近、scrollbar 稳定)
const _kindH = { collapsed: 48, expanded: 420, edit: 520 };
const _crystalKind = (c) => state.editingId === c.id ? 'edit' : state.expandedIds.has(c.id) ? 'expanded' : 'collapsed';

// 给外部 (cr-edit.js / toggleExpand 等) 调用、通知 row 高度变化
export const invalidateRow = (id) => {
  if (_vlist) _vlist.invalidateRow(id);
};

// cr-edit.js 在 module init 时注册 edit body 渲染器、避免循环 import
// renderRow 在 state.editingId === c.id 时调它生成 edit form
let _editBodyRenderer = null;
export const registerEditBodyRenderer = (fn) => { _editBodyRenderer = fn; };

export const initFilterToggles = () => {
  document.getElementById('f-rarity').innerHTML = renderFilterToggles(
    'rarity',
    { 6: '★6', 5: '★5', 4: '★4', 3: '★3', 2: '★2', 1: '★1' },
    { only: [6, 5, 4, 3, 2, 1] },
  );
  document.getElementById('f-element').innerHTML = renderElementFilterToggles('element');
  document.getElementById('f-weapon').innerHTML = renderFilterToggles('weapon', {
    0: '全',
    ...WEAPON,
  });
  // 効果: 35 类 (int enum、toggle 自动换行)
  const el = document.getElementById('f-effect');
  if (el) el.innerHTML = renderFilterToggles('effect', PARAMETER_CLASS_LABEL);
  // 条件 (発動): 5 类 (0=通常 / 1=浑身 / 2=背水 / 3=破損 / 4=队友倒地)
  const ct = document.getElementById('f-condition_trigger');
  if (ct) ct.innerHTML = renderFilterToggles('condition_trigger', COND_TRIGGER_LABEL);
  // 条件 (対象): 5 类 (1=自身 / 2=装備セット / 3=属性限定 / 4=武器限定 / 5=角色限定)
  const sc = document.getElementById('f-scope');
  if (sc) sc.innerHTML = renderFilterToggles('scope', SCOPE_LABEL);
};

export const toggleFilters = () => {
  const body = document.getElementById('filters-body');
  const btn = document.getElementById('filter-toggle-btn');
  const open = body.style.display === 'flex' || body.style.display === 'block';
  body.style.display = open ? '' : 'flex';
  btn.textContent = open ? '▼ 絞り込み' : '▲ 絞り込み';
  state._filtersOpenScrollY = open ? null : window.scrollY;
};

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
};

export const toggleFilter = (key, val, btn) => {
  if (state.filterSets[key].has(val)) {
    state.filterSets[key].delete(val);
    btn.classList.remove('on');
  } else {
    state.filterSets[key].add(val);
    btn.classList.add('on');
  }
  applyFilters();
};

export const expandAll = () => {
  // virtual scrolling: 只 mark state、行真实 DOM 由 vlist 按 viewport lazy render
  state.filteredCrystals.forEach(function (c) {
    if (state.editingId !== c.id) state.expandedIds.add(c.id);
  });
  // 重排所有 row 高度 (estimateHeight 内按 expandedIds 给 420px)、vlist 自动 re-render visible
  if (_vlist) _vlist.setItems(state.filteredCrystals);
};

export const collapseAll = () => {
  state.filteredCrystals.forEach(function (c) {
    if (state.editingId !== c.id) state.expandedIds.delete(c.id);
  });
  if (_vlist) _vlist.setItems(state.filteredCrystals);
};

export const resetFilters = () => {
  document.getElementById('search').value = '';
  Object.keys(state.filterSets).forEach(function (k) {
    state.filterSets[k].clear();
    document.querySelectorAll('#f-' + k + ' .ftog').forEach(function (b) {
      b.classList.remove('on');
    });
  });
  applyFilters();
};

const crystalElement = (c) => {
  const e = (c.effects || []).find((e) => e.element != null);
  return e ? e.element : 0;
};

const crystalWeapon = (c) => {
  const e = (c.effects || []).find((e) => e.weapon != null);
  return e ? e.weapon : 0;
};

const crystalCondition = (c) => {
  return ((c.effects || [])[0] || {}).condition || 0;
};

export const applyFilters = () => {
  const q = document.getElementById('search').value.trim();
  state.filteredCrystals = FilterCore.applyFilters(
    state.allCrystals,
    {
      q: q,
      filters: state.filterSets,
    },
    CRYSTAL_SPEC,
  );
  // 默认排序: rarity desc → 同 rarity 内 id desc
  state.filteredCrystals.sort(
    (a, b) => (b.rarity || 0) - (a.rarity || 0) || (b.id || 0) - (a.id || 0),
  );
  const ct = state.filteredCrystals.length + ' 件';
  document.getElementById('crystal-count').textContent = ct;
  const mob = document.getElementById('crystal-count-mob');
  if (mob) mob.textContent = ct;
  // 不清 expandedIds — 保留用户先前 expand 状态、被 filter 掉的 row 不在 DOM、无影响
  state.editingId = null;
  state.editData = null;
  renderList();
};

export const renderList = () => {
  const list = document.getElementById('crystal-list');
  if (!state.filteredCrystals.length) {
    if (_vlist) { _vlist.destroy(); _vlist = null; }
    list.style.position = '';
    list.style.height = '';
    list.innerHTML = '<div class="no-results">該当なし</div>';
    return;
  }
  // virtual scrolling: 屏幕外 row 不在 DOM、img 不 fetch、expand all 不卡
  if (!_vlist) {
    list.innerHTML = '';
    _vlist = new VirtualList({
      container: list,
      items: state.filteredCrystals,
      getRowId: (c) => c.id,
      renderRow,
      estimateHeight: (c) => _kindH[_crystalKind(c)],
      onMeasure: (c, real) => { _kindH[_crystalKind(c)] = real; },
      gap: 5,
    });
  } else {
    _vlist.setItems(state.filteredCrystals);
  }
  // check cb 用 delegation 在 list 上 (因为 row 是动态 add/remove)
  if (state.crystalCheckEnabled && !list._cbDelegated) {
    list._cbDelegated = true;
    list.addEventListener('change', (e) => {
      const cb = e.target.closest('.crystal-check-cb');
      if (!cb) return;
      const id = parseInt(cb.dataset.id);
      if (cb.checked) state.crystalCheck.add(id);
      else state.crystalCheck.delete(id);
      saveCrystalCheck();
    });
  }
};

// 本地 crystals_check.json 写盘
const saveCrystalCheck = () => {
  const ids = [...state.crystalCheck].sort((a, b) => a - b);
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crystal_check: ids }),
  }).catch(() => {});
};

export const fmtRowBairitu = (c) => {
  const parts = [];
  (c.effects || []).forEach(function (e) {
    if (e.bairitu_init == null && e.bairitu == null) return;
    const pfx = e.calc_type === 1 ? '+' : '×';
    const mn = e.bairitu_init,
      mx = e.bairitu;
    if (mn != null && mx != null && mn !== mx) parts.push(pfx + fmtLarge(mn) + '~' + fmtLarge(mx));
    else parts.push(pfx + fmtLarge(mn != null ? mn : mx));
  });
  return parts.length ? '<span class="row-bairitu">' + parts.join(' / ') + '</span>' : '';
};

// renderRowHd 只生成 .crystal-row-hd 内部 HTML — saveEdit 整段替换 hd 避免 patchy bug
export const renderRowHd = (c) => {
  const elem = crystalElement(c),
    weap = crystalWeapon(c),
    cond = crystalCondition(c);
  const rb = '<span class="badge r' + c.rarity + '">★' + c.rarity + '</span>';
  const eb = elem
    ? '<span class="badge elem-' + elem + '">' + (ELEMENT[elem] || elem) + '</span>'
    : '';
  const wb = weap ? '<span class="badge weapon">' + (WEAPON[weap] || weap) + '</span>' : '';
  // 効果 tag: 用 parameter class (跟 filter 一致)、不用旧 wiki bunrui
  const _cls = c.parameter ? classifyParameter(c.parameter) : null;
  const bt = _cls
    ? '<span class="badge bunrui-sm">' + (PARAMETER_CLASS_SHORT[_cls] || _cls) + '</span>'
    : '';
  const bc = cond ? '<span class="badge bunrui-sm">' + (CONDITION[cond] || cond) + '</span>' : '';
  const bairitu = fmtRowBairitu(c);
  const expandBtn =
    '<button class="expand-btn" onclick="event.stopPropagation();toggleExpand(' +
    c.id +
    ')">▾</button>';
  // 本地 check: 名字左に checkbox。click は row 展開を発火しない。
  const checkCb = state.crystalCheckEnabled
    ? '<input type="checkbox" class="crystal-check-cb" data-id="' +
      c.id +
      '"' +
      (state.crystalCheck.has(c.id) ? ' checked' : '') +
      ' onclick="event.stopPropagation()">'
    : '';

  // Desktop: row-badges | check | name | bunrui+cond | bairitu | expand
  const desktopHtml =
    '<div class="cr-row-desktop">' +
    '<div class="row-badges">' +
    rb +
    eb +
    wb +
    '</div>' +
    checkCb +
    '<div class="row-name">' +
    escHtml(c.name) +
    '</div>' +
    '<div class="row-bunrui">' +
    bt +
    bc +
    '</div>' +
    bairitu +
    '</div>';

  // Mobile: left(rarity+check+name) | right(elem+weap+cond+bunrui+bairitu)
  const mobileHtml =
    '<div class="cr-row-mobile">' +
    '<div class="bg-row-left">' +
    rb +
    checkCb +
    '<span class="row-name">' +
    escHtml(c.name) +
    '</span></div>' +
    '<div class="bg-row-right">' +
    eb +
    wb +
    bc +
    bt +
    bairitu +
    '</div>' +
    '</div>';

  return desktopHtml + mobileHtml + expandBtn;
};

export const renderRow = (c) => {
  // virtual list: row 动态进出 DOM、body 内容必须按 state 重新生成 (而不是依赖之前 innerHTML 残留)
  const isEditing = state.editingId === c.id;
  const expanded = isEditing || state.expandedIds.has(c.id);
  let bodyHtml = '';
  let bodyClass = 'crystal-body';
  if (isEditing && _editBodyRenderer) {
    bodyHtml = _editBodyRenderer(state.editData || c);
    bodyClass = 'crystal-edit-body';
  } else if (expanded) {
    bodyHtml = renderDetailBody(c);
  }
  return (
    '<div class="crystal-row' + (expanded ? ' expanded' : '') + '" id="row-' +
    c.id +
    '">' +
    '<div class="crystal-row-hd" onclick="toggleExpand(' +
    c.id +
    ')">' +
    renderRowHd(c) +
    '</div>' +
    '<div class="' + bodyClass + '" id="body-' +
    c.id +
    '">' + bodyHtml + '</div>' +
    '</div>'
  );
};

export const toggleExpand = (id) => {
  if (state.editingId === id) return;
  if (state.expandedIds.has(id)) state.expandedIds.delete(id);
  else state.expandedIds.add(id);
  // virtual list 内的 renderRow 会按 state.expandedIds 决定 body 内容、invalidateRow 重测高度
  if (_vlist) _vlist.invalidateRow(id);
};

export const scopeLabel = (e) => {
  // 直读 element / weapon (adapter 已不再注入 eff.scope)
  if (e.element) return (ELEMENT[e.element] || '') + '属性のみ';
  if (e.weapon != null) {
    const t = Array.isArray(e.weapon) ? e.weapon : [e.weapon];
    return t.map((v) => WEAPON[v] || v).join('/') + 'のみ';
  }
  return '';
};

const renderEffLine = (e) => {
  // 効果 tag: parameter class (跟 filter 一致)
  const _cls = e._parameter ? classifyParameter(e._parameter) : null;
  const bTags = _cls
    ? '<span class="badge bunrui-sm">' + (PARAMETER_CLASS_SHORT[_cls] || _cls) + '</span>'
    : '';
  const scopeStr = scopeLabel(e) ? '<span class="eff-scope">' + scopeLabel(e) + '</span>' : '';
  const condStr = e.condition
    ? '<span class="eff-cond">' + (CONDITION[e.condition] || '') + '</span>'
    : '';
  let bStr = '';
  if (e.bairitu_init != null || e.bairitu != null) {
    const unit = e.calc_type === 1 ? '' : '倍';
    const pfx = e.calc_type === 1 ? '+' : '×';
    const mn = e.bairitu_init,
      mx = e.bairitu;
    const num =
      mn != null && mx != null && mn !== mx
        ? fmt(mn) + '<span class="sep">～</span>' + fmt(mx)
        : fmt(mn != null ? mn : mx);
    bStr =
      '<span class="eff-pfx">' +
      pfx +
      '</span><span class="eff-bairitu">' +
      num +
      '</span>' +
      (unit ? '<span class="eff-unit">' + unit + '</span>' : '');
  }
  return '<div class="eff-line">' + bTags + scopeStr + condStr + bStr + '</div>';
};

export const renderDetailBody = (c) => {
  const effRows = (c.effects || []).map(renderEffLine).join('');

  const fields = [];
  // row-hd 已显示 effect tag + bairitu、body 不重复効果量、改放 master.description (in-game 长文)
  const desc = c._master?.description;
  if (desc) fields.push(['説明', escHtml(desc).replace(/\n/g, '<br>')]);
  if (c['特殊条件'])
    fields.push([
      '特殊条件',
      escHtml(c['特殊条件']) + ' <span style="color:var(--text2)">のみ</span>',
    ]);
  if (c['対象']) fields.push(['対象', escHtml(c['対象'])]);
  if (c['上限値']) fields.push(['上限値', escHtml(c['上限値'])]);
  if (c['入手方法']) fields.push(['入手方法', escHtml(c['入手方法'])]);

  // master server-fold 字段 (跟 edit mode 一致、缺省 fallback)
  // 重量 / 純度 没数 (M_W_max/M_P_max=null 或 =1) 时、不显示对应 min/max — 防误导
  const m = c._master || {};
  const factorVal = (v, def) => (v != null ? v : def);
  const factorHtml = (label, v) =>
    `<span style="margin-right:10px"><span style="color:var(--text2)">${label}</span> ${v}</span>`;
  const factorRow =
    factorHtml('Lv', factorVal(m.M_L_max, 1)) +
    factorHtml('重量', factorVal(m.M_W_max, 1)) +
    factorHtml('純度', factorVal(m.M_P_max, 1)) +
    (crystalShowWeightRange(m) ? factorHtml('重量 min', factorVal(m.min_weight, 0)) + factorHtml('重量 max', factorVal(m.max_weight, 100)) : '') +
    (crystalShowPurityRange(m) ? factorHtml('純度 min', factorVal(m.min_purity, 0)) + factorHtml('純度 max', factorVal(m.max_purity, 100)) : '');
  fields.push(['因子', factorRow]);

  const rows = fields
    .map(function (pair) {
      return (
        '<div class="field-row"><div class="field-key">' +
        pair[0] +
        '</div><div class="field-val">' +
        pair[1] +
        '</div></div>'
      );
    })
    .join('');

  return (
    '<div class="body-left">' +
    rows +
    '</div>' +
    '<div class="body-right">' +
    '<img class="crystal-icon" loading="lazy" src="' +
    crystalImageSrc(c) +
    '" onerror="this.style.display=\'none\'" alt="">' +
    '<button class="btn-edit" onclick="enterEditMode(' +
    c.id +
    ')">修正</button>' +
    '</div>'
  );
};
