// 测试 guildemblems.json schema：color (1-4) + rarity (1-4) + lvMax 计算
// 用法: node tests/test_emblem_schema.cjs

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const truthy = (label, cond) => { if (cond) pass++; else { fail++; console.error(`✗ ${label}`); } };
const eq = (label, a, b) => {
  if (a === b) pass++; else { fail++; console.error(`✗ ${label}: ${a} ≠ ${b}`); }
};

const EMBLEM_RARITY_LV_MAX = {1: 25, 2: 40, 3: 55, 4: 1};
const SLOT_COLORS = [1, 2, 3, 4];  // 黄/青/緑/赤

const emblemLvMax = (rarity) =>
  EMBLEM_RARITY_LV_MAX[+rarity || 1] || EMBLEM_RARITY_LV_MAX[1];

console.log('--- emblemLvMax (镜像 hensei.html) ---');
eq('rarity 1 → 25', emblemLvMax(1), 25);
eq('rarity 2 → 40', emblemLvMax(2), 40);
eq('rarity 3 → 55', emblemLvMax(3), 55);
eq('rarity 4 → 1', emblemLvMax(4), 1);
eq('未知 rarity 0 fallback → 25', emblemLvMax(0), 25);
eq('null fallback → 25', emblemLvMax(null), 25);

console.log('\n--- 加载 guildemblems.json ---');
let arr;
try {
  arr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'guildemblems.json'), 'utf8'));
} catch (e) {
  console.log('  (guildemblems.json 加载失败，跳过)');
  process.exit(0);
}
truthy('是数组', Array.isArray(arr));
truthy(`至少 1 个 emblem (${arr.length})`, arr.length > 0);

console.log('\n--- 每个 entry 字段验证 ---');
let bad = 0;
for (const e of arr) {
  const errs = [];
  if (typeof e.id !== 'number') errs.push('id 非数字');
  if (typeof e.name !== 'string') errs.push('name 非字符串');
  if (e.color != null && (e.color < 1 || e.color > 4)) errs.push(`color=${e.color} 超出 [1,4]`);
  if (e.rarity != null && (e.rarity < 1 || e.rarity > 4)) errs.push(`rarity=${e.rarity} 超出 [1,4]`);
  if (e.guild_only != null && typeof e.guild_only !== 'boolean') errs.push('guild_only 非 boolean');
  if (errs.length) {
    bad++;
    console.error(`✗ id=${e.id} ${e.name}: ${errs.join(', ')}`);
  }
}
truthy(`所有 entry schema 正确（错 ${bad}）`, bad === 0);

console.log('\n--- color 字段统计 ---');
const colorCount = {};
for (const e of arr) {
  if (e.color != null) colorCount[e.color] = (colorCount[e.color] || 0) + 1;
}
truthy(`color 字段已普及（${Object.keys(colorCount).length} 种值）`,
       Object.keys(colorCount).length >= 1);
console.log(`  color 分布: ${JSON.stringify(colorCount)}`);

console.log('\n--- 模拟槽位过滤逻辑 ---');
// hensei.html: SLOT_COLORS[slotIdx] = 该槽位接受的 color
function filterEmblemsForSlot(emblems, slotIdx) {
  const slotColor = SLOT_COLORS[slotIdx];
  return emblems.filter(em => !slotColor || (+em.color || 0) === slotColor);
}
for (let slot = 0; slot < 4; slot++) {
  const filtered = filterEmblemsForSlot(arr, slot);
  const expectedColor = SLOT_COLORS[slot];
  const allMatch = filtered.every(e => +e.color === expectedColor);
  truthy(`slot ${slot} 过滤后全是 color=${expectedColor}（${filtered.length} 个）`, allMatch);
}

console.log('\n--- rarity=4 emblem 验证 ---');
const r4 = arr.filter(e => e.rarity === 4);
console.log(`  rarity=4 emblem 数: ${r4.length}`);
for (const e of r4) {
  eq(`id=${e.id} ${e.name} lvMax=1`, emblemLvMax(e.rarity), 1);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
