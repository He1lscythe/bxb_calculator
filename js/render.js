// js/render.js
import { state } from './state.js';
import { RARITY, ELEMENT, WEAPON, ELEM_COLOR, BUNRUI_SHORT, CHARA_TAG,
         OMOIDE_THRESHOLDS } from '../shared/constants.js';
import { updateReviseBar } from './nav.js';
import { hasOmoide, fmt, fmtNum, fmtBairitu, renderRightTags, escHtml, min } from './utils.js';
import { CHARA_SPEC } from '../shared/chara-spec.js';

export const _fmtSortVal = (v) => {
  if (v == null) return '—';
  if (typeof v !== 'number') return String(v);
  return Number.isInteger(v) ? v.toLocaleString('en-US') : String(v);
}

// inline getSortValue to avoid circular dependency with filter.js
const _getSortValue = (c, key) => {
  const fn = CHARA_SPEC.sortFns[key];
  return fn ? fn(c) : null;
};

export const renderSortBadge = (c, key) =>
  `<span class="sort-val">${_fmtSortVal(_getSortValue(c, key))}</span>`;

export const renderList = () => {
  const list = document.getElementById('char-list');
  if (state.filteredChars.length === 0) {
    list.innerHTML = '<div class="no-results">該当なし</div>';
    return;
  }
  list.innerHTML = state.filteredChars.map(c => {
    const rLabel = RARITY[c.rarity] || c.rarity || '?';
    const eName  = ELEMENT[c.element] || String(c.element) || '?';
    const wName  = WEAPON[c.type] || String(c.type) || '-';
    const stateKeys = Object.keys(c.states || {});
    const dots = ['極弐','改造','通常'].map(s =>
      `<div class="state-dot ${stateKeys.includes(s) ? 'has' : ''}" title="${s}"></div>`
    ).join('');
    const sortBadge = state.sortKey ? renderSortBadge(c, state.sortKey) : '';
    return min`
      <div class="char-item ${c.id === state.selectedId ? 'active' : ''}" data-id="${c.id}">
        <div class="badges">
          <span class="badge ${rLabel}">${rLabel}</span>
          <span class="badge elem-${c.element}">${eName}</span>
          <span class="badge weapon">${escHtml(wName)}</span>
        </div>
        ${state.charaCheckEnabled ? `<input type="checkbox" class="chara-check-cb" data-id="${c.id}" ${state.charaCheck.has(c.id) ? 'checked' : ''}>` : ''}
        <div class="char-name">${escHtml(c.name)}</div>
        ${sortBadge}
        <div class="state-dots">${dots}</div>
      </div>`;
  }).join('');

  list.querySelectorAll('.char-item').forEach(el => {
    el.addEventListener('click', () => selectChar(parseInt(el.dataset.id)));
  });

  if (state.charaCheckEnabled) {
    list.querySelectorAll('.chara-check-cb').forEach(cb => {
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', e => {
        const id = parseInt(e.target.dataset.id);
        if (e.target.checked) state.charaCheck.add(id);
        else state.charaCheck.delete(id);
        saveCharaCheck();
      });
    });
  }

  // Scroll selected item into view
  if (state.selectedId !== null) {
    const active = list.querySelector('.char-item.active');
    if (active) active.scrollIntoView({block:'nearest'});
  }
}

// 本地 characters_check.json 写盘（走 start.py /save、本地のみ；生产無 endpoint で静默失败）
const saveCharaCheck = () => {
  const ids = [...state.charaCheck].sort((a, b) => a - b);
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chara_check: ids }),
  }).catch(() => {});
};

