// js/masou.js — 魔装 (masou) view modal、chara detail page 用。
// Phase 7 Session 4 重构: 删全部旧 wiki edit-mode 代码 (renderMasouEditSection /
// _renderMasouEditCard / _renderMasouEffectEdit / toggleMasouBunrui)、edit pipeline
// 走 chara-edit.js masou_overrides modal、跟此文件解耦。

import { state } from './state.js';
import { escHtml, min } from './utils.js';

// ===== view modal =====
export const openMasouModal = (charaId) => {
  const list = state.masouByChara[charaId] || [];
  const body = document.getElementById('masou-body');
  if (!body) return;
  body.innerHTML = list.length
    ? list.map(_renderMasouCard).join('')
    : '<div class="no-results">魔装データなし</div>';
  document.getElementById('masou-modal').style.display = 'flex';
};
export const closeMasouModal = () => {
  const m = document.getElementById('masou-modal');
  if (m) m.style.display = 'none';
};

// v2 shape (parameter / math_type / value / value_scaling / effect_text)、跟 master 直读
const _renderEffectRow = (e) => {
  const param = escHtml(e.parameter || '');
  const math = e.math_type ? `<span class="masou-eff-math">[${escHtml(e.math_type)}]</span>` : '';
  const val = e.value != null ? e.value : '';
  const scaling = e.value_scaling != null && e.value_scaling !== 0
    ? `<span class="masou-eff-scaling">+${e.value_scaling}/熟度</span>`
    : '';
  return `<div class="masou-eff-row">
    ${e.effect_text ? `<span class="masou-eff-text">${escHtml(e.effect_text)}</span>` : ''}
    <span class="masou-eff-param">${param}</span> ${math}
    <span class="masou-eff-value">value=${val}</span>
    ${scaling}
  </div>`;
};

const _renderMasouCard = (m) => min`
  <div class="skill-card masou-card">
    <img class="masou-img" loading="lazy" src="../icons/masou/${m.id}.png"
         onerror="this.style.visibility='hidden'" alt="">
    <div class="masou-body">
      <div class="skill-name-row">
        <span class="skill-name">${escHtml(m.name || '')}</span>
        <span style="font-size:11px;color:var(--text2)">id=${m.id}</span>
      </div>
      <div class="masou-effects">
        ${(m.effects || []).map(_renderEffectRow).join('') || '<div class="om-empty">(effect なし)</div>'}
      </div>
    </div>
  </div>`;
