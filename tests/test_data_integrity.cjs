// 数据完整性测试：所有 base / revise json 文件的 schema 不变量
// 用法: node tests/test_data_integrity.cjs

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const truthy = (label, cond) => { if (cond) pass++; else { fail++; console.error(`✗ ${label}`); } };

const ROOT = path.resolve(__dirname, '..');
const load = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8')); }
  catch (e) { return null; }
};

console.log('--- 文件加载 ---');
const files = ['characters.json', 'souls.json', 'crystals.json', 'bladegraph.json',
               'masou.json', 'guildemblem.json', 'guildtitle.json',
               'characters_revise.json', 'souls_revise.json', 'crystals_revise.json',
               'bladegraph_revise.json', 'masou_revise.json', 'omoide_revise.json'];
const data = {};
for (const f of files) {
  // revise 文件は main branch 上では gitignored（data-staging のみ tracked）。
  // 存在しなければスキップ、後続テストも data[f] が undefined なら自動 skip。
  const fullPath = path.join(ROOT, 'data', f);
  if (f.endsWith('_revise.json') && !fs.existsSync(fullPath)) continue;
  data[f] = load(f);
  truthy(`${f} 可加载且为数组`, Array.isArray(data[f]));
}

console.log('\n--- 通用 entry schema (id 必须, name 通常有) ---');
for (const f of files) {
  if (!data[f]) continue;
  let bad = 0;
  for (const e of data[f]) {
    if (typeof e.id !== 'number' && typeof e.id !== 'string') bad++;
  }
  truthy(`${f}: 所有 entry id 是数字（错 ${bad}）`, bad === 0);
}

console.log('\n--- effect_text 字段统一（不应有 effect 顶层字段）---');
for (const fname of ['characters.json', 'souls.json', 'crystals.json', 'bladegraph.json', 'masou.json']) {
  const arr = data[fname];
  if (!arr) continue;
  let bad = 0;
  for (const e of arr) {
    if ('effect' in e && !('effect_text' in e)) bad++;
  }
  truthy(`${fname}: 顶层 effect_text 替代 effect（错 ${bad}）`, bad === 0);
}

console.log('\n--- bunrui=7 硬规则: 含 7 时必须独占 [7] ---');
function checkBunrui7(arr, getEffects) {
  let violations = 0;
  for (const e of arr || []) {
    for (const eff of getEffects(e) || []) {
      const b = eff.bunrui || [];
      if (b.includes(7) && b.length > 1) violations++;
    }
  }
  return violations;
}
truthy(`crystals: bunrui=[7] 独占 (违反: ${checkBunrui7(data['crystals.json'], c => c.effects)})`,
       checkBunrui7(data['crystals.json'], c => c.effects) === 0);
truthy(`bladegraph: bunrui=[7] 独占`,
       checkBunrui7(data['bladegraph.json'], c => c.effects) === 0);

console.log('\n--- soul affinity schema ---');
const souls = data['souls.json'];
if (souls) {
  let bad = 0, total = 0;
  for (const s of souls) {
    for (const fld of ['element_affinity', 'weapon_affinity']) {
      const d = s[fld] || {};
      for (const [k, v] of Object.entries(d)) {
        total++;
        if (typeof v !== 'object' || v === null) { bad++; continue; }
        if (!('level' in v)) bad++;
        // atk/def_effect 可选；如果有，必须是 string
        if ('atk_effect' in v && typeof v.atk_effect !== 'string') bad++;
        if ('def_effect' in v && typeof v.def_effect !== 'string') bad++;
        // base 不应有 = "1" 的字段（已 strip）
        if (v.atk_effect === '1' || v.def_effect === '1') bad++;
      }
    }
  }
  truthy(`souls.json affinity entry 全部合法（共 ${total}，错 ${bad}）`, bad === 0);
}

console.log('\n--- chara.tags（魔剣特性）schema ---');
// chara.tags = int[]、各 id ∈ CHARA_TAG keys（旧 bd_skill.special 已迁移）
// 注：新 tag 加入时同步更新此 expected set（与 shared/constants.js CHARA_TAG 保持一致）。
{
  const EXPECTED_TAG_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  const checkChara = (arr, fname) => {
    let badShape = 0, badId = 0, residualSpecial = 0;
    for (const c of arr || []) {
      if ('tags' in c) {
        if (!Array.isArray(c.tags)) badShape++;
        else for (const t of c.tags) {
          if (typeof t !== 'number' || !EXPECTED_TAG_IDS.has(t)) badId++;
        }
      }
      // bd_skill.special 不应残留
      if (c.bd_skill && typeof c.bd_skill === 'object' && 'special' in c.bd_skill) residualSpecial++;
    }
    truthy(`${fname}: chara.tags 必须是 int[] (违反 ${badShape})`, badShape === 0);
    truthy(`${fname}: chara.tags id ∈ CHARA_TAG keys (违反 ${badId})`, badId === 0);
    truthy(`${fname}: 不残留 bd_skill.special (违反 ${residualSpecial})`, residualSpecial === 0);
  };
  checkChara(data['characters.json'],         'characters.json');
  checkChara(data['characters_revise.json'],  'characters_revise.json');
}

console.log('\n--- crystal tombstone schema ---');
const crystals = data['crystals.json'];
if (crystals) {
  const ts = crystals.filter(c => c.tombstone);
  let bad = 0;
  for (const t of ts) {
    if (!Array.isArray(t.split_into) || t.split_into.length !== 2) bad++;
    else if (t.split_into[0] !== t.id + 100000 || t.split_into[1] !== t.id + 200000) bad++;
  }
  truthy(`crystal tombstone split_into 全部正确 (${ts.length} tombstone, 错 ${bad})`, bad === 0);
}

