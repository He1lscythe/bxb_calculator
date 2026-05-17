// 結晶 weight / purity / lv 乗性 delta 衰减 + cr-edit 撤回联动
// 用法: node tests/test_crystal_dims.cjs

let pass = 0, fail = 0;
const eq = (label, a, b) => {
  const ok = (typeof a === 'number' && typeof b === 'number')
    ? Math.abs(a - b) < 1e-9
    : a === b;
  if (ok) pass++; else { fail++; console.error(`✗ ${label}: got=${JSON.stringify(a)} expected=${JSON.stringify(b)}`); }
};
const truthy = (label, cond) => { if (cond) pass++; else { fail++; console.error(`✗ ${label}`); } };

// ===== 公式（与 hensei.html _crystalEffectiveBairitu 同実装）=====
// factor_i = delta + (1 - delta) * pos   (pos ∈ [0,1], delta ∈ [0,1])
// factor   = factor_w * factor_p * factor_lv
// ct=0/3:  eff = (baseB - 1) * factor + 1   (neutral = 1)
// ct=1/2:  eff = baseB * factor             (neutral = 0)
// delta=null/undefined/'' → factor=1 (该维度不衰减)
// delta=0 → 端点満衰减
// step は slider 颗粒度のみ、公式に入らない
const _parseScaling = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.indexOf('/') >= 0) {
    const parts = v.split('/').map(Number);
    return parts[1] ? parts[0] / parts[1] : 0;
  }
  return parseFloat(v) || 0;
};
const _dimFactor = (pos, deltaRaw) => {
  if (deltaRaw == null || deltaRaw === '') return 1;
  // 注意：用户输入 0 是合法值（満衰减）、必须区分 `null/undefined/''` 与 `0`
  let d;
  if (typeof deltaRaw === 'number') d = deltaRaw;
  else d = _parseScaling(deltaRaw);
  if (!Number.isFinite(d)) return 1;
  if (pos == null || !Number.isFinite(pos)) return 1;
  return d + (1 - d) * pos;
};
const CRYSTAL_RARITY_LV_MAX = {1: 10, 2: 30, 3: 80, 4: 120, 5: 160, 6: 200};
const cryLvMax = (cr) => +cr?.level_max || (CRYSTAL_RARITY_LV_MAX[+cr?.rarity] ?? 1);
function effectiveBairitu(cr, cfg, e) {
  const baseB = _parseScaling(e.bairitu);
  if (!Number.isFinite(baseB)) return e.bairitu;
  const wPos = cfg.weight != null ? cfg.weight / 100 : null;
  const pPos = cfg.purity != null ? cfg.purity / 100 : null;
  const maxLv = cryLvMax(cr);
  const lvVal = cfg.lv != null ? cfg.lv : maxLv;
  const lvPos = maxLv > 1 ? (lvVal - 1) / (maxLv - 1) : 1;
  const fw  = _dimFactor(wPos,  e.weight_delta);
  const fp  = _dimFactor(pPos,  e.purity_delta);
  const flv = _dimFactor(lvPos, e.lv_delta);
  const factor = fw * fp * flv;
  if (factor === 1) return e.bairitu;
  const ct = e.calc_type ?? 0;
  return (ct === 0 || ct === 3) ? ((baseB - 1) * factor + 1) : (baseB * factor);
}

console.log('--- 用户校验例 (mult ct=0): bairitu=4, purity_delta=0 ---');
// purity=0   → factor=0   → eff = (4-1)·0   + 1 = 1
// purity=10  → factor=0.1 → eff = (4-1)·0.1 + 1 = 1.3
// purity=100 → factor=1   → no decay → raw bairitu=4 保留
eq('purity=0 → 1',   effectiveBairitu({}, {weight:100, purity:0},   {bairitu:4, purity_delta:0, calc_type:0}), 1);
eq('purity=10 → 1.3', effectiveBairitu({}, {weight:100, purity:10},  {bairitu:4, purity_delta:0, calc_type:0}), 1.3);
eq('purity=100 → 4',  effectiveBairitu({}, {weight:100, purity:100}, {bairitu:4, purity_delta:0, calc_type:0}), 4);

