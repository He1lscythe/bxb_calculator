// js/v2-cr-edit.js — Phase 7 Session 2 crystal inline edit
//
// scope: 8 个 server-fold 字段 (master 不可观测、归 revise 管):
//   max_value / M_L_max / M_W_max / M_P_max
//   min_weight / max_weight / min_purity / max_purity
// 其他字段 (initial_value / max_level / parameter / math_type / etc) 只读、master 100% 准确。
//
// 流程:
//   enterEditMode(id) → state.editData = clone(crystal)、row 展开 + render edit form
//   setCrField(field, val) → state.editData[field] = val (live edit、不立即 save)
//   saveEdit() → computeDiff(orig, edit, prev) → state.reviseData[id] = patch + sessionReviseIds.add(id)
//                + 更新 allCrystals[idx] = deepApply(orig, patch) 让 viewer 立即反映
//   saveRevise() → 把 sessionReviseIds 内全部 patch POST 出去 (start.py 本地或 Vercel)
//   cancelRevise(id) → 单 id 撤回 (清 reviseData[id] + sessionReviseIds.delete + 还原 allCrystals[idx])

import { state } from './cr-state.js';
import { computeDiff, deepApply } from '../shared/v2-revise-core.js';
import { submitRevise, showSaveToast } from '../shared/v2-save-client.js';
import { escHtml } from './utils.js';
import { renderDetailBody, renderRowHd } from './cr-list.js';
import { updateReviseBar } from './nav.js';

// 8 个 server-fold 字段 + UI label + 默认值 + 数据类型 (int / float)
const _EDIT_FIELDS = [
  { key: 'max_value',  label: '最大値',        type: 'float', def: null },
  { key: 'M_L_max',    label: 'M_L_max (Lv)', type: 'float', def: 1 },
  { key: 'M_W_max',    label: 'M_W_max (重量)', type: 'float', def: 1 },
  { key: 'M_P_max',    label: 'M_P_max (純度)', type: 'float', def: 1 },
  { key: 'min_weight', label: '重量 min',     type: 'int',   def: 0 },
  { key: 'max_weight', label: '重量 max',     type: 'int',   def: 100 },
  { key: 'min_purity', label: '純度 min',     type: 'int',   def: 0 },
  { key: 'max_purity', label: '純度 max',     type: 'int',   def: 100 },
];

const _getMasterField = (c, key) => c?._master?.[key];

const _renderEditBody = (c) => {
  const ed = state.editData || {};
  // 字段值优先: state.editData._master.{key} (已 deepApply revise)、fallback master
  const getVal = (k) => {
    const v = ed._master?.[k];
    return v != null ? v : '';
  };
  const fieldRows = _EDIT_FIELDS.map((f) => {
    const v = getVal(f.key);
    const step = f.type === 'int' ? '1' : 'any';
    return `<div class="cr-edit-row">
      <label class="cr-edit-label">${f.label}</label>
      <input class="cr-edit-input" type="number" step="${step}" value="${v}"
             oninput="setCrField('${f.key}', this.value)"
             placeholder="${f.def == null ? 'null' : f.def}">
    </div>`;
  }).join('');

  // 只读元数据 (master 直接展示、不允许编辑)
  const readonly = [
    ['ID', c.id],
    ['名前', escHtml(c.name || '')],
    ['parameter', escHtml(c._master?.parameter || '')],
    ['math_type', escHtml(c._master?.math_type || '')],
    ['initial_value', c._master?.initial_value ?? ''],
    ['max_level', c._master?.max_level ?? ''],
  ].map(([k, v]) => `<div class="cr-edit-meta-row"><span class="cr-edit-meta-key">${k}</span><span class="cr-edit-meta-val">${v}</span></div>`).join('');

  return `<div class="cr-edit-wrap">
    <div class="cr-edit-meta">${readonly}</div>
    <div class="cr-edit-form">${fieldRows}</div>
    <div class="cr-edit-actions">
      <button class="btn-save" onclick="saveEdit()">保存 (セッション)</button>
      <button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>
    </div>
  </div>`;
};

export const enterEditMode = (id) => {
  if (state.editingId !== null && state.editingId !== id) cancelEdit();
  const c = state.allCrystals.find((x) => x.id === id);
  if (!c) return;
  state.editData = JSON.parse(JSON.stringify(c));
  state.editingId = id;
  const row = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  if (!row || !body) return;
  row.classList.add('expanded');
  body.className = 'crystal-edit-body';
  body.innerHTML = _renderEditBody(state.editData);
};

export const cancelEdit = () => {
  if (state.editingId === null) return;
  const id = state.editingId;
  state.editingId = null;
  state.editData = null;
  const c = state.allCrystals.find((x) => x.id === id);
  const body = document.getElementById('body-' + id);
  if (body && c) {
    body.className = 'crystal-body';
    body.innerHTML = renderDetailBody(c);
  }
};

