// js/latent.js
import { state, OMOIDE_KEYS } from './state.js';

let _promptCb = null;

const _OMOIDE_RARITY_TH        = new Set([6000, 30000, 45000, 60000, 75000, 90000]);
const _OMOIDE_RARITY_STRICT_TH = new Set([45000, 60000, 75000, 90000]);
const _ICON_TO_RARITY           = {88:1, 89:2, 90:3, 91:4, 92:5};
import { OMOIDE_THRESHOLDS } from '../shared/constants.js';
import { submitRevise, showSaveToast } from '../shared/save-client.js';
import { escHtml, fmt, fmtNum, ctPfx, hasOmoide, min } from './utils.js';
import { selectChar } from './render.js';
import { updateReviseBar } from './nav.js';

export const _senzaiLabel = (iconId) => {
  const tbl = (typeof state.SENZAI_TABLE !== 'undefined') ? state.SENZAI_TABLE : {};
  const info = tbl[iconId] || tbl[String(iconId)] || {};
  const bVal = (info.bairitu != null && info.bairitu !== 0) ? ' (' + ctPfx(info.calc_type) + fmtNum(info.bairitu) + ')' : '';
  return (info.koka || ('icon ' + iconId)) + bVal;
}

export const getLinkedThresholds = (threshold, omoideRarity) => {
  const star1 = [10, 200, 700, 2000, 3000, 5000, 7000, 9000, 13000];
  const s2h = [], s3h = [];
  let icon = [];
  for (let n = 0; n < 5; n++) {
    [18000, 21000, 27000].forEach(function(b) { s2h.push(b + 15000 * n); });
    s3h.push(24000 + 15000 * n);
    icon.push(30000 + 15000 * n);
  }
  // SS/限定SS (rarity=4/5): 6000 も同じ rarity icon → icon group に追加
  if (omoideRarity === 4 || omoideRarity === 5) icon.push(6000);
  // A (rarity=1) の 30000 は icon group に入らない（star3_high 扱い）
  if (omoideRarity === 1) icon = icon.filter(function(t) { return t !== 30000; });
  if (star1.indexOf(threshold) >= 0) return star1;
  if (s2h.indexOf(threshold) >= 0) return s2h;
  if (s3h.indexOf(threshold) >= 0) return s3h;
  if (icon.indexOf(threshold) >= 0) return icon;
  return null;
}

// 92 senzai option × 40 threshold × 5 slot = 18K+ 隐藏 DOM —— enterEditMode 时
// 全部建好太重（中低端 Android 100-300ms）。把 option 构建延迟到 toggleLCS 首次打开。
const _buildLCSOpts = (iconId, t, slotIdx, restricted) => {
  let tbl = (typeof state.SENZAI_TABLE !== 'undefined') ? state.SENZAI_TABLE : {};
  let keys = Object.keys(tbl).sort(function(a, b) { return parseInt(a) - parseInt(b); });
  if (restricted) keys = keys.filter(function(k) { return +k >= 88 && +k <= 92; });
  return keys.map(function(k) {
    const info = tbl[k];
    const bVal = (info.bairitu != null && info.bairitu !== 0) ? ' (' + ctPfx(info.calc_type) + fmtNum(info.bairitu) + ')' : '';
    const label = (info.koka || ('icon ' + k)) + bVal;
    const sel = (iconId != null && parseInt(k) === iconId) ? ' class="lcs-opt lcs-selected"' : ' class="lcs-opt"';
    return '<div' + sel + ' data-val="' + k + '" onclick="selectLCS(this,' + t + ',' + slotIdx + ')">' + escHtml(label) + '</div>';
  }).join('');
};

