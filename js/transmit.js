// 伝承ボーナス弹窗:详情「伝承」→ 这把作伝承先时的伝承元 (あり / 未検証、なし 只计数)
// 外框 / 左筛选栏 / 右列表沿用 hensei 实体选择器 (shared.css),筛选走 CHARA_SPEC、列表走 VirtualList
import { state } from './state.js';
import { RARITY, ELEMENT, WEAPON, CHARA_TAG, CHARA_TAG_COLOR } from '../shared/constants.js';
import { charaIconStack } from '../shared/image-paths.js';
import { FilterCore } from '../shared/filter-core.js';
import { CHARA_SPEC } from '../shared/chara-spec.js';
import { VirtualList } from '../shared/virtual-list.js';
import {
  transmitCell,
  transmitBonusName,
  transmitCut,
  isTransmitInferred,
  countTransmit,
  TB_SAME,
  TB_UNTESTED,
} from '../shared/transmit-matrix.js';
import { escHtml, min } from './utils.js';
import { selectChar } from './render.js';

let _target = null;
let _tab = 'bonus';
let _vl = null;
let _rowH = 62;
let _bound = false;
const _f = {
  q: '',
  rarity: new Set(),
  element: new Set(),
  weapon: new Set(),
  state: new Set(),
  tags: new Set(),
  omoideRarity: new Set(),
};

const _charOfBase = (b) => state.allChars.find((c) => c.sort_id === b);

const _fsec = (label, key, opts) => {
  const btns = opts
    .map(([val, text, cls = '', style = '']) => {
      const on = _f[key].has(val) ? ' on' : '';
      const st = style ? ` style="${style}"` : '';
      return `<button class="ftog${cls ? ' ' + cls : ''}${on}" data-fkey="${key}" data-fval='${JSON.stringify(val)}'${st}>${text}</button>`;
    })
    .join('');
  return `<div class="f-section"><div class="f-label">${label}</div><div class="f-toggles">${btns}</div></div>`;
};

const _buildSidebar = () => {
  const n = countTransmit(
    state.transmit,
    _target,
    state.allChars.map((c) => c.sort_id),
  );
  const tab = (k, label) =>
    `<button class="ftog${_tab === k ? ' on' : ''}" data-tab="${k}">${label} ${n[k]}</button>`;
  let h = min`
    <div class="f-section">
      <div class="f-label">伝承ボーナス</div>
      <div class="f-toggles tb-tabs">${tab('bonus', 'あり')}${tab('unknown', '未検証')}</div>
      <div class="tb-none">なし ${n.none}</div>
    </div>`;
  h += `<input type="text" class="modal-search" id="tm-search" placeholder="魔剣名 / CV / base_id で検索..." value="${escHtml(_f.q)}">`;
  h += _fsec(
    'レア度',
    'rarity',
    [4, 3, 2, 1].map((k) => [k, RARITY[k]]),
  );
  h += _fsec(
    '属性',
    'element',
    [1, 2, 3, 4, 5, 6].map((k) => [k, ELEMENT[k], k === 6 ? '' : 'elem-' + k]),
  );
  h += _fsec(
    '武器種',
    'weapon',
    Object.keys(WEAPON).map((k) => [+k, WEAPON[k]]),
  );
  h += _fsec(
    '状態',
    'state',
    ['極弐', '改造', '通常'].map((s) => [s, s]),
  );
  h += _fsec(
    '魔剣特性',
    'tags',
    Object.keys(CHARA_TAG).map((k) => [+k, CHARA_TAG[k], '', `color:${CHARA_TAG_COLOR[k]}`]),
  );
  h += _fsec('思い出レア度', 'omoideRarity', [
    [5, '限定SS'],
    [4, 'SS'],
    [3, 'S'],
    [2, 'AA'],
    [1, 'A'],
  ]);
  h += `<div class="f-sort-row"><button class="f-reset-btn" data-reset="1" style="flex:1">リセット</button></div>`;
  h += `<div class="modal-count" id="tm-count"></div>`;
  document.getElementById('tm-sidebar').innerHTML = h;
};

