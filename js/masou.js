// js/masou.js — 魔装 (masou) view + edit support for characters page.
// 対応魔剣 (chara_id) ごとに data/masou.json から該当エントリを引っ張り、
// 詳細 modal とエディタ section を出す。effects schema は chara skill / soul と統一。

import { state } from './state.js';
import { ELEMENT, WEAPON, BUNRUI_SHORT, CONDITION, SCOPE,
         renderEditSelect } from '../shared/constants.js';
import { escHtml, fmtBairitu, min } from './utils.js';
// 注: edit.js の setPath / parseBairituVal は inline onchange handler から
// window.setPath / window.parseBairituVal で参照する（characters.html で expose 済み）。
// 従って静的 import 不要 — circular dep を避けるため敢えて import しない。

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

const _renderEffectTags = (e) => {
  const bnr = (e.bunrui || []).map(b => `<span class="bunrui-tag">${BUNRUI_SHORT[b] || b}</span>`).join('');
  let sc  = '';
  if (e.scope === 0) sc = '<span class="scope-tag scope-self">自</span>';
  else if (e.scope === 1) sc = '<span class="scope-tag scope-all">全</span>';
  else if (e.scope === 2) {
    const lim = e.element != null ? (ELEMENT[e.element] || '限') : (e.type != null ? (WEAPON[e.type] || '限') : '限');
    sc = `<span class="scope-tag scope-lim">${lim}</span>`;
  }
  const cond = e.condition ? `<span class="cond-tag cond-${e.condition}">${CONDITION[e.condition] || ''}</span>` : '';
  return bnr + sc + cond;
};

const _renderMasouCard = (m) => min`
  <div class="skill-card masou-card">
    ${m.image ? `<img class="masou-img" src="${escHtml(m.image)}" onerror="this.style.display='none'" alt="">` : ''}
    <div class="masou-body">
      <div class="skill-name-row">
        <span class="skill-name">${escHtml(m.name || '')}</span>
        <div class="skill-tags-right">${(m.effects || []).map(_renderEffectTags).join('')}</div>
      </div>
      <div class="skill-effect-row">
        <span class="skill-effect">${escHtml(m.effect_text || '')}</span>
        <span class="skill-bairitu">${fmtBairitu({effects: m.effects || []})}</span>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:6px">
        入手: ${escHtml(m.acquisition || '—')}
      </div>
    </div>
  </div>`;

// ===== edit mode =====
// state.editData の中の chara には .masou_overrides (id → patch) でデータを変えていく。
// schema は単純化：masou 自体の追加・削除は今のところサポートせず、
//   - effects 配列の中身（bunrui / bairitu / scope / condition / calc_type / bairitu_scaling）
//   を編集するだけ。各 row 横に「削除」マーカーで論理削除も可能。
export const renderMasouEditSection = (chara) => {
  const list = state.masouByChara[chara.id] || [];
  if (!list.length) return '';
  const overrides = (state.editData && state.editData.masou_overrides) || {};
  const cards = list.map(m => _renderMasouEditCard(m, overrides[m.id])).join('');
  return min`
    <div class="section" style="margin-top:16px">
      <div class="section-title">魔装 (${list.length})</div>
      <div class="skills-list">${cards}</div>
    </div>`;
};

