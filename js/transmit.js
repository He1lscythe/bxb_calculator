// 伝承ボーナス modal:这把作伝承先时、有加成的伝承元 (data/transmit_bonus.json);行样式复用 hensei picker (.em-item)
import { state } from './state.js';
import { RARITY, ELEMENT, WEAPON } from '../shared/constants.js';
import { charaIconStack } from '../shared/image-paths.js';
import { escHtml, min } from './utils.js';
import { selectChar } from './render.js';

let _byBase = null;
const _charaOfBase = (b) => {
  if (!_byBase) _byBase = new Map(state.allChars.map((c) => [c._master?.id ?? c.id, c]));
  return _byBase.get(b);
};

const _rowHtml = (b, bonus) => {
  const c = _charaOfBase(b);
  if (!c) return '';
  const r = RARITY[c.rarity] || '';
  const cut = bonus === '同型因子' ? 2 : 1;
  return min`
    <div class="em-item em-item-bg">
      ${charaIconStack({ variantId: c.id, name: c.name, elementId: c.element, weaponTypeId: c.weapon, marriageLevel: 2, className: 'em-thumb' })}
      <div class="em-bg-body">
        <div class="em-bg-header">
          <span class="badge ${r}" style="flex-shrink:0">${r}</span>
          <span class="badge elem-${c.element}" style="flex-shrink:0">${ELEMENT[c.element] || ''}</span>
          <span class="badge weapon" style="flex-shrink:0">${WEAPON[c.weapon] || ''}</span>
        </div>
        <span class="em-bg-name">${escHtml(c.name)}</span>
      </div>
      <span class="tb-bonus">${escHtml(bonus)}</span>
      <span class="tb-cut">−${cut}</span>
      <button class="em-detail-btn" onclick="pickTransmitSource(${c.id})">詳細</button>
    </div>`;
};

export const openTransmitModal = (baseId) => {
  const groups = Object.entries(state.transmitBonus?.[baseId] || {});
  groups.sort(([a], [b]) => (b === '同型因子') - (a === '同型因子'));
  const body = document.getElementById('transmit-body');
  if (!body) return;
  const html = groups.map(([bonus, srcs]) => srcs.map((b) => _rowHtml(b, bonus)).join('')).join('');
  body.innerHTML = html || '<div class="no-results">伝承ボーナスなし</div>';
  document.getElementById('transmit-modal').style.display = 'flex';
};

export const closeTransmitModal = () => {
  const m = document.getElementById('transmit-modal');
  if (m) m.style.display = 'none';
};

export const pickTransmitSource = (variantId) => {
  closeTransmitModal();
  selectChar(variantId);
};
