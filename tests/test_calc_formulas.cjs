// 测试 hensei.html 的几个 calc 公式：BD ゲージ 上限 / 主武器 / soul affinity 独立乘区 /
// _applyEf の bairitu × sourceMult × condition 結合公式
// 用法: node tests/test_calc_formulas.cjs

let pass = 0, fail = 0;
const eq = (label, a, b) => {
  const ok = Math.abs(a - b) < 1e-6;
  if (ok) pass++; else { fail++; console.error(`✗ ${label}: ${a} ≠ ${b}`); }
};

console.log('--- BD ゲージ上限 max = floor(((10+Σadd)*(1+Σmul) + ΣfinalAdd)*(1+ΣfinalMul)) - 1 ---');
// 合成公式（bunrui=18 4 種 calc_type 累加）：
//   raw      = ((10 + add) * (1 + mul) + finalAdd) * (1 + finalMul)
//   bdCapMax = floor(raw) - 1
// add: ct=1 の v 累加；mul: ct=0 の (v-1) 累加；finalAdd: ct=2；finalMul: ct=3 の (v-1) 累加。
// v は _applyEf 内で sourceMult (魂 lv 加成等) と condition factor を反映済み（净增量 K 倍）。
const bdCapMaxRaw = (add = 0, mul = 0, finalAdd = 0, finalMul = 0) =>
  ((10 + add) * (1 + mul) + finalAdd) * (1 + finalMul);
const bdCapMax = (...args) => Math.floor(bdCapMaxRaw(...args)) - 1;

// 観測データ検証（実機 ゲーム内表示）
eq('無加成 → 9 (10 - 1)',                          bdCapMax(0),                  9);
eq('+2.84 結晶 → 11 (floor(12.84)-1)',             bdCapMax(2.84),              11);
eq('+3.6 結晶 → 12 (floor(13.6)-1)',               bdCapMax(3.6),               12);
eq('1個×4魂 (K≈1) → 39 (floor(40)-1)',             bdCapMax(0,    3),           39);  // 1+(4-1)
eq('2個×4魂 (K≈1) → 69 (floor(70)-1)',             bdCapMax(0,    6),           69);  // 1+2*(4-1)

// 普通加算のみ
eq('add=0.05 → 9 (10.05-1)',          bdCapMax(0.05),  9);
eq('add=0.99 → 9 (10.99-1)',          bdCapMax(0.99),  9);
eq('add=1 → 10 (11-1)',               bdCapMax(1),    10);
eq('add=3 → 12 (13-1)',               bdCapMax(3),    12);
eq('add=15.83 → 24 (25.83-1)',        bdCapMax(15.83),24);

// 普通乗算（ct=0）
eq('mul=0.5 (1.5×) → 14 (15-1)',                  bdCapMax(0,    0.5),         14);
eq('mul=1 (2×) → 19 (20-1)',                       bdCapMax(0,    1),           19);
eq('add=2 + mul=0.5 → 17 ((10+2)*1.5-1=17)',       bdCapMax(2,    0.5),         17);

// 最終加算（ct=2）
eq('finalAdd=2.5 → 11 (12.5-1)',                   bdCapMax(0,    0,   2.5),    11);
eq('add=2 + mul=0.5 + finalAdd=3 → 20 ((10+2)*1.5+3-1=20)',
                                                    bdCapMax(2,    0.5, 3),      20);

// 最終乗算（ct=3）
eq('finalMul=1 (2×) → 19 (20-1)',                  bdCapMax(0,    0,   0,   1), 19);
eq('全 4 種：(10+2)*1.5+3=21, *1.5=31.5, floor-1 → 30',
                                                    bdCapMax(2,    0.5, 3,   0.5), 30);

console.log('\n--- 主武器なし倍率 = 1/21 (前: 0.05) ---');
const mwMult = (mainWeapon) => (mainWeapon === false) ? (1 / 21) : 1.0;
eq('main_weapon=true → 1', mwMult(true), 1);
eq('main_weapon=undefined → 1', mwMult(undefined), 1);
eq('main_weapon=false → 1/21', mwMult(false), 1/21);
eq('1/21 ≈ 0.04762', mwMult(false), 1/21);