export const selectChar = (id) => {
  state.selectedId = id;
  renderList();
  const c = state.allChars.find(x => x.id === id);
  if (!c) return;
  document.getElementById('placeholder').style.display = 'none';
  const detail = document.getElementById('chara-detail');
  detail.style.display = 'block';
  detail.innerHTML = renderDetail(c);
  // restore / set default active state tab
  const stateKeys = Object.keys(c.states || {});
  const preferred = ['極弐','改造','通常'].find(s => stateKeys.includes(s));
  const active = state.activeState[id] || preferred;
  switchState(id, active, detail);
  // Mobile: show as fullscreen modal
  if (window.innerWidth <= 768) {
    const dt = document.getElementById('detail');
    dt.classList.add('show-mob');
    dt.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }
  // Set up sticky heights for desktop AND mobile (chara-header sticks under #detail scroll)
  setupStickyHeights();
  updateMobNavBar(c);
}

export const closeDetailMob = () => {
  document.getElementById('detail').classList.remove('show-mob');
  document.body.style.overflow = '';
}

export const navChara = (dir) => {
  if (state.filteredChars.length === 0) return;
  const idx = state.filteredChars.findIndex(c => c.id === state.selectedId);
  const base = idx < 0 ? 0 : idx;
  // Wrap-around (mod): last+next → first, first+prev → last
  const newIdx = ((base + dir) % state.filteredChars.length + state.filteredChars.length) % state.filteredChars.length;
  selectChar(state.filteredChars[newIdx].id);
}

export const updateMobNavBar = (c) => {
  const idx = state.filteredChars.findIndex(x => x.id === state.selectedId);
  const label = document.getElementById('detail-mob-label');
  if (label) label.textContent = c && idx >= 0 ? `${idx + 1} / ${state.filteredChars.length}` : '';
}

export const _measureStickyHeights = () => {
  const isMob = window.innerWidth <= 768;
  const bar = document.getElementById('detail-mob-bar');
  const header = document.querySelector('#chara-detail .chara-header');
  const barH = (isMob && bar) ? bar.getBoundingClientRect().height : 0;
  const headerH = header ? header.getBoundingClientRect().height : 100;
  document.documentElement.style.setProperty('--sticky-bar-h', barH + 'px');
  document.documentElement.style.setProperty('--sticky-header-h', headerH + 'px');
  // Also set state-tabs.style.top directly as a backup to ensure correct positioning
  const stateTabs = document.querySelector('#chara-detail .state-tabs');
  if (stateTabs) stateTabs.style.top = (barH + headerH) + 'px';
}

export const _scheduleMeasure = () => {
  // Throttle via rAF: collapse multiple ResizeObserver callbacks into one frame
  if (state._stickyMeasureRAF) return;
  state._stickyMeasureRAF = requestAnimationFrame(() => {
    state._stickyMeasureRAF = null;
    _measureStickyHeights();
  });
}

export const setupStickyHeights = () => {
  // Multiple measurement attempts at different times to catch the right layout state.
  // After innerHTML, browser needs frames to lay out the new DOM.
  requestAnimationFrame(() => requestAnimationFrame(_measureStickyHeights));
  setTimeout(_measureStickyHeights, 100);
  // ResizeObserver auto-updates on chara-header height changes (e.g., entering edit mode)
  if ('ResizeObserver' in window) {
    if (state._stickyResizeObserver) state._stickyResizeObserver.disconnect();
    state._stickyResizeObserver = new ResizeObserver(_scheduleMeasure);
    const header = document.querySelector('#chara-detail .chara-header');
    if (header) state._stickyResizeObserver.observe(header);
  }
}

export const renderBDCard = (bd) => {
  // bd 専用 tag 列：duration + bdhit。魔剣特性 tag は chara header 側で表示する（chara.tags）。
  const durTag = bd.duration ? `<span class="bd-dur-tag">${escHtml(bd.duration)}</span>` : '';
  const hitTag = (bd.bdhit && bd.bdhit > 1) ? `<span class="bd-hit-tag">${bd.bdhit}連</span>` : '';
  const rightTags = durTag + hitTag;
  return min`
    <div class="section">
      <div class="section-title">ブレイズドライブ</div>
      <div class="bd-card">
        <div class="bd-label">BD SKILL${bd.cost != null ? `&nbsp;<span class="bd-cost-tag">コスト ${bd.cost}</span>` : ''}</div>
        <div class="bd-top-row">
          <div class="bd-name">${escHtml(bd.name || '')}</div>
          ${rightTags ? `<div class="bd-tags">${rightTags}</div>` : ''}
        </div>
        <div class="bd-effect">${escHtml(bd.effect_text || '')}</div>
      </div>
    </div>`;
}

