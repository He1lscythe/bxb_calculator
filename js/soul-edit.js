// js/soul-edit.js — Phase 7 Session 3 soul edit modal
//
// scope: 只 soul.tags (SOUL_TAG 8 enum 按钮 toggle)
// 其他 soul 字段 (skills / element_affinity / weapon_affinity / stats) 全只读 — master 准确。

import { state } from './soul-state.js';
import { SOUL_TAG, SOUL_TAG_COLOR } from '../shared/constants.js';
import { submitRevise, showSaveToast } from '../shared/save-client.js';
import { escHtml } from './utils.js';
import { selectSoul } from './soul-render.js';
import { updateReviseBar } from './nav.js';

const _SOUL_TAG_IDS = Object.keys(SOUL_TAG).map(Number).sort((a, b) => a - b);

const _renderModalBody = (s) => {
  const tagsSet = new Set(s.tags || []);
  const btns = _SOUL_TAG_IDS.map((id) => {
    const active = tagsSet.has(id);
    const color = SOUL_TAG_COLOR[id] || '#888';
    const style = active
      ? `background:${color};color:#fff;border-color:${color};`
      : `background:transparent;color:${color};border-color:${color};`;
    return `<button class="ce-tag-btn" style="${style}"
      onclick="toggleSoulTag(${id})">${SOUL_TAG[id]}</button>`;
  }).join('');
  return `<div class="ce-modal-content">
    <div class="ce-modal-header">
      <div class="ce-modal-title">
        <span class="ce-modal-name">${escHtml(s.name)}</span>
        <span class="ce-modal-id">(id=${s.id})</span>
      </div>
      <button class="ce-modal-close" onclick="cancelEdit()">×</button>
    </div>
    <div class="ce-modal-body">
      <div class="ce-section">
        <div class="ce-section-title">特性タグ</div>
        <div class="ce-tags-grid">${btns}</div>
      </div>
    </div>
    <div class="ce-modal-footer">
      <button class="btn-save" onclick="saveEdit()">保存</button>
      <button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>
    </div>
  </div>`;
};

const _showModal = (html) => {
  let modal = document.getElementById('soul-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'soul-edit-modal';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div class="ce-modal-overlay" onclick="cancelEdit()"></div>${html}`;
  modal.style.display = 'flex';
};

const _hideModal = () => {
  const modal = document.getElementById('soul-edit-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.innerHTML = '';
  }
};

const _reRender = () => {
  if (!state.editData) return;
  const modal = document.getElementById('soul-edit-modal');
  if (!modal) return;
  modal.innerHTML = `<div class="ce-modal-overlay" onclick="cancelEdit()"></div>${_renderModalBody(state.editData)}`;
};

export const enterEditMode = (id) => {
  const s = state.allSouls.find((x) => x.id === id);
  if (!s) return;
  state.editData = JSON.parse(JSON.stringify(s));
  state.editingId = id;
  _showModal(_renderModalBody(state.editData));
};

export const cancelEdit = () => {
  state.editData = null;
  state.editingId = null;
  _hideModal();
};

export const toggleSoulTag = (tagId) => {
  if (!state.editData) return;
  state.editData.tags = state.editData.tags || [];
  const idx = state.editData.tags.indexOf(tagId);
  if (idx >= 0) state.editData.tags.splice(idx, 1);
  else state.editData.tags.push(tagId);
  state.editData.tags.sort((a, b) => a - b);
  _reRender();
};

export const saveEdit = () => {
  if (!state.editData || state.editingId == null) return;
  const id = state.editingId;
  const orig = state.originalData[id];
  const origTags = (orig?.tags || []).slice().sort((a, b) => a - b);
  const editTags = (state.editData.tags || []).slice().sort((a, b) => a - b);
  const changed = JSON.stringify(origTags) !== JSON.stringify(editTags);

  if (changed) {
    state.reviseData[id] = { id, name: state.editData.name, tags: editTags };
    state.sessionReviseIds.add(id);
    // 同步 allSouls[idx]
    const idx = state.allSouls.findIndex((x) => x.id === id);
    if (idx >= 0) {
      state.allSouls[idx].tags = editTags;
      if (state.allSouls[idx]._master) state.allSouls[idx]._master.tags = editTags;
    }
  } else {
    delete state.reviseData[id];
    state.sessionReviseIds.delete(id);
  }
  cancelEdit();
  if (state.selectedId != null) selectSoul(state.selectedId);
  updateReviseBar();
};

export const cancelRevise = (id) => {
  if (state.reviseData[id]) delete state.reviseData[id];
  state.sessionReviseIds.delete(id);
  const orig = state.originalData[id];
  const idx = state.allSouls.findIndex((x) => x.id === id);
  if (idx >= 0 && orig) {
    state.allSouls[idx].tags = orig.tags || [];
    if (state.allSouls[idx]._master) state.allSouls[idx]._master.tags = orig.tags || [];
  }
  if (state.selectedId != null) selectSoul(state.selectedId);
  updateReviseBar();
};

export const saveRevise = async () => {
  const ids = Array.from(state.sessionReviseIds);
  if (ids.length === 0) {
    showSaveToast('保存対象がありません');
    return;
  }
  const patches = ids.map((id) => state.reviseData[id]).filter(Boolean);
  try {
    const body = { session_ids: ids, soul_revise: patches };
    const r = await submitRevise(body);
    if (r.mode === 'local') {
      showSaveToast(`保存しました (${patches.length} 件、local)`);
    } else {
      showSaveToast('提出済み');
    }
    // 保存成功 — 清 sessionReviseIds / reviseData、让 revise bar 消失
    ids.forEach((id) => delete state.reviseData[id]);
    state.sessionReviseIds.clear();
    updateReviseBar();
  } catch (e) {
    showSaveToast(`<span style="color:var(--danger)">保存失敗: ${escHtml(e.message)}</span>`, 12000);
  }
};
