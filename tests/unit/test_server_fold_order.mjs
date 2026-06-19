// tests/unit/test_server_fold_order.mjs
// HP / HitCount 战前 server-fold 计算顺序覆盖 (2026-06-19)。
// 重点: orderServerFold 顺序不变性 + 多 effect 加/乘各种先后排列、保证计算顺序正确。
// 顺序 spec: 自身好感 → 自身costume → 各slot[技能→结晶→costume(非自身)] → 各slot bg → 各slot soul → 其余
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderServerFold, serverFoldHP, serverFoldHitCount } from '../../shared/stats-calc.js';

// ---- helpers ----
// effect factory: 标记 _source/_src_slot + math/value + base_parameter。tag 用于断言顺序。
let _tag = 0;
const e = (source, slot, math, value, opts = {}) => ({
  _source: source,
  _src_slot: slot,
  _src_name: opts.name || `${source}@${slot}#${_tag++}`,
  base_parameter: opts.param || 'HP',
  parameter: opts.param || 'HP',
  math_type: math, // 'Multiply' | 'Addition'
  value,
  condition_factor: opts.cf ?? 1,
  ...(opts.stages ? { _stages: opts.stages } : {}),
  _tag: opts.name || null,
});

// 全排列
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}
const srcSlots = (list) => list.map((x) => `${x._source}@${x._src_slot}`);

// ============================================================
// orderServerFold — 顺序 spec + 输入顺序不变性
// ============================================================
test('orderServerFold: 完整 spec 顺序 (target slot 0)', () => {
  const omoide = e('omoide', 0, 'Addition', 1);
  const selfMasou = e('masou', 0, 'Multiply', 1.1);
  const s0skill = e('chara_skill', 0, 'Multiply', 1.2);
  const s0meta = e('chara_meta', 0, 'Multiply', 1.05);
  const s0cry = e('crystal', 0, 'Addition', 10);
  const s1skill = e('chara_skill', 1, 'Multiply', 1.3);
  const s1cry = e('crystal', 1, 'Addition', 20);
  const s1masou = e('masou', 1, 'Multiply', 1.15);
  const s2skill = e('chara_skill', 2, 'Addition', 30);
  const s0bg = e('bg', 0, 'Multiply', 1.4);
  const s2bg = e('bg', 2, 'Addition', 40);
  const s0soul = e('soul', 0, 'Multiply', 1.5);
  const s1soulAff = e('soul_affinity', 1, 'Multiply', 1.6);
  const otherOmoide = e('omoide', 2, 'Addition', 99); // 他 slot omoide → 末尾

  const input = [
    s1soulAff, s2bg, otherOmoide, s0cry, selfMasou, s1masou, s0bg, s2skill,
    omoide, s0skill, s1cry, s0meta, s1skill, s0soul,
  ];
  const out = orderServerFold(input, 0);
  // 期望顺序
  const expected = [
    omoide,          // 自身好感
    selfMasou,       // 自身costume
    s0skill, s0meta, // slot0 技能(chara_skill+meta)
    s0cry,           // slot0 结晶
    // slot0 costume = 自身、跳过
    s1skill,         // slot1 技能
    s1cry,           // slot1 结晶
    s1masou,         // slot1 costume
    s2skill,         // slot2 技能
    s0bg, s2bg,      // bg (slot 升序)
    s0soul, s1soulAff, // soul (slot 升序)
    otherOmoide,     // 其余
  ];
  assert.deepEqual(srcSlots(out), srcSlots(expected));
});

test('orderServerFold: 自身 costume 提前、对应 slot 不再重复', () => {
  const selfMasou = e('masou', 1, 'Multiply', 1.1, { name: 'selfMasou' });
  const s1skill = e('chara_skill', 1, 'Multiply', 1.2, { name: 's1skill' });
  const out = orderServerFold([s1skill, selfMasou], 1);
  // target=slot1: 自身costume 在 slot1 技能之前、且 slot1 的 costume 段不再出现 selfMasou
  assert.deepEqual(out.map((x) => x._src_name), ['selfMasou', 's1skill']);
  assert.equal(out.filter((x) => x._src_name === 'selfMasou').length, 1);
});

test('orderServerFold: 输入顺序不变性 — 所有排列 → 同一规范顺序', () => {
  const set = [
    e('soul', 0, 'Multiply', 1.5, { name: 'soul0' }),
    e('chara_skill', 0, 'Multiply', 1.2, { name: 'sk0' }),
    e('crystal', 0, 'Addition', 10, { name: 'cry0' }),
    e('bg', 0, 'Multiply', 1.4, { name: 'bg0' }),
    e('omoide', 0, 'Addition', 1, { name: 'omo0' }),
  ];
  const canonical = orderServerFold(set, 0).map((x) => x._src_name);
  assert.deepEqual(canonical, ['omo0', 'sk0', 'cry0', 'bg0', 'soul0']);
  for (const p of permutations(set)) {
    assert.deepEqual(orderServerFold(p, 0).map((x) => x._src_name), canonical);
  }
});

