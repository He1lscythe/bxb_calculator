// bairitu_scaling 公式 (jk-1 vs jk) + Lv2-5 检测 + parser 分母 + schema 干净
// 用法: node tests/test_bairitu_scaling.cjs

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let pass = 0, fail = 0;
const eq = (label, a, b) => {
  const ok = (typeof a === 'number' && typeof b === 'number')
    ? Math.abs(a - b) < 1e-9
    : a === b;
  if (ok) pass++; else { fail++; console.error(`✗ ${label}: got=${JSON.stringify(a)} expected=${JSON.stringify(b)}`); }
};
const truthy = (label, cond) => { if (cond) pass++; else { fail++; console.error(`✗ ${label}`); } };

// ===== Lv2-5 検出 (与 hensei.html _LV2_5_RE 同步) =====
const _LV2_5_RE = /Lv[2-5](?!\d)/;

console.log('--- _LV2_5_RE: Lv2/Lv3/Lv4/Lv5 のみ命中（Lv50/Lv500 等は除外）---');
truthy('"禁式･冥魔神の波動【深化】Lv5+" → true',  _LV2_5_RE.test('禁式･冥魔神の波動【深化】Lv5+'));
truthy('"禁式･嵐魔神の加速回路【深化】Lv2+" → true', _LV2_5_RE.test('禁式･嵐魔神の加速回路【深化】Lv2+'));
truthy('"破壊神Lv3" → true', _LV2_5_RE.test('破壊神Lv3'));
truthy('"波動Lv4" → true', _LV2_5_RE.test('波動Lv4'));
truthy('"禁式･冥魔神の波動【深化】Lv6+" → false', !_LV2_5_RE.test('禁式･冥魔神の波動【深化】Lv6+'));
truthy('"波動Lv1" → false', !_LV2_5_RE.test('波動Lv1'));
truthy('"波動Lv7" → false', !_LV2_5_RE.test('波動Lv7'));
truthy('"破壊神" (no Lv) → false', !_LV2_5_RE.test('破壊神'));
truthy('"破壊神Lv50" (Lv50 不算 Lv5) → false', !_LV2_5_RE.test('破壊神Lv50'));
truthy('"Lv500" (多位数 不算) → false', !_LV2_5_RE.test('Lv500'));
truthy('空文字列 → false', !_LV2_5_RE.test(''));

// ===== _parseScaling (与 hensei.html 同实现) =====
const _parseScaling = (v) => {
  if (v == null || v === 0 || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.indexOf('/') >= 0) {
    const parts = v.split('/').map(Number);
    return parts[1] ? parts[0] / parts[1] : 0;
  }
  return parseFloat(v) || 0;
};

console.log('\n--- _parseScaling ---');
eq('null → 0', _parseScaling(null), 0);
eq('0 → 0', _parseScaling(0), 0);
eq('"" → 0', _parseScaling(''), 0);
eq('0.00768 → 0.00768', _parseScaling(0.00768), 0.00768);
eq('"2/99" → 2/99', _parseScaling('2/99'), 2/99);
eq('"5/98" → 5/98', _parseScaling('5/98'), 5/98);
eq('"1/0" 除 0 → 0', _parseScaling('1/0'), 0);
eq('"0.005" → 0.005', _parseScaling('0.005'), 0.005);

// ===== _scaledBairitu: 切 (jk-1) vs jk 公式 =====
// b / sc 双方とも数値・分式文字列 ("1/2") を受け入れる（_parseScaling 経由）。
const _scaledBairitu = (b, sc, jukudo, jkMinus1 = false) => {
  const bv = _parseScaling(b);
  const s  = _parseScaling(sc);
  if (!s) return bv;
  const factor = jkMinus1 ? (jukudo - 1) : jukudo;
  return bv + factor * s;
};

console.log('\n--- _scaledBairitu jkMinus1=true → b + (jk-1)*s ---');
// SS Lv5「波動【深化】」 base 1.75 + scaling 0.00768
eq('jk=1 → 1.75 (no contribution)', _scaledBairitu(1.75, 0.00768, 1, true), 1.75);
eq('jk=99 → 1.75 + 98*0.00768 = 2.50264', _scaledBairitu(1.75, 0.00768, 99, true), 1.75 + 98 * 0.00768);
// SS noLv「真解放-TRUE END-」 base 3 + scaling "2/99"... 但 noLv 应该用 jk=99 才到 5。
// Lv2-5 + "2/98" 才能 jk=99 到 5。我们测 fraction 也兼容 jkMinus1。
eq('jk=99 b=3 sc="2/98" jkm1=true → 5', _scaledBairitu(3, '2/98', 99, true), 3 + 98 * (2/98));

