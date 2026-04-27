(function () {
  if (document.getElementById('topbar')) return;
  var PAGES = [
    { id: 'index',      href: 'index.html',      label: '魔剣' },
    { id: 'crystals',  href: 'crystals.html',  label: '結晶' },
    { id: 'bladegraph', href: 'bladegraph.html', label: '心象' },
    { id: 'soul',      href: 'soul.html',      label: 'ソウル' },
  ];

  // detect active page from filename
  var path = window.location.pathname.replace(/\/$/, '');
  var file = path.split('/').pop() || 'index.html';
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
        '<label id="file-label" for="file-input">JSON を読み込む</label>' +
        '<input type="file" id="file-input" accept=".json,.js">' +
        '<span id="file-status"></span>' +
        '<div id="revise-bar">' +
          '<button class="btn-revise-save" onclick="saveRevise()">Save</button>' +
          '<span id="revise-status"></span>' +
        '</div>' +
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
    '#file-label{cursor:pointer;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;white-space:nowrap;}' +
    '#file-label:hover{opacity:.85;}' +
    '#file-input{display:none;}' +
    '#file-status{font-size:12px;color:var(--text2);white-space:nowrap;}' +
    '#revise-bar{display:none;align-items:center;gap:8px;background:#142814;border:1px solid #2d6b2d;border-radius:6px;padding:4px 10px;}' +
    '#revise-status{font-size:12px;color:#55bb55;}' +
    '.btn-revise-save{background:#1e5c1e;color:#aaffaa;border:1px solid #2d8c2d;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:600;}' +
    '.btn-revise-save:hover{background:#266626;}' +
    '.btn-revise-save:disabled{opacity:.5;cursor:default;}' +
    '@media(max-width:600px){#file-label,#file-status{display:none;}#topbar{min-height:52px;}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // insert topbar where this script tag sits
  document.currentScript.insertAdjacentHTML('afterend', html);
})();