console.log('\n--- 单维 weight (mult ct=0) ---');
// baseB=5, w_delta=0.2: weight=100→5; weight=0→1+(5-1)·0.2=1.8; weight=50→1+(5-1)·0.6=3.4
eq('weight=100 → 5',
   effectiveBairitu({}, {weight:100, purity:100}, {bairitu:5, weight_delta:0.2, calc_type:0}), 5);
eq('weight=0, delta=0.2 (mult) → 1.8',
   effectiveBairitu({}, {weight:0, purity:100}, {bairitu:5, weight_delta:0.2, calc_type:0}), 1.8);
eq('weight=50, delta=0.2 (mult) → 3.4',
   effectiveBairitu({}, {weight:50, purity:100}, {bairitu:5, weight_delta:0.2, calc_type:0}), 3.4);

console.log('\n--- 单维 (add ct=1) ---');
// baseB=5, ct=1, delta=0.2: weight=100→5; weight=0→5·0.2=1; weight=50→5·0.6=3
eq('add weight=100 → 5',
   effectiveBairitu({}, {weight:100, purity:100}, {bairitu:5, weight_delta:0.2, calc_type:1}), 5);
eq('add weight=0, delta=0.2 → 1',
   effectiveBairitu({}, {weight:0, purity:100}, {bairitu:5, weight_delta:0.2, calc_type:1}), 1);
eq('add weight=50, delta=0.2 → 3',
   effectiveBairitu({}, {weight:50, purity:100}, {bairitu:5, weight_delta:0.2, calc_type:1}), 3);

console.log('\n--- delta=0 端点 ---');
// mult: baseB=3, ct=0, delta=0, cfg=0 → factor=0 → eff = (3-1)·0+1 = 1 (neutral)
// add:  baseB=5, ct=1, delta=0, cfg=0 → eff = 5·0 = 0 (neutral)
eq('mult ct=0 delta=0 cfg=0 → 1 (neutral)',
   effectiveBairitu({}, {weight:0, purity:100}, {bairitu:3, weight_delta:0, calc_type:0}), 1);
eq('add  ct=1 delta=0 cfg=0 → 0 (neutral)',
   effectiveBairitu({}, {weight:0, purity:100}, {bairitu:5, weight_delta:0, calc_type:1}), 0);
// mult delta=0 cfg=50 → factor=0.5 → eff = (3-1)·0.5+1 = 2
eq('mult delta=0 cfg=50 → 2',
   effectiveBairitu({}, {weight:50, purity:100}, {bairitu:3, weight_delta:0, calc_type:0}), 2);

console.log('\n--- delta=null/missing → 不衰减 ---');
// 注意：cfg=0 时若 delta 缺失，factor=1、不衰减、保留 raw bairitu
eq('weight_delta 缺 → raw bairitu',
   effectiveBairitu({}, {weight:0, purity:100}, {bairitu:5, calc_type:0}), 5);
eq('weight_delta=null → raw bairitu',
   effectiveBairitu({}, {weight:0, purity:100}, {bairitu:5, weight_delta:null, calc_type:0}), 5);
eq('weight_delta="" → raw bairitu',
   effectiveBairitu({}, {weight:0, purity:100}, {bairitu:5, weight_delta:'', calc_type:0}), 5);

console.log('\n--- lv 维度 (rarity=4, max_lv=120) ---');
// lv_delta=0.3, ct=0, baseB=2:
//   lv=120 → factor=1 → raw bairitu=2 (无衰减)
//   lv=1   → factor=0.3 → (2-1)·0.3+1 = 1.3
//   lv=60  → factor=0.3+0.7·(59/119) ≈ 0.6471 → (2-1)·0.6471+1 ≈ 1.6471
eq('lv=max=120 → raw 2',
   effectiveBairitu({rarity:4}, {weight:100, purity:100, lv:120}, {bairitu:2, lv_delta:0.3, calc_type:0}), 2);