console.log('\n--- _scaledBairitu jkMinus1=false → b + jk*s（缺省）---');
// SS Lv6「波動【深化】」 base 2.0 + scaling 0.00768
eq('jk=99 → 2 + 99*0.00768 = 2.76032', _scaledBairitu(2.0, 0.00768, 99, false), 2.0 + 99 * 0.00768);
eq('jk=1 → 2 + 1*0.00768 = 2.00768', _scaledBairitu(2.0, 0.00768, 1, false), 2.0 + 1 * 0.00768);
// SS noLv「真解放-TRUE END-」 base 3 + scaling "2/99" → jk=99 到 5
eq('jk=99 b=3 sc="2/99" jkm1=false → 5', _scaledBairitu(3, '2/99', 99, false), 3 + 99 * (2/99));
eq('jk=1 b=3 sc="2/99" jkm1=false → 3 + 2/99', _scaledBairitu(3, '2/99', 1, false), 3 + 1 * (2/99));
// 系列表 noLv 「対魔剣殲滅魔導兵器」 base 2.0 + scaling 0.015 (rarity A → jk_max=90)
eq('jk=90 b=2 sc=0.015 jkm1=false → 3.35', _scaledBairitu(2.0, 0.015, 90, false), 2 + 90 * 0.015);

console.log('\n--- _scaledBairitu sc=null/0 → 直接返回 b ---');
eq('sc=null → b', _scaledBairitu(1.5, null, 99, true), 1.5);
eq('sc=0 → b', _scaledBairitu(1.5, 0, 99, false), 1.5);
eq('sc="" → b', _scaledBairitu(1.5, '', 99, true), 1.5);

console.log('\n--- _scaledBairitu: bairitu 自身も分式文字列 ("1/2") を受け入れ ---');
eq('b="1/2" sc=null → 0.5', _scaledBairitu('1/2', null, 99, false), 0.5);
eq('b="1/2" sc=0 → 0.5', _scaledBairitu('1/2', 0, 99, true), 0.5);
eq('b="3/4" sc=0.01 jk=10 → 0.75 + 0.1', _scaledBairitu('3/4', 0.01, 10, false), 0.85);
eq('b="2/3" sc="1/6" jk=2 jkm1=true → 2/3 + 1/6 = 5/6', _scaledBairitu('2/3', '1/6', 2, true), 2/3 + 1/6);
eq('b="1/0" 無効 sc=null → 0', _scaledBairitu('1/0', null, 99, true), 0);

console.log('\n--- 没 scaling 的 skill：Lv2-5 vs Lv6+ vs noLv 行为完全一致（短路返回 b）---');
// 同 base 同 jukudo、不同 jkm1，输出必须相同
const b1 = _scaledBairitu(2.0, 0, 99, true);   // Lv5 想象
const b2 = _scaledBairitu(2.0, 0, 99, false);  // Lv6+ / noLv 想象
const b3 = _scaledBairitu(2.0, null, 50, true);
const b4 = _scaledBairitu(2.0, null, 50, false);
eq('Lv5+sc=0 == Lv6+sc=0 (jk=99)', b1, b2);
eq('Lv5+sc=null == Lv6+sc=null (jk=50)', b3, b4);
eq('值都等于 base', b1, 2.0);

// ===== 浅 copy 注入 _jkm1 不污染源 =====
console.log('\n--- chara skill effects 平铺时 _jkm1 注入不污染源 ---');
const sk = { name: '禁式･波動【深化】Lv5+', effects: [{bunrui:[1], bairitu:1.75, bairitu_scaling:0.00768, calc_type:0}] };
const charaEffs = [];
const jkm1 = _LV2_5_RE.test(sk.name);
sk.effects.forEach(e => charaEffs.push(jkm1 ? { ...e, _jkm1: true } : e));
truthy('charaEffs[0]._jkm1 === true', charaEffs[0]._jkm1 === true);
truthy('源 effect 不含 _jkm1（浅 copy）', !('_jkm1' in sk.effects[0]));
truthy('源 effect.bairitu 不变', sk.effects[0].bairitu === 1.75);

