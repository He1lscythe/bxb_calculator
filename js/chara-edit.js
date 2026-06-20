// js/chara-edit.js — Phase 7 Session 3 chara edit modal
//
// scope (Phase 7 plan):
//   - chara.tags (14 enum 按钮 toggle)
//   - 各 state.weapon_skills[i].value_scaling (master 已 bake 一次、user 可修正)
//   - 嵌入 masou_overrides: chara 关联 masou 的 effects[i].value_scaling
// 其他字段 (stats / element / weapon / bd_skill / skills 内容 / states 内容) 全只读 — master 100% 准确。
//
// 流程:
//   enterEditMode(wikiId) → state.editData = clone(chara wiki shape) + state.editingId = base_id 4位
//                          render modal 内容到 #chara-edit-modal、显示 modal
//   toggleCharaTag / setSkillScaling / setMasouScaling → live edit state.editData / state.masouEditData
//   saveEdit() → 算 chara patch + masou patch、入 reviseData / masouReviseData、close modal、更新 allChars
//   saveRevise() → POST 2 bucket (chara_revise + masou_revise) 到 /save (nav.js 顶部 btn 触发)
//   cancelEdit() → close modal、清 editData / editingId / masouEditData

import { state } from './state.js';
import { CHARA_TAG, CHARA_TAG_COLOR } from '../shared/constants.js';
import { submitRevise, showSaveToast } from '../shared/save-client.js';
import { escHtml } from './utils.js';
import { selectChar } from './render.js';
import { updateReviseBar } from './nav.js';
import { charaIconStack } from '../shared/image-paths.js';

// chara_revise key 是 base_id (4 位)、跟 master 一致
const _baseIdOf = (c) => c?._master?.id ?? c?.id;

const _CHARA_TAG_IDS = Object.keys(CHARA_TAG).map(Number).sort((a, b) => a - b);

// state.masouEditData = { [masou_id]: { effects: { [idx]: { value_scaling: float } } } }
// 独立追踪 masou edit、不混到 state.editData (chara) 内
state.masouEditData = state.masouEditData || {};

// ============================================================
// modal render
// ============================================================
const _renderTagsSection = (c) => {
  const tagsSet = new Set(c.tags || []);
  const btns = _CHARA_TAG_IDS.map((id) => {
    const active = tagsSet.has(id);
    const color = CHARA_TAG_COLOR[id] || '#888';
    const style = active
      ? `background:${color};color:#fff;border-color:${color};`
      : `background:transparent;color:${color};border-color:${color};`;
    return `<button class="ce-tag-btn" style="${style}"
      onclick="toggleCharaTag(${id})">${CHARA_TAG[id]}</button>`;
  }).join('');
  return `<div class="ce-section">
    <div class="ce-section-title">特性タグ</div>
    <div class="ce-tags-grid">${btns}</div>
  </div>`;
};

