// js/cr-edit.js — Phase 7 Session 2 crystal inline edit
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
import { computeDiff } from '../shared/revise-core.js';
import { submitRevise, showSaveToast } from '../shared/save-client.js';
import { escHtml, parseBairituVal } from './utils.js';
import { invalidateRow, registerEditBodyRenderer } from './cr-list.js';
import { updateReviseBar } from './nav.js';
import { crystalMaxBairitu, clampCrystalMasterField, crystalMinPlaceholder } from '../shared/hensei-helpers.js';

// server-fold 字段 + UI label + 默认值 + 数据类型 (int / float / frac / select) + 可选 width 覆盖
// type='frac' 支持分式字符串 ('5/1.13')、走 parseBairituVal、input type='text'
// type='select' 走 <select>、value=null 显示 'none'
const _WEIGHT_STEP_OPTS = [null, 0.1, 1, 10, 20, 25, 50];
const _PURITY_STEP_OPTS = [null, 0.01, 1, 10, 20, 25, 50];
const _EDIT_FIELDS = [
  { key: 'max_value',   label: '最大値',     type: 'frac',   def: null, width: 100 },
  { key: 'M_L_max',     label: 'Lv',         type: 'frac',   def: 1 },
  { key: 'M_W_max',     label: '重量',       type: 'frac',   def: 1 },
  { key: 'M_P_max',     label: '純度',       type: 'frac',   def: 1 },
  { key: 'min_weight',  label: '重量 min',   type: 'int',    def: 0 },
  { key: 'max_weight',  label: '重量 max',   type: 'int',    def: 100 },
  { key: 'min_purity',  label: '純度 min',   type: 'int',    def: 0 },
  { key: 'max_purity',  label: '純度 max',   type: 'int',    def: 100 },
  { key: 'weight_step', label: 'W step',     type: 'select', def: null, opts: _WEIGHT_STEP_OPTS, width: 70 },
  { key: 'purity_step', label: 'P step',     type: 'select', def: null, opts: _PURITY_STEP_OPTS, width: 70 },
];
const _FIELD_BY_KEY = Object.fromEntries(_EDIT_FIELDS.map((f) => [f.key, f]));
// 联动依赖图: dependent field → master field 必须 != null 才 enabled
// M_W_max null → weight_step/min_weight/max_weight 全 disabled + 擦除；M_P_max 同理
const _DEP_KEY = {
  weight_step: 'M_W_max',
  min_weight:  'M_W_max',
  max_weight:  'M_W_max',
  purity_step: 'M_P_max',
  min_purity:  'M_P_max',
  max_purity:  'M_P_max',
};

