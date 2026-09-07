// js/cr-sim.js — 結晶の倍率シミュレータ modal
// Lv / 重量 / 純度 / 残HP を動かして「その結晶が今いくらか」を見る。
// 計算は shared/hensei-helpers.crystalEffectiveValue + parameter-class.conditionFactor
// をそのまま呼ぶ (hensei と同一の式、ここで再実装はしない)。
import { state } from './cr-state.js';
import { escHtml, fmtLarge } from './utils.js';
import {
  crystalEffectiveValue,
  crystalDimAvailability,
  crystalSliderStep,
  cryLvMax,
} from '../shared/hensei-helpers.js';
import { conditionFactor } from '../shared/parameter-class.js';

let _cfg = null;   // { id, lv, weight, purity, hp }

const _cr = () => state.allCrystals.find((x) => x.id === _cfg?.id);

// 残HP が倍率に効くのは Vitality_* / RemHP_* / Break_* 系だけ
const _hpParam = (m) => {
  const p = m?.parameter || '';
  if (p.startsWith('Vitality_')) return 'HP 多いほど強い';
  if (p.startsWith('RemHP_')) return '残HP 少ないほど強い';
  if (p.startsWith('Break_')) return '残HP 50% 以下で発動';
  return null;
};

const _row = (kind, label, min, max, step, value, unit) =>
  `<div class="pop-row" data-kind="${kind}">
    <label>${label}</label>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"
      oninput="this.parentNode.querySelector('input[type=number]').value=this.value;setCrSim('${kind}',this.value)">
    <input type="number" min="${min}" max="${max}" step="${step}" value="${value}"
      oninput="this.parentNode.querySelector('input[type=range]').value=this.value;setCrSim('${kind}',this.value)">
    <span class="pop-unit">${unit}</span>
  </div>`;

// 各次元の倍率 (crystalEffectiveValue の内訳を表示用に再現)
const _dimMults = (m, cfg) => {
  const lvMax = +m.max_level || 1;
  const minW = m.min_weight ?? 0;
  const maxW = m.max_weight ?? 100;
  const minP = m.min_purity ?? 0;
  const maxP = m.max_purity ?? 100;
  const f = (v) => (v == null ? 1 : v);
  return {
    L: lvMax > 1 ? 1 + (f(m.M_L_max) - 1) * ((cfg.lv - 1) / (lvMax - 1)) : 1,
    W: maxW > minW ? 1 + (f(m.M_W_max) - 1) * ((cfg.weight - minW) / (maxW - minW)) : f(m.M_W_max),
    P: maxP > minP ? 1 + (f(m.M_P_max) - 1) * ((cfg.purity - minP) / (maxP - minP)) : f(m.M_P_max),
  };
};

const _r3 = (v) => Math.round(v * 1000) / 1000;

const _renderOut = () => {
  const el = document.getElementById('cr-sim-out');
  const cr = _cr();
  if (!el || !cr) return;
  const m = cr._master || {};
  const add = cr.effects?.[0]?.calc_type === 1;      // 1 = Addition
  const pfx = add ? '+' : '×';
  const base = crystalEffectiveValue(cr, _cfg);
  const hpLabel = _hpParam(m);
  const factor = conditionFactor(m.parameter, _cfg.hp, false, false);
  const eff = add ? base * factor : 1 + (base - 1) * factor;
  const d = _dimMults(m, _cfg);

  el.innerHTML =
    `<div class="sim-line"><span>M(Lv) ${_r3(d.L)} × M(重量) ${_r3(d.W)} × M(純度) ${_r3(d.P)}` +
    ` × 初期値 ${fmtLarge(m.initial_value, 3)}</span></div>` +
    `<div class="sim-line"><span>効果値</span><b>${pfx}${fmtLarge(_r3(base), 3)}</b></div>` +
    (hpLabel
      ? `<div class="sim-line"><span>${escHtml(hpLabel)} — 条件係数 ${_r3(factor)}</span></div>` +
        `<div class="sim-line"><span>残HP 適用後</span><b>${pfx}${fmtLarge(_r3(eff), 3)}</b></div>`
      : '');
};

export const setCrSim = (kind, v) => {
  if (!_cfg) return;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return;
  _cfg[kind] = n;
  _renderOut();
};

export const openCrSim = (id) => {
  const cr = state.allCrystals.find((x) => x.id === id);
  if (!cr) return;
  const m = cr._master || {};
  const { hasW, hasP, hasLv } = crystalDimAvailability(cr);
  const lvMax = cryLvMax(cr);
  const maxW = m.max_weight ?? 100;
  const maxP = m.max_purity ?? 100;
  _cfg = { id, lv: lvMax, weight: maxW, purity: maxP, hp: 100 };

  const body = document.getElementById('cr-sim-body');
  const title = document.getElementById('cr-sim-title');
  const modal = document.getElementById('cr-sim-modal');
  if (!body || !modal) return;
  if (title) title.textContent = cr.name || '';

  const rows =
    (hasLv ? _row('lv', 'Lv', 1, lvMax, 1, lvMax, '') : '') +
    (hasW ? _row('weight', '重', m.min_weight ?? 0, maxW, crystalSliderStep(m, 'weight'), maxW, 'g') : '') +
    (hasP ? _row('purity', '純', m.min_purity ?? 0, maxP, crystalSliderStep(m, 'purity'), maxP, '%') : '') +
    _row('hp', 'HP', 0, 100, 1, 100, '%');
  const desc = m.description || '';
  body.innerHTML =
    (desc ? `<div class="sim-desc">${escHtml(desc)}</div>` : '') +
    rows +
    `<div id="cr-sim-out" class="sim-out"></div>`;
  _renderOut();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

export const closeCrSim = () => {
  const modal = document.getElementById('cr-sim-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  _cfg = null;
};