test('orderServerFold: 同组内保持输入(master 数组)顺序', () => {
  const a = e('chara_skill', 0, 'Multiply', 1.1, { name: 'A' });
  const b = e('chara_skill', 0, 'Addition', 5, { name: 'B' });
  const c = e('chara_skill', 0, 'Multiply', 1.2, { name: 'C' });
  assert.deepEqual(orderServerFold([a, b, c], 0).map((x) => x._src_name), ['A', 'B', 'C']);
  assert.deepEqual(orderServerFold([c, b, a], 0).map((x) => x._src_name), ['C', 'B', 'A']);
});

// ============================================================
// serverFoldHP — (base + 前置Add) × 自身Mul + 后置Add、floor 终值
// ============================================================
test('serverFoldHP: 无 effect → floor(base)', () => {
  assert.equal(serverFoldHP(1000, [], 0), 1000);
  assert.equal(serverFoldHP(1000.9, [], 0), 1000); // floor、非 ceil
});

test('serverFoldHP: 单乘 → base × mul', () => {
  assert.equal(serverFoldHP(1000, [e('chara_skill', 0, 'Multiply', 1.5)], 0), 1500);
});

test('serverFoldHP: 自身好感Add 在自身技能Mul 之前 → (base+add)×mul (加算落乘算内)', () => {
  const eff = [e('chara_skill', 0, 'Multiply', 1.5), e('omoide', 0, 'Addition', 200)];
  // omoide(自身好感)排最前、chara_skill mul 之后 → (1000+200)×1.5 = 1800
  assert.equal(serverFoldHP(1000, eff, 0), 1800);
});

test('serverFoldHP: soul Add 在自身Mul 之后 → base×mul + add (加算落乘算外)', () => {
  const eff = [e('chara_skill', 0, 'Multiply', 1.5), e('soul', 0, 'Addition', 200)];
  // chara_skill mul → 1500、soul(最后) add → 1700
  assert.equal(serverFoldHP(1000, eff, 0), 1700);
});

test('serverFoldHP: 靠前 slot 的 range=All Add 落自身 Mul 内 (slot 顺序敏感)', () => {
  // target=slot1。slot0 的 HP Add(已 _effectApplies 命中)排在 slot1 技能之前
  const eff = [
    e('chara_skill', 1, 'Multiply', 2.0, { name: 's1mul' }),
    e('chara_skill', 0, 'Addition', 300, { name: 's0add' }),
  ];
  // s0(前置) add → 1300、s1 mul ×2 → 2600
  assert.equal(serverFoldHP(1000, eff, 1), 2600);
});

test('serverFoldHP: 靠后 slot 的 Add 落自身 Mul 外', () => {
  // target=slot0。slot2 的 add 排在 slot0 mul 之后
  const eff = [
    e('chara_skill', 0, 'Multiply', 2.0, { name: 's0mul' }),
    e('chara_skill', 2, 'Addition', 300, { name: 's2add' }),
  ];
  // s0 mul → 2000、s2(后置) add → 2300
  assert.equal(serverFoldHP(1000, eff, 0), 2300);
});

test('serverFoldHP: 输入顺序不影响结果 (orderServerFold 规范化)', () => {
  const set = [
    e('omoide', 0, 'Addition', 200, { name: 'omo' }),
    e('chara_skill', 0, 'Multiply', 1.5, { name: 'mul' }),
    e('soul', 0, 'Addition', 100, { name: 'add' }),
  ];
  // 期望: (1000+200)×1.5 + 100 = 1900
  const expect = 1900;
  for (const p of permutations(set)) assert.equal(serverFoldHP(1000, p, 0), expect);
});

test('serverFoldHP: 终值 floor (非 ceil/round)', () => {
  // 1000 × 1.0005 = 1000.5 → floor 1000
  assert.equal(serverFoldHP(1000, [e('chara_skill', 0, 'Multiply', 1.0005)], 0), 1000);
});

test('serverFoldHP: 只 filter HP、其它 parameter 不参与', () => {
  const eff = [
    e('chara_skill', 0, 'Multiply', 1.5),
    e('chara_skill', 0, 'Multiply', 9, { param: 'Attack' }), // 非 HP、忽略
  ];
  assert.equal(serverFoldHP(1000, eff, 0), 1500);
});

// ============================================================
// serverFoldHitCount — 每步 trunc + 每步 clamp ≥1、顺序敏感
// ============================================================
const HP = (s, slot, m, v, o = {}) => e(s, slot, m, v, { ...o, param: 'HitCount' });

