// ===== Chara Spec =====
// Usage: import { CHARA_SPEC } from '../shared/chara-spec.js';

const _bestState = c => {
  if (!c?.states) return null;
  for (const s of ['極弐', '改造', '通常'])
    if (c.states[s]) return c.states[s];
  return null;
};

const _bestStateLabel = c => {
  if (!c?.states) return null;
  for (const s of ['極弐', '改造', '通常'])
    if (c.states[s]) return s;
  return null;
};

const _basicInfo = (c, key) => {
  const st = _bestState(c);
  return st?.basic_info?.[key] ?? null;
};

const _statMax = (c, key) => {
  const st = _bestState(c);
  return st?.stats?.max?.[key] ?? null;
};

const _profile = (c, key) => {
  const st = _bestState(c);
  return st?.profile?.[key] ?? null;
};

const _selfApplies = (c, e) => {
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
};

export const maxHit = c => {
  const state = _bestState(c);
  if (!state) return null;
  const base = state.basic_info?.['Hit数'];
  if (!Array.isArray(base) || !base.length) return null;
  const N = base.length;
  const stages = base.slice(0, N).map(v => v || 0);
  for (const sk of state.skills || []) {
    for (const e of sk.effects || []) {
      if (!(e.bunrui || []).includes(7)) continue;
      if (!_selfApplies(c, e)) continue;
      const hps = e.hit_per_stage || [], sca = e.hit_per_stage_scaling || [];
      const ht  = e.hit_type ?? 0;
      for (let k = 0; k < N; k++) {
        const delta = (hps[k] || 0) + 5 * (sca[k] || 0);
        if      (ht === 3) { if (hps[k]) stages[k] = hps[k]; }
        else if (ht === 2) { if (hps[k]) stages[k] = Math.floor(stages[k] * hps[k]); }
        else               { stages[k] += delta; }
      }
    }
  }
  return stages.reduce((a, b) => a + b, 0);
};

export const maxBdhit = c => {
  if (c.bd_skill?.bdhit == null) return null;
  let adders = 0, mults = 1;
  const state = _bestState(c);
  for (const sk of state?.skills || []) {
    for (const e of sk.effects || []) {
      if (!(e.bunrui || []).includes(21)) continue;
      if (!_selfApplies(c, e)) continue;
      const maxB = (e.bairitu || 0) + 98 * (e.bairitu_scaling || 0);
      if (e.calc_type === 1) adders += maxB;
      else                   mults  *= maxB;
    }
  }
  return Math.floor((c.bd_skill.bdhit + adders) * mults);
};

export const CHARA_SPEC = {
  searchFields: ['name'],
  filters: {
    rarity:       { extract: c => c.rarity },
    element:      { extract: c => c.element },
    type:         { extract: c => c.type },
    omoideRarity: { extract: c => c.omoide_rarity },
    state:        { op: 'any', extract: c => Object.keys(c.states || {}) },
    bdSpecial:    { op: 'any', extract: c => c.bd_skill?.special || [] },
  },
  sortFns: {
    '攻撃力':      c => _statMax(c, '攻撃力'),
    '防御力':      c => _statMax(c, '防御力'),
    'ブレイク力':  c => _statMax(c, 'ブレイク力'),
    'HP':          c => _statMax(c, 'HP'),
    'LP':          c => _basicInfo(c, 'LP'),
    '保有魔力':    c => _basicInfo(c, '保有魔力'),
    '結晶スロット': c => { const raw = _basicInfo(c, '結晶スロット'); return raw != null ? Number(raw) || null : null; },
    'B':           c => _profile(c, 'B'),
    'W':           c => _profile(c, 'W'),
    'H':           c => _profile(c, 'H'),
    'BDコスト':    c => c.bd_skill?.cost ?? null,
    '__hit_max':   maxHit,
    '__bdhit_max': maxBdhit,
  },
  _bestState,
  _bestStateLabel,
  maxHit,
  maxBdhit,
};
