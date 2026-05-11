// js/bg-state.js
export const state = {
  allBG: [], filteredBG: [], reviseData: {}, sessionReviseIds: new Set(),
  originalData: {}, expandedIds: new Set(),
  editingId: null, editData: null,
  _filtersOpenScrollY: null,
  filterSets: { rarity: new Set(), element: new Set(), weapon: new Set(),
               bunrui: new Set(), scope: new Set(), condition: new Set() },
  // 本地用：data/bladegraph_check.json 存在時に per-item check 標記を有効化
  bgCheckEnabled: false,
  bgCheck:        new Set(),
};