eq('lv=1 (mult) → 1.3',
   effectiveBairitu({rarity:4}, {weight:100, purity:100, lv:1}, {bairitu:2, lv_delta:0.3, calc_type:0}), 1.3);
const lvMid = 0.3 + 0.7 * (59/119);
eq('lv=60 (mult) → (2-1)·factor+1',
   effectiveBairitu({rarity:4}, {weight:100, purity:100, lv:60}, {bairitu:2, lv_delta:0.3, calc_type:0}),
   (2-1) * lvMid + 1);
// lv add: baseB=10, ct=1, lv=1, lv_delta=0.5 → eff=10·0.5=5
eq('lv=1, ct=1, lv_delta=0.5 → 5',
   effectiveBairitu({rarity:4}, {weight:100, purity:100, lv:1}, {bairitu:10, lv_delta:0.5, calc_type:1}), 5);

console.log('\n--- max_lv=1 退化 (无 rarity/level_max) ---');
// 无表 rarity + 无 level_max → cryLvMax=1 → lvPos=1 → factor_lv=1
eq('max_lv=1 → factor_lv=1, raw bairitu',
   effectiveBairitu({rarity:99}, {weight:100, purity:100, lv:1}, {bairitu:3, lv_delta:0, calc_type:0}), 3);

console.log('\n--- 三维叠加 (mult) ---');
// baseB=4, ct=0, w_delta=p_delta=lv_delta=0.5, w=50 p=50 lv=半 (rarity=4, max_lv=120, lv=60)
// 单维 factor: 0.5 + 0.5·0.5 = 0.75
// lv factor: 0.5 + 0.5·(59/119) ≈ 0.7479
// factor_total ≈ 0.75·0.75·0.7479 ≈ 0.4207
// eff = (4-1)·0.4207 + 1 ≈ 2.2620
{
  const w = 0.75, p = 0.75, lv = 0.5 + 0.5 * (59/119);
  const expected = (4-1) * (w * p * lv) + 1;
  eq('三维 mult 叠加',
     effectiveBairitu({rarity:4}, {weight:50, purity:50, lv:60},
                      {bairitu:4, weight_delta:0.5, purity_delta:0.5, lv_delta:0.5, calc_type:0}),
     expected);
}

console.log('\n--- 三维叠加 (add) ---');
// add ct=1: 同上、但 eff = baseB · factor_total
{
  const w = 0.75, p = 0.75, lv = 0.5 + 0.5 * (59/119);
  const expected = 4 * (w * p * lv);
  eq('三维 add 叠加',
     effectiveBairitu({rarity:4}, {weight:50, purity:50, lv:60},
                      {bairitu:4, weight_delta:0.5, purity_delta:0.5, lv_delta:0.5, calc_type:1}),
     expected);
}

console.log('\n--- cfg 缺 → 该维 factor=1 ---');
eq('cfg.weight==null → 不衰减',
   effectiveBairitu({}, {weight:null, purity:100}, {bairitu:5, weight_delta:0, calc_type:0}), 5);
eq('cfg.lv==null + 满 max_lv → 不衰减 (lvVal=max_lv)',
   effectiveBairitu({rarity:4}, {weight:100, purity:100}, {bairitu:3, lv_delta:0.5, calc_type:0}), 3);

console.log('\n--- mult debuff (baseB<1) ---');
// baseB=0.5, ct=0, delta=0:
//   cfg=0  → factor=0 → eff=(0.5-1)·0+1 = 1 (neutral、没 debuff)
//   cfg=50 → factor=0.5 → eff=(0.5-1)·0.5+1 = 0.75
//   cfg=100 → 不衰减 → raw 0.5
eq('mult debuff cfg=0 → 1',
   effectiveBairitu({}, {weight:0, purity:100}, {bairitu:0.5, weight_delta:0, calc_type:0}), 1);
