// shared/revise-core.js — Sparse Diff Engine for revise system
//
// 从零写、不抄 wiki main (旧 shared/save-edit-base.js 已删)。
// 算法借鉴 wiki main 三参 computeDiff + 撤回机制、按 master schema 重写。
//
// 公开 API:
//   computeDiff(original, modified, prevRevise = null) — 返 sparse patch (null = tombstone / clear field)
//   deepApply(target, patch)                          — patch 修改 target、null 值删 key
//   pickPatches(reviseBucket, ids)                    — 按 sessionReviseIds 过滤 (提交时用)
//   isPlainObject(v)                                  — utility
//
// 数组编码 (2026-06-19 替换旧 index 稀疏):
//   带 id 的对象数组 (weapon_skills / soul.skills) → id-keyed dict `{ "<id>": {...} }` 局部 patch
//     (robust 到重排/增删、deepApply 按 element.id 匹配;找不到 id 则跳过)
//   标量数组 (tags) / 无 id 对象数组 (masou effects) → 整组替换 (patch 直接是整个数组)
// null 当 tombstone: deepApply 时删 key、computeDiff 时表示用户清字段 / 撤回

// ============================================================
// utility
// ============================================================
export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 全元素是 plain object 且都有 `id` → 用 id 做稳定 key 的对象数组 (weapon_skills / soul.skills)。
// revise patch 对这类数组按 id 局部 patch (robust 到重排/增删);其余数组 (标量 tags / 无 id
// 对象数组如 masou effects) 整组替换。2026-06-19 用户决策:彻底替换旧的 index 稀疏编码。
function _isObjIdArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every((e) => isPlainObject(e) && e.id != null);
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
//   { field: { "<id>": {...}, "<id>": null } } — id-keyed 对象数组局部 patch (按 id、null=撤回)
//   { field: [...] } — 标量/无 id 数组整组替换
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

  // 数组
  if (Array.isArray(orig) || Array.isArray(mod)) {
    const oArr = Array.isArray(orig) ? orig : [];
    const mArr = Array.isArray(mod) ? mod : [];
    // (a) 带 id 的对象数组 (weapon_skills / soul.skills) → 按 id 局部 diff、key=id (robust 到重排)
    if (_isObjIdArray(oArr) && _isObjIdArray(mArr)) {
      const oById = new Map(oArr.map((e) => [String(e.id), e]));
      const mById = new Map(mArr.map((e) => [String(e.id), e]));
      const pById = isPlainObject(prev) ? prev : {};
      const out = {};
      let hasChange = false;
      for (const id of new Set([...oById.keys(), ...mById.keys()])) {
        const d = _deepDiff(oById.get(id) ?? null, mById.get(id) ?? null, pById[id]);
        if (d === undefined) continue;
        out[id] = d;
        hasChange = true;
      }
      if (!hasChange) {
        // 整组无变化、但 prev 内还有残留 → 逐 id 撤回
        if (isPlainObject(prev) && Object.keys(prev).length) {
          const revoke = {};
          for (const id of Object.keys(prev)) revoke[id] = null;
          return revoke;
        }
        return undefined;
      }
      return out;
    }
    // (b) 标量数组 (tags) / 无 id 对象数组 (masou effects) → 整组替换
    if (JSON.stringify(oArr) === JSON.stringify(mArr)) {
      if (prev != null) return null; // 改回原值、撤回 prev
      return undefined;
    }
    return mArr;
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
// id-keyed 对象数组 patch ({ "<id>": {...} }) 按 element.id 匹配应用;Array 值 = 整组替换
// 返回修改后的 target (方便链式)
export function deepApply(target, patch) {
  if (!isPlainObject(patch)) return target;
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === null) {
      delete target[k]; // tombstone: 删 key (撤回)
    } else if (Array.isArray(v)) {
      target[k] = v; // 整组替换 (标量数组 / 无 id 对象数组)
    } else if (isPlainObject(v) && _isObjIdArray(target[k])) {
      // 按 id 局部 patch 到对象数组 (key=id、robust 到重排;找不到该 id → 跳过)
      for (const id of Object.keys(v)) {
        const sub = v[id];
        if (sub === null) continue; // 撤回 tombstone (save 已 prune;此处当作无 patch 跳过)
        const el = target[k].find((e) => String(e.id) === id);
        if (el && isPlainObject(sub)) deepApply(el, sub);
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
