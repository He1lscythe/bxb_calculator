// hit_per_stage / hit_per_stage_scaling 分式支持 + 新公式 + parser
// 用法: node tests/test_hit_scaling.cjs

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

// ===== _parseHit (与 hensei.html / chara-spec.js 同实现) =====
const _parseHit = (s) => {
  if (s == null) return 0;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  const t = String(s).trim();
  if (t === '') return 0;
  if (t.includes('/')) {
    const [n, d] = t.split('/').map(parseFloat);
    return (Number.isFinite(n) && Number.isFinite(d) && d !== 0) ? n / d : 0;
  }
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : 0;
};

console.log('--- _parseHit ---');
eq('null → 0', _parseHit(null), 0);
eq('undefined → 0', _parseHit(undefined), 0);
eq('"" → 0', _parseHit(''), 0);
eq('number 2 → 2', _parseHit(2), 2);
eq('number 1.66 → 1.66', _parseHit(1.66), 1.66);
eq('"5/98" → 5/98', _parseHit('5/98'), 5/98);
eq('"1/3" → 1/3', _parseHit('1/3'), 1/3);
eq('"10/98" → 10/98', _parseHit('10/98'), 10/98);
eq('"2.5" → 2.5', _parseHit('2.5'), 2.5);
eq('"abc" → 0', _parseHit('abc'), 0);
eq('"1/0" (除数 0) → 0', _parseHit('1/0'), 0);
eq('NaN → 0', _parseHit(NaN), 0);

// ===== 新 calc 公式：base + (jk - 1) * scaling =====
console.log('\n--- calc 公式：baseV = base + (jk - 1) * scaling ---');
const calcBaseV = (hps, hpss, jk) => _parseHit(hps) + (jk - 1) * _parseHit(hpss);
// SS chara skill「1～3撃目+2 + 熟度 5 milestones × +1」
//   stored: hps=2, sca="5/98" → at jk=99 → 2 + 98*(5/98) = 7（与「最大+7」吻合）
eq('jk=1: base 2 alone', calcBaseV(2, '5/98', 1), 2);
eq('jk=99: max +7', calcBaseV(2, '5/98', 99), 7);
eq('jk=50 中段', calcBaseV(2, '5/98', 50), 2 + 49 * 5/98);
// SS chara skill「1～3撃目+3 + 10 milestones × +1」hps=3, sca="10/98", max +13
eq('jk=99 hps=3 sca="10/98" → 13', calcBaseV(3, '10/98', 99), 13);
eq('jk=1 hps=3 sca="10/98" → 3', calcBaseV(3, '10/98', 1), 3);
// 无 scaling
eq('hps=5 sca=0 jk=99 → 5', calcBaseV(5, 0, 99), 5);
eq('hps=5 sca=null jk=99 → 5', calcBaseV(5, null, 99), 5);

// ===== chara-spec maxHit denom =====
console.log('\n--- chara-spec maxHit: denom = rarity 最高熟度 - 1 ---');
const _RARITY_MAX_JK = { 1: 50, 2: 70, 3: 90, 4: 99 };
const charaMaxDelta = (rarity, hps, sca) => {
  const denom = (_RARITY_MAX_JK[rarity] ?? 99) - 1;
  return _parseHit(hps) + denom * _parseHit(sca);
};
eq('SS (4) hps=2 sca="5/98" → 7', charaMaxDelta(4, 2, '5/98'), 7);
eq('A  (3) hps=2 sca="5/89" → 7', charaMaxDelta(3, 2, '5/89'), 7);
eq('B  (2) hps=2 sca="5/69" → 7', charaMaxDelta(2, 2, '5/69'), 7);
eq('C  (1) hps=2 sca="5/49" → 7', charaMaxDelta(1, 2, '5/49'), 7);
eq('SS no scaling hps=5 → 5', charaMaxDelta(4, 5, 0), 5);

// ===== chara-spec maxBd: bairitu / bairitu_scaling 双方とも分式対応 =====
console.log('\n--- chara-spec maxBd: bairitu も分式文字列 ("3/2") 受け入れ ---');
const charaMaxBdB = (rarity, b, sc) => {
  const denomBd = (_RARITY_MAX_JK[rarity] ?? 99);
  return _parseHit(b) + denomBd * _parseHit(sc);
};
eq('SS b="3/2" sc=0 → 1.5', charaMaxBdB(4, '3/2', 0), 1.5);
eq('SS b="3/2" sc="1/99" → 1.5 + 1', charaMaxBdB(4, '3/2', '1/99'), 1.5 + 1);
eq('SS b=2 sc="1/99" → 2 + 1', charaMaxBdB(4, 2, '1/99'), 3);
eq('SS b="1/0" 無効 → 0', charaMaxBdB(4, '1/0', 0), 0);

// ===== _normalizeHitVal (UI 写入归一化) =====
console.log('\n--- _normalizeHitVal: 含 / 存 string、纯数值存 number、空串 null ---');
const _normalizeHitVal = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (s.includes('/')) return s;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : s;
};
eq('"" → null', _normalizeHitVal(''), null);
eq('"  " → null', _normalizeHitVal('  '), null);
eq('null → null', _normalizeHitVal(null), null);
eq('"5" → 5 (number)', _normalizeHitVal('5'), 5);
eq('"5.5" → 5.5 (number)', _normalizeHitVal('5.5'), 5.5);
eq('"5/4" → "5/4" (string)', _normalizeHitVal('5/4'), '5/4');
eq('"1/3" → "1/3" (string)', _normalizeHitVal('1/3'), '1/3');
truthy('"5" 类型是 number', typeof _normalizeHitVal('5') === 'number');
truthy('"5/4" 类型是 string', typeof _normalizeHitVal('5/4') === 'string');