eq('mult debuff cfg=50 → 0.75',
   effectiveBairitu({}, {weight:50, purity:100}, {bairitu:0.5, weight_delta:0, calc_type:0}), 0.75);
eq('mult debuff cfg=100 → 0.5',
   effectiveBairitu({}, {weight:100, purity:100}, {bairitu:0.5, weight_delta:0, calc_type:0}), 0.5);

console.log('\n--- 分式 delta (3 个 delta 均支持) ---');
// weight_delta="1/2" = 0.5, ct=0, weight=50 → factor=0.75, eff=(5-1)·0.75+1=4
eq('w_delta="1/2" (mult) cfg=50 → 4',
   effectiveBairitu({}, {weight:50, purity:100}, {bairitu:5, weight_delta:'1/2', calc_type:0}), 4);
// purity_delta="1/4" = 0.25, ct=1, purity=60 → factor=0.25+0.75·0.6=0.7, eff=3·0.7=2.1
eq('p_delta="1/4" (add) cfg=60 → 2.1',
   effectiveBairitu({}, {weight:100, purity:60}, {bairitu:3, purity_delta:'1/4', calc_type:1}), 2.1);
// lv_delta="2/5" = 0.4, ct=0, rarity=4, lv=1 → factor=0.4, eff=(3-1)·0.4+1=1.8
eq('lv_delta="2/5" (mult) lv=1 → 1.8',
   effectiveBairitu({rarity:4}, {weight:100, purity:100, lv:1}, {bairitu:3, lv_delta:'2/5', calc_type:0}), 1.8);

console.log('\n--- step 不参与公式 (同 cfg / delta、不同 step → 同结果) ---');
// 旧公式 step 是关键参数；新公式 step 不存在
const r1 = effectiveBairitu({weight_step:10},  {weight:50, purity:100}, {bairitu:5, weight_delta:0.5, calc_type:0});
const r2 = effectiveBairitu({weight_step:100}, {weight:50, purity:100}, {bairitu:5, weight_delta:0.5, calc_type:0});
const r3 = effectiveBairitu({},                {weight:50, purity:100}, {bairitu:5, weight_delta:0.5, calc_type:0});
truthy('step=10/100/missing 结果一致', r1 === r2 && r2 === r3);

console.log('\n--- 完全无衰减 → 保留 raw bairitu (含分数字符串) ---');
eq('无 delta 字段 → raw 分式 "3/2" 保持',
   effectiveBairitu({}, {weight:100, purity:100}, {bairitu:'3/2', calc_type:0}), '3/2');
eq('cfg 满 + delta=0 → raw bairitu',
   effectiveBairitu({}, {weight:100, purity:100}, {bairitu:5, weight_delta:0, calc_type:0}), 5);

// ===== cr-edit setter 撤回联动模拟（新语义：0 保留为数值 0）=====
console.log('\n--- cr-edit setCrystalStep("weight", 0) → editData.weight_step=null + effects.weight_delta=null ---');
function setCrystalStep(editData, kind, val) {
  const stepKey = kind + '_step';
  const deltaKey = kind + '_delta';
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) {
    editData[stepKey] = null;
    (editData.effects || []).forEach(e => { e[deltaKey] = null; });
  } else {
    editData[stepKey] = n;
  }
}
const ed = {
  id: 1,
  weight_step: 10,
  purity_step: 20,
  effects: [
    {bairitu:5, weight_delta:0.3, purity_delta:0.5},
    {bairitu:3, weight_delta:0.2, purity_delta:0.4},
  ]
};
setCrystalStep(ed, 'weight', 0);
eq('weight_step → null', ed.weight_step, null);
eq('effects[0].weight_delta → null', ed.effects[0].weight_delta, null);
eq('effects[1].weight_delta → null', ed.effects[1].weight_delta, null);
truthy('purity_step 不受影响', ed.purity_step === 20);
truthy('effects[0].purity_delta 不受影响', ed.effects[0].purity_delta === 0.5);

