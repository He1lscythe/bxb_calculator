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
};