// 旧 wiki cr-edit 视觉 pattern (2026-06-08 用户决策):
// - 顶部 .edit-actions (保存 / キャンセル)
// - 下面 .edit-ro 显示 name
// - .field-row + .field-key + .field-val 显示只读 effect 文 / 特殊条件
// - .field-label 作 section title、.skill-edit-meta 作 grid 容器
// - 每个 input 包在 <div><div class="field-label">{name}</div>{input}</div> 模式
const _renderEditBody = (c) => {
  const ed = state.editData || {};
  const m = ed._master || {};
  const getVal = (k) => {
    const v = m[k];
    return v != null ? v : '';
  };
  const inputFor = (f) => {
    const v = getVal(f.key);
    const w = f.width || 68;
    let placeholder = f.def == null ? 'null' : String(f.def);
    // 联动 disabled: dep master field 为 null 时本字段不可改
    const dep = _DEP_KEY[f.key];
    const disabled = dep && (m[dep] == null || m[dep] === '');
    const disAttr = disabled ? ' disabled' : '';
    // 重量/純度 没缩放 (M_W_max/M_P_max=null 或 =1) 时、min_weight/min_purity placeholder 走 helper (100 而非 0)
    const minPh = crystalMinPlaceholder(f.key, m);
    if (minPh != null) placeholder = String(minPh);
    // frac 类型走 text input (允许 '5/1.13' 分式)、其他走 number input
    if (f.type === 'frac') {
      return `<div><div class="field-label">${f.label}</div>` +
        `<input type="text" data-field="${f.key}" class="edit-num-sm" style="width:${w}px" value="${escHtml(String(v))}" ` +
        `placeholder="${placeholder}"${disAttr} oninput="setCrField('${f.key}',this.value)"></div>`;
    }
    // select 类型 (weight_step / purity_step)
    if (f.type === 'select') {
      const cur = m[f.key];
      const opts = f.opts.map((o) => {
        const ov = o == null ? '' : String(o);
        const lbl = o == null ? 'none' : String(o);
        const sel = ((cur == null || cur === '') && o == null) || cur === o ? ' selected' : '';
        return `<option value="${ov}"${sel}>${lbl}</option>`;
      }).join('');
      return `<div><div class="field-label">${f.label}</div>` +
        `<select data-field="${f.key}" class="edit-num-sm" style="width:${w}px"${disAttr} onchange="setCrField('${f.key}',this.value)">${opts}</select></div>`;
    }
    const step = f.type === 'int' ? '1' : 'any';
    return `<div><div class="field-label">${f.label}</div>` +
      `<input type="number" data-field="${f.key}" class="edit-num-sm" style="width:${w}px" step="${step}" value="${v}" ` +
      `placeholder="${placeholder}"${disAttr} oninput="setCrField('${f.key}',this.value)"></div>`;
  };

  // 只读 effect_text / 特殊条件 (旧 wiki pattern、master 不可编辑直接展示)
  const param = escHtml(m.parameter || '');
  const math = escHtml(m.math_type || '');
  const initV = m.initial_value ?? '';
  const lvMax = m.max_level ?? '';
  const desc = escHtml(m.description || '');

  const roEffect = desc
    ? `<div class="field-row"><div class="field-key">効果</div><div class="field-val edit-ro">${desc}</div></div>`
    : '';
  const roMeta = `<div class="field-row"><div class="field-key">parameter</div><div class="field-val edit-ro">${param} <span style="color:var(--text2)">/ ${math}</span></div></div>` +
    `<div class="field-row"><div class="field-key">初期値</div><div class="field-val edit-ro">${initV}</div></div>` +
    `<div class="field-row"><div class="field-key">max_level</div><div class="field-val edit-ro">${lvMax}</div></div>`;

  // 顶层 server-fold 字段 — 8 个 input 全合并成 1 行
  const fieldsSec = `<div class="skill-edit-meta" style="margin-top:8px">` +
    _EDIT_FIELDS.map(inputFor).join('') +
    `</div>`;

  // id 左 + 保存/キャンセル 右 同行
  const topBar = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0 8px">` +
    `<span style="font-size:11px;color:var(--text2)">id=${c.id}</span>` +
    `<div class="edit-actions" style="margin:0">` +
    `<button class="btn-save" onclick="saveEdit()">保存</button>` +
    `<button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>` +
    `</div>` +
    `</div>`;

  return topBar +
    roEffect +
    roMeta +
    fieldsSec;
};

// 注册给 cr-list.js renderRow 用 — virtual list 重 build node 时按 state.editingId 决定渲染 edit body
registerEditBodyRenderer(_renderEditBody);

export const enterEditMode = (id) => {
  if (state.editingId !== null && state.editingId !== id) cancelEdit();
  const c = state.allCrystals.find((x) => x.id === id);
  if (!c) return;
  state.editData = JSON.parse(JSON.stringify(c));
  state.editingId = id;
  invalidateRow(id);   // renderRow 看 editingId 自动渲染 edit body + 重测高度
};

export const cancelEdit = () => {
  if (state.editingId === null) return;
  const id = state.editingId;
  state.editingId = null;
  state.editData = null;
  invalidateRow(id);
};

