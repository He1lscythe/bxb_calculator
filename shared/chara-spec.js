// ===== CHARA SPEC (shared) =====
// Filter / sort declarations for 魔剣 (characters.json).

(function (root) {
  function _bestState(c) {
    if (!c || !c.states) return null;
    const states = ['極弐', '改造', '通常'];
    for (let i = 0; i < states.length; i++) {
      if (c.states[states[i]]) return c.states[states[i]];
    }
    return null;
  }
  function _bestStateLabel(c) {
    if (!c || !c.states) return null;
    const states = ['極弐', '改造', '通常'];
    for (let i = 0; i < states.length; i++) {
      if (c.states[states[i]]) return states[i];
    }
    return null;
  }
  function _basicInfo(c, key) {
    const st = _bestState(c);
    if (!st || !st.basic_info) return null;
    return st.basic_info[key];
  }
  function _statMax(c, key) {
    const st = _bestState(c);
    return st && st.stats && st.stats.max ? st.stats.max[key] : null;
  }
  function _profile(c, key) {
    const st = _bestState(c);
    return st && st.profile ? st.profile[key] : null;
  }
  function _selfApplies(c, e) {
    const sc = e.scope;
    if (sc === 0 || sc === 1) return true;
    if (sc === 2 || sc === 3) {
      const elem = e.element;
      const elemOK = elem == null ||
        (Array.isArray(elem) ? elem.indexOf(c.element) >= 0 : elem === c.element);
      const tp = e.type;
      const typeOK = tp == null ||
        (Array.isArray(tp) ? tp.indexOf(c.type) >= 0 : tp === c.type);
      return elemOK && typeOK;
    }
    return false;
  }

  function maxHit(c) {
    const state = _bestState(c);
    if (!state) return null;
    const base = state.basic_info && state.basic_info['Hit数'];
    if (!Array.isArray(base) || !base.length) return null;
    const N = base.length;
    const stages = base.slice(0, N).map(function (v) { return v || 0; });
    const skills = state.skills || [];
    for (let i = 0; i < skills.length; i++) {
      const sk = skills[i];
      const effs = sk.effects || [];
      for (let j = 0; j < effs.length; j++) {
        const e = effs[j];
        if (!(e.bunrui || []).includes(7)) continue;
        if (!_selfApplies(c, e)) continue;
        const hps = e.hit_per_stage || [];
        const sca = e.hit_per_stage_scaling || [];
        const ht = e.hit_type != null ? e.hit_type : 0;
        for (let k = 0; k < N; k++) {
          const hpsK = hps[k] || 0, scaK = sca[k] || 0;
          const delta = hpsK + 5 * scaK;
          if (ht === 3) {
            if (hpsK) stages[k] = hpsK;
          } else if (ht === 2) {
            if (hpsK) stages[k] = Math.floor(stages[k] * hpsK);
          } else {
            stages[k] += delta;
          }
        }
      }
    }
    return stages.reduce(function (a, b) { return a + b; }, 0);
  }

  function maxBdhit(c) {
    if (!c.bd_skill || c.bd_skill.bdhit == null) return null;
    const bdhit = c.bd_skill.bdhit;
    const adders = 0, mults = 1;
    const state = _bestState(c);
    if (state) {
      const skills = state.skills || [];
      for (let i = 0; i < skills.length; i++) {
        const sk = skills[i];
        const effs = sk.effects || [];
        for (let j = 0; j < effs.length; j++) {
          const e = effs[j];
          if (!(e.bunrui || []).includes(21)) continue;
          if (!_selfApplies(c, e)) continue;
          const b = e.bairitu || 0;
          const sc = e.bairitu_scaling || 0;
          const maxB = b + 98 * sc;
          if (e.calc_type === 1) adders += maxB;
          else                   mults  *= maxB;
        }
      }
    }
    return Math.floor((bdhit + adders) * mults);
  }

  root.CHARA_SPEC = {
    searchFields: ['name'],
    filters: {
      rarity:        { extract: function (c) { return c.rarity; } },
      element:       { extract: function (c) { return c.element; } },
      type:          { extract: function (c) { return c.type; } },
      omoideRarity:  { extract: function (c) { return c.omoide_rarity; } },
      state: {
        op: 'any',
        extract: function (c) { return Object.keys(c.states || {}); },
      },
      bdSpecial: {
        op: 'any',
        extract: function (c) { return (c.bd_skill && c.bd_skill.special) || []; },
      },
    },
    sortFns: {
      '攻撃力':      function (c) { return _statMax(c, '攻撃力'); },
      '防御力':      function (c) { return _statMax(c, '防御力'); },
      'ブレイク力':  function (c) { return _statMax(c, 'ブレイク力'); },
      'HP':          function (c) { return _statMax(c, 'HP'); },
      'LP':          function (c) { return _basicInfo(c, 'LP'); },
      '保有魔力':    function (c) { return _basicInfo(c, '保有魔力'); },
      '結晶スロット': function (c) {
        const raw = _basicInfo(c, '結晶スロット');
        return raw != null ? Number(raw) || null : null;
      },
      'B':           function (c) { return _profile(c, 'B'); },
      'W':           function (c) { return _profile(c, 'W'); },
      'H':           function (c) { return _profile(c, 'H'); },
      'BDコスト':    function (c) { return c.bd_skill && c.bd_skill.cost; },
      '__hit_max':   maxHit,
      '__bdhit_max': maxBdhit,
    },
  };

  // Expose helpers
  root.CHARA_SPEC._bestState      = _bestState;
  root.CHARA_SPEC._bestStateLabel = _bestStateLabel;
  root.CHARA_SPEC.maxHit          = maxHit;
  root.CHARA_SPEC.maxBdhit        = maxBdhit;
})(typeof window !== 'undefined' ? window : this);
