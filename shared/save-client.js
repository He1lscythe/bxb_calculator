// 共享前端 helper —— viewer 页面的 saveRevise 通过它发送修改。
// local 域名（127.0.0.1 / 192.168.* / 10.* / 172.16-31.*）→ POST /save（start.py 直接写文件）
// 其他域名（GitHub Pages 等）→ POST 到 Vercel 的 /api/save，由 Vercel 函数开 PR
//
// body shape 在两种模式下完全一致（详见 api/save.js 头部注释或 docs/frontend_ui.md）。

(function () {
  const VERCEL_API = 'https://bxb-calculator.vercel.app/api/save';

  function isLocalEnv() {
    const h = location.hostname;
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      /^192\.168\./.test(h) ||
      /^10\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    );
  }

  async function submitRevise(body) {
    const local = isLocalEnv();
    const endpoint = local ? '/save' : VERCEL_API;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json;
    try { json = await res.json(); } catch (_) { json = {}; }
    if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
    return Object.assign({}, json, { mode: local ? 'local' : 'remote' });
  }

  // helper —— 给一组 ids、一个 reviseData 对象，组成 patch 数组（仅当前 id 还有 diff 的）
  function pickPatches(reviseData, ids) {
    let out = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (reviseData && reviseData[id]) out.push(reviseData[id]);
    }
    return out;
  }

  // 显示在 nav.js 的 #save-toast 上的成功提示，自动 6 秒消失。
  // 主要用于 remote 模式 save 成功后给用户一个明显的视觉反馈（位置：导航栏 Save/汉堡菜单 左侧）。
  function showSaveToast(html, durationMs) {
    const t = document.getElementById('save-toast');
    if (!t) return;
    t.innerHTML = html;
    t.classList.add('show');
    if (t._hideTimer) clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function () {
      t.classList.remove('show');
      t._hideTimer = null;
    }, typeof durationMs === 'number' ? durationMs : 6000);
  }

  window.submitRevise = submitRevise;
  window.isLocalEnv = isLocalEnv;
  window.pickPatches = pickPatches;
  window.showSaveToast = showSaveToast;
})();
