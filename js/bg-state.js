// js/bg-state.js
export const state = {
  allBG: [], filteredBG: [], reviseData: {}, sessionReviseIds: new Set(),
  originalData: {}, expandedIds: new Set(),
  editingId: null, editData: null,
  _filtersOpenScrollY: null,
  filterSets: { rarity: new Set(), element: new Set(), weapon: new Set(),
               bunrui: new Set(), scope: new Set(), condition: new Set() },
};
