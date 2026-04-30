// ===== SOUL SPEC (shared) =====
(function (root) {
  root.SOUL_SPEC = {
    searchFields: ['name', 'kana'],
    filters: {
      rarity: { extract: function (s) { return s.rarity || 0; } },
      // element / type are arrays on souls (適性 from element_affinity / weapon_affinity)
      element: { op: 'any', extract: function (s) { return s.element || []; } },
      type:    { op: 'any', extract: function (s) { return s.type || []; } },
    },
    sortFns: {
      'id':     function (s) { return s.id || 0; },
      'rarity': function (s) { return s.rarity || 0; },
    },
  };
})(typeof window !== 'undefined' ? window : this);