export const renderDetail = (c) => {
  const rLabel = RARITY[c.rarity] || c.rarity || '?';
  const eName  = ELEMENT[c.element] || c.element || '-';
  const eColor = ELEM_COLOR[c.element] || '#888';
  const wName  = WEAPON[c.type] || c.type || '-';
  const stateKeys = Object.keys(c.states || {});

  const tabs = ['極弐','改造','通常'].filter(s => stateKeys.includes(s)).map(s =>
    `<div class="state-tab" data-state="${s}" onclick="switchState(${c.id},'${s}',document.getElementById('chara-detail'))">${s}</div>`
  ).join('');

  const contents = ['極弐','改造','通常'].filter(s => stateKeys.includes(s)).map(s =>
    `<div class="state-content" data-state="${s}">${renderStateContent(c.states[s], s, c)}</div>`
  ).join('');

  const bdSection = c.bd_skill?.name ? renderBDCard(c.bd_skill) : '';
  const omoideBtn = hasOmoide(c) ? `<button class="btn-latent btn-omoide" onclick="openLatentModal(${c.id})">潜在開放</button>` : '';
  const masouBtn  = (state.masouByChara && (state.masouByChara[c.id] || []).length) ? `<button class="btn-latent btn-masou" onclick="openMasouModal(${c.id})">魔装</button>` : '';
  const actionsHtml = (omoideBtn || masouBtn) ? `<div class="chara-actions">${masouBtn}${omoideBtn}</div>` : '';
  const tagsHtml = (c.tags || []).map(s =>
    `<span class="bd-sp-tag bd-sp-${s}">${CHARA_TAG[s] || s}</span>`).join('');
  return min`
    <div class="chara-header">
      <div class="chara-title">
        <span class="name-text">${escHtml(c.name)}</span>
        <img class="chara-icon" src="https://img.altema.jp/bxb/chara/icon/${c.id}.jpg" onerror="this.style.display='none'" alt="">
      </div>
      ${actionsHtml}
      <button class="btn-edit" onclick="enterEditMode(${c.id})">修正</button>
      <div class="chara-meta">
        <span class="meta-chip"><span class="badge ${rLabel}">${rLabel}</span></span>
        <span class="meta-chip"><span class="elem-dot" style="background:${eColor}"></span>${eName}属性</span>
        <span class="meta-chip">${wName}</span>
        ${c.url ? `<a class="meta-chip" href="${c.url}" target="_blank" style="color:var(--accent);text-decoration:none">Altema ↗</a>` : ''}
      </div>
      ${tagsHtml ? `<div class="chara-tags">${tagsHtml}</div>` : ''}
    </div>
    <div class="state-tabs">${tabs}</div>
    ${bdSection}
    ${contents}`;
}

export const switchState = (id, stateLabel, container) => {
  state.activeState[id] = stateLabel;
  container.querySelectorAll('.state-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.state === stateLabel);
  });
  container.querySelectorAll('.state-content').forEach(d => {
    d.classList.toggle('active', d.dataset.state === stateLabel);
  });
}

export const _deletedSkillSet = (c) => {
  return new Set(Array.isArray(c && c._deleted_skills) ? c._deleted_skills : []);
}

