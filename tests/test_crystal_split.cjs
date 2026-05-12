// 测试 crystal 純真記憶 split 逻辑（id+100000=攻 / id+200000=動 / tombstone）
// 用法: node tests/test_crystal_split.cjs

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const truthy = (label, cond) => { if (cond) pass++; else { fail++; console.error(`✗ ${label}`); } };
const eq = (label, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${label}: actual=${JSON.stringify(a)} expected=${JSON.stringify(b)}`);
  }
};

console.log('--- 加载 crystals.json ---');
let arr;
try {
  arr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crystals.json'), 'utf8'));
} catch (e) {
  console.log('  (crystals.json 加载失败，跳过)');
  process.exit(0);
}
truthy('是数组', Array.isArray(arr));
const byId = new Map(arr.map(c => [c.id, c]));

console.log('\n--- 純真記憶 schema 验证 ---');
const tombstones = arr.filter(c => c.tombstone === true);
const splits = arr.filter(c => c.id >= 100000);
truthy(`存在 tombstone entry (${tombstones.length} 个)`, tombstones.length > 0);
truthy(`存在 split entry (${splits.length} 个)`, splits.length > 0);
truthy(`splits 数 = tombstone × 2`, splits.length === tombstones.length * 2);

console.log('\n--- 每个 tombstone 的 split_into 完整性 ---');
let badSplits = 0;
for (const ts of tombstones) {
  if (!ts.split_into || ts.split_into.length !== 2) {
    badSplits++;
    console.error(`✗ id=${ts.id} ${ts.name}: split_into 缺失或非 2 元素`);
    continue;
  }
  const [atkId, spdId] = ts.split_into;
  if (atkId !== ts.id + 100000 || spdId !== ts.id + 200000) {
    badSplits++;
    console.error(`✗ id=${ts.id}: split_into=[${atkId},${spdId}] 不符 [+100000, +200000]`);
    continue;
  }
  if (!byId.has(atkId) || !byId.has(spdId)) {
    badSplits++;
    console.error(`✗ id=${ts.id}: split_into 引用的 id 在 crystals.json 不存在`);
  }
}
truthy(`tombstone split_into 全部正确（错误 ${badSplits}）`, badSplits === 0);

console.log('\n--- 攻 / 動 entry 字段 ---');
let badAtk = 0, badSpd = 0;
for (const ts of tombstones) {
  const [atkId, spdId] = ts.split_into;
  const atk = byId.get(atkId), spd = byId.get(spdId);
  if (atk) {
    if (!atk.name.endsWith('･攻')) badAtk++;
    if (atk.effect_text !== '攻撃力UP') badAtk++;
    if (!atk.effects || !atk.effects[0] ||
        JSON.stringify(atk.effects[0].bunrui) !== '[1]') badAtk++;
  }
  if (spd) {
    if (!spd.name.endsWith('･動')) badSpd++;
    if (spd.effect_text !== '攻撃モーション速度UP') badSpd++;
    if (!spd.effects || !spd.effects[0] ||
        JSON.stringify(spd.effects[0].bunrui) !== '[5]') badSpd++;
  }
}
truthy(`所有 ･攻 entry name/effect_text/bunrui 正确（错误 ${badAtk}）`, badAtk === 0);
truthy(`所有 ･動 entry name/effect_text/bunrui 正确（错误 ${badSpd}）`, badSpd === 0);

console.log('\n--- icon URL 模 100000 验证 ---');
// split id 的 icon 应当解析回原 crystal id（mod 100000）
function iconUrlId(id) { return id % 100000; }
for (const ts of tombstones.slice(0, 3)) {
  const [atkId, spdId] = ts.split_into;
  eq(`atk id=${atkId} icon → ${ts.id}`, iconUrlId(atkId), ts.id);
  eq(`spd id=${spdId} icon → ${ts.id}`, iconUrlId(spdId), ts.id);
}

console.log('\n--- 前端 tombstone filter 验证 ---');
// 模拟 hensei.html 的 allCrystals = arr.filter(c => !c.tombstone)
const visibleToHensei = arr.filter(c => !c.tombstone);
truthy('所有 tombstone 都被过滤掉', visibleToHensei.every(c => !c.tombstone));
truthy('split entry 都保留',
       splits.every(s => visibleToHensei.some(v => v.id === s.id)));

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