// ===== Parser: classify_hit_fields (Python 调) =====
console.log('\n--- classify_common.py classify_hit_fields ---');
function runPython(args) {
  const r = spawnSync('python', ['-c', args], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
  return (r.stdout || '') + (r.stderr || '');
}
const py = `
import sys, json
sys.path.insert(0, 'scripts')
from classify_common import classify_hit_fields
cases = [
    ('1～3撃目ヒット数を+2する【熟度21,41,60,80,99でさらに+1(最大+7)】', 2, 1, 4),
    ('1～3撃目ヒット数を+3する【熟度11,21,31,41,50,60,70,80,90.99でさらに+1(最大+13)】', 3, 1, 4),
    ('3撃目ヒット数を+13する', 13, 1, 4),
    ('1撃目+1と3撃目+3', 0, 1, 4),
    ('第三撃のみヒット数+5', 5, 1, 4),
    # rarity=3 (A): denom = 89
    ('1～3撃目ヒット数を+2する【熟度11,21,41,60,80,90でさらに+1(最大+8)】', 2, 1, 3),
    # rarity=2 (B): denom = 69
    ('1～3撃目ヒット数を+1する【熟度21,41,60でさらに+1(最大+4)】', 1, 1, 2),
]
out = []
for text, b, ct, rarity in cases:
    ent = {'bunrui':[7], 'bairitu': b, 'calc_type': ct}
    classify_hit_fields(text, ent, rarity=rarity)
    out.append({'hps': ent['hit_per_stage'], 'sca': ent['hit_per_stage_scaling']})
print(json.dumps(out, ensure_ascii=False))
`;
const out = runPython(py).trim().split('\n').filter(l => l.startsWith('[')).pop();
let parsed = null;
try { parsed = JSON.parse(out); } catch (e) { console.error('python JSON parse failed:', out); }
if (parsed) {
  // case 0: SS rarity, 1～3撃目+2, 5 milestones × +1 → hps [2,2,2], sca ["5/98","5/98","5/98"]
  eq('case0 hps[0] = 2', parsed[0].hps[0], 2);
  eq('case0 hps[2] = 2', parsed[0].hps[2], 2);
  eq('case0 sca[0] = "5/98"', parsed[0].sca[0], '5/98');
  // case 1: SS, 10 milestones × +1 → "10/98"
  eq('case1 hps = [3,3,3]', JSON.stringify(parsed[1].hps), JSON.stringify([3,3,3]));
  eq('case1 sca[0] = "10/98"', parsed[1].sca[0], '10/98');
  // case 2: 3撃目+13 一段 → hps [0,0,13]
  eq('case2 hps = [0,0,13]', JSON.stringify(parsed[2].hps), JSON.stringify([0,0,13]));
  eq('case2 sca = [0,0,0]', JSON.stringify(parsed[2].sca), JSON.stringify([0,0,0]));
  // case 3: 1撃目+1 と 3撃目+3 → [1,0,3]
  eq('case3 hps = [1,0,3]', JSON.stringify(parsed[3].hps), JSON.stringify([1,0,3]));
  // case 4: 第三撃のみ+5 → [0,0,5]
  eq('case4 hps = [0,0,5]', JSON.stringify(parsed[4].hps), JSON.stringify([0,0,5]));
  // case 5: A rarity (3) → denom 89
  eq('case5 (A) sca[0] = "6/89"', parsed[5].sca[0], '6/89');  // 6 milestones × 1
  // case 6: B rarity (2) → denom 69
  eq('case6 (B) sca[0] = "3/69"', parsed[6].sca[0], '3/69');  // 3 milestones × 1
}

// ===== 数据完整性：现存 chara 的 sca 与新公式吻合 =====
console.log('\n--- characters.json: 非零 scaling 必须是分式字符串 "X/{rarity-1}" ---');
const ROOT = path.resolve(__dirname, '..');
const chars = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characters.json'), 'utf8'));
const denomFor = r => (_RARITY_MAX_JK[r] ?? 99) - 1;
let scaTotal = 0, scaBad = 0;
function walkSca(c, x) {
  if (Array.isArray(x)) { x.forEach(it => walkSca(c, it)); return; }
  if (!x || typeof x !== 'object') return;
  const sca = x.hit_per_stage_scaling;
  if (Array.isArray(sca) && sca.some(v => v)) {
    const expectedDenom = denomFor(c.rarity);
    sca.forEach(v => {
      if (!v) return;
      scaTotal++;
      if (typeof v !== 'string' || !v.includes('/')) { scaBad++; return; }
      const denom = parseInt(v.split('/')[1], 10);
      if (denom !== expectedDenom) scaBad++;
    });
  }
  for (const v of Object.values(x)) walkSca(c, v);
}
for (const c of chars) walkSca(c, c);
truthy(`所有非零 sca 都是 "X/{rarity-1}" 形式（${scaTotal} 个，错 ${scaBad}）`, scaBad === 0);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
