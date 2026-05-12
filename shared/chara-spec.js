// ===== Chara Spec =====
// Usage: import { CHARA_SPEC } from '../shared/chara-spec.js';

// hit_per_stage / scaling 値の数値化（分数字列 "1/3" 含む受け入れ、無効値は 0）
const _parseHit = (s) => {
  if (s == null) return 0;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  const t = String(s).trim();
  if (t === '') return 0;
  if (t.includes('/')) {
    const [n, d] = t.split('/').map(parseFloat);
    return (Number.isFinite(n) && Number.isFinite(d) && d !== 0) ? n / d : 0;
  }
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : 0;
};

// rarity ごとの「（改造/極弐含む）到達可能な最高熟度」。SS=99 / A=90 / B=70 / C=50
const _RARITY_MAX_JK = { 1: 50, 2: 70, 3: 90, 4: 99 };

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
    const tp = e.weapon;
    const typeOK = tp == null ||
      (Array.isArray(tp) ? tp.indexOf(c.weapon) >= 0 : tp === c.weapon);
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
      // 分母は chara rarity 由来の最高到達熟度 - 1。state に依らず最大値で評価。
      const denom = (_RARITY_MAX_JK[c.rarity] ?? 99) - 1;
      for (let k = 0; k < N; k++) {
        const baseHit = _parseHit(hps[k]);
        const delta   = baseHit + denom * _parseHit(sca[k]);
        if      (ht === 3) { if (baseHit) stages[k] = baseHit; }
        else if (ht === 2) { if (baseHit) stages[k] = Math.floor(stages[k] * baseHit); }
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
      // BD effect は name に Lv2-5 を含まないので b + jk*s 公式（jk_max 倍）。
      // bairitu / bairitu_scaling 双方とも数値 / 分式文字列を _parseHit で解釈。
      const denomBd = (_RARITY_MAX_JK[c.rarity] ?? 99);
      const maxB = _parseHit(e.bairitu) + denomBd * _parseHit(e.bairitu_scaling);
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
    weapon:         { extract: c => c.weapon },
    omoideRarity: { extract: c => c.omoide_rarity },
    state:        { op: 'any', extract: c => Object.keys(c.states || {}) },
    tags:         { op: 'all', extract: c => c.tags || [] },
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