// live edit: 修改 editData._master[field]、不立即落盘
// frac 字段走 parseBairituVal、可存分式 'a/b' 字符串或 number；其他字段走 Number 强转
// 联动: M_W_max ↔ weight_step、M_P_max ↔ purity_step
//   重量擦除 → weight_step=null;重量从 null 变非 null + step=null → step=0.1 (purity 同理 → 0.01)
// clamp: M_W_max / M_P_max 数值形态强制 0-100 (分式字符串 '5/1.13' 透传不 clamp)
export const setCrField = (field, val) => {
  if (!state.editData) return;
  state.editData._master = state.editData._master || {};
  const m = state.editData._master;
  const def = _FIELD_BY_KEY[field];
  if (val === '' || val == null) {
    m[field] = null;
  } else if (def?.type === 'frac') {
    m[field] = clampCrystalMasterField(field, parseBairituVal(String(val)));
  } else {
    const n = +val;
    m[field] = Number.isFinite(n) ? n : null;
  }
  if (field === 'M_W_max') _syncCoupling('weight');
  else if (field === 'M_P_max') _syncCoupling('purity');
};

// M_W_max / M_P_max 改动后同步 dependents (step + min/max + min placeholder) + 直接更新 DOM (避免 invalidateRow 失焦)
//   master null → 全 dependents 擦除 + disabled、min placeholder=100
//   master 非 null + step 仍 null → step 自动填 (weight=0.1 / purity=0.01)
//   M_W_max=1 (非 null 但无缩放) → field enabled、min placeholder 仍 100
const _syncCoupling = (dim) => {
  const m = state.editData?._master;
  if (!m) return;
  const isW = dim === 'weight';
  const maxKey = isW ? 'M_W_max' : 'M_P_max';
  const stepKey = isW ? 'weight_step' : 'purity_step';
  const stepAuto = isW ? 0.1 : 0.01;
  const minKey = isW ? 'min_weight' : 'min_purity';
  const maxRangeKey = isW ? 'max_weight' : 'max_purity';
  const masterNull = m[maxKey] == null;
  if (masterNull) {
    m[stepKey] = null;
    m[minKey] = null;
    m[maxRangeKey] = null;
  } else if (m[stepKey] == null) {
    m[stepKey] = stepAuto;
  }
  _updateFieldDOM(stepKey, m[stepKey], masterNull);
  _updateFieldDOM(minKey, m[minKey], masterNull);
  _updateFieldDOM(maxRangeKey, m[maxRangeKey], masterNull);
  // min 字段 placeholder 实时更新 (M_W_max=null/1 → 100、>1 → 0)
  const minEl = document.querySelector(`[data-field="${minKey}"]`);
  const minPh = crystalMinPlaceholder(minKey, m);
  if (minEl && minPh != null) minEl.placeholder = String(minPh);
};

const _updateFieldDOM = (key, val, disabled) => {
  const el = document.querySelector(`[data-field="${key}"]`);
  if (!el) return;
  el.disabled = disabled;
  el.value = val == null ? '' : String(val);
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
    // 同步 wiki shape 派生字段 (adapter 在 fetch 时映射、edit 后需手动同步给 render 用)
    // effects[0].bairitu ← crystalMaxBairitu(master) (三因子任一非 null → initial×Π;否则 max_value)
    const eff0 = state.allCrystals[idx].effects?.[0];
    if (eff0) eff0.bairitu = crystalMaxBairitu(state.allCrystals[idx]._master);
  }

  // 退出 edit mode — renderRow 看 editingId=null 自动转 detail body + 重测高度
  state.editingId = null;
  state.editData = null;
  invalidateRow(id);
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
    // 同步 wiki shape effects[0].bairitu (display 用)、跟 saveEdit 同 sync
    const eff0 = state.allCrystals[idx].effects?.[0];
    if (eff0) eff0.bairitu = crystalMaxBairitu(state.allCrystals[idx]._master);
  }
  invalidateRow(id);
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
      showSaveToast('提出済み');
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
