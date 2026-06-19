// ===== Nav component =====
// Usage: import { Nav, updateReviseBar } from '../js/nav.js';
//        Nav.init();

const PAGES = [
  { id: 'characters', href: 'characters.html', label: '魔剣' },
  { id: 'crystals', href: 'crystals.html', label: '結晶' },
  { id: 'bladegraphs', href: 'bladegraphs.html', label: '心象結晶' },
  { id: 'souls', href: 'souls.html', label: 'ソウル' },
  { id: 'hensei', href: 'hensei.html', label: '編成' },
];

// 「攻略」下拉菜单项（点击展开）。各项是独立页面（多为 iframe 包装的自包含攻略页）。
const GUIDES = [
  { id: 'dungeon_yggdrasil', href: 'dungeon_yggdrasil.html', label: '大迷宮 ユグドラシル' },
];

const _activePage = () => {
  const file = window.location.pathname.replace(/\/$/, '').split('/').pop() || 'characters.html';
  return file.replace(/\.html$/, '');
};

const _render = () => {
  const active = _activePage();
  const links = PAGES.map(
    (p) => `<a href="${p.href}" class="nav-link${p.id === active ? ' active' : ''}">${p.label}</a>`,
  ).join('');
  const guidesActive = GUIDES.some((g) => g.id === active);
  const guideItems = GUIDES.map(
    (g) =>
      `<a href="${g.href}" class="nav-dropdown-item${g.id === active ? ' active' : ''}">${g.label}</a>`,
  ).join('');
  const guides = `<div class="nav-dropdown">
        <button type="button" class="nav-link nav-dropdown-btn${guidesActive ? ' active' : ''}"
          aria-haspopup="true" aria-expanded="false" onclick="Nav.toggleDropdown(event)">攻略 <span class="nav-caret">▾</span></button>
        <div class="nav-dropdown-menu">${guideItems}</div>
      </div>`;
  return `<div id="topbar">
    <h1>⚔ BxB</h1>
    <nav id="page-nav">${links}${guides}</nav>
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
    // iPad Safari/Chrome 上 <a href> 的首次 tap 有偶发被吞掉的 bug（页面加载光圈
    // 转但不 navigate，第二次 tap 才生效）。原因不明（hover/:active emulation 或
    // 系统手势识别）。用 pointerdown + 显式 location.assign 绕开浏览器的 <a>
    // 处理流程，pointerdown 在 touchstart 之前触发，确保抢在任何 hover 模拟前。
    // 只对带 href 的导航 <a> 绑定（排除「攻略」下拉按钮——它是 <button>、走 onclick 展开）
    document.querySelectorAll('#page-nav a[href]').forEach((link) => {
      link.addEventListener('pointerdown', (e) => {
        // 中键/右键不处理；ctrl/cmd+click 让默认行为生效（新标签打开）
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) window.location.assign(href);
      });
    });
    document.addEventListener('click', (e) => {
      const nav = document.getElementById('page-nav');
      const hb = document.getElementById('nav-hamburger');
      if (nav && hb && !nav.contains(e.target) && e.target !== hb && !hb.contains(e.target))
        nav.classList.remove('open');
      // 点到下拉之外 → 收起展开的「攻略」菜单
      document.querySelectorAll('.nav-dropdown.open').forEach((dd) => {
        if (!dd.contains(e.target)) {
          dd.classList.remove('open');
          dd.querySelector('.nav-dropdown-btn')?.setAttribute('aria-expanded', 'false');
        }
      });
    });
  },
  toggleMenu() {
    document.getElementById('page-nav')?.classList.toggle('open');
  },
  toggleDropdown(e) {
    e.preventDefault();
    e.stopPropagation(); // 不让本次 click 冒泡到 document 的关闭逻辑
    const dd = e.currentTarget.closest('.nav-dropdown');
    if (!dd) return;
    const open = dd.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
  },
};

// 所有 viewer 都通过 window.state = state 暴露 — 不再 fallback 到 legacy 全局
export const updateReviseBar = () => {
  const sr = window.state?.sessionReviseIds ?? new Set();
  // characters ページでは masou 編集も同じ save bar をトリガする（独立 set）
  const msr = window.state?.masouSessionReviseIds ?? new Set();
  const count = sr.size + msr.size;
  const bar = document.getElementById('revise-bar');
  const btn = document.querySelector('.btn-revise-save');
  const status = document.getElementById('revise-status');
  if (!bar || !btn) return;
  bar.style.display = count > 0 ? 'flex' : 'none';
  btn.textContent = count > 0 ? `Save (${count})` : 'Save';
  if (status) status.textContent = '';
};

// expose Nav.toggleMenu globally so inline onclick="Nav.toggleMenu()" still works
window.Nav = Nav;
