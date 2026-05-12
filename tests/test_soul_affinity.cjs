// 测试 soul affinity schema + atk/def_effect 独立乘区计算
// 用法: node tests/test_soul_affinity.js

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const eq = (label, a, b) => {
  const ok = Math.abs(a - b) < 1e-9;
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${label}: ${a} ≠ ${b}`);
  }
};
const truthy = (label, cond) => { if (cond) pass++; else { fail++; console.error(`✗ ${label}`); } };

// _parseAff (镜像 hensei.html)
const _parseAff = (s) => {
  if (s == null) return 1;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 1;
  const t = String(s).trim();
  if (t === '') return 1;
  if (t.includes('/')) {
    const [n, d] = t.split('/').map(parseFloat);
    return (Number.isFinite(n) && Number.isFinite(d) && d !== 0) ? n / d : 1;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 1;
};

console.log('--- _parseAff parsing ---');
eq('null → 1', _parseAff(null), 1);
eq('undefined → 1', _parseAff(undefined), 1);
eq('"" → 1', _parseAff(''), 1);
eq('"1" → 1', _parseAff('1'), 1);
eq('"1.9" → 1.9', _parseAff('1.9'), 1.9);
eq('"5/4" → 1.25', _parseAff('5/4'), 1.25);
eq('"1/3" → 0.3333', _parseAff('1/3'), 1 / 3);
eq('"5/0" → 1 (除零回退)', _parseAff('5/0'), 1);
eq('"abc" → 1 (无效回退)', _parseAff('abc'), 1);
eq('number 2.5 直接通过', _parseAff(2.5), 2.5);

console.log('\n--- atk/def 倍率组合 ---');
// 模拟 hensei calc 的 affinity 计算
const _ELEMS = ['火','水','風','光','闇','無'];
const _WEAPS = ['長剣','大剣','太刀','杖棒','弓矢','連弩','戦斧','騎槍','投擲','拳闘','魔典','大鎌'];
function affinityMult(soul, charaElement, charaType) {
  const eName = _ELEMS[(charaElement || 6) - 1];
  const wName = _WEAPS[(charaType || 1) - 1];
  const eAff = (soul.element_affinity || {})[eName] || {};
  const wAff = (soul.weapon_affinity  || {})[wName] || {};
  return {
    atk: _parseAff(eAff.atk_effect) * _parseAff(wAff.atk_effect),
    def: _parseAff(eAff.def_effect) * _parseAff(wAff.def_effect),
  };
}

// 默认 soul (无 atk/def 字段)
const defaultSoul = {
  element_affinity: { 火: {level:1}, 水: {level:0} },
  weapon_affinity:  { 長剣: {level:0}, 大剣: {level:1} },
};
let m = affinityMult(defaultSoul, 1, 1);
eq('default atk=1', m.atk, 1);
eq('default def=1', m.def, 1);

// 部分 atk override
const customSoul = {
  element_affinity: { 火: {level:1, atk_effect:'1.9', def_effect:'0.5'}, 水: {level:0} },
  weapon_affinity:  { 長剣: {level:0, atk_effect:'5/4'}, 大剣: {level:1} },
};
m = affinityMult(customSoul, 1, 1);  // 火 + 長剣
eq('火+長剣 atk=1.9*1.25', m.atk, 1.9 * 1.25);
eq('火+長剣 def=0.5*1', m.def, 0.5);
m = affinityMult(customSoul, 2, 2);  // 水 + 大剣 (无 override → 1)
eq('水+大剣 atk=1', m.atk, 1);
eq('水+大剣 def=1', m.def, 1);

console.log('\n--- 独立乘区: bunrui [1,2] vs [12] ---');
// 模拟应用：atkAff 影响攻撃力(bunrui 1)/ブレイク力(bunrui 2)，defAff 影响防御力(bunrui 12)
function applyAffinity(stats, atkAff, defAff) {
  const out = {...stats};
  out['攻撃力']    *= atkAff;
  out['ブレイク力'] *= atkAff;
  out['防御力']    *= defAff;
  // HP 等其他不受影响
  return out;
}
const stats = { '攻撃力': 1000, 'ブレイク力': 500, '防御力': 800, 'HP': 5000 };
const out = applyAffinity(stats, 1.9, 0.5);
eq('攻撃力 1000*1.9', out['攻撃力'], 1900);
eq('ブレイク力 500*1.9', out['ブレイク力'], 950);
eq('防御力 800*0.5', out['防御力'], 400);
eq('HP 不受影响', out['HP'], 5000);

console.log('\n--- 实际 souls.json schema 验证 ---');
let arr;
try {
  arr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'souls.json'), 'utf8'));
} catch (e) {
  console.log('  (souls.json 加载失败，跳过)');
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
truthy('souls.json 是数组', Array.isArray(arr));
truthy('至少 100 个 entry', arr.length >= 100);
// 验证 base 不存默认 atk/def_effect="1"（migrate 后）
let stripCount = 0, totalAffEntries = 0;
for (const s of arr) {
  for (const fld of ['element_affinity', 'weapon_affinity']) {
    const d = s[fld] || {};
    for (const e of Object.values(d)) {
      if (e && typeof e === 'object') {
        totalAffEntries++;
        if (e.atk_effect === '1' || e.def_effect === '1') stripCount++;
      }
    }
  }
}
truthy(`base souls.json 不含 atk/def_effect="1"（共 ${totalAffEntries} 个 affinity entry，${stripCount} 个含 "1"）`,
       stripCount === 0);

// 验证 schema：每个 affinity entry 至少有 level
let levelMissing = 0;
for (const s of arr) {
  for (const fld of ['element_affinity', 'weapon_affinity']) {
    const d = s[fld] || {};
    for (const e of Object.values(d)) {
      if (e && typeof e === 'object' && e.level === undefined) levelMissing++;
    }
  }
}
truthy(`所有 affinity entry 都有 level (missing: ${levelMissing})`, levelMissing === 0);

// ===== fmtAff (display formatter — 镜像 js/utils.js) =====
console.log('\n--- fmtAff: 表示用フォーマッタ（編集モードでは使わない）---');
const fmtAff = (v) => {
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
const eqStr = (label, a, b) => {
  if (a === b) pass++;
  else { fail++; console.error(`✗ ${label}: got=${JSON.stringify(a)} expected=${JSON.stringify(b)}`); }
};

// null / 缺失 → デフォルト '1'
eqStr('null → "1"', fmtAff(null), '1');
eqStr('undefined → "1"', fmtAff(undefined), '1');

// 整数値（数値 / 文字列両対応）→ 末尾 0 を除去
eqStr('1 (number) → "1"', fmtAff(1), '1');
eqStr('"1" → "1"', fmtAff('1'), '1');
eqStr('1.0 (number) → "1"', fmtAff(1.0), '1');
eqStr('"1.0" → "1"', fmtAff('1.0'), '1');
eqStr('"1.00" → "1"', fmtAff('1.00'), '1');

// 一桁小数
eqStr('1.9 → "1.9"', fmtAff(1.9), '1.9');
eqStr('"1.9" → "1.9"', fmtAff('1.9'), '1.9');
eqStr('"1.90" → "1.9" (末尾 0 落とす)', fmtAff('1.90'), '1.9');

// 二桁小数（ちょうど 2dp）
eqStr('1.23 → "1.23"', fmtAff(1.23), '1.23');
eqStr('"1.23" → "1.23"', fmtAff('1.23'), '1.23');

// 3 桁以上 → 四捨五入 2dp
eqStr('1.234 → "1.23"', fmtAff(1.234), '1.23');
eqStr('1.235 → "1.24" (四舍五入)', fmtAff(1.235), '1.24');
eqStr('1.999 → "2"', fmtAff(1.999), '2');
eqStr('"1.234" → "1.23"', fmtAff('1.234'), '1.23');

// 分式は素通し（trim はする）
eqStr('"5/4" → "5/4"', fmtAff('5/4'), '5/4');
eqStr('"1/2" → "1/2"', fmtAff('1/2'), '1/2');
eqStr('" 5/4 " → "5/4" (trim)', fmtAff(' 5/4 '), '5/4');
eqStr('"3/2" → "3/2"', fmtAff('3/2'), '3/2');

// 不正な文字列 → そのまま（display 側で raw を見せる）
eqStr('"" → ""', fmtAff(''), '');
eqStr('"abc" → "abc"', fmtAff('abc'), 'abc');

// 编辑模式不应该用 fmtAff（edit 路径用 raw `aff.atk_effect`）— 这只是 display
// 確認しておく：分式入力 → display は分式、parseFloat 値が変わらない
truthy('"5/4" の分式表示と parseAff(5/4)=1.25 の数値計算は別レイヤ',
       fmtAff('5/4') === '5/4' && Math.abs(_parseAff('5/4') - 1.25) < 1e-9);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
