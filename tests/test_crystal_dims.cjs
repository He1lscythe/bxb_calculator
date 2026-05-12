// 結晶 weight / purity 颗粒度衰减 (占位公式) + cr-edit 撤回联动
// 用法: node tests/test_crystal_dims.cjs

let pass = 0, fail = 0;
const eq = (label, a, b) => {
  const ok = (typeof a === 'number' && typeof b === 'number')
    ? Math.abs(a - b) < 1e-9
    : a === b;
  if (ok) pass++; else { fail++; console.error(`✗ ${label}: got=${JSON.stringify(a)} expected=${JSON.stringify(b)}`); }
};
const truthy = (label, cond) => { if (cond) pass++; else { fail++; console.error(`✗ ${label}`); } };

// ===== 占位公式 (与 hensei.html calc 路径同実装) =====
// raw 衰减: (100 - cfg) / step * delta
// bairitu_eff = max(minB, max - Σ衰减), minB={0:1, 3:1, else:0}
// bairitu は数値・分式文字列 ("1/2") 双方受け入れ（_parseScaling 経由）。
const _parseScaling = (v) => {
  if (v == null || v === 0 || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.indexOf('/') >= 0) {
    const parts = v.split('/').map(Number);
    return parts[1] ? parts[0] / parts[1] : 0;
  }
  return parseFloat(v) || 0;
};
function effectiveBairitu(cr, cfg, e) {
  const wStep = +cr.weight_step || 0;
  const pStep = +cr.purity_step || 0;
  let delta = 0;
  if (wStep > 0 && e.weight_delta && cfg.weight != null) {
    delta += (100 - cfg.weight) / wStep * e.weight_delta;
  }
  if (pStep > 0 && e.purity_delta && cfg.purity != null) {
    delta += (100 - cfg.purity) / pStep * e.purity_delta;
  }
  const baseB = _parseScaling(e.bairitu);
  if (!(delta > 0) || !Number.isFinite(baseB)) return e.bairitu;
  const ct = e.calc_type ?? 0;
  const minB = (ct === 0 || ct === 3) ? 1 : 0;
  return Math.max(minB, baseB - delta);
}

console.log('--- weight 衰减公式 ---');
// max=5, weight_step=10, weight_delta=0.3
// weight=100 → 不衰减
eq('weight=100 (max) → 5',
   effectiveBairitu({weight_step:10}, {weight:100, purity:100},
                    {bairitu:5, weight_delta:0.3, calc_type:0}), 5);
// weight=60 → 减 4 step × 0.3 = 1.2 → 3.8
eq('weight=60 → 5 - (40/10)*0.3 = 3.8',
   effectiveBairitu({weight_step:10}, {weight:60, purity:100},
                    {bairitu:5, weight_delta:0.3, calc_type:0}), 3.8);
// weight=0 → 减 10 step × 0.3 = 3 → 5-3=2 (mul ct=0, clamp 1, 2>1 OK)
eq('weight=0 → 5-3=2',
   effectiveBairitu({weight_step:10}, {weight:0, purity:100},
                    {bairitu:5, weight_delta:0.3, calc_type:0}), 2);

console.log('\n--- purity 衰减公式 ---');
// max=3 (加算 ct=1), purity_step=20, purity_delta=0.5
// purity=80 → 1 step × 0.5 = 0.5 → 3-0.5=2.5
eq('purity=80, ct=1 加算 → 3-0.5=2.5',
   effectiveBairitu({purity_step:20}, {weight:100, purity:80},
                    {bairitu:3, purity_delta:0.5, calc_type:1}), 2.5);

console.log('\n--- 双维度叠加 (占位：独立加性) ---');
// max=10, weight_step=10/delta=0.5, purity_step=20/delta=1
// weight=80 → 2 step × 0.5 = 1
// purity=60 → 2 step × 1 = 2
// total = 1+2 = 3 → 10-3=7
eq('weight=80, purity=60 双维度 → 7',
   effectiveBairitu({weight_step:10, purity_step:20},
                    {weight:80, purity:60},
                    {bairitu:10, weight_delta:0.5, purity_delta:1, calc_type:0}), 7);

console.log('\n--- clamp by calc_type ---');
// 大 delta → 衰减 > bairitu
const cr = {weight_step:10};
const cfg = {weight:0, purity:100};
// ct=0 mul → clamp 1
eq('mul (ct=0) clamp to 1',
   effectiveBairitu(cr, cfg, {bairitu:2, weight_delta:1, calc_type:0}), 1);
// ct=1 add → clamp 0
eq('add (ct=1) clamp to 0',
   effectiveBairitu(cr, cfg, {bairitu:2, weight_delta:1, calc_type:1}), 0);
// ct=2 final-add → clamp 0
eq('final-add (ct=2) clamp to 0',
   effectiveBairitu(cr, cfg, {bairitu:2, weight_delta:1, calc_type:2}), 0);
// ct=3 final-mul → clamp 1
eq('final-mul (ct=3) clamp to 1',
   effectiveBairitu(cr, cfg, {bairitu:2, weight_delta:1, calc_type:3}), 1);

console.log('\n--- step=0 / 缺省 → 不衰减 ---');
eq('weight_step=0 → 不衰减',
   effectiveBairitu({weight_step:0}, {weight:0, purity:100},
                    {bairitu:5, weight_delta:0.3, calc_type:0}), 5);
