// ===== Effect scope constraints =====
// scope ∈ {0, 1} → element/type 必须为空（自身/セット全体，无属性武器限制）。
//
// 用途：base + revise 合并后，server 把 revise 里的 null 撤回标记 pop 掉了，
// 但 base 上的 element/type 字段仍然存在 — 合并后会出现「scope=0 + element=1」
// 的不一致状态。加载时扫一遍强制清理，保证 editData / display 都符合约束。
//
// Usage:
//   import { enforceScopeConstraints } from '../shared/effect-constraints.js';
//   enforceScopeConstraints(state.allBG);
//   enforceScopeConstraints(state.allCrystals);

export const enforceScopeConstraints = (entries) => {
  if (!Array.isArray(entries)) return;
  for (const item of entries) {
    if (!Array.isArray(item?.effects)) continue;
    for (const e of item.effects) {
      if (e && (e.scope === 0 || e.scope === 1)) {
        delete e.element;
        delete e.weapon;
      }
    }
  }
};
