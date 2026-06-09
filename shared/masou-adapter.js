// shared/masou-adapter.js — masou.json + masou_revise.json → final shape
//
// Phase 7 Session 2: v2 masou.json schema 已是 raw shape (跟 wiki main 几乎一致)、
// 不做 schema 转换、仅 deepApply revise patch (effects[].value_scaling 等)
//
// masou_revise key 是 weapon_costumes.id (7 位)、独立 masou_session_ids namespace

import { deepApply } from './revise-core.js';

export function adaptMasouList(arr, revise = []) {
  if (!Array.isArray(arr)) return [];
  const reviseById = new Map();
  for (const r of (revise || [])) {
    if (r && r.id != null) reviseById.set(r.id, r);
  }
  return arr.map((m) => {
    const patch = reviseById.get(m.id);
    if (!patch) return m;
    const cloned = JSON.parse(JSON.stringify(m));
    deepApply(cloned, patch);
    return cloned;
  });
}