console.log('\n--- BDゲージ攻撃力倍率 = 1 + floor(bd_cap/2)*0.25 ---');
const bdCapMult = (bdCap) => 1 + Math.floor(bdCap / 2) * 0.25;
eq('bd_cap=0 → 1', bdCapMult(0), 1);
eq('bd_cap=1 → 1', bdCapMult(1), 1);
eq('bd_cap=2 → 1.25', bdCapMult(2), 1.25);
eq('bd_cap=3 → 1.25', bdCapMult(3), 1.25);
eq('bd_cap=4 → 1.5', bdCapMult(4), 1.5);
eq('bd_cap=9 → 2.0', bdCapMult(9), 2.0);

console.log('\n--- soul affinity 独立乘区 ---');
function applyAffinity(stat攻, stat防, atkAff, defAff) {
  return { atk: stat攻 * atkAff, def: stat防 * defAff };
}
let r = applyAffinity(1000, 800, 1.9, 0.5);
eq('aff 1.9/0.5: 攻 1900', r.atk, 1900);
eq('aff 1.9/0.5: 防 400', r.def, 400);
r = applyAffinity(1000, 800, 1, 1);
eq('aff 1/1 (default): 攻 不变', r.atk, 1000);
eq('aff 1/1 (default): 防 不变', r.def, 800);

console.log('\n--- 完整 stat pipeline 简化模拟 ---');
// base * 結婚 * 燃心 * lp * 主武器 * affinity → final
function pipeline(base, marriage, moeshin, lp, mainWeapon, atkAff) {
  const mr = [1.00, 1.03, 1.05][marriage] || 1;
  const mo = moeshin ? 1.3 : 1;
  const lpM = [1.0, 1.1, 1.5][lp] || 1;
  const mw = mwMult(mainWeapon);
  return base * mr * mo * lpM * mw * atkAff;
}
// 一个全开例：marriage=2, moeshin, lp=2, main_weapon true, atkAff=2
let p = pipeline(1000, 2, true, 2, true, 2);
eq('1000 * 1.05 * 1.3 * 1.5 * 1 * 2 = 4095', p, 1000 * 1.05 * 1.3 * 1.5 * 1 * 2);
// 主武器 false 削弱
p = pipeline(1000, 0, false, 0, false, 1);
eq('1000 * 1 * 1 * 1 * (1/21) = 47.619...', p, 1000 / 21);

console.log('\n--- _fmtStat: 不再 ceil ---');
// _fmtStat 改成不做 ceil；最终显示由调用方 ceil
const _fmtStat = (v) => {
  if (v == null || isNaN(v)) return '-';
  if (Math.abs(v) >= 1e13) return (+v).toExponential(6);
  return (+v).toLocaleString('en-US');
};
const ceil = Math.ceil;
// 模拟显示：max/min ceil 后再 fmt
function displayMax(aMax) { return _fmtStat(ceil(aMax)); }
function displayDef(d) { return _fmtStat(d); }  // 防御力直接显示
console.log(`  攻擊力 max=12345.67 → "${displayMax(12345.67)}" (期望 ceil=12,346)`);
console.log(`  防御力 800.0  → "${displayDef(800)}" (期望 800)`);
console.log(`  防御力 800.5 → "${displayDef(800.5)}" (期望 800.5 不取整)`);
eq('max ceil 12346', ceil(12345.67), 12346);
eq('防御力 不取整 800.5 直接显示', _fmtStat(800.5).includes('.5') ? 1 : 0, 1);