const sk2 = { name: '禁式･脈動【深化】Lv6+', effects: [{bunrui:[5], bairitu:2.66, bairitu_scaling:0.008}] };
const eff2 = [];
const jkm12 = _LV2_5_RE.test(sk2.name);
sk2.effects.forEach(e => eff2.push(jkm12 ? { ...e, _jkm1: true } : e));
truthy('Lv6+ skill: 不命中 → 直接 push 原 ref', eff2[0] === sk2.effects[0]);
truthy('Lv6+ skill: 不带 _jkm1', !eff2[0]._jkm1);

// ===== Python: assign_bairitu_and_scaling =====
console.log('\n--- Python assign_bairitu_and_scaling: rarity × Lv 分母 ---');
const py = `
import sys, json
sys.path.insert(0, 'scripts')
from crawl_chara import assign_bairitu_and_scaling

cases = [
    # (skill, rarity) → 期望
    # 1. SS rarity, 无 Lv 后缀, effect 含「最大5倍」base 3 → scaling = (5-3)/99 = "2/99"
    ({'name':'真解放-TRUE END-', 'effect_text':'攻撃力が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】', 'effects':[{'bunrui':[1]}]}, 4),
    # 2. A rarity (3), 无 Lv 后缀 → 分母 90: (5-3)/90 = "2/90" = "1/45"
    ({'name':'真解放-TRUE END-', 'effect_text':'攻撃力が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】', 'effects':[{'bunrui':[1]}]}, 3),
    # 3. SS rarity, Lv5+ 深化 → SKILL_TABLE 直查、jk_minus_1=True
    ({'name':'波動【深化】Lv5+', 'effect_text':'攻撃力が大にアップ【熟度UPにつれてさらに効果値UP】', 'effects':[{'bunrui':[1]}]}, 4),
    # 4. SS rarity, Lv6+ 深化 → SKILL_TABLE 直查、jk_minus_1=False
    ({'name':'波動【深化】Lv6+', 'effect_text':'攻撃力が大にアップ【熟度UPにつれてさらに効果値UP】', 'effects':[{'bunrui':[1]}]}, 4),
    # 5. SS, 「最大5倍」+ Lv5 → 分母 98: (5-3)/98 = "1/49"
    ({'name':'破壊神Lv5', 'effect_text':'攻撃力が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】', 'effects':[{'bunrui':[1]}]}, 4),
    # 6. B rarity (2), Lv2 + 「最大4倍」base 2 → 分母 69: (4-2)/69 = "2/69"
    # 用 SKILL_TABLE に存在しない name でないと _table_lookup でベース倍率が上書きされる
    ({'name':'破壊神Lv2', 'effect_text':'攻撃力が2倍【熟度UPにつれてさらに効果値がUP(最大4倍)】', 'effects':[{'bunrui':[1]}]}, 2),
]
out = []
for skill, rarity in cases:
    r = assign_bairitu_and_scaling(skill, rarity)
    out.append({'b': r[0], 's': r[1], 'ct': r[2], 'jkm1': r[3]})
print(json.dumps(out, ensure_ascii=False))
`;
const r = spawnSync('python', ['-c', py], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
const stdout = (r.stdout || '') + (r.stderr || '');
const last = stdout.trim().split('\n').filter(l => l.trim().startsWith('[')).pop();
let parsed = null;
try { parsed = JSON.parse(last); } catch (e) { console.error('python output parse failed:', stdout); }

if (parsed) {
  // case 0: SS noLv「最大5倍」 → s = "2/99", jkm1=False
  eq('case0 (SS noLv 最大5倍): s = "2/99"', parsed[0].s, '2/99');
  eq('case0: jkm1 = False', parsed[0].jkm1, false);
  // case 1: A noLv「最大5倍」 → s = (5-3)/90 = 1/45 (化简後)
  eq('case1 (A noLv 最大5倍): s = "1/45"', parsed[1].s, '1/45');
  eq('case1: jkm1 = False', parsed[1].jkm1, false);
  // case 2: SS Lv5 深化 → SKILL_TABLE「波動【深化】」5 = 0.00768
  eq('case2 (SS Lv5 深化): s = 0.00768', parsed[2].s, 0.00768);
  eq('case2: jkm1 = True', parsed[2].jkm1, true);
  // case 3: SS Lv6 深化 → 0.00768、jkm1=False
  eq('case3 (SS Lv6 深化): s = 0.00768', parsed[3].s, 0.00768);
  eq('case3: jkm1 = False', parsed[3].jkm1, false);
  // case 4: SS Lv5 + 最大5倍 → s = (5-3)/(99-1) = 1/49
  eq('case4 (SS Lv5 最大5倍): s = "1/49"', parsed[4].s, '1/49');
  eq('case4: jkm1 = True', parsed[4].jkm1, true);
  // case 5: B Lv2 + 最大4倍 → s = (4-2)/(70-1) = 2/69
  eq('case5 (B Lv2 最大4倍): s = "2/69"', parsed[5].s, '2/69');
  eq('case5: jkm1 = True', parsed[5].jkm1, true);
}

// ===== schema：data/characters.json 中 bairitu_scaling_minus_jk_1 已清干净 =====
console.log('\n--- schema：bairitu_scaling_minus_jk_1 字段不应残留（已迁移到 calc-only 推断）---');
const ROOT = path.resolve(__dirname, '..');
const chars = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characters.json'), 'utf8'));
let leftovers = 0;
function walk(x) {
  if (Array.isArray(x)) { x.forEach(walk); return; }
  if (!x || typeof x !== 'object') return;
  if ('bairitu_scaling_minus_jk_1' in x) leftovers++;
  for (const v of Object.values(x)) walk(v);
}
walk(chars);
truthy(`characters.json 中无 bairitu_scaling_minus_jk_1 字段（残留 ${leftovers}）`, leftovers === 0);

// ===== 实数据校验：现存 chara skill scaling 与公式自洽 =====
console.log('\n--- 实数据：jk=max 时还原效果文字「最大N倍」 ---');
// 取一个明确含「熟度…最大N倍」的 skill 来验证
let verified = 0;
const _RARITY_MAX_JK = { 1:50, 2:70, 3:90, 4:99 };
for (const c of chars) {
  for (const state of Object.values(c.states || {})) {
    for (const sk of state.skills || []) {
      const m = (sk.effect_text || '').match(/熟度.*?最大(?:約)?(\d+(?:\.\d+)?)倍/);
      if (!m) continue;
      const maxFromText = parseFloat(m[1]);
      const e = (sk.effects || [])[0];
      if (!e) continue;
      const sc = e.bairitu_scaling;
      if (!sc) continue;
      const jkm1 = _LV2_5_RE.test(sk.name || '');
      const jkMax = _RARITY_MAX_JK[c.rarity] || 99;
      const reconstructed = _scaledBairitu(e.bairitu || 0, sc, jkMax, jkm1);
      // 容差 0.02（fmtLarge 显示精度 / wiki 数据精度）
      if (Math.abs(reconstructed - maxFromText) <= 0.02) verified++;
    }
  }
}
truthy(`计算还原 maxN倍 的 skill 数 > 0（实测 ${verified}）`, verified > 0);

// ===== parseBairituVal: edit UI 入口 (与 js/utils.js 同実装) =====
console.log('\n--- parseBairituVal: edit UI 分式入力 ---');
const parseBairituVal = (s) => {
  if (s === '') return null;
  if (s.includes('/')) {
    const p = s.trim().split('/');
    return (p.length === 2 && p[0] !== '' && p[1] !== '') ? s.trim() : null;
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
};
eq('"" → null', parseBairituVal(''), null);
eq('"5" → 5 (number)', parseBairituVal('5'), 5);
eq('"5.5" → 5.5 (number)', parseBairituVal('5.5'), 5.5);
eq('"0" → 0 (number)', parseBairituVal('0'), 0);
eq('"1/2" → "1/2" (string)', parseBairituVal('1/2'), '1/2');
eq('"3/2" → "3/2" (string)', parseBairituVal('3/2'), '3/2');
eq('" 1/2 " → "1/2" (trim)', parseBairituVal(' 1/2 '), '1/2');
eq('"1/" → null (incomplete)', parseBairituVal('1/'), null);
eq('"/2" → null (incomplete)', parseBairituVal('/2'), null);
eq('"abc" → null', parseBairituVal('abc'), null);
truthy('"1/2" 类型は string', typeof parseBairituVal('1/2') === 'string');
truthy('"5" 类型は number', typeof parseBairituVal('5') === 'number');

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
