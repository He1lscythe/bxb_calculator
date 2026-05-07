// ===== Nav component =====
// Usage: import { Nav, updateReviseBar } from '../js/nav.js';
//        Nav.init();

const PAGES = [
  { id: 'characters', href: 'characters.html', label: '魔剣' },
  { id: 'crystals',   href: 'crystals.html',   label: '結晶' },
  { id: 'bladegraph', href: 'bladegraph.html',  label: '心象結晶' },
  { id: 'soul',       href: 'soul.html',        label: 'ソウル' },
  { id: 'hensei',     href: 'hensei.html',      label: '編成' },
];

const _activePage = () => {
  const file = window.location.pathname.replace(/\/$/, '').split('/').pop() || 'characters.html';
  return file.replace(/\.html$/, '');
};

const _render = () => {
  const active = _activePage();
  const links = PAGES.map(p =>
    `<a href="${p.href}" class="nav-link${p.id === active ? ' active' : ''}">${p.label}</a>`
  ).join('');
  return `<div id="topbar">
    <h1>⚔ BxB</h1>
    <nav id="page-nav">${links}</nav>
    <div id="topbar-right">
      <div id="save-toast"></div>
      <div id="revise-bar">
        <button class="btn-revise-save"
          onclick="typeof saveRevise==='function'&&saveRevise()">Save</button>
        <span id="revise-status"></span>
      </div>
      <button id="nav-hamburger" onclick="Nav.toggleMenu()" aria-label="メニュー">☰</button>
    </div>
  </div>`;
};

export const Nav = {
  init() {
    if (document.getElementById('topbar')) return;
    // inject as first child of #page-wrap (currentScript is null in ES modules)
    const wrap = document.getElementById('page-wrap');
    if (wrap) wrap.insertAdjacentHTML('afterbegin', _render());
    document.addEventListener('click', e => {
      const nav = document.getElementById('page-nav');
      const hb  = document.getElementById('nav-hamburger');
      if (nav && hb && !nav.contains(e.target) && e.target !== hb && !hb.contains(e.target))
        nav.classList.remove('open');
    });
  },
  toggleMenu() {
    document.getElementById('page-nav')?.classList.toggle('open');
  },
};

// reads sessionReviseIds from either legacy global or window.state (ES module pages)
export const updateReviseBar = () => {
  const sr    = window.state?.sessionReviseIds
             ?? (typeof sessionReviseIds !== 'undefined' ? sessionReviseIds : new Set());
  // characters ページでは masou 編集も同じ save bar をトリガする（独立 set）
  const msr   = window.state?.masouSessionReviseIds ?? new Set();
  const count = sr.size + msr.size;
  const bar   = document.getElementById('revise-bar');
  const btn   = document.querySelector('.btn-revise-save');
  const status = document.getElementById('revise-status');
  if (!bar || !btn) return;
  bar.style.display = count > 0 ? 'flex' : 'none';
  btn.textContent   = count > 0 ? `Save (${count})` : 'Save';
  if (status) status.textContent = '';
};

// expose Nav.toggleMenu globally so inline onclick="Nav.toggleMenu()" still works
window.Nav = Nav;
