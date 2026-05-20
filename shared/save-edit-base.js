// shared/save-edit-base.js — 4 个 viewer (chara/cr/soul/bg) 的 saveEdit / saveRevise 共享核心。
//
// 设计：本模块只处理纯逻辑（sessionChanged / computeDiff / 写 reviseData / submit+refresh），
// UI re-render (DOM 操作 / row 替换 / detail 切回) 由 viewer 自己 wrap。
//
// 提供 4 个函数：
//
//   saveEditSingleViewer(state, opts) — bg/cr/soul 用、单 reviseData bucket
//     opts: { collectionKey, normalizeForDiff? }
//     返回 { idx, changed, id } 让 caller 决定 UI re-render
//
//   saveEditCharaCore(state, opts) — chara 用、需要 OMOIDE_KEYS split
//     opts: { OMOIDE_KEYS }
//     返回 { idx, changed, id }（chara 已 split 到 reviseData / omoideReviseData）
//
//   saveReviseSingleViewer(state, opts) — bg/cr/soul 用、单 bucket post
//     opts: { collectionKey, bucketKey, normalizeForDiff? }
//     async；处理 submit + refresh state + toast
//
//   saveReviseCharaCore(state, opts) — chara 用、3 buckets (revise + omoide_revise + masou_revise)
//     opts: { OMOIDE_KEYS }
//     async；同上但拆 buckets
//
// UI re-render 留给 viewer：viewer 调完 base 后自己 updateReviseBar() + DOM 重渲。

import { submitRevise, pickPatches, showSaveToast } from './save-client.js';
import { computeDiff } from '../js/diff.js';

// ===== saveEdit core =====

/**
 * 单 viewer (bg/cr/soul) 用：sessionChanged + computeDiff + 写 reviseData。
 * 调用方负责：清 editData/editingId、UI re-render。
 *
 * @param {object} state — viewer 的 state 对象 (editData / allXxx / reviseData / originalData / sessionReviseIds)
 * @param {object} opts
 * @param {string} opts.collectionKey — 'allBG' / 'allCrystals' / 'allSouls'
 * @param {function} [opts.normalizeForDiff] — (editData) => normalizedEditData（soul 去除 default value 等）
 * @returns {{ idx: number, changed: boolean, id: number|null }}
 */
export const saveEditSingleViewer = (state, opts) => {
  if (!state.editData) return { idx: -1, changed: false, id: null };
  const all = state[opts.collectionKey];
  const id = state.editData.id;
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) return { idx: -1, changed: false, id };

  const sessionChanged = JSON.stringify(state.editData) !== JSON.stringify(all[idx]);
  if (sessionChanged) {
    all[idx] = state.editData;
    const editForDiff = opts.normalizeForDiff
      ? opts.normalizeForDiff(state.editData)
      : state.editData;
    // prev-revise pattern：让 _deepDiff 自动 emit null 撤回标记
    const prev = state.reviseData[id];
    const diff = computeDiff(state.originalData[id], editForDiff, prev);
    const meaningful = Object.keys(diff).some((k) => k !== 'id' && k !== 'name');
    if (meaningful) {
      state.reviseData[id] = diff;
      state.sessionReviseIds.add(id);
    } else {
      // 完全无差异（编辑又撤回到 base、且 prev 也无残留）→ 清空、不入队
      delete state.reviseData[id];
      state.sessionReviseIds.delete(id);
    }
  }
  return { idx, changed: sessionChanged, id };
};

/**
 * Chara 用：sessionChanged + computeDiff + split diff（按 OMOIDE_KEYS 拆 reviseData / omoideReviseData）。
 * masou_overrides / cleanup / omoide_template 压缩等 viewer-specific 处理由 caller 在调 base 前后做。
 *
 * @param {object} state — chara state (editData / allChars / reviseData / omoideReviseData / originalData / sessionReviseIds)
 * @param {object} opts
 * @param {Set} opts.OMOIDE_KEYS — omoide 字段 set（外部传、避免 base 引入 viewer 常量）
 * @returns {{ idx: number, changed: boolean, id: number|null }}
 */