const _rowHtml = (c) => {
  const tm = state.transmit;
  const v = transmitCell(tm, c.sort_id, _target);
  let tag = '';
  if (v >= TB_SAME) {
    const inf = isTransmitInferred(tm, c.sort_id, _target);
    const mark = inf ? '<span class="tb-inf-mark">推定</span>' : '';
    tag = `<span class="tb-tag${inf ? ' tb-inf' : ''}">${escHtml(transmitBonusName(tm, v) || '')} −${transmitCut(v)}${mark}</span>`;
  }
  const r = RARITY[c.rarity] || '';
  return min`
    <div class="em-item em-item-bg">
      ${charaIconStack({ variantId: c.id, name: c.name, elementId: c.element, weaponTypeId: c.weapon, marriageLevel: 2, className: 'em-thumb' })}
      <div class="em-bg-body">
        <div class="em-bg-header">
          <span class="badge ${r}" style="flex-shrink:0">${r}</span>
          <span class="badge elem-${c.element}" style="flex-shrink:0">${ELEMENT[c.element] || ''}</span>
          <span class="badge weapon" style="flex-shrink:0">${WEAPON[c.weapon] || ''}</span>
          ${tag}
        </div>
        <span class="em-bg-name">${escHtml(c.name)}</span>
      </div>
      <button class="em-detail-btn" onclick="pickTransmitSource(${c.id})">詳細</button>
    </div>`;
};

const _renderList = (items) => {
  const list = document.getElementById('tm-list');
  if (!document.getElementById('tm-vlist')) {
    list.innerHTML =
      '<div class="em-no-results" id="tm-no-results" style="display:none">該当なし</div>' +
      '<div id="tm-vlist"></div>';
  }
  document.getElementById('tm-no-results').style.display = items.length ? 'none' : '';
  if (_vl) {
    _vl.setItems(items);
  } else if (items.length) {
    _vl = new VirtualList({
      container: document.getElementById('tm-vlist'),
      items,
      getRowId: (x) => x.id,
      renderRow: _rowHtml,
      estimateHeight: () => _rowH,
      onMeasure: (_, real) => {
        _rowH = real;
      },
    });
  }
};

// あり = bonus 分组 (同型因子 先)、组内 / 未検証 = 新魔剣在前
const _apply = () => {
  if (_target == null || !state.transmit) return;
  const tm = state.transmit;
  const t = _target;
  const vOf = new Map();
  const items = FilterCore.applyFilters(
    state.allChars,
    { q: _f.q, filters: _f, sortKey: '', sortDesc: true },
    CHARA_SPEC,
  ).filter((c) => {
    const s = c.sort_id;
    if (s === t || !tm.sources.has(s)) return false;
    const v = transmitCell(tm, s, t);
    vOf.set(s, v);
    return _tab === 'bonus' ? v >= TB_SAME : v === TB_UNTESTED;
  });
  items.sort((a, b) => vOf.get(a.sort_id) - vOf.get(b.sort_id) || b.sort_id - a.sort_id);
  document.getElementById('tm-count').textContent = `${items.length} 件`;
  _renderList(items);
};

const _bind = () => {
  if (_bound) return;
  _bound = true;
  const sb = document.getElementById('tm-sidebar');
  sb.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      _tab = tabBtn.dataset.tab;
      sb.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === tabBtn));
      document.getElementById('tm-list').scrollTop = 0;
      _apply();
      return;
    }
    if (e.target.closest('[data-reset]')) {
      Object.keys(_f).forEach((k) => (k === 'q' ? (_f.q = '') : _f[k].clear()));
      _buildSidebar();
      _apply();
      return;
    }
    const btn = e.target.closest('[data-fkey]');
    if (!btn) return;
    const set = _f[btn.dataset.fkey];
    const val = JSON.parse(btn.dataset.fval);
    if (set.has(val)) set.delete(val);
    else set.add(val);
    btn.classList.toggle('on', set.has(val));
    _apply();
  });
  sb.addEventListener('input', (e) => {
    if (e.target.id !== 'tm-search') return;
    _f.q = e.target.value;
    _apply();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _target != null) closeTransmitModal();
  });
};

export const openTransmitModal = (baseId) => {
  if (!state.transmit) return;
  _bind();
  _target = baseId;
  _tab = 'bonus';
  const c = _charOfBase(baseId);
  document.getElementById('tm-title').textContent = `伝承ボーナス — 伝承先: ${c?.name ?? baseId}`;
  document.getElementById('transmit-modal').classList.add('open');
  document.getElementById('tm-list').scrollTop = 0;
  _buildSidebar();
  _apply();
};

export const closeTransmitModal = () => {
  document.getElementById('transmit-modal').classList.remove('open');
  _target = null;
};

export const pickTransmitSource = (variantId) => {
  closeTransmitModal();
  selectChar(variantId);
};
