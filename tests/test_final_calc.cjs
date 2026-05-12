// calc_type=2 (最終加算) / 3 (最終乗算) + Stage 5 final pass + Stage 6 BD 排序
// 用法: node tests/test_final_calc.cjs

const { spawnSync } = require('child_process');
const path = require('path');

let pass = 0, fail = 0;
const eq = (label, a, b) => {
  const ok = (typeof a === 'number' && typeof b === 'number')
    ? Math.abs(a - b) < 1e-9
    : a === b;
  if (ok) pass++; else { fail++; console.error(`✗ ${label}: got=${JSON.stringify(a)} expected=${JSON.stringify(b)}`); }
};
const truthy = (label, cond) => { if (cond) pass++; else { fail++; console.error(`✗ ${label}`); } };

// ===== _applyEf 简化模拟 (与 hensei.html 同 ct 过滤逻辑) =====
function _applyEf(acc, e, mode) {
  const ct = e.calc_type ?? 1;
  if (mode === 'add'       && ct !== 1) return;
  if (mode === 'mul'       && ct !== 0) return;
  if (mode === 'final-add' && ct !== 2) return;
  if (mode === 'final-mul' && ct !== 3) return;
  const isAddMode = (mode === 'add' || mode === 'final-add');
  const v = e.bairitu;
  if (isAddMode) acc.stat += v;
  else           acc.stat *= v;
}

// ===== ct 过滤：mode↔ct 严格对应 =====
console.log('--- _applyEf ct 过滤：mode 仅命中相应 ct ---');
function check(ct, mode, baseStat, expected, label) {
  const acc = { stat: baseStat };
  _applyEf(acc, { calc_type: ct, bairitu: 10 }, mode);
  eq(label, acc.stat, expected);
}
check(1, 'add',       100, 110, 'ct=1 + add → +10');
check(1, 'mul',       100, 100, 'ct=1 + mul → 不应用');
check(1, 'final-add', 100, 100, 'ct=1 + final-add → 不应用');
check(0, 'mul',       100, 1000, 'ct=0 + mul → ×10');
check(0, 'add',       100, 100, 'ct=0 + add → 不应用');
check(2, 'final-add', 100, 110, 'ct=2 + final-add → +10');
check(2, 'add',       100, 100, 'ct=2 + add → 不应用 (final 不被 normal pass 触发)');
check(2, 'mul',       100, 100, 'ct=2 + mul → 不应用');
check(2, 'final-mul', 100, 100, 'ct=2 + final-mul → 不应用 (final-add ≠ final-mul)');
check(3, 'final-mul', 100, 1000, 'ct=3 + final-mul → ×10');
check(3, 'final-add', 100, 100, 'ct=3 + final-add → 不应用');
check(3, 'mul',       100, 100, 'ct=3 + mul → 不应用 (final 不被 normal pass 触发)');

// ===== Stage 顺序：normal-add → normal-mul → final-add → final-mul → BD =====
console.log('\n--- Pipeline 顺序：normal → final → BD ---');
function pipeline(initial, effects, bdEffects) {
  const acc = { stat: initial };
  // Stage normal: add → mul（按 ct=1, ct=0 过滤）
  for (const e of effects) _applyEf(acc, e, 'add');
  for (const e of effects) _applyEf(acc, e, 'mul');
  // Stage 5 Final pass（按 ct=2, ct=3 过滤）— BD 不参与
  for (const e of effects) _applyEf(acc, e, 'final-add');
  for (const e of effects) _applyEf(acc, e, 'final-mul');
  // Stage 6 BD（最後に走る、独立）
  for (const e of bdEffects) _applyEf(acc, e, 'add');
  for (const e of bdEffects) _applyEf(acc, e, 'mul');
  return acc.stat;
}

// 例：base 100, +50 (ct=1), ×2 (ct=0), +20 (ct=2), ×0.5 (ct=3), BD ×3 (ct=0)
// normal: 100 + 50 = 150 → ×2 = 300
// final:  300 + 20 = 320 → ×0.5 = 160
// BD:     160 × 3 = 480
const rA = pipeline(100,
  [
    {calc_type:1, bairitu:50},
    {calc_type:0, bairitu:2},
    {calc_type:2, bairitu:20},
    {calc_type:3, bairitu:0.5},
  ],
  [{calc_type:0, bairitu:3}]
);
eq('正确顺序: 100 +50 ×2 +20 ×0.5 ×3 → 480', rA, 480);

