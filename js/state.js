// ===== Page-level mutable state =====
// Imported by all characters-page modules.
// Functions mutate properties on these objects; the bindings themselves never change.

export const state = {
  // data
  allChars:        [],
  filteredChars:   [],
  selectedId:      null,
  activeState:     {},   // { charId: stateLabel }
  sortKey:         '',
  sortDesc:        true,
  SENZAI_TABLE:    {},
  omoideTemplates: [],
  // 魔装：data/masou.json から派生。chara_id → masou[] でグループ済み。
  // 編集セッション中の修正は state.editData.masou_added / masou_deleted_ids で追跡。
  allMasou:        [],     // 平の masou 配列（masou.json 原貌）
  masouByChara:    {},     // {chara_id: [masou objects]}
  masouReviseData: {},     // masou_id → patch object
  masouSessionReviseIds: new Set(),  // 当前会话で触れた masou_id（revise 提出時の session_ids）
  filterSets:      {
    rarity: new Set(), element: new Set(), type: new Set(),
    state: new Set(), bdSpecial: new Set(), omoideRarity: new Set(),
  },

  // filter panel
  _filtersOpenScrollY: null,

  // edit mode
  editData:          null,
  reviseData:        {},
  omoideReviseData:  {},
  sessionReviseIds:  new Set(),
  originalData:      {},

  // latent selector
  _lcsOpen: null,

  // sticky header
  _stickyResizeObserver: null,
  _stickyMeasureRAF:     null,
};

export const OMOIDE_KEYS = new Set(['omoide', 'omoide_template', 'omoide_rarity']);
