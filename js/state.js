// ===== Page-level mutable state =====
// Imported by all characters-page modules.
// Functions mutate properties on these objects; the bindings themselves never change.

export const state = {
  // data
  allChars: [],
  filteredChars: [],
  selectedId: null,
  activeState: {}, // { charId: stateLabel }
  sortKey: '',
  sortDesc: true,
  SENZAI_TABLE: {},
  omoideTemplates: [],
  // 魔装: 从 data/masou.json 派生。已按 chara_id → masou[] 分好组。
  // 编辑会话中的改动用 state.editData.masou_added / masou_deleted_ids 追踪。
  allMasou: [], // 平の masou 配列（masou.json + extra + revise 適用後）
  masouOriginalData: {}, // masou_id → snapshot of (base + extra)、computeDiff baseline
  masouByChara: {}, // {chara_id: [masou objects]}
  masouReviseData: {}, // masou_id → patch object
  masouSessionReviseIds: new Set(), // 当前会话で触れた masou_id（revise 提出時の session_ids）
  filterSets: {
    rarity: new Set(),
    element: new Set(),
    weapon: new Set(),
    state: new Set(),
    tags: new Set(),
    omoideRarity: new Set(),
  },

  // filter panel
  _filtersOpenScrollY: null,

  // edit mode (加 editingId 当前编辑中 chara base_id)
  editingId: null,
  editData: null,
  reviseData: {},
  omoideReviseData: {},
  sessionReviseIds: new Set(),
  originalData: {},

  // latent selector
  _lcsOpen: null,

  // sticky header
  _stickyResizeObserver: null,
  _stickyMeasureRAF: null,

  // 仅本地: data/characters_check.json 存在时启用逐项 check 标记 (跟 soul 同一套)
  charaCheckEnabled: false,
  charaCheck: new Set(),
};
