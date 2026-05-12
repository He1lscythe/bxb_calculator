// fmtHitStages / fmtBairitu / fmtVal 显示格式 align 测试
// 用法: node tests/test_hensei_align.cjs

let pass = 0, fail = 0;
const eq = (label, a, b) => {
  if (a === b) pass++; else { fail++; console.error(`✗ ${label}\n  got=${JSON.stringify(a)}\n  exp=${JSON.stringify(b)}`); }
};

// ===== 复刻 utils.js fmtNum + fmtHitStages（新格式） =====
const fmtNum = (v) => {
  if (typeof v === 'string') return v;
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  return String(parseFloat(v.toFixed(4)));
};
const fmtHitStages = (e) => {
  const hps = Array.isArray(e.hit_per_stage) ? e.hit_per_stage : [];
  const sc  = Array.isArray(e.hit_per_stage_scaling) ? e.hit_per_stage_scaling : [0,0,0];
  if (!hps.length) return '';
  const ht = e.hit_type != null ? e.hit_type : 0;
  const op = (ht === 2) ? '×' : (ht === 3) ? '=' : '+';
  function stageStr(v, s) {
    if (!s) return op + fmtNum(v);
    return op + '(' + fmtNum(v) + ' + ' + fmtNum(s) + ' * 熟度)';
  }
  const s0 = sc[0] || 0, s1 = sc[1] || 0, s2 = sc[2] || 0;
  if (hps.length === 3 && hps[0] !== 0 && hps[0] === hps[1] && hps[1] === hps[2] && s0 === s1 && s1 === s2) {
    return stageStr(hps[0], s0);
  }
  const parts = hps.map((v, i) => v == null || v === 0 ? null : (i + 1) + '撃' + stageStr(v, sc[i] || 0)).filter(Boolean);
  return parts.length ? parts.join(' / ') : '';
};

console.log('--- fmtHitStages: 全段一致简写 ---');
eq('hps=[2,2,2] sca=[0,0,0] → "+2"',
   fmtHitStages({hit_per_stage:[2,2,2], hit_per_stage_scaling:[0,0,0], hit_type:0}),
   '+2');
eq('hps=[2,2,2] sca=["5/98",...] hit_type=0 → "+(2 + 5/98 * 熟度)"',
   fmtHitStages({hit_per_stage:[2,2,2], hit_per_stage_scaling:['5/98','5/98','5/98'], hit_type:0}),
   '+(2 + 5/98 * 熟度)');
eq('hps=[3,3,3] sca=["10/98",...] → "+(3 + 10/98 * 熟度)"',
   fmtHitStages({hit_per_stage:[3,3,3], hit_per_stage_scaling:['10/98','10/98','10/98']}),
   '+(3 + 10/98 * 熟度)');
eq('hit_type=2 (乗算) hps=[2.5,2.5,2.5] sca=[0..] → "×2.5"',
   fmtHitStages({hit_per_stage:[2.5,2.5,2.5], hit_per_stage_scaling:[0,0,0], hit_type:2}),
   '×2.5');
eq('hit_type=3 (設定値) hps=[1,1,1] sca=0 → "=1"',
   fmtHitStages({hit_per_stage:[1,1,1], hit_per_stage_scaling:[0,0,0], hit_type:3}),
   '=1');

console.log('\n--- fmtHitStages: 各段不同 ---');
eq('hps=[0,0,13] sca=[0,0,"10/98"] → "3撃+(13 + 10/98 * 熟度)"',
   fmtHitStages({hit_per_stage:[0,0,13], hit_per_stage_scaling:[0,0,'10/98'], hit_type:0}),
   '3撃+(13 + 10/98 * 熟度)');
eq('hps=[1,0,3] sca=[0,0,0] → "1撃+1 / 3撃+3"',
   fmtHitStages({hit_per_stage:[1,0,3], hit_per_stage_scaling:[0,0,0], hit_type:0}),
   '1撃+1 / 3撃+3');

// ===== fmtBairitu (utils.js, character/soul) =====
console.log('\n--- fmtBairitu (character/soul): "+(v + s * 熟度)" / 无 sc 时 "+v" ---');
const ctPfx = (ct) => ct === 1 ? '+' : '×';
const fmtBairitu = (s) => (s.effects || []).map(e => {
  const bunrui = e.bunrui || [];
  const isHitOnly = bunrui.length === 1 && bunrui[0] === 7;
  if (isHitOnly) return fmtHitStages(e);
  let bs = '';
  if (e.bairitu != null && e.bairitu !== 0) {
    const sc = e.bairitu_scaling;
    const pfx = ctPfx(e.calc_type);
    bs = pfx + (sc ? '(' : '') + fmtNum(e.bairitu);
    if (sc) bs += ' + ' + fmtNum(sc) + ' * 熟度)';
  }
  const hitStr = bunrui.includes(7) ? fmtHitStages(e) : '';
  return [bs, hitStr].filter(Boolean).join(' / ');
}).filter(Boolean).join(' / ');

eq('bairitu=2.66 sc=0.008 calc_type=0 → "×(2.66 + 0.008 * 熟度)"',
   fmtBairitu({effects: [{bunrui:[5], bairitu:2.66, bairitu_scaling:0.008, calc_type:0}]}),
   '×(2.66 + 0.008 * 熟度)');
