// js/omoide-view.js — Phase 7 Session 3 omoide「潜在開放」view-only
//
// 视觉 1:1 旧 wiki main:js/latent.js openLatentModal — 复用 css/characters.css 内
// .omoide-row / .omoide-label / .omoide-slots / .latent-slot / .latent-slot-koka /
// .latent-slot-syosai / .latent-slot-bairitu 现有样式。
//
// 数据源切换 (旧 wiki → master):
//   旧: c.omoide[].slots[iconId] + state.SENZAI_TABLE[iconId] = { koka, syosai, bairitu, calc_type, bairitu_scaling }
//   master: data/omoide/{base_id}.json .slots[].memory_slot.weapon_skills[] = { name, description, parameter, math_type, value, value_scaling }
//
// 映射:
//   koka      ← weapon_skill.name
//   syosai    ← weapon_skill.description
//   bairitu   ← value (math_type prefix + 億/万 缩写 + value_scaling 换行)

import { state } from './state.js';
import { escHtml } from './utils.js';
import { omoideEffectiveScaling } from '../shared/hensei-helpers.js';

const _baseIdOf = (c) => c?._master?.id ?? c?.id;

const _MATH_PREFIX = { Multiply: '×', Addition: '+', Set: '=' };

// 跟 wiki main fmtBairituJP 一致: 大数字缩写 (億/万) + scaling 换行
// scaling 走 omoideEffectiveScaling fallback (Frida 抓的 value_scaling 全空、用户实测 0.003)
const _fmtBairituJP = (sk) => {
  const v = sk.value;
  if (v == null || v === 0) return '';
  const pfx = _MATH_PREFIX[sk.math_type] || '';
  let valStr;
  if (v >= 1e8) {
    const b = v / 1e8;
    valStr = (b % 1 === 0 ? b : parseFloat(b.toFixed(2))) + '億';
  } else if (v >= 1e4) {
    const m = v / 1e4;
    valStr = (m % 1 === 0 ? m : parseFloat(m.toFixed(2))) + '万';
  } else {
    valStr = (v % 1 === 0) ? String(v) : String(parseFloat(v.toFixed(4)));
  }
  const sc = omoideEffectiveScaling(sk);
  if (sc !== 0) {
    const scStr = (sc % 1 === 0) ? String(sc) : String(parseFloat(sc.toFixed(4)));
    return `${pfx}(${valStr}+${scStr}\n×熟度)`;
  }
  return `${pfx}${valStr}`;
};

const _renderLatentSlot = (sk) => {
  const bStr = _fmtBairituJP(sk);
  const bClass = bStr ? 'latent-slot-bairitu' : 'latent-slot-bairitu empty';
  const bDisplay = bStr || '—';
  return `<div class="latent-slot">
    <span class="latent-slot-koka">${escHtml(sk.name || '?')}</span>
    <span class="latent-slot-syosai">${escHtml(sk.description || '')}</span>
    <span class="${bClass}">${escHtml(bDisplay)}</span>
  </div>`;
};

const _renderBody = (omoideData) => {
  // 按 affection_threshold 分组 (同 threshold 的所有 weapon_skills 摊平到一行)
  const groups = new Map();
  for (const slotObj of (omoideData?.slots || [])) {
    const ms = slotObj.memory_slot || {};
    const t = ms.affection_threshold ?? 0;
    if (!groups.has(t)) groups.set(t, []);
    for (const sk of (ms.weapon_skills || [])) {
      groups.get(t).push(sk);
    }
  }
  if (!groups.size) return '<div class="no-results">潜在 slot データなし</div>';
  const thresholds = Array.from(groups.keys()).sort((a, b) => a - b);
  return thresholds.map((t) => {
    const skills = groups.get(t);
    const slotsHtml = skills.map(_renderLatentSlot).join('');
    return `<div class="omoide-row">
      <div class="omoide-label">思い出 ${t.toLocaleString('ja-JP')}</div>
      <div class="omoide-slots">${slotsHtml}</div>
    </div>`;
  }).join('');
};

export const openLatentModal = async (wikiId) => {
  const c = state.allChars.find((x) => x.id === wikiId);
  if (!c) return;
  const baseId = _baseIdOf(c);
  let omoideData = c._omoide_data;
  if (!omoideData) {
    try {
      const r = await fetch(`../data/omoide/${baseId}.json`);
      if (r.ok) omoideData = await r.json();
    } catch (_) {
      omoideData = null;
    }
    c._omoide_data = omoideData;
  }
  const body = document.getElementById('latent-body');
  if (!body) return;
  body.innerHTML = omoideData
    ? _renderBody(omoideData)
    : '<div class="no-results">潜在データ取得失敗</div>';
  const modal = document.getElementById('latent-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
};

export const closeLatentModal = () => {
  const modal = document.getElementById('latent-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
};