export const renderStateContent = (sectionState, stateLabel, chara) => {
  const parts = [];
  const dead  = _deletedSkillSet(chara);

  // --- Skills (base filtered by tombstone + user-added per state) ---
  const baseSkills  = sectionState.skills || [];
  const addedSkills = (chara && chara._added_skills && chara._added_skills[stateLabel]) || [];
  const baseV  = baseSkills.filter(s => !dead.has(s.name||''));
  const allSkills = baseV.concat(addedSkills);
  if (allSkills.length) {
    const cards = allSkills.map(s =>
      '<div class="skill-card"><div class="skill-name-row"><span class="skill-name">' + escHtml(s.name) + '</span>' + renderRightTags(s) + '</div><div class="skill-effect-row"><span class="skill-effect">' + escHtml(s.effect_text) + '</span><span class="skill-bairitu">' + fmtBairitu(s) + '</span></div></div>'
    ).join('');
    parts.push(`<div class="section"><div class="section-title">スキル構成 (${allSkills.length})</div><div class="skills-list">${cards}</div></div>`);
  }

  // --- Stats ---
  if (sectionState.stats) {
    parts.push(`<div class="section"><div class="section-title">ステータス</div>${renderStats(sectionState.stats, stateLabel)}</div>`);
  }

  // --- Basic Info ---
  if (sectionState.basic_info) {
    parts.push(`<div class="section"><div class="section-title">基本情報</div>${renderBasicInfo(sectionState.basic_info)}</div>`);
  }

  // --- Profile ---
  if (sectionState.profile && Object.keys(sectionState.profile).length > 0) {
    const rows = Object.entries(sectionState.profile)
      .filter(([k]) => k !== 'B' && k !== 'W' && k !== 'H')
      .map(([k,v]) =>
        `<div class="profile-key">${escHtml(k)}</div><div class="profile-val">${escHtml(v)}</div>`
      ).join('');
    parts.push(min`
      <div class="section">
        <div class="section-title">プロフィール</div>
        <div class="profile-table">${rows}</div>
      </div>`);
  }

  return parts.join('') || '<div class="no-results">データなし</div>';
}

export const renderStats = (stats, stateLabel) => {
  const STAT_LABELS = {
    HP:'HP', '攻撃力':'攻撃力', '防御力':'防御力',
    'ブレイク力':'ブレイク力', 'フルヒット攻撃力':'フルヒット'
  };

  // All states now use {max:{...}} or {initial:{...}, max:{...}}
  const maxStats   = stats.max    || {};
  const initStats  = stats.initial || null;
  const keys = Object.keys(maxStats);

  const cards = keys.map(k => {
    const lbl = STAT_LABELS[k] || k;
    const max = fmt(maxStats[k]);
    const init = initStats ? fmt(initStats[k]) : null;
    return min`
      <div class="stat-card">
        <div class="stat-label">${escHtml(lbl)}</div>
        <div class="stat-row">
          <span class="stat-row-label">最大</span>
          <span class="stat-row-value">${max}</span>
        </div>
        ${init !== null ? min`
          <div class="stat-row">
            <span class="stat-row-label">初期</span>
            <span class="stat-row-value init">${init}</span>
          </div>` : ''}
      </div>`;
  }).join('');
  return `<div class="stat-grid">${cards}</div>`;
}

export const renderBasicInfo = (info) => {
  const rows = Object.entries(info).map(([k, v]) => {
    let displayVal;
    if (k === 'Hit数' && Array.isArray(v)) {
      const phases = v.map((n,i) => `<span class="hit-phase">${n}</span>${i<v.length-1?'<span class="hit-arrow">-</span>':''}`).join('');
      const total = v.reduce((a,b)=>a+b,0);
      displayVal = `<div class="hit-phases">${phases}<span style="color:var(--text2);font-size:11px;margin-left:4px">合計${total}hit</span></div>`;
    } else if (k === 'Hit数' && typeof v === 'number') {
      // Legacy: single number stored before fix
      displayVal = `${v}hit`;
    } else {
      displayVal = escHtml(String(v ?? '-'));
    }
    return `<div class="info-cell label">${escHtml(k)}</div><div class="info-cell value">${displayVal}</div>`;
  }).join('');
  return `<div class="info-table">${rows}</div>`;
}