eq('bairitu=1.05 sc=0 calc_type=1 → "+1.05"',
   fmtBairitu({effects: [{bunrui:[1], bairitu:1.05, bairitu_scaling:0, calc_type:1}]}),
   '+1.05');
eq('bairitu=3 sc="2/99" calc_type=0 → "×(3 + 2/99 * 熟度)"',
   fmtBairitu({effects: [{bunrui:[1], bairitu:3, bairitu_scaling:'2/99', calc_type:0}]}),
   '×(3 + 2/99 * 熟度)');

// ===== fmtVal (hensei) — 与 fmtBairitu 一致（除了 fmtLarge 内层处理） =====
console.log('\n--- hensei fmtVal: 同 fmtBairitu 结构（不带 fmtLarge 万/億 缩写时输出一致）---');
const fmtLarge = (n) => {  // 简化版，bairitu 范围内不会触发万/億
  if (n == null) return '-';
  if (typeof n !== 'number') return String(n);
  return Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(2)).toString();
};
const fmtVal = (ef) => {
  const bunrui = ef.bunrui || [];
  const isHitOnly = bunrui.length===1 && bunrui[0]===7;
  if (isHitOnly) return fmtHitStages(ef);
  let v = '';
  if (ef.bairitu != null && ef.bairitu !== 0) {
    const sc = ef.bairitu_scaling;
    const pfx = ef.calc_type === 1 ? '+' : 'x';
    let inner;
    if (ef.calc_type !== 1) {
      const lo = ef.bairitu_init, hi = ef.bairitu;
      inner = (lo != null && lo !== hi) ? fmtLarge(lo) + '〜' + fmtLarge(hi) : fmtLarge(hi);
    } else {
      inner = fmtLarge(ef.bairitu);
    }
    v = pfx + (sc ? '(' + inner + ' + ' + sc + ' * 熟度)' : inner);
  }
  if (bunrui.includes(7)) {
    const hitStr = fmtHitStages(ef);
    if (hitStr) v += (v ? ' / ' : '') + hitStr;
  }
  return v;
};
eq('hensei: ×(2.66 + 0.008 * 熟度) format',
   fmtVal({bunrui:[5], bairitu:2.66, bairitu_scaling:0.008, calc_type:0}),
   'x(2.66 + 0.008 * 熟度)');
eq('hensei: +1.05 (calc_type=1, no scaling)',
   fmtVal({bunrui:[1], bairitu:1.05, bairitu_scaling:0, calc_type:1}),
   '+1.05');
eq('hensei: x1〜x3 范围 (calc_type=0, lo!=hi, no sc)',
   fmtVal({bunrui:[1], bairitu_init:1, bairitu:3, bairitu_scaling:0, calc_type:0}),
   'x1〜3');
eq('hensei: bunrui=[7] 纯 hit → 走 fmtHitStages',
   fmtVal({bunrui:[7], hit_per_stage:[2,2,2], hit_per_stage_scaling:[0,0,0], hit_type:0, bairitu:0, calc_type:1}),
   '+2');

// ===== scope tag 文本/类对齐 =====
console.log('\n--- scope-tag 简写 + 类与 utils.js 一致 ---');
const ELEMENT = {1:'火',2:'水',3:'風',4:'光',5:'闇',6:'無'};
const WEAPON  = {1:'剣',2:'槍',3:'槌',4:'弓'};
const fmtScopeTag = (ef) => {
  const elStr = ef.element != null ? [].concat(ef.element).map(e => ELEMENT[e] || e).join('/') : '';
  const tyStr = ef.weapon    != null ? [].concat(ef.weapon   ).map(t => WEAPON [t] || t).join('/') : '';
  const parts = [elStr, tyStr].filter(Boolean);
  const lim = parts.join('·');
  if (ef.scope === 0) return '<span class="scope-tag scope-self">自</span>';
  if (ef.scope === 1) return '<span class="scope-tag scope-all">全</span>';
  if (ef.scope === 2) return '<span class="scope-tag scope-lim">'      + (lim || '限') + '</span>';
  if (ef.scope === 3) return '<span class="scope-tag scope-equip-s">' + (lim || '装') + '·自</span>';
  if (ef.scope === 4) return '<span class="scope-tag scope-equip-a">' + (lim || '装') + '·全</span>';
  return '';
};
eq('scope=0 → 自', fmtScopeTag({scope:0}), '<span class="scope-tag scope-self">自</span>');
eq('scope=1 → 全', fmtScopeTag({scope:1}), '<span class="scope-tag scope-all">全</span>');
eq('scope=2 element=5 → 闇', fmtScopeTag({scope:2, element:5}), '<span class="scope-tag scope-lim">闇</span>');
eq('scope=2 element=5 weapon=1 → 闇·剣', fmtScopeTag({scope:2, element:5, weapon:1}), '<span class="scope-tag scope-lim">闇·剣</span>');
eq('scope=3 element=5 → 闇·自', fmtScopeTag({scope:3, element:5}), '<span class="scope-tag scope-equip-s">闇·自</span>');
eq('scope=4 weapon=1 → 剣·全', fmtScopeTag({scope:4, weapon:1}), '<span class="scope-tag scope-equip-a">剣·全</span>');
eq('scope=2 (无属性) → 限', fmtScopeTag({scope:2}), '<span class="scope-tag scope-lim">限</span>');

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