export const saveEditCharaCore = (state, opts) => {
  if (!state.editData) return { idx: -1, changed: false, id: null };
  const id = state.editData.id;
  const idx = state.allChars.findIndex((x) => x.id === id);
  if (idx < 0) return { idx: -1, changed: false, id };

  const sessionChanged = JSON.stringify(state.editData) !== JSON.stringify(state.allChars[idx]);
  if (sessionChanged) {
    state.allChars[idx] = state.editData;
    // prev-revise pattern：合并两个 revise 文件作为 prev，让 _deepDiff 自动 emit null 撤回标记
    const prevMerged = Object.assign(
      {},
      state.reviseData[id] || {},
      state.omoideReviseData[id] || {},
    );
    const diff = computeDiff(state.originalData[id], state.editData, prevMerged);
    const charDiff = { id: diff.id, name: diff.name };
    const omoideDiff = { id: diff.id, name: diff.name };
    let hasChar = false;
    let hasOmoide = false;
    for (const key in diff) {
      if (key === 'id' || key === 'name') continue;
      if (opts.OMOIDE_KEYS.has(key)) {
        omoideDiff[key] = diff[key];
        hasOmoide = true;
      } else {
        charDiff[key] = diff[key];
        hasChar = true;
      }
    }
    // omoide_template 非 null 時、omoide 配列は冗長（render 时 resolveOmoideTemplates 复原）
    if (hasOmoide && omoideDiff.omoide_template != null) {
      omoideDiff.omoide = null;
    }
    if (hasChar) state.reviseData[id] = charDiff;
    else delete state.reviseData[id];
    if (hasOmoide) state.omoideReviseData[id] = omoideDiff;
    else delete state.omoideReviseData[id];
    state.sessionReviseIds.add(id);
  }
  return { idx, changed: sessionChanged, id };
};

// ===== saveRevise core =====

/**
 * 单 viewer (bg/cr/soul) 用 saveRevise — submit + refresh state.reviseData。
 * UI (btn / status / toast / updateReviseBar) 由 caller 包装。
 *
 * @param {object} state
 * @param {object} opts
 * @param {string} opts.collectionKey — 'allBG' / 'allCrystals' / 'allSouls'
 * @param {string} opts.bucketKey — 'bladegraphs_revise' / 'crystals_revise' / 'souls_revise'
 * @param {function} [opts.normalizeForDiff] — refresh 时也走 normalize
 * @returns {Promise<{ mode: 'local'|'remote' }>}
 */
export const saveReviseSingleViewer = async (state, opts) => {
  const ids = Array.from(state.sessionReviseIds);
  const json = await submitRevise({
    session_ids: ids,
    [opts.bucketKey]: pickPatches(state.reviseData, ids),
  });
  // submit 成功后 refresh：用无 prev 的 computeDiff 重算 state.reviseData，
  // 去掉 null 撤回标记，防止下次 saveEdit 拿到 stale prev 重复 emit null。
  const all = state[opts.collectionKey];
  for (const id of ids) {
    const idx = all.findIndex((x) => x.id === id);
    if (idx < 0) continue;
    const norm = opts.normalizeForDiff ? opts.normalizeForDiff(all[idx]) : all[idx];
    const fresh = computeDiff(state.originalData[id], norm);
    if (Object.keys(fresh).some((k) => k !== 'id' && k !== 'name')) {
      state.reviseData[id] = fresh;
    } else {
      delete state.reviseData[id];
    }
  }
  state.sessionReviseIds.clear();
  return json;
};

/**
 * Chara 用 saveRevise — 3 buckets (revise + omoide_revise + masou_revise) + split refresh。
 *
 * @param {object} state — chara state (含 masouSessionReviseIds / masouReviseData / omoideReviseData)
 * @param {object} opts
 * @param {Set} opts.OMOIDE_KEYS
 * @returns {Promise<{ mode: 'local'|'remote' }>}
 */
