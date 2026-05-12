// js/utils.js
import { BUNRUI_SHORT, ELEMENT, WEAPON, CONDITION } from '../shared/constants.js';

export const hasOmoide = (c) => {
  return c.omoide && c.omoide.some(function(r) { return r.slots && r.slots.length > 0; });
}

export const renderRightTags = (s) => {
  let tags = '';
  (s.effects || []).forEach(function(e) {
    (e.bunrui || []).forEach(function(b) {
      tags += '<span class="bunrui-tag">' + (BUNRUI_SHORT[b] || b) + '</span>';
    });
    if (e.scope === 0) {
      tags += '<span class="scope-tag scope-self">自</span>';
    } else if (e.scope === 1) {
      tags += '<span class="scope-tag scope-all">全</span>';
    } else if (e.scope === 2) {
      const lim = e.element != null ? (ELEMENT[e.element] || e.element) : (e.weapon != null ? (WEAPON[e.weapon] || e.weapon) : '限');
      tags += '<span class="scope-tag scope-lim">' + lim + '</span>';
    }
    if (e.condition) tags += '<span class="cond-tag cond-' + e.condition + '">' + (CONDITION[e.condition] || '') + '</span>';
  });
  return '<div class="skill-tags-right">' + tags + '</div>';
}

export const fmtNum = (v) => {
  if (typeof v === 'string') {
    // 分式 "100000000/9" → 両側それぞれ千分位化（"100,000,000/9"）。非数値部分は原状維持。
    if (v.includes('/')) {
      return v.split('/').map(part => {
        const t = part.trim();
        const n = Number(t);
        if (t === '' || isNaN(n)) return part;
        return Number.isInteger(n) ? n.toLocaleString('en-US') : String(parseFloat(n.toFixed(4)));
      }).join('/');
    }
    return v;
  }
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  return String(parseFloat(v.toFixed(4)));
}

// soul affinity の atk_effect / def_effect 表示用。
//   - 含 `/` の文字列 → そのまま（分数表記を保持）
//   - 数値 / 数値文字列 → 小数 2 位四捨五入、末尾 0 除去（例 1.9 → "1.9"、1.234 → "1.23"、1 → "1"）
//   - その他 → そのまま toString
// 編集モードは生値を見せるので別 path（このヘルパは display 専用）。
export const fmtAff = (v) => {
  if (v == null) return '1';
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.includes('/')) return t;
    const n = parseFloat(t);
    if (!Number.isFinite(n)) return t;
    return parseFloat(n.toFixed(2)).toString();
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return parseFloat(v.toFixed(2)).toString();
  }
  return String(v);
};

export const parseBairituVal = (s) => {
  if (s === '') return null;
  if (s.includes('/')) {
    const p = s.trim().split('/');
    return (p.length === 2 && p[0] !== '' && p[1] !== '') ? s.trim() : null;
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export const ctPfx = (ct) => {
  if (ct === 1) return '+';
  if (ct === 2) return '+(終)';
  if (ct === 3) return '×(終)';
  return '×';
}

export const fmtHitStages = (e) => {
  // Render hit_per_stage with optional milestone scaling
  const hps = Array.isArray(e.hit_per_stage) ? e.hit_per_stage : [];
  const sc  = Array.isArray(e.hit_per_stage_scaling) ? e.hit_per_stage_scaling : [0,0,0];
  if (!hps.length) return '';
  const ht  = e.hit_type != null ? e.hit_type : 0;
  const op  = (ht === 2) ? '×' : (ht === 3) ? '=' : '+';  // 2=乗算→×, 3=設定値→=, else→+
  function stageStr(v, s) {
    if (!s) return op + fmtNum(v);
    return op + '(' + fmtNum(v) + ' + ' + fmtNum(s) + ' * 熟度)';
  }
  // Condensed form: all 3 stages identical → show once with "全段"
  const s0 = sc[0] || 0, s1 = sc[1] || 0, s2 = sc[2] || 0;
  if (hps.length === 3 && hps[0] !== 0 && hps[0] === hps[1] && hps[1] === hps[2] && s0 === s1 && s1 === s2) {
    return stageStr(hps[0], s0);
  }
  const parts = hps.map(function(v, i) {
    if (v == null || v === 0) return null;
    return (i + 1) + '撃' + stageStr(v, sc[i] || 0);
  }).filter(Boolean);
  return parts.length ? parts.join(' / ') : '';
}

export const fmtBairitu = (s) => {
  return (s.effects || []).map(function(e) {
    const bunrui = e.bunrui || [];
    const isHitOnly = bunrui.length === 1 && bunrui[0] === 7;
    if (isHitOnly) return fmtHitStages(e);
    let bairituStr = '';
    if (e.bairitu != null && e.bairitu !== 0) {
      const sc = e.bairitu_scaling;
      const pfx = ctPfx(e.calc_type);
      bairituStr = pfx + (sc ? '(' : '') + fmtNum(e.bairitu);
      if (sc) bairituStr += ' + ' + fmtNum(sc) + ' * 熟度)';
    }
    const hitStr = bunrui.includes(7) ? fmtHitStages(e) : '';
    return [bairituStr, hitStr].filter(Boolean).join(' / ');
  }).filter(Boolean).join(' / ');
}

export const fmt = (n) => {
  if (n == null) return '-';
  if (typeof n === 'number') return n.toLocaleString('ja-JP');
  return String(n);
}

// row バッジ用：大きい数字を万/億に変換（toFixed(2)）
export const fmtLarge = (n) => {
  if (n == null) return '-';
  if (typeof n !== 'number') return String(n);
  const a = Math.abs(n);
  if (a >= 1e8) return parseFloat((n / 1e8).toFixed(2)) + '億';
  if (a >= 1e4) return parseFloat((n / 1e4).toFixed(2)) + '万';
  return Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(2)).toString();
};

export const escHtml = (s) => {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};

// 数据加载完后调用：让 loading overlay fade 掉再从 DOM 移除
export const hideLoading = () => {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  el.classList.add('done');
  setTimeout(() => el.remove(), 300);
};

// Tagged template helper: 把多行可读的 HTML 模板字符串运行时压缩
// 用法：min`<div>\n  <span>${x}</span>\n</div>` → "<div><span>...</span></div>"
// 只清除"换行+紧跟空白"，单个空格保留（inline 元素间空白有语义）。
// `${...}` 表达式的值原样保留，不被压缩。
export const min = (strs, ...vals) => {
  let out = strs[0].replace(/\n\s*/g, '');
  for (let i = 0; i < vals.length; i++) {
    out += vals[i] + strs[i + 1].replace(/\n\s*/g, '');
  }
  return out;
};