// setCrystalDelta 新语义：'' → null（撤回）；'0' → 0（保留数值 0、満衰减）
console.log('\n--- setCrystalDelta（新语义：0 = 満衰减、保留为数值 0；空串 → null 撤回）---');
const parseBairituVal = (s) => {
  if (s === '') return null;
  if (s.includes('/')) {
    const p = s.trim().split('/');
    return (p.length === 2 && p[0] !== '' && p[1] !== '') ? s.trim() : null;
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
};
function setCrystalDelta(ed, ei, kind, val) {
  const e = ed.effects?.[ei];
  if (!e) return;
  const deltaKey = kind + '_delta';
  e[deltaKey] = parseBairituVal(val);   // '' → null, '0' → 0, '1/2' → '1/2', '0.5' → 0.5
}

// 空串 → null (撤回)
{
  const e = {effects: [{weight_delta: 0.3}]};
  setCrystalDelta(e, 0, 'weight', '');
  eq('空串 → null（撤回）', e.effects[0].weight_delta, null);
}
// '0' → 0 (満衰减、保留)
{
  const e = {effects: [{weight_delta: 0.3}]};
  setCrystalDelta(e, 0, 'weight', '0');
  eq('"0" → 0（数値、満衰减）', e.effects[0].weight_delta, 0);
}
// '0.5' → 0.5
{
  const e = {effects: [{}]};
  setCrystalDelta(e, 0, 'weight', '0.5');
  eq('"0.5" → 0.5', e.effects[0].weight_delta, 0.5);
}
// '1/2' → '1/2'（分式字符串保留）
{
  const e = {effects: [{}]};
  setCrystalDelta(e, 0, 'weight', '1/2');
  eq('"1/2" → "1/2"（保留分式）', e.effects[0].weight_delta, '1/2');
}
// purity_delta 同上
{
  const e = {effects: [{}]};
  setCrystalDelta(e, 0, 'purity', '3/4');
  eq('purity_delta "3/4" → "3/4"', e.effects[0].purity_delta, '3/4');
}
// lv_delta 新增（三个 delta 都走相同路径）
{
  const e = {effects: [{}]};
  setCrystalDelta(e, 0, 'lv', '0.7');
  eq('lv_delta "0.7" → 0.7', e.effects[0].lv_delta, 0.7);
}
{
  const e = {effects: [{}]};
  setCrystalDelta(e, 0, 'lv', '2/5');
  eq('lv_delta "2/5" → "2/5"（分式）', e.effects[0].lv_delta, '2/5');
}
{
  const e = {effects: [{lv_delta: 0.5}]};
  setCrystalDelta(e, 0, 'lv', '0');
  eq('lv_delta "0" → 0（満衰减、保留）', e.effects[0].lv_delta, 0);
}
{
  const e = {effects: [{lv_delta: 0.5}]};
  setCrystalDelta(e, 0, 'lv', '');
  eq('lv_delta "" → null（撤回）', e.effects[0].lv_delta, null);
}

// ===== cryLvMax 表 =====
console.log('\n--- cryLvMax: 顶层 level_max 优先；缺省走 rarity 表 ---');
eq('rarity=4 缺省 → 120', cryLvMax({rarity:4}), 120);
eq('rarity=6 缺省 → 200', cryLvMax({rarity:6}), 200);
eq('rarity=4, level_max=200 覆盖 → 200', cryLvMax({rarity:4, level_max:200}), 200);
eq('rarity 不存在 → 1', cryLvMax({rarity:99}), 1);
eq('null → 1', cryLvMax(null), 1);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
