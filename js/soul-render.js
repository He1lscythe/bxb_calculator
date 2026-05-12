// js/soul-render.js
import { state } from './soul-state.js';
import { ELEMENT, WEAPON, BUNRUI_SHORT, CONDITION,
         ELEMS_ORDER, WEAPONS_ORDER } from '../shared/constants.js';
import { updateReviseBar } from './nav.js';
import { escHtml, fmtBairitu, fmtAff, min } from './utils.js';

export const AFF_LABEL = {'-2':'超苦手','-1':'苦手','0':'普通','1':'得意','2':'超得意'};
export const AFF_CLS   = {'-2':'aff-m2','-1':'aff-m1','0':'aff-0','1':'aff-1','2':'aff-2'};
export const AFF_CELL  = {'-2':'aff-cell-m2','-1':'aff-cell-m1','0':'','1':'aff-cell-1','2':'aff-cell-2'};

export const renderList = () => {
  const list = document.getElementById('soul-list');
  if (!state.filteredSouls.length) {
    list.innerHTML = '<div class="no-results">該当なし</div>';
    return;
  }
  list.innerHTML = state.filteredSouls.map(s => min`
    <div class="soul-item ${s.id === state.selectedId ? 'active' : ''}" data-id="${s.id}">
      <span class="star-badge star-${s.rarity||0}">★${s.rarity||'?'}</span>
      ${state.soulCheckEnabled ? `<input type="checkbox" class="soul-check-cb" data-id="${s.id}" ${state.soulCheck.has(s.id) ? 'checked' : ''}>` : ''}
      <span class="soul-name">${escHtml(s.name)}</span>
      <img class="soul-icon-thumb" src="https://img.altema.jp/bxb/soul/icon/${s.id}.jpg"
           onerror="this.style.display='none'" alt="">
    </div>`
  ).join('');

  list.querySelectorAll('.soul-item').forEach(el => {
    el.addEventListener('click', () => selectSoul(parseInt(el.dataset.id)));
  });

  if (state.soulCheckEnabled) {
    list.querySelectorAll('.soul-check-cb').forEach(cb => {
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', e => {
        const id = parseInt(e.target.dataset.id);
        if (e.target.checked) state.soulCheck.add(id);
        else state.soulCheck.delete(id);
        saveSoulCheck();
      });
    });
  }

  if (state.selectedId !== null) {
    const active = list.querySelector('.soul-item.active');
    if (active) active.scrollIntoView({block:'nearest'});
  }
}

export const selectSoul = (id) => {
  state.selectedId = id;
  renderList();
  const s = state.allSouls.find(x => x.id === id);
  if (!s) return;
  document.getElementById('placeholder').style.display = 'none';
  const det = document.getElementById('soul-detail');
  det.style.display = 'block';
  det.innerHTML = renderDetail(s);
  // Mobile: show as fullscreen modal
  if (window.innerWidth <= 900) {
    const dt = document.getElementById('detail');
    dt.classList.add('show-mob');
    dt.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }
  // 桌面+移动都需要测量 sticky vars（移动端 mob-bar 高度，桌面端 0）
  requestAnimationFrame(setupStickyHeights);
  updateMobNavBar(s);
}

export const closeDetailMob = () => {
  document.getElementById('detail').classList.remove('show-mob');
  document.body.style.overflow = '';
}

export const navSoul = (dir) => {
  if (state.filteredSouls.length === 0) return;
  const idx = state.filteredSouls.findIndex(s => s.id === state.selectedId);
  const base = idx < 0 ? 0 : idx;
  const newIdx = ((base + dir) % state.filteredSouls.length + state.filteredSouls.length) % state.filteredSouls.length;
  selectSoul(state.filteredSouls[newIdx].id);
}

export const updateMobNavBar = (s) => {
  const idx = state.filteredSouls.findIndex(x => x.id === state.selectedId);
  const label = document.getElementById('detail-mob-label');
  if (label) label.textContent = s && idx >= 0 ? `${idx + 1} / ${state.filteredSouls.length}` : '';
}