test('serverFoldHitCount: 无 effect → base 原样', () => {
  assert.deepEqual(serverFoldHitCount([3, 4, 5], [], 0), [3, 4, 5]);
});

test('serverFoldHitCount: 单乘每段 trunc', () => {
  // 3×1.5=4.5→4、4×1.5=6、5×1.5=7.5→7
  assert.deepEqual(serverFoldHitCount([3, 4, 5], [HP('chara_skill', 0, 'Multiply', 1.5)], 0), [4, 6, 7]);
});

test('serverFoldHitCount: 顺序敏感 — Mul先(技能) vs Add先(自身好感) 结果不同', () => {
  const mul = HP('chara_skill', 0, 'Multiply', 1.5, { name: 'mul' });
  const add = HP('omoide', 0, 'Addition', 2, { name: 'add' }); // omoide=自身好感 排最前

  // 实际顺序: 自身好感(add) → 技能(mul): trunc(3+2)=5 → trunc(5×1.5)=7
  assert.deepEqual(serverFoldHitCount([3], [mul, add], 0), [7]);

  // 对照: 若两者都在技能组 (add 在 mul 前 / 后) — 同组保持输入顺序
  const addSk = HP('chara_skill', 0, 'Addition', 2, { name: 'addSk' });
  // mul 先: trunc(3×1.5)=4 → trunc(4+2)=6
  assert.deepEqual(serverFoldHitCount([3], [mul, addSk], 0), [6]);
  // add 先: trunc(3+2)=5 → trunc(5×1.5)=7
  assert.deepEqual(serverFoldHitCount([3], [addSk, mul], 0), [7]);
});

test('serverFoldHitCount: per-step clamp ≥1 (Mul×0 → 1、再 Add)', () => {
  const mul0 = HP('chara_skill', 0, 'Multiply', 0, { name: 'mul0' });
  const add = HP('soul', 0, 'Addition', 2, { name: 'add' }); // soul 最后
  // trunc(3×0)=0 → clamp 1 → trunc(1+2)=3。若无 per-step clamp 则 0+2=2
  assert.deepEqual(serverFoldHitCount([3], [mul0, add], 0), [3]);
});

test('serverFoldHitCount: 终值 max(1)', () => {
  // 只有 Mul×0、无后续 → clamp 到 1
  assert.deepEqual(serverFoldHitCount([3], [HP('chara_skill', 0, 'Multiply', 0)], 0), [1]);
});

test('serverFoldHitCount: soul _stages 数组按段', () => {
  const sk = HP('soul', 0, 'Addition', 0, { stages: [1, 2, 3], name: 'soulHit' });
  // 每段 +stages[i]: [3+1, 4+2, 5+3] = [4,6,8]
  assert.deepEqual(serverFoldHitCount([3, 4, 5], [sk], 0), [4, 6, 8]);
});

test('serverFoldHitCount: base=0 的段不参与 (返 0)', () => {
  assert.deepEqual(serverFoldHitCount([3, 0, 5], [HP('chara_skill', 0, 'Addition', 2)], 0), [5, 0, 7]);
});

test('serverFoldHitCount: 多 effect 跨 slot 顺序 (slot0技能 → slot1结晶 → soul)', () => {
  const eff = [
    HP('soul', 0, 'Addition', 1, { name: 'soulAdd' }),      // 最后
    HP('crystal', 1, 'Multiply', 2, { name: 's1cryMul' }),  // slot1 结晶
    HP('chara_skill', 0, 'Addition', 3, { name: 's0skAdd' }), // slot0 技能
  ];
  // 顺序: s0skAdd → s1cryMul → soulAdd
  // base 5 → trunc(5+3)=8 → trunc(8×2)=16 → trunc(16+1)=17
  assert.deepEqual(serverFoldHitCount([5], eff, 0), [17]);
  // 输入乱序 → 同结果
  const shuffled = [eff[2], eff[0], eff[1]];
  assert.deepEqual(serverFoldHitCount([5], shuffled, 0), [17]);
});

test('serverFoldHitCount: HitCountKeepDamage 也计入 hit (与 HitCount 一致)', () => {
  // 第一效果「加 hit」: Addition value 2 → 每段 +2 (减攻第二效果在 collectEffects 里、此处只验 hit fold)
  const keep = e('crystal', 0, 'Addition', 2, { param: 'HitCountKeepDamage', name: 'keep' });
  assert.deepEqual(serverFoldHitCount([3, 4, 5], [keep], 0), [5, 6, 7]);
  // 跟普通 HitCount 混用、顺序由 orderServerFold 决定
  const hc = HP('chara_skill', 0, 'Multiply', 2, { name: 'hc' }); // slot0 技能、先
  // base 3 → trunc(3×2)=6 (技能 Mul) → trunc(6+2)=8 (crystal keep Add)
  assert.deepEqual(serverFoldHitCount([3], [keep, hc], 0), [8]);
});
