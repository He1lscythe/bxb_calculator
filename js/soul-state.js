// js/soul-state.js — soul.html 的可变状态单例
export const state = {
  allSouls:        [],
  filteredSouls:   [],
  selectedId:      null,
  sortDesc:        true,
  reviseData:      {},
  sessionReviseIds: new Set(),
  originalData:    {},
  editData:        null,
  filterSets:      { rarity: new Set(), element: new Set(), type: new Set() },
  _filtersOpenScrollY: null,
  // 本地用：data/soul_check.json 存在时启用 per-item check 标记
  soulCheckEnabled: false,
  soulCheck:        new Set(),
};
