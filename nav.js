(function () {
  if (document.getElementById('topbar')) return;
  var PAGES = [
    { id: 'characters', href: 'characters.html', label: '魔剣' },
    { id: 'crystals',   href: 'crystals.html',   label: '結晶' },
    { id: 'bladegraph', href: 'bladegraph.html', label: '心象結晶' },
    { id: 'soul',       href: 'soul.html',       label: 'ソウル' },
    { id: 'hensei',     href: 'hensei.html',     label: '編成' },
  ];

  // detect active page from filename
  var path = window.location.pathname.replace(/\/$/, '');
  var file = path.split('/').pop() || 'characters.html';
  var activePage = file.replace(/\.html$/, '');

  // build nav links
  var links = PAGES.map(function (p) {
    var cls = p.id === activePage ? 'nav-link active' : 'nav-link';
    return '<a href="' + p.href + '" class="' + cls + '">' + p.label + '</a>';
  }).join('');

  // topbar HTML
  var html =
    '<div id="topbar">' +
      '<h1>⚔ BxB</h1>' +
      '<nav id="page-nav">' + links + '</nav>' +
      '<div id="topbar-right">' +
        '<div id="save-toast"></div>' +
        '<div id="revise-bar">' +
          '<button class="btn-revise-save" onclick="typeof saveRevise===\'function\'&&saveRevise()">Save</button>' +
          '<span id="revise-status"></span>' +
        '</div>' +
        '<button id="nav-hamburger" onclick="(function(){var n=document.getElementById(\'page-nav\');n.classList.toggle(\'open\');})()" aria-label="メニュー">☰</button>' +
      '</div>' +
    '</div>';

  // inject CSS into <head>
  var css =
    'html{scrollbar-gutter:stable;}' +
    '#topbar{background:var(--bg2);border-bottom:1px solid var(--border);padding:8px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:sticky;top:0;z-index:100;min-height:52px;}' +
    '#topbar h1{font-size:16px;font-weight:700;color:var(--accent);white-space:nowrap;margin:0;}' +
    '#page-nav{display:flex;gap:0;}' +
    '.nav-link{padding:5px 18px;font-size:13px;font-weight:600;color:var(--text2);text-decoration:none;border-bottom:2px solid transparent;transition:color .15s;white-space:nowrap;}' +
    '.nav-link:hover{color:var(--text);}' +
    '.nav-link.active{color:var(--accent);border-bottom-color:var(--accent);}' +
    '#topbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-shrink:0;}' +
    '#nav-hamburger{display:none;background:none;border:none;color:var(--text);font-size:22px;cursor:pointer;padding:2px 6px;line-height:1;border-radius:4px;}' +
    '#nav-hamburger:hover{background:var(--bg3);}' +
    '#revise-bar{display:none;align-items:center;gap:8px;}' +
    '#revise-status{font-size:12px;color:#55bb55;}' +
    '.btn-revise-save{background:#1e5c1e;color:#aaffaa;border:1px solid #2d8c2d;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:600;}' +
    '.btn-revise-save:hover{background:#266626;}' +
    '.btn-revise-save:disabled{opacity:.5;cursor:default;}' +
    /* Save success toast — 出现在 Save/汉堡菜单 左侧，6 秒后自动消失 */
    '#save-toast{display:none;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;background:rgba(80,200,120,.12);border:1px solid rgba(80,200,120,.4);color:#7dd99f;font-size:12px;font-weight:600;white-space:nowrap;animation:save-toast-in .25s ease-out;}' +
    '#save-toast.show{display:flex;}' +
    '#save-toast a{color:var(--accent);text-decoration:none;}' +
    '#save-toast a:hover{text-decoration:underline;}' +
    '@keyframes save-toast-in{from{opacity:0;transform:translateX(8px);}to{opacity:1;transform:translateX(0);}}' +
    '@media(max-width:600px){' +
      '#nav-hamburger{display:block;}' +
      '#page-nav{' +
        'display:none;position:absolute;top:52px;left:0;right:0;' +
        'flex-direction:column;background:var(--bg2);' +
        'border-bottom:2px solid var(--border);' +
        'box-shadow:0 6px 16px rgba(0,0,0,.5);z-index:99;' +
      '}' +
      '#page-nav.open{display:flex;}' +
      '.nav-link{padding:12px 20px;border-bottom:1px solid var(--border);border-right:none;white-space:normal;}' +
      '.nav-link.active{border-bottom-color:var(--border);border-left:3px solid var(--accent);padding-left:17px;}' +
      /* topbar 保持 sticky（默认值）——sticky 本身就是定位元素，#page-nav 的 absolute 定位仍以 topbar 为锚 */
    '}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // insert topbar where this script tag sits
  document.currentScript.insertAdjacentHTML('afterend', html);

  // close menu when clicking outside nav
  document.addEventListener('click', function(e) {
    var nav = document.getElementById('page-nav');
    var hamburger = document.getElementById('nav-hamburger');
    if (!nav || !hamburger) return;
    if (!nav.contains(e.target) && e.target !== hamburger && !hamburger.contains(e.target)) {
      nav.classList.remove('open');
    }
  });
})();

// shared across all pages — reads each page's own sessionReviseIds (Set of this-session edits)
function updateReviseBar() {
  var sr = (typeof sessionReviseIds !== 'undefined') ? sessionReviseIds : new Set();
  var count = sr.size;
  var bar = document.getElementById('revise-bar');
  var btn = document.querySelector('.btn-revise-save');
  var status = document.getElementById('revise-status');
  if (!bar || !btn) return;
  bar.style.display = count > 0 ? 'flex' : 'none';
  btn.textContent = count > 0 ? 'Save (' + count + ')' : 'Save';
  if (status) status.textContent = '';
}
