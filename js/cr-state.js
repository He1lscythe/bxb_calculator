// js/cr-state.js
export const state = {
  allCrystals: [],
  filteredCrystals: [],
  reviseData: {},
  sessionReviseIds: new Set(),
  originalData: {},
  expandedIds: new Set(),
  editingId: null,
  editData: null,
  _filtersOpenScrollY: null,
  filterSets: {
    rarity: new Set(),
    element: new Set(),
    weapon: new Set(),
    effect: new Set(),
    scope: new Set(),
    condition_trigger: new Set(),
  },
  // 仅本地: data/crystals_check.json 存在时启用逐项 check 标记
  crystalCheckEnabled: false,
  crystalCheck: new Set(),
};