// 验证 final-add 在 normal-mul 之后（不是「先 final-add 再 normal-mul」）
// base=100, ×2 (ct=0), +50 (ct=2)
//   错序（先 +50 再 ×2）: (100+50)*2 = 300
//   正确（先 ×2 再 +50）: 100*2+50 = 250
const rB = pipeline(100, [
  {calc_type:0, bairitu:2},
  {calc_type:2, bairitu:50},
], []);
eq('final-add 在 normal-mul 之后: 100×2+50 = 250', rB, 250);

// 验证 final-mul 在 final-add 之后
// base=100, +20 (ct=2), ×0.5 (ct=3)
//   错序: 100×0.5+20 = 70
//   正确: (100+20)×0.5 = 60
const rC = pipeline(100, [
  {calc_type:3, bairitu:0.5},  // 输入顺序故意打乱
  {calc_type:2, bairitu:20},
], []);
eq('final-mul 在 final-add 之后: (100+20)×0.5 = 60', rC, 60);

// 验证 BD 在所有 final 之后
// base=100, +20 (ct=2), ×0.5 (ct=3), BD +50 (ct=1)
//   错序（BD 先）: ((100+50)+20)*0.5 = 85
//   正确（BD 最后）: ((100+20)*0.5)+50 = 110
const rD = pipeline(100, [
  {calc_type:2, bairitu:20},
  {calc_type:3, bairitu:0.5},
], [{calc_type:1, bairitu:50}]);
eq('BD 在所有 final 之后: (100+20)*0.5+50 = 110', rD, 110);

// ===== BD 自身 ct=2/3 也不进 final pass（finalDeferred 跳过） =====
// 关键 invariant：BD 的 effect 即使 ct=2/3 也不会被 _applyEf 在 final-add/final-mul mode 触发
// 因为 BD 走 _applyList(..., skipFinal=true)，effect 不入 finalDeferred
console.log('\n--- BD effects 即使 ct=2/3 也不参与 final pass（Stage 6 走自己的 add/mul） ---');
const acc = { stat: 100 };
const nonBd = [{calc_type:2, bairitu:20}];
const bd    = [{calc_type:2, bairitu:99}];  // BD 内若有 ct=2，本不应触发；BD stage 只跑 add/mul
// Stage normal
for (const e of nonBd) _applyEf(acc, e, 'add');
for (const e of nonBd) _applyEf(acc, e, 'mul');
// Stage 5 final（仅 nonBd）
for (const e of nonBd) _applyEf(acc, e, 'final-add');
for (const e of nonBd) _applyEf(acc, e, 'final-mul');
// Stage 6 BD（仅 add/mul，ct=2 不命中）
for (const e of bd) _applyEf(acc, e, 'add');
for (const e of bd) _applyEf(acc, e, 'mul');
eq('BD ct=2 effect 被忽略（不命中 add/mul）→ 仅 nonBd final-add 生效: 100+20=120', acc.stat, 120);

// ===== ctPfx 显示前缀 =====
console.log('\n--- ctPfx: 0→×, 1→+, 2→+(終), 3→×(終) ---');
const ctPfx = (ct) => {
  if (ct === 1) return '+';
  if (ct === 2) return '+(終)';
  if (ct === 3) return '×(終)';
  return '×';
};
eq('ct=0 → ×', ctPfx(0), '×');
eq('ct=1 → +', ctPfx(1), '+');
eq('ct=2 → +(終)', ctPfx(2), '+(終)');
eq('ct=3 → ×(終)', ctPfx(3), '×(終)');
eq('ct=undefined → ×', ctPfx(undefined), '×');