console.log('\n--- crystal lv / 颗粒度 schema (顶层 level_max / weight_step / purity_step + effect delta) ---');
// 字段 optional；若存在必须是正数。0 / null は「不可調」= 字段缺省 で表現するため残留禁止。
// 注：crystals_revise.json effects は稀疏 index 形式 ({"0":{...},"1":{...}})、crystals.json は配列。両対応。
{
  const _effectsValues = (e) => {
    if (Array.isArray(e?.effects)) return e.effects;
    if (e?.effects && typeof e.effects === 'object') return Object.values(e.effects);
    return [];
  };
  const checkPos = (arr, fname) => {
    let bad = 0;
    for (const c of arr || []) {
      for (const k of ['level_max', 'weight_step', 'purity_step']) {
        if (k in c && (typeof c[k] !== 'number' || !(c[k] > 0))) bad++;
      }
      for (const e of _effectsValues(c)) {
        for (const k of ['weight_delta', 'purity_delta']) {
          if (k in e && (typeof e[k] !== 'number' || !(e[k] > 0))) bad++;
        }
      }
    }
    truthy(`${fname}: crystal lv/颗粒度/delta 字段若存在必须 > 0 (违反 ${bad})`, bad === 0);
  };
  checkPos(data['crystals.json'],         'crystals.json');
  checkPos(data['crystals_revise.json'],  'crystals_revise.json');
}

console.log('\n--- emblem color/rarity 边界 ---');
const emblems = data['guildemblem.json'];
if (emblems) {
  let bad = 0;
  for (const e of emblems) {
    if (e.color != null && (e.color < 1 || e.color > 4)) bad++;
    if (e.rarity != null && (e.rarity < 1 || e.rarity > 4)) bad++;
  }
  truthy(`emblem color ∈ [1,4], rarity ∈ [1,4] (错 ${bad})`, bad === 0);
}

console.log('\n--- revise schema：entry 至少有 id+name + 1 个改动字段 ---');
for (const fname of ['characters_revise.json', 'souls_revise.json', 'crystals_revise.json',
                     'bladegraph_revise.json', 'masou_revise.json', 'omoide_revise.json']) {
  const arr = data[fname];
  if (!arr) continue;
  let bad = 0;
  for (const e of arr) {
    const realKeys = Object.keys(e).filter(k => k !== 'id' && k !== 'name');
    if (realKeys.length === 0) bad++;
  }
  truthy(`${fname}: 无空 entry（${arr.length} entries, 空 ${bad}）`, bad === 0);
}

console.log('\n--- soul merge pass：同 key effects 合体到 bunrui[]（不应留 dup entries）---');
// classify_skill_v2 末尾の merge pass：同 (bairitu, calc_type, scope, condition, element, type) は
// 1 entry に合体されるべき。例「攻撃力とブレイク力とスピード77%UP」→ bunrui=[1,2,4] 単一 entry。
{
  const souls = data['souls.json'];
  let dupGroups = 0;
  for (const s of souls || []) {
    for (const sk of s.skills || []) {
      const seen = new Map();
      for (const e of sk.effects || []) {
        if ((e.bunrui || []).includes(7)) continue;  // hit excluded
        if ('name' in e) continue;                    // scope=5 limited
        const key = JSON.stringify([e.bairitu, e.calc_type, e.scope, e.condition,
                                     e.element ?? null, e.type ?? null]);
        seen.set(key, (seen.get(key) || 0) + 1);
      }
      for (const cnt of seen.values()) if (cnt > 1) dupGroups++;
    }
  }
  truthy(`souls.json 无同 key 未合并的 effect 重复（残留 ${dupGroups} 组）`, dupGroups === 0);
}

console.log('\n--- recal 不再 merge revise 进 base JSON（HP+犠牲 cost-split 验证）---');
// crawl_*.py の Phase 3（merge revise → base）は除去された：base JSON は純粋な parser 出力。
// 「最大HPを犠牲に同装備セットの他魔剣攻撃力45%UP」を持つ 4 entries (id=174/206/402/415) で検証：
//   parser は HP-veto 修正後 bunrui=[1] benefit + bunrui=[10] cost-side を生成。
//   recal が誤って revise を merge した場合（ユーザー手動 bunrui=[1] self override で cost-side 消える）
//   この test が失敗する。
{
  const souls = data['souls.json'];
  const target = (souls || []).filter(s => [174, 206, 402, 415].includes(s.id));
  let checked = 0, withCost10 = 0;
  for (const s of target) {
    for (const sk of s.skills || []) {
      const et = sk.effect_text || '';
      if (!/最大HPを犠牲に.*他魔剣.*攻撃力45%UP/.test(et)) continue;
      checked++;
      if ((sk.effects || []).some(e => (e.bunrui || []).includes(10))) withCost10++;
    }
  }
  truthy(`souls.json HP+犠牲 cost-split：${checked}/${target.length} skills 含 bunrui=[10] cost-side`,
         checked > 0 && withCost10 === checked);
}

console.log('\n--- revise 不应残留 null 字段 ---');
function findNulls(obj, path = '') {
  const found = [];
  if (obj === null) return [path];
  if (typeof obj !== 'object' || Array.isArray(obj)) return [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null) found.push(`${path}.${k}`);
    else found.push(...findNulls(v, `${path}.${k}`));
  }
  return found;
}
for (const fname of ['characters_revise.json', 'souls_revise.json', 'crystals_revise.json',
                     'bladegraph_revise.json', 'masou_revise.json']) {
  const arr = data[fname];
  if (!arr) continue;
  let nullCount = 0;
  for (const e of arr) nullCount += findNulls(e).length;
  truthy(`${fname}: 无 null 字段 (${nullCount} null)`, nullCount === 0);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