// live edit: 修改 editData._master[field]、不立即落盘
export const setCrField = (field, val) => {
  if (!state.editData) return;
  state.editData._master = state.editData._master || {};
  if (val === '' || val == null) {
    state.editData._master[field] = null;
    return;
  }
  const n = +val;
  state.editData._master[field] = Number.isFinite(n) ? n : null;
};

// session save: 算 diff、入 reviseData、更新 allCrystals 让 viewer 即时反映
export const saveEdit = () => {
  if (state.editingId == null || !state.editData) return;
  const id = state.editingId;
  const idx = state.allCrystals.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const orig = state.originalData[id];
  const edited = state.editData;
  const prev = state.reviseData[id] || null;

  // 只 diff _master 字段 (其他都只读)、且仅 8 个 server-fold 字段
  const origMasterSubset = {};
  const editMasterSubset = {};
  for (const f of _EDIT_FIELDS) {
    origMasterSubset[f.key] = orig?._master?.[f.key] ?? null;
    editMasterSubset[f.key] = edited?._master?.[f.key] ?? null;
  }
  const prevMasterSubset = prev?._master_subset || null;
  const subsetDiff = computeDiff(origMasterSubset, editMasterSubset, prevMasterSubset);

  if (!subsetDiff) {
    // 无变化 — 撤回 (清掉之前的 patch)
    delete state.reviseData[id];
    state.sessionReviseIds.delete(id);
  } else {
    // 落盘 patch shape (跟 crystal_revise.json schema 一致):
    //   { id, name, max_value: ..., M_L_max: ..., ... }
    // 直接平铺 8 字段到 patch 顶层 (没有 _master wrapper、Phase 7 plan 设计)
    const patch = { id, name: edited.name };
    for (const f of _EDIT_FIELDS) {
      const v = editMasterSubset[f.key];
      if (v !== origMasterSubset[f.key]) {
        patch[f.key] = v;   // null = tombstone (清回 master 缺省)
      }
    }
    state.reviseData[id] = patch;
    state.sessionReviseIds.add(id);
  }

  // 更新 allCrystals[idx] (deepApply revise 到 master + 重新转 wiki shape)
  // 简化版: 直接把 editData._master 的 8 字段 copy 回 state.allCrystals[idx]._master
  if (state.allCrystals[idx]?._master) {
    for (const f of _EDIT_FIELDS) {
      state.allCrystals[idx]._master[f.key] = editMasterSubset[f.key];
    }
  }

  // 退出 edit mode + 重 render detail body
  state.editingId = null;
  state.editData = null;
  const c = state.allCrystals[idx];
  const row = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  if (row) {
    const hd = row.querySelector('.crystal-row-hd');
    if (hd) hd.innerHTML = renderRowHd(c);
  }
  if (body) {
    body.className = 'crystal-body';
    body.innerHTML = renderDetailBody(c);
  }
  updateReviseBar();
};

// 撤回单 id: 清 reviseData / sessionReviseIds、还原 allCrystals[idx]._master
export const cancelRevise = (id) => {
  if (!state.reviseData[id]) return;
  delete state.reviseData[id];
  state.sessionReviseIds.delete(id);
  // 还原 _master 8 字段
  const orig = state.originalData[id];
  const idx = state.allCrystals.findIndex((x) => x.id === id);
  if (idx >= 0 && orig?._master && state.allCrystals[idx]?._master) {
    for (const f of _EDIT_FIELDS) {
      state.allCrystals[idx]._master[f.key] = orig._master[f.key];
    }
    const c = state.allCrystals[idx];
    const row = document.getElementById('row-' + id);
    const body = document.getElementById('body-' + id);
    if (row) {
      const hd = row.querySelector('.crystal-row-hd');
      if (hd) hd.innerHTML = renderRowHd(c);
    }
    if (body && !state.editingId) {
      body.className = 'crystal-body';
      body.innerHTML = renderDetailBody(c);
    }
  }
  updateReviseBar();
};

// 把 sessionReviseIds 内全部 patch POST 出去
export const saveRevise = async () => {
  const ids = Array.from(state.sessionReviseIds);
  if (ids.length === 0) {
    showSaveToast('保存対象がありません');
    return;
  }
  const patches = ids
    .map((id) => state.reviseData[id])
    .filter(Boolean);
  try {
    const body = {
      session_ids: ids,
      crystal_revise: patches,
    };
    const r = await submitRevise(body);
    if (r.mode === 'local') {
      showSaveToast(`保存しました (${patches.length} 件、local)`);
    } else {
      const url = r.prUrl ? `<a href="${r.prUrl}" target="_blank">${r.prUrl}</a>` : '(no url)';
      showSaveToast(`PR を作成しました: ${url}`, 30000);
    }
    // 保存成功 — 清 sessionReviseIds / reviseData、让 revise bar 消失
    // (server 端已合入 crystal_revise.json、下次 reload fetch 时新 baseline 通过 adapter deepApply 反映)
    ids.forEach((id) => delete state.reviseData[id]);
    state.sessionReviseIds.clear();
    updateReviseBar();
  } catch (e) {
    showSaveToast(`<span style="color:var(--danger)">保存失敗: ${escHtml(e.message)}</span>`, 12000);
  }
};