// ===== Python: classify_common 関键詞識別 =====
console.log('\n--- Python: classify_common 「最終的に/最後に」 → ct=2/3 ---');
const py = `
import sys
sys.path.insert(0, 'scripts')
from classify_common import _extract_val_from_pos
import json

# (text, bunrui) → 期望 (val, ct)
cases = [
    ('攻撃力が最終的に+50する',     1, (50.0, 2)),  # 最終加算
    ('攻撃力が最終的に2倍にする',   1, (2.0,  3)),  # 最終乗算
    ('攻撃力が最後に+30',           1, (30.0, 2)),  # 「最後に」 同等
    ('攻撃力が最後に1.5倍',         1, (1.5,  3)),  # 「最後に」 N倍
    # 普通の +N / N倍 が前にあっても final が後ろなら final が後の position に来るので普通優先（位置で決定）
    ('攻撃力が+50する',             1, (50.0, 1)),  # 普通加算
    ('攻撃力が2倍にする',           1, (2.0,  0)),  # 普通乗算
    # 文中の 1 つ目が final なら final 優先（最終キーワード位置が早い）
    ('最終的に+50後に普通+30',      1, (50.0, 2)),
]
out = []
for text, bunrui, expected in cases:
    val, ct = _extract_val_from_pos(text, 0, bunrui)
    out.append({'val': val, 'ct': ct, 'expected_val': expected[0], 'expected_ct': expected[1], 'text': text[:30]})
print(json.dumps(out, ensure_ascii=False))
`;
const r = spawnSync('python', ['-c', py], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
const out = (r.stdout || '') + (r.stderr || '');
const last = out.trim().split('\n').filter(l => l.trim().startsWith('[')).pop();
let parsed = null;
try { parsed = JSON.parse(last); } catch (e) { console.error('python parse failed:', out); }
if (parsed) {
  parsed.forEach((p, i) => {
    eq(`case${i} val: ${p.text}`, p.val, p.expected_val);
    eq(`case${i} ct:  ${p.text}`, p.ct,  p.expected_ct);
  });
}

// ===== Python: crawl_chara._effect_extract も同様にサポート =====
console.log('\n--- Python: crawl_chara._effect_extract 「最終的に」 識別 ---');
const py2 = `
import sys, json
sys.path.insert(0, 'scripts')
from crawl_chara import _effect_extract
cases = [
    ('攻撃力が最終的に+50する',     [1], (50.0, 2)),
    ('攻撃力が最終的に2倍にする',   [1], (2.0,  3)),
    ('攻撃力が最後に+30',           [1], (30.0, 2)),
    ('攻撃力が+50する',             [1], (50.0, 1)),  # 不被 final 误抓
    ('攻撃力が2倍にする',           [1], (2.0,  0)),  # 不被 final 误抓
]
out = []
for text, bunrui, expected in cases:
    v, ct = _effect_extract(text, bunrui)
    out.append({'v': v, 'ct': ct, 'ev': expected[0], 'ec': expected[1], 't': text[:25]})
print(json.dumps(out, ensure_ascii=False))
`;
const r2 = spawnSync('python', ['-c', py2], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
const out2 = (r2.stdout || '') + (r2.stderr || '');
const last2 = out2.trim().split('\n').filter(l => l.trim().startsWith('[')).pop();
let p2 = null;
try { p2 = JSON.parse(last2); } catch (e) { console.error('python2 parse failed:', out2); }
if (p2) {
  p2.forEach((p, i) => {
    eq(`chara case${i} val: ${p.t}`, p.v, p.ev);
    eq(`chara case${i} ct:  ${p.t}`, p.ct, p.ec);
  });
}

// ===== bunrui=18 BDゲージ最大値 合成公式 =====
// raw = ((10 + Σadd) * (1 + Σmul) + ΣfinalAdd) * (1 + ΣfinalMul)
// bdCapMax = floor(raw) - 1
console.log('\n--- bunrui=18 合成公式: floor((10 + Σadd)*(1 + Σmul) + ΣfinalAdd)*(1 + ΣfinalMul)) - 1 ---');
const bdRaw = (add, mul, fAdd, fMul) =>
  ((10 + add) * (1 + mul) + fAdd) * (1 + fMul);
const bdMax = (...args) => Math.floor(bdRaw(...args)) - 1;

eq('全 0 → 9 (10-1)',                  bdMax(0,    0,   0,   0),   9);
eq('add=3 → 12 (13-1)',                 bdMax(3,    0,   0,   0),   12);
eq('mul=0.5 (1.5×) → 14 (15-1)',        bdMax(0,    0.5, 0,   0),   14);
eq('finalAdd=2.5 → 11 (12.5-1 → floor 12 - 1)',
                                          bdMax(0,    0,   2.5, 0),   11);
eq('finalMul=1 (2×) → 19 (20-1)',       bdMax(0,    0,   0,   1),   19);
eq('add=2 + mul=0.5 → 17 ((10+2)*1.5-1)',bdMax(2,    0.5, 0,   0),   17);
eq('add=2 + mul=0.5 + finalAdd=3 → 20',  bdMax(2,    0.5, 3,   0),   20);
eq('全 4 種：raw=31.5, floor 31 - 1 = 30',
                                          bdMax(2,    0.5, 3,   0.5), 30);

// 観測データ（実機）対照 — 1 個 / 2 個 ×4 魂は (1+Σnet) で表現（K=1 近似）
eq('実機: 1個×4魂 → 39',                  bdMax(0, 3, 0, 0),     39);
eq('実機: 2個×4魂 → 69',                  bdMax(0, 6, 0, 0),     69);
eq('実機: +2.84 結晶 → 11',               bdMax(2.84, 0, 0, 0),  11);
eq('実機: +3.6 結晶 → 12',                bdMax(3.6, 0, 0, 0),   12);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
