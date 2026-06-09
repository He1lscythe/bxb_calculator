// shared/revise-core.js — Sparse Diff Engine for v2 revise system
//
// Phase 7 Session 1: 从零写、不抄 wiki main (旧 shared/save-edit-base.js 已删)。
// 算法借鉴 wiki main 三参 computeDiff + 撤回机制 + sparse array dict 编码、按 v2 schema 重写。
//
// 公开 API:
//   computeDiff(original, modified, prevRevise = null) — 返 sparse patch (null = tombstone / clear field)
//   deepApply(target, patch)                          — patch 修改 target、null 值删 key
//   pickPatches(reviseBucket, ids)                    — 按 sessionReviseIds 过滤 (提交时用)
//   isPlainObject(v)                                  — utility
//
// Sparse array dict 编码: 数组用 `{ "5": { ... } }` 代替完整数组 (省带宽)、deepApply 自动还原
// null 当 tombstone: deepApply 时删 key、computeDiff 时表示用户清字段 / 撤回

// ============================================================
// utility
// ============================================================
export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 数字 key 全是非负整数 → 视为 sparse array dict (用 deepApply 还原数组)
function _isArrayDict(o) {
  if (!isPlainObject(o)) return false;
  const keys = Object.keys(o);
  if (!keys.length) return false;
  return keys.every((k) => /^\d+$/.test(k));
}

// ============================================================
// computeDiff — 三参版含撤回逻辑
// ============================================================
// 输入:
//   original — view-only 显示的原值 (master + 上次提交 revise 合并后)
//   modified — 用户编辑后的值
//   prevRevise — 上次 sessionRevise 状态 (用来检测「撤回」: 用户改回原值时 emit null 清除字段)
//
// 输出: sparse patch
//   {} (空对象) — 完全无变化
//   { field: value } — 字段被改成 value
//   { field: null } — 字段被撤回/清除 (deepMerge 时删 key)
//   { field: { 0: {...}, 3: null } } — sparse array (第 0 项改、第 3 项 tombstone)
//
// 撤回规则:
//   - modified === original && prevRevise 内有此字段 → emit null (清掉 prev)
//   - modified === original && prevRevise 内无此字段 → 不 emit (无变化)
//   - modified !== original → emit modified
export function computeDiff(original, modified, prevRevise = null) {
  return _deepDiff(original, modified, prevRevise);
}

function _deepDiff(orig, mod, prev) {
  // null/undefined 处理
  const oNull = orig == null;
  const mNull = mod == null;
  const pNull = prev == null;

  // 都 nullish: 无变化
  if (oNull && mNull) {
    // 但如果 prev 有值、说明用户撤回 → emit null 清除
    if (!pNull) return null;
    return undefined;  // sentinel: 无 diff
  }

  // mod nullish (orig 有值): 用户清掉了字段
  if (mNull) return null;

  // 数组: 用 sparse dict 编码
  if (Array.isArray(orig) || Array.isArray(mod)) {
    const oArr = Array.isArray(orig) ? orig : [];
    const mArr = Array.isArray(mod) ? mod : [];
    const pArr = Array.isArray(prev) ? prev : (isPlainObject(prev) ? prev : {});
    // 整数组替换的简单 case: 如果 length 变了或元素不全是 plain object、直接 emit 整数组
    // 但 wiki main 用 sparse dict 省带宽、我们跟随
    const sparse = {};
    const maxLen = Math.max(oArr.length, mArr.length);
    let hasChange = false;
    for (let i = 0; i < maxLen; i++) {
      const d = _deepDiff(
        i < oArr.length ? oArr[i] : null,
        i < mArr.length ? mArr[i] : null,
        Array.isArray(pArr) ? (i < pArr.length ? pArr[i] : null) : pArr[i],
      );
      if (d === undefined) continue;   // 无 diff、跳过
      sparse[i] = d;
      hasChange = true;
    }
    if (!hasChange) {
      // 数组完全相同、但 prev 内还有 sparse 修改 → 全 emit null 撤回
      if (isPlainObject(prev) || Array.isArray(prev)) {
        const pKeys = Array.isArray(prev) ? prev.map((_, i) => i) : Object.keys(prev);
        if (pKeys.length) {
          const revoke = {};
          for (const k of pKeys) revoke[k] = null;
          return revoke;
        }
      }
      return undefined;
    }
    return sparse;
  }

  // 标量 / 字符串 / 数字 / boolean
  if (!isPlainObject(orig) && !isPlainObject(mod)) {
    // 都是标量、直接比较
    if (orig === mod) {
      // 相等、检查 prev 是否有不同值需要撤回
      if (!pNull && prev !== orig) return null;   // 撤回
      return undefined;
    }
    return mod;
  }

  // plain object 递归
  const oObj = isPlainObject(orig) ? orig : {};
  const mObj = isPlainObject(mod) ? mod : {};
  const pObj = isPlainObject(prev) ? prev : {};
  const allKeys = new Set([...Object.keys(oObj), ...Object.keys(mObj), ...Object.keys(pObj)]);
  const out = {};
  let hasAny = false;
  for (const k of allKeys) {
    const d = _deepDiff(oObj[k], mObj[k], pObj[k]);
    if (d === undefined) continue;
    out[k] = d;
    hasAny = true;
  }
  return hasAny ? out : undefined;
}