export const setupStickyHeights = () => {
  // 桌面端 --sticky-bar-h=0（无 mob-bar），移动端=mob-bar 高度
  const isMob = window.innerWidth <= 900;
  const bar = document.getElementById('detail-mob-bar');
  const barH = (isMob && bar) ? bar.offsetHeight : 0;
  document.documentElement.style.setProperty('--sticky-bar-h', barH + 'px');
}

export const renderDetail = (s) => {
  const stars = s.rarity || 0;
  const acqEntries = Object.entries(s.acquisition || {});
  return min`
    <div class="soul-header">
      <div class="soul-header-top">
        <div class="soul-title">${escHtml(s.name)}</div>
        <button class="btn-edit" onclick="enterEditMode(${s.id})">修正</button>
      </div>
      <img class="soul-banner" src="${escHtml(s.image||`https://img.altema.jp/bxb/soul/banner/${s.id}.jpg`)}"
           onerror="this.style.display='none'" alt="${escHtml(s.name)}">
      <div class="soul-meta">
        <span class="meta-chip star-${stars}" style="font-weight:700;letter-spacing:1px">${'★'.repeat(stars)||'?'}</span>
        <span class="meta-chip">Lv.${s.max_level || '?'}</span>
        ${s.url ? `<a class="meta-chip" href="${escHtml(s.url)}" target="_blank" style="color:var(--accent);text-decoration:none">Altema ↗</a>` : ''}
        ${acqEntries.length ? `<span class="meta-chip" style="color:var(--text2)">${escHtml(acqEntries[0][0])}</span>` : ''}
      </div>
    </div>
    ${renderAffinityView(s)}
    ${renderSkillsView(s.skills || [], s)}
    ${acqEntries.length ? min`
      <div class="section">
        <div class="section-title">入手場所</div>
        <div class="acq-table">
          ${acqEntries.map(([k,v]) => `<div class="acq-key">${escHtml(k)}</div><div class="acq-val">${escHtml(v)}</div>`).join('')}
        </div>
      </div>` : ''}`;
}

export const renderAffinityView = (s) => {
  function cellHtml(name, affObj, extraStyle) {
    const aff   = affObj || {level:0, atk_effect:'1', def_effect:'1'};
    const lv    = String(aff.level != null ? aff.level : 0);
    const label = AFF_LABEL[lv] || '普通';
    const cls   = AFF_CLS[lv]  || 'aff-0';
    const ccls  = AFF_CELL[lv] || '';
    const atk   = fmtAff(aff.atk_effect);
    const def   = fmtAff(aff.def_effect);
    return min`
      <div class="affinity-cell ${ccls}" ${extraStyle||''}>
        <span class="affinity-name">${name}</span>
        <span class="affinity-level ${cls}">${label}</span>
        <span class="affinity-effect">×${atk}/×${def}</span>
      </div>`;
  }
  const elemCells = ELEMS_ORDER.map(n => cellHtml(n, (s.element_affinity||{})[n])).join('');
  // 武器 grid: 6×2（12 weapons / 6 cols）。inline min-width:60px を外し grid を screen 宽以内に納める
  const weapCells = WEAPONS_ORDER.map(n => cellHtml(n, (s.weapon_affinity||{})[n])).join('');
  return min`
    <div class="section">
      <div class="section-title">属性相性</div>
      <div class="affinity-grid">${elemCells}</div>
    </div>
    <div class="section">
      <div class="section-title">得意武器</div>
      <div class="affinity-grid">${weapCells}</div>
    </div>`;
}

export const _deletedSet = (s) => {
  return new Set(Array.isArray(s && s._deleted_skills) ? s._deleted_skills : []);
}

export const renderSkillsView = (skills, soul) => {
  const dead   = _deletedSet(soul);
  const baseV  = (skills || []).filter(sk => !dead.has(sk.name||''));
  const addedV = Array.isArray(soul && soul._added_skills) ? soul._added_skills : [];
  const all    = baseV.concat(addedV);
  if (!all.length) return '';
  const cards = all.map(sk => min`
    <div class="skill-card">
      <div class="skill-name-row">
        <span class="skill-name">${escHtml(sk.name||'')}</span>
        ${renderRightTags(sk)}
      </div>
      <div class="skill-effect-row">
        <span class="skill-effect">${escHtml(sk.effect_text||'')}</span>
        <span class="skill-bairitu">${fmtBairitu(sk)}</span>
      </div>
    </div>`
  ).join('');
  return min`
    <div class="section">
      <div class="section-title">スキル構成 (${all.length})</div>
      <div class="skills-list">${cards}</div>
    </div>`;
}

export const fmtElem = (v) => {
  if (v == null) return null;
  const ids = Array.isArray(v) ? v : [v];
  return ids.map(function(id){ return ELEMENT[id] || id; }).join('/');
}

export const fmtType = (v) => {
  if (v == null) return null;
  const ids = Array.isArray(v) ? v : [v];
  return ids.map(function(id){ return WEAPON[id] || id; }).join('/');
}

export const _ctxKey = (e) => {
  const elem = Array.isArray(e.element) ? e.element.slice().sort().join(',')
           : (e.element != null ? String(e.element) : '');
  const type = Array.isArray(e.type) ? e.type.slice().sort().join(',')
           : (e.type != null ? String(e.type) : '');
  return [e.scope, elem, type, e.condition || 0].join('|');
}

export const _renderScopeTag = (e) => {
  if (e.scope === 0) return '<span class="scope-tag scope-self">自</span>';
  if (e.scope === 1) return '<span class="scope-tag scope-all">全</span>';
  const parts = [];
  const el = fmtElem(e.element); if (el) parts.push(el);
  const ty = fmtType(e.type);   if (ty) parts.push(ty);
  if (e.scope === 2) return '<span class="scope-tag scope-lim">'      + (parts.join('·') || '限') + '</span>';
  if (e.scope === 3) return '<span class="scope-tag scope-equip-s">' + (parts.join('·') || '装') + '·自</span>';
  if (e.scope === 4) return '<span class="scope-tag scope-equip-a">' + (parts.join('·') || '装') + '·全</span>';
  return '';
}

export const _renderCondTag = (e) => {
  if (!e.condition) return '';
  return '<span class="cond-tag cond-' + e.condition + '">' + (CONDITION[e.condition] || '') + '</span>';
}

export const renderRightTags = (sk) => {
  const groups = []; // [{key, ctx, bunruis: []}]
  (sk.effects || []).forEach(function(e) {
    const key = _ctxKey(e);
    let g = null;
    for (var i = 0; i < groups.length; i++) if (groups[i].key === key) { g = groups[i]; break; }
    if (!g) { g = { key: key, ctx: e, bunruis: [] }; groups.push(g); }
    (e.bunrui || []).forEach(function(b) { g.bunruis.push(b); });
  });
  let tags = '';
  groups.forEach(function(g) {
    g.bunruis.forEach(function(b) {
      tags += '<span class="bunrui-tag">' + (BUNRUI_SHORT[b] || b) + '</span>';
    });
    tags += _renderScopeTag(g.ctx);
    tags += _renderCondTag(g.ctx);
  });
  return '<div class="skill-tags-right">' + tags + '</div>';
}

export const _fmtNumSimple = (b) => {
  return Number.isInteger(b) ? b.toLocaleString('en-US') : String(parseFloat(b.toFixed(6)));
}

// 本地 soul_check.json 写盘（走 start.py /save，仅本地有效；生产无 endpoint 即静默失败）
const saveSoulCheck = () => {
  const ids = [...state.soulCheck].sort((a, b) => a - b);
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soul_check: ids }),
  }).catch(() => {});
};