export const saveReviseCharaCore = async (state, opts) => {
  const ids = Array.from(state.sessionReviseIds);
  const masouIds = Array.from(state.masouSessionReviseIds);
  const json = await submitRevise({
    session_ids: ids,
    masou_session_ids: masouIds,
    revise: pickPatches(state.reviseData, ids),
    omoide_revise: pickPatches(state.omoideReviseData, ids),
    masou_revise: pickPatches(state.masouReviseData, masouIds),
  });
  // refresh：用无 prev 的 computeDiff、再按 OMOIDE_KEYS split 回两个 revise
  for (const id of ids) {
    const idx = state.allChars.findIndex((c) => c.id === id);
    if (idx < 0) continue;
    const fresh = computeDiff(state.originalData[id], state.allChars[idx]);
    const charDiff = { id: fresh.id, name: fresh.name };
    const omoideDiff = { id: fresh.id, name: fresh.name };
    let hasChar = false;
    let hasOmoide = false;
    for (const key in fresh) {
      if (key === 'id' || key === 'name') continue;
      if (opts.OMOIDE_KEYS.has(key)) {
        omoideDiff[key] = fresh[key];
        hasOmoide = true;
      } else {
        charDiff[key] = fresh[key];
        hasChar = true;
      }
    }
    if (hasOmoide && omoideDiff.omoide_template != null) omoideDiff.omoide = null;
    if (hasChar) state.reviseData[id] = charDiff;
    else delete state.reviseData[id];
    if (hasOmoide) state.omoideReviseData[id] = omoideDiff;
    else delete state.omoideReviseData[id];
  }
  // refresh masouReviseData：用无 prev 的 computeDiff、清掉 null 撤回标记。
  // chara_id / chara_name 作 metadata 写进 entry（同 saveEdit 时的格式）、与 server 端
  // _hasRealContent 豁免列表保持一致。
  for (const mid of masouIds) {
    const m = state.allMasou.find((x) => x.id === mid);
    if (!m) continue;
    const orig = state.masouOriginalData[mid];
    if (!orig) continue;
    const fresh = computeDiff(orig, m);
    const meaningful = Object.keys(fresh).some(
      (k) => k !== 'id' && k !== 'name' && k !== 'chara_id' && k !== 'chara_name',
    );
    if (meaningful) {
      state.masouReviseData[mid] = Object.assign(
        { id: mid, name: m.name, chara_id: m.chara_id, chara_name: m.chara_name },
        fresh,
      );
    } else {
      delete state.masouReviseData[mid];
    }
  }
  state.sessionReviseIds.clear();
  state.masouSessionReviseIds.clear();
  return json;
};

// ===== saveRevise UI wrapping helper =====
// 4 个 viewer 共享的 btn/status/toast/error 处理。viewer 把核心 async function 传进来。

/**
 * 包装 saveRevise 的 UI flow：disable btn → 跑 coreFn → success toast / error message → updateReviseBar
 *
 * @param {function} coreFn — async () => json
 * @param {function} updateReviseBar — () => void
 * @returns {Promise<void>}
 */
export const wrapSaveReviseUi = async (coreFn, updateReviseBar) => {
  const btn = document.querySelector('.btn-revise-save');
  const status = document.getElementById('revise-status');
  btn.textContent = '保存中...';
  btn.disabled = true;
  try {
    const json = await coreFn();
    if (json.mode === 'remote') {
      showSaveToast('✓ 提案受付完了 — 管理者の審査・マージ後に反映されます');
      status.textContent = '';
    } else {
      status.textContent = '✓ 保存完了';
    }
  } catch (err) {
    status.textContent = '保存失敗';
    console.error(err);
  } finally {
    btn.disabled = false;
    updateReviseBar();
  }
};
