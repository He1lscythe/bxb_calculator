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
import { crystalMaxBairitu } from '../shared/hensei-helpers.js';

// 8 个 server-fold 字段 + UI label + 默认值 + 数据类型 (int / float / frac) + 可选 width 覆盖
// type='frac' 支持分式字符串 ('5/1.13')、走 parseBairituVal、input type='text'
const _EDIT_FIELDS = [
  { key: 'max_value',  label: '最大値',        type: 'float', def: null, width: 100 },
  { key: 'M_L_max',    label: 'Lv',           type: 'frac',  def: 1 },
  { key: 'M_W_max',    label: '重量',         type: 'frac',  def: 1 },
  { key: 'M_P_max',    label: '純度',         type: 'frac',  def: 1 },
  { key: 'min_weight', label: '重量 min',     type: 'int',   def: 0 },
  { key: 'max_weight', label: '重量 max',     type: 'int',   def: 100 },
  { key: 'min_purity', label: '純度 min',     type: 'int',   def: 0 },
  { key: 'max_purity', label: '純度 max',     type: 'int',   def: 100 },
];
const _FIELD_BY_KEY = Object.fromEntries(_EDIT_FIELDS.map((f) => [f.key, f]));

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
    const placeholder = f.def == null ? 'null' : String(f.def);
    // frac 类型走 text input (允许 '5/1.13' 分式)、其他走 number input
    if (f.type === 'frac') {
      return `<div><div class="field-label">${f.label}</div>` +
        `<input type="text" class="edit-num-sm" style="width:${w}px" value="${escHtml(String(v))}" ` +
        `placeholder="${placeholder}" oninput="setCrField('${f.key}',this.value)"></div>`;
    }
    const step = f.type === 'int' ? '1' : 'any';
    return `<div><div class="field-label">${f.label}</div>` +
      `<input type="number" class="edit-num-sm" style="width:${w}px" step="${step}" value="${v}" ` +
      `placeholder="${placeholder}" oninput="setCrField('${f.key}',this.value)"></div>`;
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
export const setCrField = (field, val) => {
  if (!state.editData) return;
  state.editData._master = state.editData._master || {};
  if (val === '' || val == null) {
    state.editData._master[field] = null;
    return;
  }
  const def = _FIELD_BY_KEY[field];
  if (def?.type === 'frac') {
    state.editData._master[field] = parseBairituVal(String(val));
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
