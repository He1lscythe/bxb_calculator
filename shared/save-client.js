// shared/save-client.js — Phase 7 Session 2 save client
//
// 用法:
//   import { submitRevise, showSaveToast } from '../shared/save-client.js';
//   await submitRevise({ chara_revise: [...], session_ids: [...], ... });
//
// 路由:
//   local env (127.0.0.1 / 192.168.* / 10.* / 172.16-31.*) → POST /save (start.py 本地 endpoint)
//   otherwise → POST Vercel /api/save (跟 wiki main 同 URL: bxb-calculator.vercel.app)
//
// Body 4 bucket schema (跟 scripts/start.py + api/save.js 一致):
//   {
//     session_ids:       [int, ...],         // chara/soul/crystal 共用
//     masou_session_ids: [int, ...],         // masou 独立 namespace
//     chara_revise:      [{id, ...}, ...],   // optional bucket patches (sparse diff)
//     soul_revise:       [{id, ...}, ...],
//     crystal_revise:    [{id, ...}, ...],
//     masou_revise:      [{id, ...}, ...],
//   }

const VERCEL_API = 'https://bxb-calculator.vercel.app/api/save';

const isLocalEnv = () => {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    /^192\.168\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
};

export const submitRevise = async (body) => {
  const local = isLocalEnv();
  const endpoint = local ? '/save' : VERCEL_API;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch (_) {
    json = {};
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return { ...json, mode: local ? 'local' : 'remote' };
};

// toast: hensei / chara detail 页用、显示保存成功 / 失败 / PR URL
// id="save-toast" 的 DOM 在各 viewer 内嵌 (跟 wiki main 同 pattern)
export const showSaveToast = (html, durationMs = 6000) => {
  const t = document.getElementById('save-toast');
  if (!t) return;
  t.innerHTML = html;
  t.classList.add('show');
  if (t._hideTimer) clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => {
    t.classList.remove('show');
    t._hideTimer = null;
  }, durationMs);
};