const _renderMasouEditCard = (m, override) => {
  // override.effects may arrive as either an array (from toggleMasouBunrui) or a
  // sparse-index dict like { '0': {...}, '2': {...} } (from setPath, since the
  // generic setPath always creates plain objects on the way down). Normalize both
  // forms into an array so the .map() call below doesn't blow up.
  const baseEffs = m.effects || [];
  let effs;
  const ovEffs = override && override.effects;
  if (Array.isArray(ovEffs)) {
    effs = ovEffs;
  } else if (ovEffs && typeof ovEffs === 'object') {
    effs = baseEffs.map(e => Object.assign({}, e));
    Object.entries(ovEffs).forEach(([k, patch]) => {
      const i = +k;
      if (!isNaN(i) && i >= 0 && i < effs.length && patch && typeof patch === 'object') {
        effs[i] = Object.assign({}, effs[i], patch);
      }
    });
  } else {
    effs = baseEffs;
  }
  const effHtml = effs.map((e, ei) => _renderMasouEffectEdit(m.id, ei, e)).join('');
  return min`
    <div class="skill-edit-card" data-masou-id="${m.id}">
      <div class="skill-name" style="font-weight:600;font-size:13px;color:var(--accent);margin-bottom:4px">
        ${escHtml(m.name || '')}
      </div>
      <div style="font-size:13px;line-height:1.6;color:var(--text);margin-bottom:8px">
        ${escHtml(m.effect_text || '')}
      </div>
      ${effHtml}
    </div>`;
};

const _renderMasouEffectEdit = (masouId, ei, e) => {
  const ep = `masou_overrides.${masouId}.effects.${ei}`;
  const bunrui = e.bunrui || [];
  const isHitOnly = bunrui.length === 1 && bunrui[0] === 7;
  const BUNRUI_ALL = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
  const btogs = BUNRUI_ALL.map(b =>
    `<button class="btog${bunrui.includes(b)?' on':''}" onclick="toggleMasouBunrui(${masouId},${ei},${b},this)">${BUNRUI_SHORT[b] || b}</button>`
  ).join('');
  return min`
    <div class="field-label">分類</div>
    <div class="bunrui-toggles">${btogs}</div>
    <div class="skill-edit-meta">
      <div>
        <div class="field-label">scope</div>
        ${renderEditSelect({0:'自身',1:'全体',2:'限定'}, e.scope, `setPath(state.editData,'${ep}.scope',+this.value)`)}
      </div>
      <div>
        <div class="field-label">condition</div>
        ${renderEditSelect(CONDITION, e.condition, `setPath(state.editData,'${ep}.condition',+this.value)`)}
      </div>
      ${isHitOnly ? '' : min`
        <div>
          <div class="field-label">倍率</div>
          <div style="display:flex;align-items:center;gap:4px">
            ${renderEditSelect({0:'×',1:'+'}, e.calc_type, `setPath(state.editData,'${ep}.calc_type',+this.value)`)}
            <input type="number" step="any" class="edit-num-sm" value="${e.bairitu ?? ''}"
                   oninput="setPath(state.editData,'${ep}.bairitu',this.value===''?null:Number(this.value))">
          </div>
        </div>
        <div>
          <div class="field-label">熟度補正</div>
          <input type="text" class="edit-num-sm" value="${e.bairitu_scaling ?? 0}"
                 oninput="setPath(state.editData,'${ep}.bairitu_scaling',parseBairituVal(this.value))">
        </div>`}
    </div>`;
};

// btog handler — mirrors edit.js toggleBunrui pattern with hit-mutex.
export const toggleMasouBunrui = (masouId, ei, b, btn) => {
  const overrides = state.editData.masou_overrides = state.editData.masou_overrides || {};
  const list = state.masouByChara[state.editData.id] || [];
  const m = list.find(x => x.id === masouId);
  if (!m) return;
  const ov  = overrides[masouId] = overrides[masouId] || JSON.parse(JSON.stringify({effects: m.effects || []}));
  const eff = ov.effects[ei] = ov.effects[ei] || {};
  let bunrui = (eff.bunrui || []).slice();
  // hit-mutex hard rule: bunrui=[7] standalone
  const has = bunrui.includes(b);
  if (b === 7) {
    bunrui = has ? [] : [7];
  } else {
    bunrui = bunrui.filter(x => x !== 7);
    if (has) bunrui = bunrui.filter(x => x !== b);
    else bunrui.push(b);
  }
  bunrui.sort((a, b) => a - b);
  eff.bunrui = bunrui;
  if (bunrui.includes(7)) eff.bairitu = 0;
  btn.classList.toggle('on', bunrui.includes(b));
};