export const makeLCSHtml = (iconId, t, slotIdx, restricted) => {
  const triggerLabel = iconId != null ? _senzaiLabel(iconId) : '選択...';
  const searchHtml = restricted ? '' : '<input class="lcs-search" type="text" placeholder="絞込..." oninput="filterLCS(this)">';
  // data-* 属性で初回開閉時に _buildLCSOpts に必要な情報を保持。.lcs-list は初期空、
  // toggleLCS が初開時に populate。
  const iconAttr = iconId != null ? iconId : '';
  return '<div class="latent-edit-chip">'
    + '<button class="lcs-trigger" data-icon="' + iconAttr + '" data-t="' + t + '" data-slot="' + slotIdx + '" data-rest="' + (restricted ? '1' : '0') + '" onclick="toggleLCS(event,this)">' + escHtml(triggerLabel) + '</button>'
    + '<div class="lcs-dropdown">'
    + searchHtml
    + '<div class="lcs-list"></div>'
    + '</div>'
    + '<button class="latent-rm-btn" onclick="removeLatentSlot(' + t + ',' + slotIdx + ')">×</button>'
    + '</div>';
}

export const renderLatentEditBody = (c) => {
  const omoideMap = {};
  (c.omoide || []).forEach(function(row) { omoideMap[row.threshold] = row.slots || []; });
  return OMOIDE_THRESHOLDS.map(function(t) {
    const restricted = _OMOIDE_RARITY_STRICT_TH.has(t);
    const slots = omoideMap[t] || [];
    const slotsHtml = slots.map(function(iconId, slotIdx) {
      return makeLCSHtml(iconId, t, slotIdx, restricted);
    }).join('');
    const showAdd = !restricted || slots.length === 0;
    const addBtn = showAdd ? '<button class="btn-add-slot" onclick="addLatentSlot(' + t + ')">+ 追加</button>' : '';
    return '<div class="latent-edit-row">'
      + '<div class="latent-edit-label">思い出 ' + t.toLocaleString('ja-JP') + '</div>'
      + '<div class="latent-edit-slots">' + slotsHtml + addBtn
      + '</div></div>';
  }).join('');
}

