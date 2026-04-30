// ===== CRYSTAL SPEC (shared) =====
(function (root) {
  function _crystalElement(c) {
    var e = (c.effects || []).find(function (e) {
      return (e.scope === 2 || e.scope === 3) && e.element != null;
    });
    return e ? e.element : 0;
  }
  function _crystalWeapon(c) {
    var e = (c.effects || []).find(function (e) {
      return (e.scope === 2 || e.scope === 3) && e.type != null;
    });
    return e ? e.type : 0;
  }
  function _crystalScope(c) {
    return ((c.effects || [])[0] || {}).scope || 0;
  }

  root.CRYSTAL_SPEC = {
    searchFields: ['name'],
    filters: {
      rarity:    { extract: function (c) { return c.rarity; } },
      element:   { extract: _crystalElement },
      weapon: { extract: _crystalWeapon },
      scope:     { extract: _crystalScope },
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

  // expose helpers
  root.CRYSTAL_SPEC._element = _crystalElement;
  root.CRYSTAL_SPEC._weapon  = _crystalWeapon;
  root.CRYSTAL_SPEC._scope   = _crystalScope;
})(typeof window !== 'undefined' ? window : this);