// ============================================================
// deepApply — 用 patch 修改 target (in-place)
// ============================================================
// null 值 → 删 key (tombstone)
// sparse array dict ({ "0": ..., "3": null }) 自动应用到目标数组对应 index
// 返回修改后的 target (方便链式)
export function deepApply(target, patch) {
  if (!isPlainObject(patch)) return target;
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === null) {
      // tombstone: 删 key (数组也允许、用 splice 不太合理、保留 dict pattern: 数组项设 null 让上层判定)
      if (Array.isArray(target)) {
        target[+k] = null;
      } else {
        delete target[k];
      }
      continue;
    }
    if (isPlainObject(v) && _isArrayDict(v) && Array.isArray(target[k])) {
      // sparse array 应用到数组 (覆盖某些 index)
      for (const idx of Object.keys(v)) {
        const i = +idx;
        const subPatch = v[idx];
        if (subPatch === null) {
          target[k][i] = null;
        } else if (isPlainObject(subPatch) && isPlainObject(target[k][i])) {
          deepApply(target[k][i], subPatch);
        } else {
          target[k][i] = subPatch;
        }
      }
    } else if (isPlainObject(v) && isPlainObject(target[k])) {
      deepApply(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

// ============================================================
// pickPatches — 按 sessionReviseIds 过滤 revise bucket
// ============================================================
// reviseBucket: Array<{ id, name?, ...patch }>
// ids: Iterable<number> (Set 或 array)
// 返回只含 id ∈ ids 的 entries (提交时拿来当 POST body 的 bucket payload)
export function pickPatches(reviseBucket, ids) {
  if (!Array.isArray(reviseBucket)) return [];
  const idSet = new Set(Array.isArray(ids) ? ids : [...ids]);
  return reviseBucket.filter((entry) => entry && idSet.has(entry.id));
}

// ============================================================
// getPath / setPath — 路径访问 (跟 wiki main 同 utility、供 UI inline 用)
// ============================================================
// 用 'a.b.c' / 'a.b.0' 路径取/设深层字段
export function getPath(obj, path) {
  if (obj == null || !path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function setPath(obj, path, value) {
  if (obj == null || !path) return;
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || (typeof cur[p] !== 'object')) {
      // 下一段是数字 → 建 array、否则建 object
      cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

// ============================================================
// mergeRevise — 应用 revise bucket 到 master 数组、产 final 数据
// ============================================================
// masterArr: Array<{id, ...}> (例 chara list、各 chara wiki shape)
// reviseBucket: Array<{id, ...patch}>
// returns: 新数组、不修改 master (clone + apply、跟 wiki main pattern 一致)
export function mergeRevise(masterArr, reviseBucket) {
  if (!Array.isArray(masterArr)) return [];
  if (!Array.isArray(reviseBucket) || !reviseBucket.length) return masterArr;
  const reviseById = new Map();
  for (const r of reviseBucket) {
    if (r && r.id != null) reviseById.set(r.id, r);
  }
  return masterArr.map((m) => {
    const r = reviseById.get(m.id);
    if (!r) return m;
    return deepApply(JSON.parse(JSON.stringify(m)), r);
  });
}
