// ===== Save client =====
// Usage: import { submitRevise, pickPatches, showSaveToast } from '../shared/save-client.js';
//
// local env (127.0.0.1 / 192.168.* / 10.* / 172.16-31.*) → POST /save (start.py)
// otherwise → POST Vercel /api/save (opens PR on GitHub)

const VERCEL_API = 'https://bxb-calculator.vercel.app/api/save';

export const isLocalEnv = () => {
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

export const submitRevise = async body => {
  const local    = isLocalEnv();
  const endpoint = local ? '/save' : VERCEL_API;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json;
  try { json = await res.json(); } catch (_) { json = {}; }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return { ...json, mode: local ? 'local' : 'remote' };
};

export const pickPatches = (reviseData, ids) =>
  ids.filter(id => reviseData?.[id]).map(id => reviseData[id]);

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