eq('weight_step 缺省 → 不衰减',
   effectiveBairitu({}, {weight:50, purity:50},
                    {bairitu:5, weight_delta:0.3, calc_type:0}), 5);
eq('weight_delta=0 / 缺省 → 不衰减',
   effectiveBairitu({weight_step:10}, {weight:50, purity:100},
                    {bairitu:5, calc_type:0}), 5);

console.log('\n--- cfg 满 max → 不衰减 ---');
eq('cfg.weight=100, cfg.purity=100 → 5',
   effectiveBairitu({weight_step:10, purity_step:20},
                    {weight:100, purity:100},
                    {bairitu:5, weight_delta:0.3, purity_delta:0.5, calc_type:0}), 5);

console.log('\n--- 浮点 step (0.1g / 0.01%) ---');
// weight_step=0.1, weight_delta=0.001, weight=99.9 → 1 step × 0.001 = 0.001
eq('weight_step=0.1 → 精确',
   effectiveBairitu({weight_step:0.1}, {weight:99.9, purity:100},
                    {bairitu:5, weight_delta:0.001, calc_type:0}), 5 - 0.001);
// purity_step=0.01, purity_delta=0.0001, purity=99.99 → 1 step × 0.0001
eq('purity_step=0.01 → 精确',
   effectiveBairitu({purity_step:0.01}, {weight:100, purity:99.99},
                    {bairitu:5, purity_delta:0.0001, calc_type:0}), 5 - 0.0001);

console.log('\n--- bairitu 分式文字列 ("3/2" 等) も衰减対象 ---');
// b="3/2" = 1.5, weight_step=10, weight_delta=0.1, weight=50 → 衰减 5 step × 0.1 = 0.5 → 1.5 - 0.5 = 1.0
eq('b="3/2" weight=50 ct=0 → max(1, 1.5 - 0.5) = 1',
   effectiveBairitu({weight_step:10}, {weight:50, purity:100},
                    {bairitu:'3/2', weight_delta:0.1, calc_type:0}), 1);
// b="3/2" 衰减但ない場合は raw 文字列を保持（calc 路径と同様）
eq('b="3/2" no decay (cfg.weight=100) → "3/2" 保持',
   effectiveBairitu({weight_step:10}, {weight:100, purity:100},
                    {bairitu:'3/2', weight_delta:0.1, calc_type:0}), '3/2');
// b="2/3" ≈ 0.6667 + ct=1 加算 → max(0, 0.6667 - 0.5) = 0.1667
eq('b="2/3" weight=50 ct=1 → max(0, 2/3 - 0.5) = 1/6',
   effectiveBairitu({weight_step:10}, {weight:50, purity:100},
                    {bairitu:'2/3', weight_delta:0.1, calc_type:1}), 2/3 - 0.5);

// ===== cr-edit setter 撤回联动模拟 =====
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

// 撤回路径反向：从 0 改成有效值
const ed2 = {weight_step: null, effects: [{}]};
setCrystalStep(ed2, 'weight', 10);
eq('weight_step 设回 10 → 10', ed2.weight_step, 10);
truthy('effects[0].weight_delta 保留 null（不联动恢复，玩家自己再填）',
       !('weight_delta' in ed2.effects[0]) || ed2.effects[0].weight_delta == null);

// setCrystalDelta 撤回
console.log('\n--- setCrystalDelta(ei, "weight", "" 或 0) → effect.weight_delta=null ---');
function setCrystalDelta(ed, ei, kind, val) {
  const e = ed.effects?.[ei];
  if (!e) return;
  const deltaKey = kind + '_delta';
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n === 0 || val === '') e[deltaKey] = null;
  else e[deltaKey] = n;
}
const ed3 = {effects: [{weight_delta: 0.3}]};
setCrystalDelta(ed3, 0, 'weight', '');
eq('空串 → null', ed3.effects[0].weight_delta, null);
const ed4 = {effects: [{weight_delta: 0.3}]};
setCrystalDelta(ed4, 0, 'weight', '0');
eq('"0" → null', ed4.effects[0].weight_delta, null);
const ed5 = {effects: [{weight_delta: 0.3}]};
setCrystalDelta(ed5, 0, 'weight', '0.5');
eq('"0.5" → 0.5', ed5.effects[0].weight_delta, 0.5);

// ===== CRYSTAL_RARITY_LV_MAX 表 =====
console.log('\n--- cryLvMax: 顶层 level_max 优先；缺省走 rarity 表 ---');
const CRYSTAL_RARITY_LV_MAX = {1: 10, 2: 30, 3: 80, 4: 120, 5: 160, 6: 200};
const cryLvMax = (cr) => +cr?.level_max || (CRYSTAL_RARITY_LV_MAX[+cr?.rarity] ?? 1);
eq('rarity=4 缺省 → 120', cryLvMax({rarity:4}), 120);
eq('rarity=6 缺省 → 200', cryLvMax({rarity:6}), 200);
eq('rarity=4, level_max=200 覆盖 → 200', cryLvMax({rarity:4, level_max:200}), 200);
eq('rarity 不存在 → 1', cryLvMax({rarity:99}), 1);
eq('null → 1', cryLvMax(null), 1);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
