// js/cr-state.js
export const state = {
  allCrystals: [], filteredCrystals: [], reviseData: {}, sessionReviseIds: new Set(),
  originalData: {}, expandedIds: new Set(),
  editingId: null, editData: null,
  _filtersOpenScrollY: null,
  filterSets: { rarity: new Set(), bunrui: new Set(), element: new Set(),
               weapon: new Set(), scope: new Set(), condition: new Set() },
};