const _renderSkillsSection = (c) => {
  const m = c._master;
  if (!m?.states) return '';
  const stateNames = Object.keys(m.states);
  if (!stateNames.length) return '';
  const blocks = stateNames.map((sname) => {
    const sd = m.states[sname];
    const rows = (sd.weapon_skills || []).map((sk, i) => {
      const scaling = sk.value_scaling ?? 0;
      return `<div class="ce-skill-row">
        <div class="ce-skill-name">${escHtml(sk.name || `(skill ${i})`)}</div>
        <div class="ce-skill-meta">
          <span class="ce-skill-param">${escHtml(sk.parameter || '')}</span>
          <span class="ce-skill-value">value=${sk.value ?? 0}</span>
        </div>
        <div class="ce-skill-scaling">
          <label>熟度補正</label>
          <input class="ce-input" type="number" step="any" value="${scaling}"
            oninput="setSkillScaling('${escHtml(sname)}',${i},this.value)">
        </div>
        ${sk.description ? `<div class="ce-skill-desc">${escHtml(sk.description)}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="ce-state-block">
      <div class="ce-state-title">${escHtml(sname)}</div>
      ${rows || '<div class="ce-empty">(skill なし)</div>'}
    </div>`;
  }).join('');
  return `<div class="ce-section">
    <div class="ce-section-title">技能 熟度補正 (value_scaling)</div>
    ${blocks}
  </div>`;
};

const _renderMasouSection = (c) => {
  const charaId = _baseIdOf(c);
  const masouList = (state.masouByChara || {})[charaId] || [];
  if (!masouList.length) return '';
  const blocks = masouList.map((m) => {
    const masouId = m.id;
    const editPatch = state.masouEditData[masouId]?.effects || {};
    const rows = (m.effects || []).map((eff, i) => {
      const overridden = editPatch[i]?.value_scaling;
      const scaling = overridden != null ? overridden : (eff.value_scaling ?? 0);
      return `<div class="ce-skill-row">
        <div class="ce-skill-name">effect ${i}: ${escHtml(eff.parameter || '')}</div>
        <div class="ce-skill-meta">
          <span class="ce-skill-value">value=${eff.value ?? 0}</span>
          ${eff.math_type ? `<span class="ce-skill-math">[${escHtml(eff.math_type)}]</span>` : ''}
        </div>
        <div class="ce-skill-scaling">
          <label>熟度補正</label>
          <input class="ce-input" type="number" step="any" value="${scaling}"
            oninput="setMasouScaling(${masouId},${i},this.value)">
        </div>
        ${eff.effect_text ? `<div class="ce-skill-desc">${escHtml(eff.effect_text)}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="ce-state-block">
      <div class="ce-state-title">${escHtml(m.name || `masou ${masouId}`)}</div>
      ${rows || '<div class="ce-empty">(effect なし)</div>'}
    </div>`;
  }).join('');
  return `<div class="ce-section">
    <div class="ce-section-title">魔装 熟度補正 (masou_overrides)</div>
    ${blocks}
  </div>`;
};

const _renderModalBody = (c) => {
  const baseId = _baseIdOf(c);
  return `<div class="ce-modal-content">
    <div class="ce-modal-header">
      <div class="ce-modal-title">
        ${charaIconStack({
          variantId: c.id, name: c.name, elementId: c.element,
          weaponTypeId: c.weapon, marriageLevel: 2, className: 'equip-thumb',
        })}
        <span class="ce-modal-name">${escHtml(c.name)}</span>
        <span class="ce-modal-id">(base_id=${baseId})</span>
      </div>
      <button class="ce-modal-close" onclick="cancelEdit()">×</button>
    </div>
    <div class="ce-modal-body">
      ${_renderTagsSection(c)}
      ${_renderSkillsSection(c)}
      ${_renderMasouSection(c)}
    </div>
    <div class="ce-modal-footer">
      <button class="btn-save" onclick="saveEdit()">保存</button>
      <button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>
    </div>
  </div>`;
};

const _showModal = (html) => {
  let modal = document.getElementById('chara-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'chara-edit-modal';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div class="ce-modal-overlay" onclick="cancelEdit()"></div>${html}`;
  modal.style.display = 'flex';
};

const _hideModal = () => {
  const modal = document.getElementById('chara-edit-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.innerHTML = '';
  }
};

const _reRender = () => {
  if (!state.editData) return;
  const modal = document.getElementById('chara-edit-modal');
  if (!modal) return;
  modal.innerHTML = `<div class="ce-modal-overlay" onclick="cancelEdit()"></div>${_renderModalBody(state.editData)}`;
};

// ============================================================
// open / close
// ============================================================
export const enterEditMode = (wikiId) => {
  const c = state.allChars.find((x) => x.id === wikiId);
  if (!c) return;
  state.editData = JSON.parse(JSON.stringify(c));
  state.editingId = _baseIdOf(state.editData);
  // masouEditData 不每次 reset — 让用户在多个 chara 间切换、masou edit 保留
  _showModal(_renderModalBody(state.editData));
};

export const cancelEdit = () => {
  state.editData = null;
  state.editingId = null;
  _hideModal();
};

// ============================================================
// live edit
// ============================================================
export const toggleCharaTag = (tagId) => {
  if (!state.editData) return;
  // Bug A 修: source of truth 是 _master.tags (_buildCharaPatch 读这个生成 patch)
  // wiki 顶层 state.editData.tags 也同步、让 _renderTagsSection (读 c.tags) 立即反映
  state.editData._master = state.editData._master || {};
  state.editData._master.tags = state.editData._master.tags || [];
  const arr = state.editData._master.tags;
  const idx = arr.indexOf(tagId);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(tagId);
  arr.sort((a, b) => a - b);
  state.editData.tags = arr.slice();   // wiki view 同步
  _reRender();
};

export const setSkillScaling = (stateName, skillIdx, val) => {
  if (!state.editData?._master?.states?.[stateName]) return;
  const sk = state.editData._master.states[stateName].weapon_skills?.[skillIdx];
  if (!sk) return;
  const n = +val;
  sk.value_scaling = Number.isFinite(n) ? n : 0;
};

export const setMasouScaling = (masouId, idx, val) => {
  state.masouEditData[masouId] = state.masouEditData[masouId] || { effects: {} };
  state.masouEditData[masouId].effects = state.masouEditData[masouId].effects || {};
  const n = +val;
  state.masouEditData[masouId].effects[idx] = { value_scaling: Number.isFinite(n) ? n : 0 };
};

// ============================================================
// save / submit
// ============================================================

// 算 chara patch (sparse diff、对比 originalData _master vs editData._master)
//   patch = { id (base_id), name, tags?, states?: { [stateName]: { weapon_skills: { [skillId]: { value_scaling } } } } }
const _buildCharaPatch = (orig, edited) => {
  const baseId = _baseIdOf(edited);
  if (!baseId) return null;
  const patch = { id: baseId };
  let hasChange = false;
  // tags 比较 (array)
  const origTags = (orig._master?.tags || []).slice().sort((a, b) => a - b);
  const editTags = (edited._master?.tags || edited.tags || []).slice().sort((a, b) => a - b);
  if (JSON.stringify(origTags) !== JSON.stringify(editTags)) {
    patch.tags = editTags;
    hasChange = true;
  }
  // states.{name}.weapon_skills.{i}.value_scaling 比较
  const origStates = orig._master?.states || {};
  const editStates = edited._master?.states || {};
  const statesPatch = {};
  for (const sname of Object.keys(editStates)) {
    const origSkills = origStates[sname]?.weapon_skills || [];
    const editSkills = editStates[sname]?.weapon_skills || [];
    const skillPatch = {};
    editSkills.forEach((sk, i) => {
      const origVs = origSkills[i]?.value_scaling ?? 0;
      const editVs = sk.value_scaling ?? 0;
      if (origVs !== editVs && sk.id != null) {
        skillPatch[sk.id] = { value_scaling: editVs }; // 按 skill id (非 index、robust 到重排)
      }
    });
    if (Object.keys(skillPatch).length) {
      statesPatch[sname] = { weapon_skills: skillPatch };
    }
  }
  if (Object.keys(statesPatch).length) {
    patch.states = statesPatch;
    hasChange = true;
  }
  if (!hasChange) return null;
  patch.name = edited.name;
  return patch;
};

// 算 masou patch (跟 masou_revise.json schema 一致):
//   { id (weapon_costumes.id), name, chara_id, chara_name, effects: [...] }
//   masou effects 无 id (parameter 也不保证唯一) → 整组替换 (full-replace、非 index 稀疏)。
//   caveat: 整组替换会"冻结"effects 数组、master 改 effect 时被 revise 覆盖;但 masou 极少 revise、可接受。
const _buildMasouPatches = () => {
  const patches = [];
  for (const masouId of Object.keys(state.masouEditData)) {
    const ed = state.masouEditData[masouId];
    if (!ed.effects || !Object.keys(ed.effects).length) continue;
    const m = (state.allMasou || []).find((x) => x.id == masouId);
    if (!m) continue;
    const orig = state.masouOriginalData?.[masouId] || m;
    const baseEffects = Array.isArray(orig.effects) ? orig.effects : [];
    // 用 master effects 套上编辑过的 value_scaling、产出完整 effects 数组
    const merged = baseEffects.map((e, i) =>
      ed.effects[i] && ed.effects[i].value_scaling != null
        ? { ...e, value_scaling: ed.effects[i].value_scaling }
        : e,
    );
    if (JSON.stringify(merged) !== JSON.stringify(baseEffects)) {
      patches.push({
        id: +masouId,
        name: m.name,
        chara_id: m.chara_id,
        chara_name: m.chara_name,
        effects: merged,
      });
    }
  }
  return patches;
};

export const saveEdit = () => {
  if (!state.editData || state.editingId == null) return;
  const baseId = state.editingId;

  const orig = state.originalData[baseId] || state.allChars.find((x) => _baseIdOf(x) === baseId);
  const charaPatch = _buildCharaPatch(orig, state.editData);
  if (charaPatch) {
    state.reviseData[baseId] = charaPatch;
    state.sessionReviseIds.add(baseId);
  } else {
    delete state.reviseData[baseId];
    state.sessionReviseIds.delete(baseId);
  }

  // masou patches: 单独 bucket、独立 session
  const masouPatches = _buildMasouPatches();
  for (const p of masouPatches) {
    state.masouReviseData[p.id] = p;
    state.masouSessionReviseIds.add(p.id);
  }

  // 把 editData 改动同步回 state.allChars[idx] (deepApply _master 字段) 让 detail view 立即反映
  const idx = state.allChars.findIndex((x) => _baseIdOf(x) === baseId);
  if (idx >= 0) {
    const c = state.allChars[idx];
    if (state.editData._master) {
      c._master.tags = state.editData._master.tags;
      c.tags = state.editData._master.tags || [];
      const newStates = state.editData._master.states || {};
      for (const sname of Object.keys(newStates)) {
        const ws = newStates[sname].weapon_skills || [];
        ws.forEach((sk, i) => {
          if (c._master.states?.[sname]?.weapon_skills?.[i]) {
            c._master.states[sname].weapon_skills[i].value_scaling = sk.value_scaling;
          }
          // 同步 wiki shape (skills[].effects[0].bairitu_scaling) 让 hensei/render 立即看到
          if (c.states?.[sname]?.skills?.[i]?.effects?.[0]) {
            c.states[sname].skills[i].effects[0].bairitu_scaling = sk.value_scaling;
          }
        });
      }
    }
  }

  // masou data 同步
  for (const p of masouPatches) {
    const mIdx = (state.allMasou || []).findIndex((m) => m.id === p.id);
    if (mIdx >= 0) {
      const m = state.allMasou[mIdx];
      m.effects = m.effects || [];
      for (const idx of Object.keys(p.effects)) {
        if (m.effects[idx]) m.effects[idx].value_scaling = p.effects[idx].value_scaling;
      }
    }
  }

  cancelEdit();
  // 重新渲染 detail view 让 tags / skill scaling 更新
  if (state.selectedId != null) selectChar(state.selectedId);
  updateReviseBar();
};

// 撤回单 chara
export const cancelRevise = (baseId) => {
  if (state.reviseData[baseId]) delete state.reviseData[baseId];
  state.sessionReviseIds.delete(baseId);
  // 还原 allChars[idx]._master.tags + skills value_scaling
  const orig = state.originalData[baseId];
  const idx = state.allChars.findIndex((x) => _baseIdOf(x) === baseId);
  if (idx >= 0 && orig) {
    const c = state.allChars[idx];
    c._master.tags = orig._master?.tags || [];
    c.tags = orig._master?.tags || [];
    if (orig._master?.states && c._master?.states) {
      for (const sname of Object.keys(orig._master.states)) {
        const origSkills = orig._master.states[sname].weapon_skills || [];
        origSkills.forEach((sk, i) => {
          if (c._master.states?.[sname]?.weapon_skills?.[i]) {
            c._master.states[sname].weapon_skills[i].value_scaling = sk.value_scaling;
          }
          if (c.states?.[sname]?.skills?.[i]?.effects?.[0]) {
            c.states[sname].skills[i].effects[0].bairitu_scaling = sk.value_scaling;
          }
        });
      }
    }
  }
  if (state.selectedId != null) selectChar(state.selectedId);
  updateReviseBar();
};

// POST 当前 session 所有 revise patches
export const saveRevise = async () => {
  const charaIds = Array.from(state.sessionReviseIds);
  const masouIds = Array.from(state.masouSessionReviseIds || []);
  if (charaIds.length === 0 && masouIds.length === 0) {
    showSaveToast('保存対象がありません');
    return;
  }
  const charaPatches = charaIds.map((id) => state.reviseData[id]).filter(Boolean);
  const masouPatches = masouIds.map((id) => state.masouReviseData[id]).filter(Boolean);
  try {
    const body = {
      session_ids: charaIds,
      masou_session_ids: masouIds,
      chara_revise: charaPatches,
      masou_revise: masouPatches,
    };
    const r = await submitRevise(body);
    if (r.mode === 'local') {
      showSaveToast(`保存しました (chara: ${charaPatches.length}、masou: ${masouPatches.length}、local)`);
    } else {
      showSaveToast('提出済み');
    }
    // 保存成功 — 清 sessionReviseIds / reviseData、让 revise bar 消失
    charaIds.forEach((id) => delete state.reviseData[id]);
    masouIds.forEach((id) => delete state.masouReviseData[id]);
    state.sessionReviseIds.clear();
    state.masouSessionReviseIds?.clear();
    updateReviseBar();
  } catch (e) {
    showSaveToast(`<span style="color:var(--danger)">保存失敗: ${escHtml(e.message)}</span>`, 12000);
  }
};