// =====================================================================
// _applyEf bairitu × sourceMult × condFactor 結合公式（hensei.html:1031-1041）
// =====================================================================
// 加算 (ct=1, mode='add'/'final-add')：
//   v = bairitu * sourceMult * factor
// 乗算 (ct=0, mode='mul'/'final-mul')：
//   v = (bairitu * sourceMult - 1) * factor + 1   ← 正しい公式（魂 lv は bairitu 直接乗算）
//   ※ 旧 (v0-1)*sourceMult*factor+1 はバグ — sourceMult が 净増量にしか掛からなかった
// =====================================================================
console.log('\n--- 乗算公式 v = (bairitu * sourceMult - 1) * factor + 1 ---');
const _conditionFactor = (cond, hp) => {
  if (!cond) return 1;
  let h = +hp; if (isNaN(h)) h = 100;
  h = Math.max(0, Math.min(100, h));
  if (cond === 1) return h / 100;          // 浑身
  if (cond === 2) return (100 - h) / 100;   // 背水
  if (cond === 3) return h < 50 ? 1 : 0;    // 破損
  return 1;
};
const SOUL_AWK_MAX = {1: 13, 2: 11, 3: 9, 4: 7, 5: 5};
const soulMultiplier = (rarity, lv) => {
  const r = +rarity || 1;
  const L = Math.max(1, +lv || 1);
  const maxNoAwk = r * 10;
  if (L <= maxNoAwk) return 1 + 0.01 * L;
  const base = 1 + 0.1 * r;
  const range = 75 - maxNoAwk;
  if (range <= 0) return base;
  const inc = r === 5 ? 0.3 : 0.1;
  return base + inc * (L - maxNoAwk) / range;
};
// ゲーム仕様：bairitu=1 占位 entry も soulMult を受ける（「占位 ×1 base に魂 lv 倍率乗る」）。
// ガード無し — soulMult > 1 のとき bairitu=1 でも (1*sourceMult - 1)*factor + 1 が 1 を超える。
const _applyMul = (v0, sourceMult, condition, hp) =>
  (v0 * sourceMult - 1) * _conditionFactor(condition, hp) + 1;
const _applyAdd = (v0, sourceMult, condition, hp) =>
  v0 * sourceMult * _conditionFactor(condition, hp);

// === 用户指定的两个 case ===
// Case A: 5★ lv=75 / bairitu=2.5 (150%UP) / 浑身 / 满血 → 4.5
{
  const sm = soulMultiplier(5, 75);   // = 1.8
  eq('5★ lv75 sourceMult', sm, 1.8);
  const v = _applyMul(2.5, sm, 1, 100);
  eq('5★ lv75 bairitu=2.5 浑身 100%血 → 4.5', v, 4.5);
}
// Case B: 4★ lv=40 / bairitu=1.5 (50%UP) / 浑身 / 半血 → 1.55
{
  const sm = soulMultiplier(4, 40);   // = 1.4
  eq('4★ lv40 sourceMult', sm, 1.4);
  const v = _applyMul(1.5, sm, 1, 50);
  eq('4★ lv40 bairitu=1.5 浑身 50%血 → 1.55', v, 1.55);
}

// === sourceMult=1（魂以外 source）→ 两公式等价 ===
console.log('\n--- sourceMult=1（chara/結晶/bg/魔装）→ formula reduces to (v0-1)*factor+1 ---');
eq('bairitu=1.5 浑身 100%血 → 1.5',  _applyMul(1.5, 1, 1, 100), 1.5);
eq('bairitu=1.5 浑身 50%血 → 1.25',   _applyMul(1.5, 1, 1, 50),  1.25);
eq('bairitu=1.5 背水 0%血 → 1.5',    _applyMul(1.5, 1, 2, 0),   1.5);
eq('bairitu=1.5 背水 100%血 → 1',    _applyMul(1.5, 1, 2, 100), 1);

// === bairitu=2 / 各 condition × HP ===
console.log('\n--- bairitu=2 (100%UP) × condition × HP 行列 ---');
eq('1★ lv1 sourceMult', soulMultiplier(1, 1), 1.01);
eq('5★ lv1 sourceMult', soulMultiplier(5, 1), 1.01);
eq('5★ lv50 sourceMult (maxNoAwk)', soulMultiplier(5, 50), 1.5);
// 满血浑身：condition factor=1, full
eq('bairitu=2 浑身 5★lv75 100%血: (2*1.8-1)*1+1 = 3.6', _applyMul(2, 1.8, 1, 100), 3.6);
// 半血浑身：factor=0.5
eq('bairitu=2 浑身 5★lv75 50%血: (2*1.8-1)*0.5+1 = 2.3', _applyMul(2, 1.8, 1, 50), 2.3);
// 0%血浑身：factor=0 → v=1（無効）
eq('bairitu=2 浑身 5★lv75 0%血: (2*1.8-1)*0+1 = 1', _applyMul(2, 1.8, 1, 0), 1);
// 0%血背水：factor=1
eq('bairitu=2 背水 5★lv75 0%血: (2*1.8-1)*1+1 = 3.6', _applyMul(2, 1.8, 2, 0), 3.6);
// 50%血背水：factor=0.5
eq('bairitu=2 背水 5★lv75 50%血: (2*1.8-1)*0.5+1 = 2.3', _applyMul(2, 1.8, 2, 50), 2.3);
// no condition：factor=1
eq('bairitu=2 無条件 5★lv75: (2*1.8-1)+1 = 3.6', _applyMul(2, 1.8, 0, 50), 3.6);