export const toggleLCS = (e, triggerBtn) => {
  e.stopPropagation();
  const chip = triggerBtn.parentElement;
  const dropdown = chip.querySelector('.lcs-dropdown');
  if (state._lcsOpen === dropdown) { closeLCS(); return; }
  closeLCS();
  // Lazy build options on first open（enterEditMode 時の構築コスト回避）
  const list = dropdown.querySelector('.lcs-list');
  if (list && list.children.length === 0) {
    const iconStr = triggerBtn.dataset.icon;
    list.innerHTML = _buildLCSOpts(
      iconStr === '' ? null : +iconStr,
      +triggerBtn.dataset.t,
      +triggerBtn.dataset.slot,
      triggerBtn.dataset.rest === '1'
    );
  }
  const rect = triggerBtn.getBoundingClientRect();
  let top = rect.bottom + 2;
  let left = rect.left;
  if (top + 220 > window.innerHeight) top = rect.top - 220;
  if (left + 244 > window.innerWidth) left = window.innerWidth - 248;
  dropdown.style.top = top + 'px';
  dropdown.style.left = left + 'px';
  dropdown.style.display = 'block';
  state._lcsOpen = dropdown;
  const s = dropdown.querySelector('.lcs-search');
  if (s) { s.value = ''; filterLCS(s); }
  // Scroll the currently selected option into view (within the lcs-list scroll container)
  const cur = dropdown.querySelector('.lcs-selected');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

export const closeLCS = () => {
  if (state._lcsOpen) { state._lcsOpen.style.display = 'none'; state._lcsOpen = null; }
}

// 点击 dropdown 外部（且不在它对应的 chip 内）→ 关闭，不做任何修改
// 用 mousedown（capture 之前），避免 click 事件 race
document.addEventListener('mousedown', (e) => {
  if (!state._lcsOpen) return;
  if (state._lcsOpen.contains(e.target)) return;       // 点 dropdown 内
  const chip = state._lcsOpen.parentElement;
  if (chip && chip.contains(e.target)) return;          // 点同 chip 内的 trigger / × 按钮
  closeLCS();
});

export const filterLCS = (input) => {
  const q = input.value.toLowerCase();
  input.closest('.lcs-dropdown').querySelectorAll('.lcs-opt').forEach(function(opt) {
    opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

export const selectLCS = (optEl, threshold, slotIdx) => {
  const icon = parseInt(optEl.dataset.val);
  changeLatentSlot(threshold, slotIdx, icon);
  // 任何一个好感の破限阈值（45000/60000/75000/90000）变更时，
  // 都根据 icon (88-92) → omoide_rarity (1-5) 同步
  if (_OMOIDE_RARITY_TH.has(threshold) && _ICON_TO_RARITY[icon] != null) {
    state.editData.omoide_rarity = _ICON_TO_RARITY[icon];
  }
  const linked = getLinkedThresholds(threshold, state.editData.omoide_rarity);
  if (linked && linked.length > 1) {
    linked.forEach(function(t) {
      if (t === threshold) return;
      const row = (state.editData.omoide || []).find(function(r) { return r.threshold === t; });
      if (row && slotIdx < row.slots.length) row.slots[slotIdx] = icon;
    });
    reRenderLatentEdit();
    return;
  }
  const chip = optEl.closest('.latent-edit-chip');
  chip.querySelector('.lcs-trigger').textContent = optEl.textContent;
  optEl.closest('.lcs-list').querySelectorAll('.lcs-opt').forEach(function(o) {
    o.classList.toggle('lcs-selected', o === optEl);
  });
  closeLCS();
}

export const getCrystalSlotsJS = (c) => {
  for (const lbl of ['改造', '極弐', '通常']) {
    const v = c.states?.[lbl]?.basic_info?.['結晶スロット'];
    if (v != null) { const n = parseInt(v); if (!isNaN(n)) return n; }
  }
  return 0;
}

export const fillOmoideSlots = (omoideArr, omoideRarity, k, star2High, star3High) => {
  const omap = {};
  (omoideArr || []).forEach(r => { if (r.slots?.length) omap[r.threshold] = r.slots; });
  const star1 = omap[10] || [], star2 = omap[400] || [];
  const star3_raw = omap[1000] || [];
  if (!star1.length && !star2.length && !star3_raw.length) return omoideArr;
  const _s3icon = x => x>=54&&x<=64 ? x+4 : x>=83&&x<=87 ? x+1 : x<=82 ? x+6 : x;
  // If 1000好感 count != 400好感 count → special slot, derive per type
  let star3;
  if (star2.length && star3_raw.length && star3_raw.length !== star2.length)
    star3 = star2.map(_s3icon);
  else if (star2.length && !star3_raw.length)
    star3 = star2.map(_s3icon);
  else
    star3 = star3_raw;
  const r = omoideRarity || 1;
  const s2h = star2High?.length ? star2High : star2;
  const s3h = star3High?.length ? star3High : (star2High?.length ? s2h.map(_s3icon) : star3);
  const rules = {};
  [2000,3000,5000,7000,9000,13000].forEach(t => { rules[t] = star1; });
  rules[4000] = star2;
  rules[6000]  = r===5?[92]:r===4?[91]:(k>=3?star3:[93]);
  rules[11000] = star3;
  rules[15000] = r>=4?[94,95,96]:(k>=4?star3:[93]);
  for (let n = 0; n < 5; n++) {
    rules[18000+15000*n] = s2h;
    rules[21000+15000*n] = s2h;
    rules[24000+15000*n] = s3h;
    rules[27000+15000*n] = s2h;
    const t30 = 30000+15000*n;
    rules[t30] = r===5?[92]:r===4?[91]:r===3?[90]:r===2?[89]:(n===0?s3h:[88]);
  }
  const BASE = new Set([10,200,400,700,1000]);
  for (const [t, slots] of Object.entries(rules))
    if (!BASE.has(+t) && slots.length) omap[+t] = slots;
  return Object.keys(omap).sort((a,b)=>+a-+b)
    .map(t => ({threshold:+t, slots:omap[t]})).filter(r => r.slots.length);
}

export const renderOmoideTemplateBar = (c) => {
  const opts = state.omoideTemplates.map(t =>
    `<option value="${t.id}"${c.omoide_template===t.id?' selected':''}>${escHtml(t.name)}</option>`
  ).join('');
  return min`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <select id="omoide-tpl-sel" class="edit-select" style="flex:1;min-width:120px" onchange="applyOmoideTemplate()">
        <option value="">テンプレートを選択...</option>
        ${opts}
      </select>
      <button class="btn-add-slot" onclick="saveOmoideTemplate()" style="white-space:nowrap;padding:3px 10px">テンプレ保存</button>
    </div>`;
}

export const showPrompt = (title, defaultVal, cb) => {
  _promptCb = cb;
  document.getElementById('prompt-title').textContent = title;
  const inp = document.getElementById('prompt-input');
  inp.value = defaultVal || '';
  const modal = document.getElementById('prompt-modal');
  modal.style.display = 'flex';
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
}

export const _promptConfirm = () => {
  const val = document.getElementById('prompt-input').value.trim();
  document.getElementById('prompt-modal').style.display = 'none';
  if (_promptCb) { _promptCb(val); _promptCb = null; }
}

export const _promptCancel = () => {
  document.getElementById('prompt-modal').style.display = 'none';
  _promptCb = null;
}

export const saveOmoideTemplate = () => {
  if (!state.editData) { alert('編集モードではありません'); return; }
  if (!state.editData.omoide || !state.editData.omoide.length) { alert('潜在データがありません'); return; }

  const sel = document.getElementById('omoide-tpl-sel');
  const existingId = sel?.value ? +sel.value : null;
  const existing = existingId ? state.omoideTemplates.find(t => t.id === existingId) : null;
  showPrompt('テンプレートを保存', existing?.name || 'テンプレート名', function(trimmed) {
    if (!trimmed) { alert('名前を入力してください'); return; }
    const omoide = JSON.parse(JSON.stringify(state.editData.omoide));
    if (existing) {
      existing.name = trimmed;
      existing.omoide = omoide;
    } else {
      const newId = state.omoideTemplates.length ? Math.max(...state.omoideTemplates.map(t => t.id)) + 1 : 1;
      state.omoideTemplates.push({ id: newId, name: trimmed, omoide });
    }
    submitRevise({ omoide_templates: state.omoideTemplates })
      .then(j => {
        if (!j.ok) throw new Error(j.error);
        const savedId = existing ? existing.id : state.omoideTemplates[state.omoideTemplates.length - 1].id;
        const bar = document.getElementById('omoide-tpl-sel');
        if (bar) {
          bar.innerHTML = '<option value="">テンプレートを選択...</option>'
            + state.omoideTemplates.map(t =>
                `<option value="${t.id}"${t.id===savedId?' selected':''}>${escHtml(t.name)}</option>`
              ).join('');
          bar.value = savedId;
        }
        if (state.editData) state.editData.omoide_template = savedId;
      })
      .catch(e => { alert('保存失敗: ' + e.message); });
  });
}

export const applyOmoideTemplate = () => {
  const sel = document.getElementById('omoide-tpl-sel');
  if (!sel || !sel.value) return;
  const tpl = state.omoideTemplates.find(t => t.id === +sel.value);
  if (!tpl?.omoide) return;
  state.editData.omoide = JSON.parse(JSON.stringify(tpl.omoide));
  state.editData.omoide_template = tpl.id;
  // template の高閾値 slot に並ぶ icon (88-92) から omoide_rarity を逆引き。
  // changeLatentSlot の手動更新と同じロジック。最後に見つけた行が勝つ（通常
  // template 内 rarity 一致なので順序非依存）。
  for (const row of tpl.omoide) {
    if (!_OMOIDE_RARITY_TH.has(row.threshold)) continue;
    for (const icon of (row.slots || [])) {
      if (_ICON_TO_RARITY[icon] != null) {
        state.editData.omoide_rarity = _ICON_TO_RARITY[icon];
        break;
      }
    }
  }
  reRenderLatentEdit();
}

export const reRenderLatentEdit = () => {
  closeLCS();
  const el = document.getElementById('latent-edit-section');
  if (el) el.innerHTML = renderLatentEditBody(state.editData);
}

// Slot 改完后，omoide 已经偏离原 template → 清掉 omoide_template + select.value，
// 让用户能直观看到「已离开模板」状态
const _syncTemplateSelect = () => {
  if (!state.editData) return;
  if (state.editData.omoide_template == null) return;
  const tpl = (state.omoideTemplates || []).find(t => t.id === state.editData.omoide_template);
  const same = tpl && JSON.stringify(state.editData.omoide || []) === JSON.stringify(tpl.omoide || []);
  if (same) return;
  state.editData.omoide_template = null;
  const sel = document.getElementById('omoide-tpl-sel');
  if (sel) sel.value = '';
}

export const ensureOmoideRow = (threshold) => {
  if (!state.editData.omoide) state.editData.omoide = [];
  let row = state.editData.omoide.find(function(r) { return r.threshold === threshold; });
  if (!row) {
    row = { threshold: threshold, slots: [] };
    state.editData.omoide.push(row);
    state.editData.omoide.sort(function(a, b) { return a.threshold - b.threshold; });
  }
  return row;
}

export const addLatentSlot = (threshold) => {
  let row = ensureOmoideRow(threshold);
  row.slots.push(null);
  let linked = getLinkedThresholds(threshold, state.editData.omoide_rarity);
  if (linked) {
    linked.forEach(function(t) {
      if (t === threshold) return;
      ensureOmoideRow(t).slots.push(null);
    });
  }
  _syncTemplateSelect();
  reRenderLatentEdit();
}

export const removeLatentSlot = (threshold, slotIdx) => {
  let row = (state.editData.omoide || []).find(function(r) { return r.threshold === threshold; });
  if (!row) return;
  row.slots.splice(slotIdx, 1);
  const linked = getLinkedThresholds(threshold, state.editData.omoide_rarity);
  if (linked) {
    linked.forEach(function(t) {
      if (t === threshold) return;
      const r2 = (state.editData.omoide || []).find(function(r) { return r.threshold === t; });
      if (r2 && slotIdx < r2.slots.length) r2.slots.splice(slotIdx, 1);
    });
  }
  _syncTemplateSelect();
  reRenderLatentEdit();
}

export const changeLatentSlot = (threshold, slotIdx, iconId) => {
  const row = (state.editData.omoide || []).find(function(r) { return r.threshold === threshold; });
  if (row) row.slots[slotIdx] = parseInt(iconId);
  _syncTemplateSelect();
}

export const openLatentModal = (charaId) => {
  const c = state.allChars.find(function(x) { return x.id === charaId; });
  if (!c || !hasOmoide(c)) return;
  const tbl = (typeof state.SENZAI_TABLE !== 'undefined') ? state.SENZAI_TABLE : {};
  function fmtBairituJP(info) {
    const v = info.bairitu;
    if (v == null || v === 0) return '';
    const sc = (info.bairitu_scaling != null && info.bairitu_scaling !== 0) ? fmtNum(info.bairitu_scaling) : '';
    const pfx = ctPfx(info.calc_type);
    if (v >= 100000000) {
      const b = v / 100000000;
      return pfx + (b % 1 === 0 ? b : parseFloat(b.toFixed(2))) + '億';
    } else if (v >= 10000) {
      const m = v / 10000;
      return pfx + (m % 1 === 0 ? m : parseFloat(m.toFixed(2))) + '万';
    }
    return pfx + (sc ? '(' + fmtNum(v) + '+' + sc + '\n×熟度)': fmtNum(v));
  }
  const html = c.omoide.filter(function(row) { return row.slots && row.slots.length > 0; }).map(function(row) {
    const slotsHtml = row.slots.map(function(iconId) {
      const info = tbl[iconId] || {};
      const bStr = fmtBairituJP(info);
      const bClass = bStr ? 'latent-slot-bairitu' : 'latent-slot-bairitu empty';
      const bDisplay = bStr || '—';
      return '<div class="latent-slot">'
        + '<span class="latent-slot-koka">' + escHtml(info.koka || '?') + '</span>'
        + '<span class="latent-slot-syosai">' + escHtml(info.syosai || '') + '</span>'
        + '<span class="' + bClass + '">' + escHtml(bDisplay) + '</span>'
        + '</div>';
    }).join('');
    return '<div class="omoide-row">'
      + '<div class="omoide-label">思い出 ' + row.threshold.toLocaleString('ja-JP') + '</div>'
      + '<div class="omoide-slots">' + slotsHtml + '</div>'
      + '</div>';
  }).join('');
  document.getElementById('latent-body').innerHTML = html;
  const modal = document.getElementById('latent-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

export const closeLatentModal = () => {
  document.getElementById('latent-modal').style.display = 'none';
  document.body.style.overflow = '';
}

