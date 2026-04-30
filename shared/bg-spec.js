// ===== BLADEGRAPH SPEC (shared) =====
(function (root) {
  function _cardElement(c) {
    var e = (c.effects || []).find(function (e) {
      return e.scope === 3 && e.element != null;
    });
    return e ? e.element : 0;
  }
  function _cardWeapon(c) {
    var e = (c.effects || []).find(function (e) {
      return e.scope === 3 && e.type != null;
    });
    return e ? e.type : 0;
  }

  root.BG_SPEC = {
    searchFields: ['name'],
    filters: {
      rarity:  { extract: function (c) { return c.rarity; } },
      element: { extract: _cardElement },
      weapon:  { extract: _cardWeapon },
      bunrui: {
        match: function (c, set) {
          var arr = Array.from(set);
          return arr.some(function (v) {
            return (c.effects || []).some(function (e) {
              return (e.bunrui || []).indexOf(v) >= 0;
            });
          });
        },
      },
      scope: {
        match: function (c, set) {
          var arr = Array.from(set);
          return arr.some(function (v) {
            return (c.effects || []).some(function (e) { return e.scope === v; });
          });
        },
      },
      condition: {
        match: function (c, set) {
          var arr = Array.from(set);
          return arr.some(function (v) {
            return (c.effects || []).some(function (e) { return e.condition === v; });
          });
        },
      },
    },
    sortFns: {
      'rarity': function (c) { return c.rarity || 0; },
      'id':     function (c) { return c.id || 0; },
    },
  };

  root.BG_SPEC._element = _cardElement;
  root.BG_SPEC._weapon  = _cardWeapon;
})(typeof window !== 'undefined' ? window : this);