console.log('\n--- 加算公式 v = bairitu * sourceMult * factor ---');
// 加算 case：bairitu=300 (+300攻撃力)、5★ lv75、浑身、半血
eq('+300 加算 5★lv75 浑身 50%血: 300*1.8*0.5 = 270', _applyAdd(300, 1.8, 1, 50), 270);
eq('+300 加算 5★lv75 浑身 100%血: 300*1.8*1 = 540', _applyAdd(300, 1.8, 1, 100), 540);
eq('+300 加算 5★lv75 背水 0%血: 300*1.8 = 540', _applyAdd(300, 1.8, 2, 0), 540);
eq('+10 加算 sourceMult=1 無条件: 10', _applyAdd(10, 1, 0, 100), 10);

console.log('\n--- 旧バグ formula (v0-1)*sourceMult*factor+1 と新 formula の差分 ---');
// 旧 (バグ): (1.5-1)*1.4*1+1 = 1.7  ←  +50%UP × 4★lv40 を直接乗算 1.5*1.4=2.1 と一致せず
// 新 (修正): (1.5*1.4-1)*1+1 = 2.1
const oldBuggy = (v0, sm, c, hp) => (v0 - 1) * sm * _conditionFactor(c, hp) + 1;
eq('旧バグ: 1.5×1.4 (no cond) → 1.7 (bug)', oldBuggy(1.5, 1.4, 0, 100), 1.7);
eq('新正解: 1.5×1.4 (no cond) → 2.1 (= 直接乘算)', _applyMul(1.5, 1.4, 0, 100), 2.1);
eq('旧バグ: 2.5×1.8 浑身满血 → 3.7 (bug)', oldBuggy(2.5, 1.8, 1, 100), 3.7);
eq('新正解: 2.5×1.8 浑身満血 → 4.5', _applyMul(2.5, 1.8, 1, 100), 4.5);

// === bairitu=1 占位 entry も soulMult を受ける（ゲーム仕様）===
console.log('\n--- bairitu=1 + soulMult > 1 → 占位でも増幅される（ガード無し）---');
// 5★ lv75: (1 * 1.8 - 1)*1 + 1 = 1.8
eq('bairitu=1 + 5★ lv75 + 無条件 → 1.8',           _applyMul(1, 1.8, 0, 100), 1.8);
// 4★ lv40: (1 * 1.4 - 1)*1 + 1 = 1.4
eq('bairitu=1 + 4★ lv40 + 無条件 → 1.4',           _applyMul(1, 1.4, 0, 100), 1.4);
// + 浑身 50%血: (1*1.8 - 1)*0.5 + 1 = 1.4
eq('bairitu=1 + 5★ lv75 + 浑身 50%血 → 1.4',       _applyMul(1, 1.8, 1, 50),  1.4);
// + 背水 0%血: (1*1.4 - 1)*1 + 1 = 1.4
eq('bairitu=1 + 4★ lv40 + 背水 0%血 → 1.4',        _applyMul(1, 1.4, 2, 0),   1.4);
// sourceMult=1（chara skill 等）→ bairitu=1 は完全 no-op
eq('bairitu=1 + sourceMult=1 → 1（no-op）',         _applyMul(1, 1, 0, 100),   1);
eq('bairitu=1 + sourceMult=1 + 浑身 50%血 → 1',    _applyMul(1, 1, 1, 50),    1);

// === sourceMult 边界值 ===
console.log('\n--- soulMultiplier 边界値 ---');
eq('rarity=4 lv=1: 1.01', soulMultiplier(4, 1), 1.01);
eq('rarity=4 lv=40 (maxNoAwk): 1.40', soulMultiplier(4, 40), 1.40);
eq('rarity=4 lv=75 (満覚醒): 1.5', soulMultiplier(4, 75), 1.5);
eq('rarity=5 lv=50 (maxNoAwk): 1.50', soulMultiplier(5, 50), 1.50);
eq('rarity=5 lv=75 (満覚醒): 1.8', soulMultiplier(5, 75), 1.8);
eq('rarity=1 lv=10 (maxNoAwk): 1.10', soulMultiplier(1, 10), 1.10);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
