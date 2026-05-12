// classify_skill_v2 (soul) のエッジケーステスト：cost-split / HP veto / condition guard /
// 数値化 / merge pass の交叉ケースを Python invoke で検証する。
// 用法: node tests/test_classify_soul.cjs

const path = require('path');
const { spawnSync } = require('child_process');

let pass = 0, fail = 0;
const eqDeep = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${label}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
  }
};
const truthy = (label, cond, msg = '') => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${label}${msg ? ' — ' + msg : ''}`);
  }
};

// Python-side: classify_skill_v2 を呼ぶワンショット script。case リストを stdin から JSON で読み、
// 各 case の effects 配列を stdout に JSON で返す。
const py = `
import sys, json
sys.path.insert(0, 'scripts')
from classify_common import classify_skill_v2
cases = json.loads(sys.stdin.read())
out = []
for c in cases:
    sk = {'name': c.get('name', 'X'), 'effect_text': c['text']}
    classify_skill_v2(sk, {}, {})
    out.append(sk.get('effects', []))
print(json.dumps(out, ensure_ascii=False))
`;

// 1 回の python 起動で全 case を回す（spawnSync を 1 回に抑える）
const cases = [
  // ── HP cost-side / veto / condition guard ──
  { id: 'hp-gisei-no-cond',         text: '最大HPを犠牲に同装備セットの他魔剣攻撃力45%UP' },
  { id: 'hp-daisho-no-cond',        text: '最大HPを代償に、HPを消耗するほど攻撃力が超UP' },
  { id: 'hp-shouhi-activation',     text: '拳闘装備で自分の攻撃時にHPを消費してダメージ増' },
  { id: 'hp-gisei-haisui',          text: '最大HPを犠牲に、残HPが多いほどモーション速度が超UP' },
  { id: 'hp-daisho-haisui-konshin', text: '最大HPを代償に、残HP多いほど攻撃力が超絶UP(最大150%UP)' },
  { id: 'hp-daisho-haisui-konshin2', text: '最大HPを代償に、自身の損傷率が低いほど攻撃力が超UP' },
  { id: 'hp-daisho-konshin',        text: '最大HPを代償に、残HPが少ないほど攻撃力が超UP(最大150%UP)' },

  // ── 非 HP cost-side（防御力 / ブレイク力 / B.D.攻撃力 等）──
  { id: 'def-cost-haisui',  text: '防御力を代償に、残HPが多いほど攻撃力が超UP' },
  { id: 'bk-cost-no-cond',  text: 'ブレイク力を代償に、さらに攻撃力がUP' },
  { id: 'mei-cost-pct',     text: '命中率40%DOWNを代償に、破損時攻撃力80%UP' },
  { id: 'bd-cost-pct',      text: 'B.D.攻撃力25%DOWNを代償に、ダメージ上限6.66億UPし、残HPが多いほど攻撃力UP(最大50%)' },

  // ── 並列 buff merge pass：同 (bairitu, ct, scope, cond, element, type) は 1 entry に合体 ──
  { id: 'merge-3stats',     text: '大鎌装備で攻撃力とブレイク力とスピード77%UP' },
  { id: 'merge-2stats',     text: '攻撃力とサファイア獲得量45%UP' },

  // ── cost-split + condition：cost_bunruis を Step 2 で union しないと cost-side 漏れる ──
  { id: 'no-split-haisui',  text: '残HPが多いほど攻撃力が超UP' },                           // cost-split 無し → bunrui=[1] のみ
  { id: 'no-split-attack',  text: '攻撃力50%UP' },                                           // 単純 buff

  // ── HP 消費 (activation cost) + bunrui=10 抑制 (cost-split 無し) ──
  { id: 'hp-shouhi-attack', text: '攻撃時のHP消費を代償に、攻撃力30%UP' },

  // ── 背水 (condition=2) variant：「HPが減るほど」「残HPが減るほど」 ──
  { id: 'haisui-heru',         text: '長剣か太刀装備でHPが減るほど攻撃力UP' },           // id=44 シンプル背水
  { id: 'haisui-zan-heru',     text: '残HPが減るほど攻撃力UP' },                          // 残 prefix variant
  { id: 'haisui-zanri-heru',   text: '残りHPが減るほど攻撃力UP' },                        // 残り prefix
  { id: 'haisui-sukunai',      text: '残HPが少ないほど攻撃力UP' },                        // 既存 background
  { id: 'haisui-shoumou',      text: 'HPを消耗するほど攻撃力が超UP' },                    // 既存 background
  { id: 'konshin-ooi',         text: '残HPが多いほど攻撃力UP' },                          // 既存 浑身（regression）
  // ↑「HP消費を代償に」 — cost_text の HP 消費キーワード で classify_effect が 10 を出さない。
  //   activation-cost なので bunrui=10 出ないのが正解。
];

const stdin = JSON.stringify(cases);
const r = spawnSync('python', ['-c', py], {
  encoding: 'utf8',
  cwd: path.resolve(__dirname, '..'),
  input: stdin,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});
if (r.status !== 0) {
  console.error('Python invocation failed:');
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
const lines = (r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('['));
const results = JSON.parse(lines[lines.length - 1]);
const byId = {};
cases.forEach((c, i) => { byId[c.id] = results[i]; });

const bunruiSetOf = (effs) => new Set(effs.flatMap(e => e.bunrui || []));
const findEntry  = (effs, b) => effs.find(e => (e.bunrui || []).includes(b));

// ===== HP cost-side / veto =====
console.log('--- HP cost-side / veto ---');

// 1. HP+犠牲 (no condition) → cost-split fires, _HP_COST veto suppressed (cost-split path) → bunrui=[10] preserved
{
  const effs = byId['hp-gisei-no-cond'];
  truthy('HP+犠牲 no cond: bunrui=[10] cost-side preserved', bunruiSetOf(effs).has(10));
  const e10 = findEntry(effs, 10);
  truthy('HP+犠牲 no cond: cost-side condition=0', e10 && e10.condition === 0);
  truthy('HP+犠牲 no cond: bunrui=[1] benefit present', bunruiSetOf(effs).has(1));
  const e1 = findEntry(effs, 1);
  truthy('HP+犠牲 no cond: bunrui=[1] bairitu=1.45', e1 && Math.abs(e1.bairitu - 1.45) < 1e-9);
}

// 2. HP+代償 (no condition triggers HP detection in full text) → bunrui=[10] preserved (代償 not in _HP_COST)
{
  const effs = byId['hp-daisho-no-cond'];
  truthy('HP+代償 no cond: bunrui=[10] preserved', bunruiSetOf(effs).has(10));
  truthy('HP+代償 no cond: bunrui=[1] benefit present', bunruiSetOf(effs).has(1));
}

// 3. HP+消費 (activation cost, no cost-split) → veto fires → bunrui=[10] DROPPED
{
  const effs = byId['hp-shouhi-activation'];
  truthy('HP+消費 activation cost: bunrui=[10] dropped (veto)', !bunruiSetOf(effs).has(10));
}

// 4. HP+犠牲 + condition (残HPが多いほど) → full-text classify_effect の HP 検出は condition>0 で skip、
//    cost_bunruis の Step-2 union が必須（id=370 プロメテウス case）
{
  const effs = byId['hp-gisei-haisui'];
  truthy('HP+犠牲 + 残HP多い (condition=1): bunrui=[10] cost-side preserved (Step-2 union 効く)',
         bunruiSetOf(effs).has(10));
  const e10 = findEntry(effs, 10);
  truthy('HP+犠牲 + 残HP多い: bunrui=[10] cost-side condition=0', e10 && e10.condition === 0);
  const e5 = findEntry(effs, 5);
  truthy('HP+犠牲 + 残HP多い: bunrui=[5] benefit condition=1 (浑身)', e5 && e5.condition === 1);
}

// 5. HP+代償 + 残HP多いほど (id=436 ケイオス) — 同じ Step-2 union path
{
  const effs = byId['hp-daisho-haisui-konshin'];
  truthy('id=436 HP+代償+残HP多い: bunrui=[10] preserved', bunruiSetOf(effs).has(10));
  const e1 = findEntry(effs, 1);
  truthy('id=436: bunrui=[1] benefit cond=1 (浑身)', e1 && e1.condition === 1);
  const e10 = findEntry(effs, 10);
  truthy('id=436: bunrui=[10] cost cond=0', e10 && e10.condition === 0);
}

// 6. HP+代償 + 損傷率が低いほど (id=399 プルート) — condition=1 (浑身)
{
  const effs = byId['hp-daisho-haisui-konshin2'];
  truthy('id=399 HP+代償+損傷率低い: bunrui=[10] preserved', bunruiSetOf(effs).has(10));
}

// 7. HP+代償 + 残HPが少ないほど (id=428 アプロディタ) — condition=2 (背水)
{
  const effs = byId['hp-daisho-konshin'];
  truthy('id=428 HP+代償+残HP少ない: bunrui=[10] preserved', bunruiSetOf(effs).has(10));
  const e1 = findEntry(effs, 1);
  truthy('id=428: bunrui=[1] benefit cond=2 (背水)', e1 && e1.condition === 2);
}

// ===== 非 HP cost-side =====
console.log('\n--- 非 HP cost-side ---');

// 8. 防御力を代償に + condition trigger → bunrui=[12] cost-side
{
  const effs = byId['def-cost-haisui'];
  truthy('防御力 cost + 残HP多い: bunrui=[12] cost-side', bunruiSetOf(effs).has(12));
  const e12 = findEntry(effs, 12);
  truthy('防御力 cost: cond=0', e12 && e12.condition === 0);
  const e1 = findEntry(effs, 1);
  truthy('防御力 cost: 攻撃力 benefit cond=1 (浑身)', e1 && e1.condition === 1);
}

// 9. ブレイク力を代償に → bunrui=[2] cost
{
  const effs = byId['bk-cost-no-cond'];
  truthy('ブレイク力 cost: bunrui=[2] cost-side', bunruiSetOf(effs).has(2));
}

// 10. 命中率40%DOWN cost (bunrui=16 = その他) — bairitu=1 placeholder OK
{
  const effs = byId['mei-cost-pct'];
  const e1 = findEntry(effs, 1);
  truthy('命中率DOWN cost + 攻撃力80%UP benefit: bunrui=[1] bairitu=1.8',
         e1 && Math.abs(e1.bairitu - 1.8) < 1e-9);
}

// 11. B.D.攻撃力25%DOWN cost — bunrui=[3] bairitu=0.75
{
  const effs = byId['bd-cost-pct'];
  const e3 = findEntry(effs, 3);
  truthy('B.D.攻撃力25%DOWN cost: bunrui=[3] bairitu=0.75',
         e3 && Math.abs(e3.bairitu - 0.75) < 1e-9);
}

// ===== merge pass =====
console.log('\n--- merge pass：同 key effects 合体 ---');

// 12. 「攻撃力とブレイク力とスピード77%UP」→ 1 entry bunrui=[1,2,4]
{
  const effs = byId['merge-3stats'];
  truthy('3-stat 並列 → 1 entry', effs.length === 1, `actual ${effs.length} entries`);
  const e = effs[0];
  eqDeep('3-stat: bunrui=[1,2,4] sorted union', e.bunrui, [1, 2, 4]);
  truthy('3-stat: bairitu=1.77', Math.abs(e.bairitu - 1.77) < 1e-9);
}

// 13. 「攻撃力とサファイア獲得量45%UP」→ 1 entry bunrui=[1,14]
{
  const effs = byId['merge-2stats'];
  truthy('2-stat 並列 → 1 entry', effs.length === 1);
  const e = effs[0];
  eqDeep('2-stat: bunrui=[1,14] sorted union', e.bunrui, [1, 14]);
  truthy('2-stat: bairitu=1.45', Math.abs(e.bairitu - 1.45) < 1e-9);
}

// ===== no cost-split path =====
console.log('\n--- no cost-split path ---');

// 14. 「残HPが多いほど攻撃力が超UP」→ cost-split 無し、condition=1、bunrui=[1] のみ（HP cost-side 無し）
{
  const effs = byId['no-split-haisui'];
  truthy('no-split haisui: bunrui=[1] のみ', bunruiSetOf(effs).has(1) && !bunruiSetOf(effs).has(10));
  const e1 = findEntry(effs, 1);
  truthy('no-split haisui: cond=1 (浑身)', e1 && e1.condition === 1);
}

// 15. 「攻撃力50%UP」→ シンプル
{
  const effs = byId['no-split-attack'];
  truthy('simple buff: bunrui=[1] cond=0 bairitu=1.5',
         bunruiSetOf(effs).has(1) && findEntry(effs, 1).condition === 0
         && Math.abs(findEntry(effs, 1).bairitu - 1.5) < 1e-9);
}

// 16. 「攻撃時のHP消費を代償に、攻撃力30%UP」— HP消費 = activation cost, cost_text "攻撃時のHP消費を" の
//    classify_effect は HP 消費 negative regex で bunrui=10 出さない。activation cost is by design 排除。
{
  const effs = byId['hp-shouhi-attack'];
  truthy('HP消費 activation: bunrui=[10] not present (activation cost by design)',
         !bunruiSetOf(effs).has(10));
  const e1 = findEntry(effs, 1);
  truthy('HP消費 activation: bunrui=[1] bairitu=1.3', e1 && Math.abs(e1.bairitu - 1.3) < 1e-9);
}

// ===== 背水 condition=2 variant 検出 =====
console.log('\n--- 背水 condition=2 variant：HPが減るほど etc ---');

// 17. 「長剣か太刀装備でHPが減るほど攻撃力UP」(id=44 実例)
{
  const effs = byId['haisui-heru'];
  const e1 = findEntry(effs, 1);
  truthy('id=44 HPが減るほど: bunrui=[1] cond=2 (背水)', e1 && e1.condition === 2);
}

// 18-19. 残/残り prefix variant
{
  const e = findEntry(byId['haisui-zan-heru'], 1);
  truthy('残HPが減るほど → cond=2', e && e.condition === 2);
}
{
  const e = findEntry(byId['haisui-zanri-heru'], 1);
  truthy('残りHPが減るほど → cond=2', e && e.condition === 2);
}

// 20-21. 既存 patterns regression
{
  const e = findEntry(byId['haisui-sukunai'], 1);
  truthy('残HPが少ないほど → cond=2', e && e.condition === 2);
}
{
  const e = findEntry(byId['haisui-shoumou'], 1);
  truthy('HPを消耗するほど → cond=2', e && e.condition === 2);
}

// 22. 浑身 regression
{
  const e = findEntry(byId['konshin-ooi'], 1);
  truthy('残HPが多いほど → cond=1（浑身 regression）', e && e.condition === 1);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
