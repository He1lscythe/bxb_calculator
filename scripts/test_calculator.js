// 测试 hensei.html 计算器逻辑
// 用法: node scripts/test_calculator.js
// 镜像 hensei.html 的核心计算函数 (computeStats / _baseStat / _buffApplies / _conditionMet / ...)
// 然后跑一组场景验证：单魔剑/双魔剑/三魔剑、各种 scope/condition/状态

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
}

// ===== 加载真实数据 (用于真实场景测试) =====
let allCharas = load('characters.json');
let allSouls  = load('souls.json');
let allBGs    = load('bladegraph.json');
let allCrystals = load('crystals.json');
let SENZAI_TABLE = {};
try { SENZAI_TABLE = load('senzai_table.json'); } catch(e) {}

// 应用 revise (与 hensei.html 一致)
function deepApply(target, patch) {
  for (var k in patch) {
    if (k === 'id') continue;
    var pv = patch[k], tv = target[k];
    if (Array.isArray(tv) && pv && typeof pv === 'object' && !Array.isArray(pv) &&
        Object.keys(pv).every(kk => /^\d+$/.test(kk))) {
      for (var idx in pv) {
        var i = +idx;
        if (i >= tv.length) continue;
        var pvi = pv[idx];
        if (pvi && typeof pvi === 'object' && !Array.isArray(pvi) &&
            tv[i] && typeof tv[i] === 'object' && !Array.isArray(tv[i])) {
          deepApply(tv[i], pvi);
        } else {
          tv[i] = JSON.parse(JSON.stringify(pvi));
        }
      }
    } else if (pv !== null && typeof pv === 'object' && !Array.isArray(pv) &&
        tv !== null && typeof tv === 'object' && !Array.isArray(tv)) {
      deepApply(tv, pv);
    } else {
      target[k] = JSON.parse(JSON.stringify(pv));
    }
  }
}
function applyRevise(arr, revise) {
  if (!Array.isArray(revise)) return;
  const idx = new Map(arr.map((c, i) => [c.id, i]));
  revise.forEach(r => {
    const i = idx.get(r.id);
    if (i != null) deepApply(arr[i], r);
  });
}
function tryLoad(name) { try { return load(name); } catch(e) { return []; } }
applyRevise(allCharas, tryLoad('characters_revise.json'));
applyRevise(allCharas, tryLoad('omoide_revise.json'));
applyRevise(allSouls, tryLoad('souls_revise.json'));
applyRevise(allCrystals, tryLoad('crystals_revise.json'));

// ===== 常量 (与 hensei.html 一致) =====
const _STAT_KEYS = ['攻撃力','防御力','HP','ブレイク力'];
const _BUNRUI_TO_STAT = { 1:'攻撃力', 2:'ブレイク力', 10:'HP', 12:'防御力' };
const JUKUDO_MAX_TBL={4:{通常:60,改造:99},3:{通常:50,改造:75,極弐:90},2:{通常:30,改造:45,極弐:70},1:{通常:10,改造:25,極弐:50}};
const LEVEL_MAX_TBL ={4:{通常:250,改造:255},3:{通常:200,改造:215,極弐:230},2:{通常:150,改造:155,極弐:180},1:{通常:60,改造:99,極弐:120}};
const LEVEL_1JUK_TBL={4:{通常:60,改造:70},3:{通常:40,改造:50,極弐:65},2:{通常:30,改造:35,極弐:60},1:{通常:15,改造:20,極弐:35}};
const AWAKENING_MAX_TBL={4:9,3:14,2:36,1:24};
const AWAKENING_MULT_TBL={4:1.43,3:2.42,2:4.45,1:5.37};

// ===== 计算函数 (与 hensei.html 完全镜像) =====
function _capLevel(chara, tr) {
  const r = chara.rarity;
  const lev1 = LEVEL_1JUK_TBL[r]?.[tr.state];
  const levMax = LEVEL_MAX_TBL[r]?.[tr.state];
  if (lev1 == null || levMax == null) return null;
  const jMax = JUKUDO_MAX_TBL[r]?.[tr.state] ?? 1;
  const jk = Math.min(Math.max(1, tr.jukudo||1), jMax);
  return Math.min(levMax, lev1 + (jk-1) * 5);
}
function _baseStat(chara, tr, attr) {
  const state = chara.states?.[tr.state];
  const stMax = state?.stats?.max?.[attr];
  if (stMax == null) return null;
  const sourceState = (tr.state === '通常') ? state : chara.states?.['通常'];
  const initial = sourceState?.stats?.initial?.[attr];
  const normalMax = sourceState?.stats?.max?.[attr];
  const r = chara.rarity;
  const levMax = LEVEL_MAX_TBL[r]?.[tr.state];
  const cap = _capLevel(chara, tr);
  if (cap == null || levMax == null || levMax <= 1 || initial == null || normalMax == null) return stMax;
  const lvBase = Math.min(tr.level || 1, cap);
  let v = stMax * (1 - (levMax - lvBase) / (levMax - 1) * initial / normalMax);
  if ((tr.level || 1) > cap) {
    const aMax = AWAKENING_MAX_TBL[chara.rarity] || 1;
    const mult = AWAKENING_MULT_TBL[chara.rarity] || 1;
    const overLv = (tr.level || 1) - cap;
    v = v * (1 + overLv / (aMax * 5) * (mult - 1));
  }
  return v;
}
function _resolveCharaSkills(c){
  if(!c||!c.states) return [];
  let stateLabel=null, state=null;
  for(const s of ['極弐','改造','通常']){
    if(c.states[s]){ stateLabel=s; state=c.states[s]; break; }
  }
  if(!state) return [];
  const dead = new Set(Array.isArray(c._deleted_skills)?c._deleted_skills:[]);
  const base = (state.skills||[]).filter(sk=>!dead.has(sk.name||''));
  const added = (c._added_skills && c._added_skills[stateLabel]) || [];
  return base.concat(added);
}
function _resolveSoulSkills(s){
  if(!s) return [];
  const dead = new Set(Array.isArray(s._deleted_skills)?s._deleted_skills:[]);
  const base = (s.skills||[]).filter(sk=>!dead.has(sk.name||''));
  const added = Array.isArray(s._added_skills)?s._added_skills:[];
  return base.concat(added);
}
function _omoidePicksFor(chara, tr) {
  const picks = tr.omoide_picks || {};
  const aff = +tr.affinity || 0;
  const result = [];
  (chara.omoide || []).forEach(row => {
    if ((+row.threshold || 0) > aff) return;
    const pickedIcon = picks[row.threshold];
    if (pickedIcon == null) return;
    const info = SENZAI_TABLE[pickedIcon] || SENZAI_TABLE[String(pickedIcon)];
    if (info) result.push(info);
  });
  return result;
}
function _buffApplies(srcChara, tgtChara, e) {
  if (!tgtChara) return false;
  const sc = e.scope;
  if (sc == null || sc === 1) return true;
  if (sc === 0) return !!srcChara && srcChara.id === tgtChara.id;
  if (sc === 3) {
    if (!srcChara || srcChara.id !== tgtChara.id) return false;
    const elem = e.element;
    const elemOK = elem == null || (Array.isArray(elem) ? elem.indexOf(tgtChara.element) >= 0 : elem === tgtChara.element);
    const tp = e.type;
    const typeOK = tp == null || (Array.isArray(tp) ? tp.indexOf(tgtChara.type) >= 0 : tp === tgtChara.type);
    return elemOK && typeOK;
  }
  if (sc === 2 || sc === 4) {
    const elem = e.element;
    const elemOK = elem == null || (Array.isArray(elem) ? elem.indexOf(tgtChara.element) >= 0 : elem === tgtChara.element);
    const tp = e.type;
    const typeOK = tp == null || (Array.isArray(tp) ? tp.indexOf(tgtChara.type) >= 0 : tp === tgtChara.type);
    return elemOK && typeOK;
  }
  if (sc === 5) {
    const nm = e.name;
    if (!nm || !tgtChara.name) return false;
    return tgtChara.name === nm || tgtChara.name.indexOf(nm) >= 0;
  }
  return false;
}
function _conditionMet(condition, hpPct) {
  if (!condition) return true;
  let h = +hpPct; if (isNaN(h)) h = 100;
  if (condition === 1) return h >= 80;
  if (condition === 2) return h <= 50;
  if (condition === 3) return h <= 25;
  return true;
}
function _parseScaling(v) {
  if (v == null || v === 0 || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.indexOf('/') >= 0) {
    const parts = v.split('/').map(Number);
    return parts[1] ? parts[0] / parts[1] : 0;
  }
  return parseFloat(v) || 0;
}
function _scaledBairitu(b, sc, jukudo) {
  const s = _parseScaling(sc);
  if (!s) return b;
  return (b || 0) + Math.max(1, jukudo) * s;
}
function computeStats(chara, tr, team, teamSize) {
  if (!chara || !tr) return null;
  const stats = {};
  for (const attr of _STAT_KEYS) {
    const b = _baseStat(chara, tr, attr);
    stats[attr] = b != null ? b : 0;
  }
  let damageLimit = 2147483647;
  const acc = { stats, damageLimit };
  const tgt = chara;

  function _applyEf(e, srcJk, mode) {
    const ct = e.calc_type ?? 1;
    if (mode === 'add' && ct !== 1) return;
    if (mode === 'mul' && ct !== 0) return;
    const v = _scaledBairitu(e.bairitu || 0, e.bairitu_scaling, srcJk);
    const bunrui = e.bunrui || [];
    for (const b of bunrui) {
      if (b === 17) {
        if (mode === 'add') acc.damageLimit += v;
        else acc.damageLimit *= v;
      } else {
        const stat = _BUNRUI_TO_STAT[b];
        if (!stat || acc.stats[stat] == null) continue;
        if (mode === 'add') acc.stats[stat] += v;
        else acc.stats[stat] *= v;
      }
    }
  }
  function _applyList(effects, srcChara, srcHp, srcJk) {
    if (!effects || !effects.length) return;
    const filtered = effects.filter(e =>
      _buffApplies(srcChara, tgt, e) && _conditionMet(e.condition, srcHp));
    if (!filtered.length) return;
    for (const e of filtered) _applyEf(e, srcJk, 'add');
    for (const e of filtered) _applyEf(e, srcJk, 'mul');
  }

  const selfJk = Math.max(1, tr.jukudo || 1);
  const picks = _omoidePicksFor(chara, tr);
  for (const info of picks) _applyEf(info, selfJk, 'add');
  for (const info of picks) _applyEf(info, selfJk, 'mul');

  for (let si = 0; si < teamSize; si++) {
    const slot = team[si]; if (!slot) continue;
    const srcChara = allCharas.find(x => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    const crEffs = [];
    (slot.crystals || []).forEach(cid => {
      if (!cid) return;
      const cr = allCrystals.find(x => x.id === cid);
      if (cr) (cr.effects || []).forEach(e => crEffs.push(e));
    });
    _applyList(crEffs, srcChara, srcHp, srcJk);
    if (srcChara) {
      const skills = _resolveCharaSkills(srcChara);
      const charaEffs = [];
      skills.forEach(sk => (sk.effects || []).forEach(e => charaEffs.push(e)));
      _applyList(charaEffs, srcChara, srcHp, srcJk);
    }
  }
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si]; if (!slot) continue;
    const srcChara = allCharas.find(x => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    const soul = allSouls.find(x => x.id === slot.soul);
    if (!soul) continue;
    const skills = _resolveSoulSkills(soul);
    const soulEffs = [];
    skills.forEach(sk => (sk.effects || []).forEach(e => soulEffs.push(e)));
    _applyList(soulEffs, srcChara, srcHp, srcJk);
  }
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si]; if (!slot) continue;
    const srcChara = allCharas.find(x => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    const bg = allBGs.find(x => x.id === slot.bg);
    if (!bg) continue;
    _applyList(bg.effects || [], srcChara, srcHp, srcJk);
  }

  const mr = [1.00, 1.03, 1.05][tr.marriage] || 1;
  for (const k of _STAT_KEYS) acc.stats[k] *= mr;
  if (tr.moeshin) acc.stats['攻撃力'] *= 1.3;
  const lpMult = [1.0, 1.1, 1.5][tr.lp] || 1;
  acc.stats['攻撃力'] *= lpMult;

  return { stats: acc.stats, damageLimit: acc.damageLimit };
}

// ===== 测试框架 =====
const results = [];
let pass = 0, fail = 0;

function approxEq(a, b, tol = 0.01) {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}
function expect(label, actual, expected, tol) {
  const ok = (typeof expected === 'number' && typeof actual === 'number')
    ? approxEq(actual, expected, tol)
    : (actual === expected);
  results.push({ label, actual, expected, ok });
  if (ok) pass++; else fail++;
  return ok;
}
function expectClose(label, actual, expected, relTol = 0.001) {
  return expect(label, actual, expected, relTol);
}

// ===== Mock 数据 (受控测试) =====
function mkTr(overrides) {
  return Object.assign({state:'通常',jukudo:1,awakening:0,marriage:0,moeshin:false,lp:0,level:1,hpPercent:100,affinity:0,omoide_picks:{}}, overrides||{});
}
function mkSlot(overrides) {
  return Object.assign({chara:null,soul:null,bg:null,crystals:[],tr:mkTr()}, overrides||{});
}
const emptyTeam = () => [0,1,2].map(()=>mkSlot());

// 注入 mock chara — 模拟一个 SS 火 长剣，通常+改造，单技能 攻+1000 scope=0
const MOCK_A = {
  id: 999001, name: 'MOCK_A', rarity: 4, element: 1, type: 1,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 10000, 防御力: 5000, HP: 30000, ブレイク力: 4000},
        initial: {攻撃力: 100, 防御力: 50, HP: 300, ブレイク力: 40},
      },
      skills: [{name: 'Self_攻+1000', effects: [{bunrui:[1], scope:0, calc_type:1, bairitu:1000}]}],
      basic_info: {結晶スロット: 4},
    },
    '改造': {
      stats: {
        max: {攻撃力: 12000, 防御力: 6000, HP: 36000, ブレイク力: 5000},
      },
      skills: [{name: 'Self_攻+1000', effects: [{bunrui:[1], scope:0, calc_type:1, bairitu:1000}]}],
      basic_info: {結晶スロット: 4},
    },
  },
  omoide: [{threshold: 100, slots: [9001]}, {threshold: 5000, slots: [9002]}],
};
// MOCK_B: SS 水 大剣，全体 攻+500
const MOCK_B = {
  id: 999002, name: 'MOCK_B', rarity: 4, element: 2, type: 2,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 8000, 防御力: 4000, HP: 25000, ブレイク力: 3000},
        initial: {攻撃力: 80, 防御力: 40, HP: 250, ブレイク力: 30},
      },
      skills: [{name: 'All_攻+500', effects: [{bunrui:[1], scope:1, calc_type:1, bairitu:500}]}],
    }
  },
};
// MOCK_C: SS 風 太刀，火属性限定 攻×1.20
const MOCK_C = {
  id: 999003, name: 'MOCK_C', rarity: 4, element: 3, type: 3,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 9000, 防御力: 4500, HP: 28000, ブレイク力: 3500},
        initial: {攻撃力: 90, 防御力: 45, HP: 280, ブレイク力: 35},
      },
      skills: [{name: 'Fire_攻×1.20', effects: [{bunrui:[1], scope:2, element:1, calc_type:0, bairitu:1.20}]}],
    }
  },
};
// MOCK_D: 浑身 攻+2000
const MOCK_D = {
  id: 999004, name: 'MOCK_D', rarity: 4, element: 4, type: 4,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 7000, 防御力: 3500, HP: 22000, ブレイク力: 3000},
        initial: {攻撃力: 70, 防御力: 35, HP: 220, ブレイク力: 30},
      },
      skills: [{name: 'Konshin_攻+2000', effects: [{bunrui:[1], scope:1, condition:1, calc_type:1, bairitu:2000}]}],
    }
  },
};
// 受控 mock soul
const MOCK_SOUL_X = {
  id: 999101, name: 'MOCK_SOUL', rarity: 4,
  skills: [{name: 'Soul_攻+300', effects: [{bunrui:[1], scope:1, calc_type:1, bairitu:300}]}],
};
// mock bg
const MOCK_BG_X = {
  id: 999201, name: 'MOCK_BG', rarity: 4,
  effects: [{bunrui:[1], scope:1, calc_type:0, bairitu:1.10}],
};
// mock crystal
const MOCK_CR_X = {
  id: 999301, name: 'MOCK_CR_FlatATK', rarity: 4,
  effects: [{bunrui:[1], scope:0, calc_type:1, bairitu:200}],
};
const MOCK_CR_FIRE = {
  id: 999302, name: 'MOCK_CR_FireOnly', rarity: 4,
  effects: [{bunrui:[1], scope:2, element:1, calc_type:1, bairitu:500}],
};

// 注入 mock 到全局表
allCharas.push(MOCK_A, MOCK_B, MOCK_C, MOCK_D);
allSouls.push(MOCK_SOUL_X);
allBGs.push(MOCK_BG_X);
allCrystals.push(MOCK_CR_X, MOCK_CR_FIRE);

// 受控 omoide info
SENZAI_TABLE[9001] = { koka: 'mock 攻+100', bunrui: [1], calc_type: 1, bairitu: 100 };
SENZAI_TABLE[9002] = { koka: 'mock 攻×1.05', bunrui: [1], calc_type: 0, bairitu: 1.05 };

// ===== 场景 =====
console.log('\n===== 计算器场景测试 =====\n');

// ----- 单魔剣 -----
{
  // C1: 通常 lv1 jukudo1 awakening0 — 应等于公式最低值 (含自身技能 +1000)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // SS通常 lv1 jukudo1: cap=60, levMax=250
  // 攻 = 10000 * (1 - 249/249 * 100/10000) = 10000 * 0.99 = 9900
  // + self skill +1000 → 10900
  expectClose('C1 通常 lv1 jk1 攻撃力 (含自身+1000)', r.stats['攻撃力'], 9900 + 1000);
  // 防 = 5000 * 0.99 = 4950 (无防御技能加成)
  expectClose('C1 通常 lv1 jk1 防御力', r.stats['防御力'], 4950);
  // ダメ上限 base 2^31-1 (无 bunrui=17 技能)
  expectClose('C1 ダメ上限 base', r.damageLimit, 2147483647);
}
{
  // C2: 通常 lv=cap (60), jukudo=1 — 攻=stats.max - (250-60)/249 * initial
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:60});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // 攻 = 10000 * (1 - (250-60)/249 * 100/10000) = 10000 * (1 - 190/249 * 0.01) ≈ 10000 * (1 - 0.007631) = 9923.7
  const expATK = 10000 * (1 - (250-60)/249 * 100/10000) + 1000;
  expectClose('C2 通常 lv60 jk1 攻撃力', r.stats['攻撃力'], expATK);
}
{
  // C3: 改造 lv 最大 (255), jukudo 99
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'改造', jukudo:99, level:255});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // 攻 = 12000 * (1 - (255-255)/254 * 100/10000) = 12000 (改造 stats.max)
  expectClose('C3 改造 lv255 jk99 攻撃力', r.stats['攻撃力'], 12000 + 1000);
}
{
  // C4: 觉醒 +5: lv > cap → boost
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, awakening:1, level:65}); // cap=60 +awakening 5 = 65
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // base at cap: 10000 * (1 - 190/249 * 0.01) ≈ 9923.69
  // boost: k*(1 + 5/(9*5) * (1.43-1)) = k*(1 + 5/45 * 0.43) = k * 1.04777...
  const k = 10000 * (1 - 190/249 * 0.01);
  const exp = k * (1 + 5/45 * 0.43) + 1000;
  expectClose('C4 觉醒 1 lv65 攻撃力', r.stats['攻撃力'], exp);
}
{
  // C5: 結婚 +1.05
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, marriage:2, level:1});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // (9900 + 1000) * 1.05 = 11445
  expectClose('C5 結婚×1.05', r.stats['攻撃力'], (9900 + 1000) * 1.05);
}
{
  // C6: 燃心 攻×1.3
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, moeshin:true, level:1});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  expectClose('C6 燃心 ×1.3', r.stats['攻撃力'], (9900 + 1000) * 1.3);
  expectClose('C6 燃心 不影响 防御力', r.stats['防御力'], 4950);
}
{
  // C7: LP 危機 ×1.5
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, lp:2, level:1});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  expectClose('C7 LP 危機 ×1.5', r.stats['攻撃力'], (9900 + 1000) * 1.5);
}
{
  // C8: omoide 加算 (icon 9001 +100)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, affinity:100, omoide_picks:{100: 9001}});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // base 9900 + omoide 100 + skill 1000 = 11000
  expectClose('C8 omoide 加算 100', r.stats['攻撃力'], 11000);
}
{
  // C9: omoide 乗算 (icon 9002 ×1.05)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, affinity:5000, omoide_picks:{5000: 9002}});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // 顺序: (base 9900) * 1.05 + skill 1000 (skill 是后续 stage 加算)
  // 实际计算: stage1 omoide add = 0; mul = 1.05 → base*1.05 = 10395
  // stage2 chara skill add = +1000 → 11395
  expectClose('C9 omoide ×1.05', r.stats['攻撃力'], 9900 * 1.05 + 1000);
}
{
  // C10: omoide 加+乘
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, affinity:5000, omoide_picks:{100: 9001, 5000: 9002}});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // (9900 + 100) * 1.05 + skill 1000 = 10500 + 1000 = 11500
  expectClose('C10 omoide 加+乘', r.stats['攻撃力'], (9900+100)*1.05 + 1000);
}
{
  // C11: omoide affinity gating (affinity=0 → 全锁定)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, affinity:0, omoide_picks:{100: 9001, 5000: 9002}});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // 所有 omoide 锁定 → 仅 base + skill
  expectClose('C11 affinity=0 锁定', r.stats['攻撃力'], 9900 + 1000);
}
{
  // C12: affinity=100 → 仅低阈值解锁
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, affinity:100, omoide_picks:{100: 9001, 5000: 9002}});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // 仅 100 解锁 (+100), 5000 锁定
  expectClose('C12 affinity=100 部分解锁', r.stats['攻撃力'], 9900 + 100 + 1000);
}

// ----- HP condition -----
{
  // C13: 浑身 hp=100 → 触发
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  const r = computeStats(MOCK_D, t[0].tr, t, 1);
  // base 攻 = 7000 * (1 - 249/249 * 70/7000) = 7000 * 0.99 = 6930
  // condition=1 浑身 满足 → +2000
  expectClose('C13 hp=100 浑身触发', r.stats['攻撃力'], 6930 + 2000);
}
{
  // C14: hp=50 → 浑身不触发
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  const r = computeStats(MOCK_D, t[0].tr, t, 1);
  expectClose('C14 hp=50 浑身不触发', r.stats['攻撃力'], 6930);
}
{
  // C15: hp=80 → 浑身阈值满足
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:80});
  const r = computeStats(MOCK_D, t[0].tr, t, 1);
  expectClose('C15 hp=80 浑身边界', r.stats['攻撃力'], 6930 + 2000);
}

// ----- 双魔剣 cross-slot -----
{
  // C16: A(slot0) self skill scope=0 不影响 B(slot1)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[1] = mkSlot({chara: 999002});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[0].tr, t, 2);
  const rB = computeStats(MOCK_B, t[1].tr, t, 2);
  // A: base 9900 + self+1000 + B 全体+500 = 11400
  // B: base 7920 + B self全体+500 + A scope=0 不影响 = 8420
  // base B攻 = 8000 * (1 - 249/249 * 80/8000) = 8000 * 0.99 = 7920
  expectClose('C16 A 攻撃力', rA.stats['攻撃力'], 9900 + 1000 + 500);
  expectClose('C16 B 攻撃力 (A 自身限定不影响)', rB.stats['攻撃力'], 7920 + 500);
}
{
  // C17: 全体 scope=1 buff 双向
  // 都已包含在 C16
  // 这里专门测 A scope=0 self only
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[1] = mkSlot({chara: 999002});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[0].tr, t, 2);
  // A 自身 scope=0 应用到 A → +1000
  expectClose('C17 A 自身 scope=0 应用', rA.stats['攻撃力'] - 9900 - 500, 1000);
}
{
  // C18: 元素限定 scope=2 element=1 (火) — MOCK_C 限定火, A=火, B=水
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999003}); // C 风
  t[1] = mkSlot({chara: 999001}); // A 火
  t[2] = mkSlot({chara: 999002}); // B 水
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[2].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[1].tr, t, 3);
  const rB = computeStats(MOCK_B, t[2].tr, t, 3);
  // C 的火属性 ×1.20 应该乘 A，但不乘 B
  // A: (9900) * 1.20 + self+1000 + B 全体+500 = ... 但 wait, 顺序是: stage 0 (C) → stage 1 (A) → stage 2 (B)
  // C 在 slot 0: chara skill 火属性 ×1.20 — 加算 0 (calc_type=0=乗算), A 是火 → 应用乘 1.20
  // A 在 slot 1: chara skill +1000 — A 是 self → 应用 +1000
  // B 在 slot 2: chara skill 全体+500 — 应用 +500
  // 顺序对 A: 9900*1.20 + 1000 + 500 = 11880 + 1500 = 13380
  expectClose('C18 A 火属性受 C 加成', rA.stats['攻撃力'], 9900 * 1.20 + 1000 + 500);
  // B 不是火 → C 的乘不应用
  // B 顺序: stage 0 (C 不应用) → stage 1 (A 不应用) → stage 2 (B self+500)
  expectClose('C18 B 水属性 不受 C 加成', rB.stats['攻撃力'], 7920 + 500);
}

// ----- crystal -----
{
  // C19: 結晶 scope=0 仅装备者
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001, crystals:[999301]});
  t[1] = mkSlot({chara: 999002});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[0].tr, t, 2);
  const rB = computeStats(MOCK_B, t[1].tr, t, 2);
  // A 应得 crystal +200; B 不得
  expectClose('C19 結晶 scope=0 仅装备者 A', rA.stats['攻撃力'], 9900 + 200 + 1000 + 500);
  expectClose('C19 結晶 scope=0 不影响 B', rB.stats['攻撃力'], 7920 + 500);
}
{
  // C20: 結晶 scope=2 火限定 (装备在水属性 B slot1)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001});
  t[1] = mkSlot({chara: 999002, crystals:[999302]});  // B 装备火限定结晶
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[0].tr, t, 2);
  const rB = computeStats(MOCK_B, t[1].tr, t, 2);
  // 結晶火限定 scope=2 element=1 → 检查 target 元素，A 是火 → 加成 +500; B 是水 → 不
  expectClose('C20 火限定結晶 加成 A', rA.stats['攻撃力'], 9900 + 1000 + 500 + 500);
  expectClose('C20 火限定結晶 不加成 B', rB.stats['攻撃力'], 7920 + 500);
}

// ----- soul / bg -----
{
  // C21: soul 全体加成
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001, soul:999101});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[0].tr, t, 1);
  // soul +300 全体
  expectClose('C21 soul 全体加成', rA.stats['攻撃力'], 9900 + 1000 + 300);
}
{
  // C22: bg 全体乘
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001, bg:999201});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[0].tr, t, 1);
  // 顺序: (base + skill+1000 stage 1) → bg ×1.10 stage 4
  // 9900 + 1000 = 10900 → ×1.10 = 11990
  expectClose('C22 bg 全体乘', rA.stats['攻撃力'], (9900 + 1000) * 1.10);
}

// ----- 三魔剑 完整 -----
{
  // C23: 完整三人队 顺序验证
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999003, crystals:[999302], soul:999101, bg:999201});  // C(风) + 火限定結晶 + Soul + BG
  t[1] = mkSlot({chara: 999001, crystals:[999301]});  // A(火) + 自身結晶+200
  t[2] = mkSlot({chara: 999002});  // B(水)
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[2].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[1].tr, t, 3);
  // 计算 A (slot 1, 火)
  // base = 9900
  // stage 1 self omoide: 无
  // stage 2:
  //   slot 0 結晶 (火限定 scope=2 元素=1, A=火 ✓) +500 → 10400
  //   slot 0 chara skill (C 火限定 scope=2 element=1) ×1.20 → 12480
  //   slot 1 結晶 (scope=0 自身 ✓) +200 → 12680
  //   slot 1 chara skill (A 自身 +1000) +1000 → 13680
  //   slot 2 結晶: 无
  //   slot 2 chara skill (B 全体 +500) +500 → 14180
  // stage 3:
  //   slot 0 soul (全体 +300) +300 → 14480
  //   slot 1 soul: 无
  //   slot 2 soul: 无
  // stage 4:
  //   slot 0 bg (全体 ×1.10) ×1.10 → 15928
  //   slot 1/2 bg: 无
  // 結婚 1.0, 燃心 false, LP 0
  const exp = ((((9900 + 500) * 1.20 + 200 + 1000) + 500) + 300) * 1.10;
  expectClose('C23 完整三队 A 顺序', rA.stats['攻撃力'], exp);
}
{
  // C24: 三人队 同 C23 但 C 在 slot 2 (验证不同槽位顺序结果不同)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001, crystals:[999301]});  // A(火) + 自身結晶
  t[1] = mkSlot({chara: 999002});  // B(水)
  t[2] = mkSlot({chara: 999003, crystals:[999302], soul:999101, bg:999201});  // C(风) + 火限定結晶 + Soul + BG
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[2].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rA = computeStats(MOCK_A, t[0].tr, t, 3);
  // 计算 A (slot 0, 火)
  // base = 9900
  // stage 2:
  //   slot 0 結晶 (scope=0 自身 ✓) +200 → 10100
  //   slot 0 chara skill (A self +1000) +1000 → 11100
  //   slot 1 結晶: 无
  //   slot 1 chara skill (B 全体 +500) +500 → 11600
  //   slot 2 結晶 (火限定, A=火 ✓) +500 → 12100
  //   slot 2 chara skill (C 火限定 ×1.20) ×1.20 → 14520
  // stage 3:
  //   slot 2 soul (+300) +300 → 14820
  // stage 4:
  //   slot 2 bg (×1.10) → 16302
  const exp = (((9900 + 200 + 1000 + 500 + 500) * 1.20 + 300)) * 1.10;
  expectClose('C24 同样魔剣不同槽位顺序', rA.stats['攻撃力'], exp);
  // C23 vs C24 应该不同 (顺序敏感)
  // C23 = ((((9900 + 500) * 1.20 + 200 + 1000) + 500) + 300) * 1.10
  //     = (((10400 * 1.20) + 1200) + 500 + 300) * 1.10
  //     = ((12480 + 1200) + 800) * 1.10
  //     = (13680 + 800) * 1.10
  //     = 14480 * 1.10 = 15928
  // C24 = (((9900 + 200 + 1000 + 500 + 500) * 1.20 + 300)) * 1.10
  //     = ((12100 * 1.20) + 300) * 1.10
  //     = (14520 + 300) * 1.10
  //     = 14820 * 1.10 = 16302
  // 不同 ✓
}

// ----- HP condition cross-slot (source HP) -----
{
  // C25: D(slot 0, hp=100) 浑身 +2000 全体, A(slot 1)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[1] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  const rA = computeStats(MOCK_A, t[1].tr, t, 2);
  // D 浑身触发 (D hp=100 ≥80) → +2000 全体生效
  // A: 9900 + 2000 (D) + 1000 (A self) = 12900
  expectClose('C25 source HP=100 触发浑身 → 全体生效', rA.stats['攻撃力'], 9900 + 2000 + 1000);
}
{
  // C26: D(slot 0, hp=50) 浑身不触发, 即使 A hp=100
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[1] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  const rA = computeStats(MOCK_A, t[1].tr, t, 2);
  expectClose('C26 source HP=50 浑身不触发', rA.stats['攻撃力'], 9900 + 1000);
}

// ----- 复合: 結婚 + LP + 燃心 + 全 buff -----
{
  // C27: 完整复合
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001, soul: 999101, bg: 999201, crystals:[999301]});
  t[0].tr = mkTr({state:'改造', jukudo:99, level:255, awakening:0, marriage:2, moeshin:true, lp:2, affinity:5000, omoide_picks:{100:9001, 5000:9002}});
  const r = computeStats(MOCK_A, t[0].tr, t, 1);
  // base 攻 (改造 lv255 jk99): cap=255, levMax=255
  //   = 12000 * (1 - 0/254 * 100/10000) = 12000
  // stage 1 omoide:
  //   add: +100 → 12100
  //   mul: ×1.05 → 12705
  // stage 2:
  //   slot 0 crystal scope=0 +200 → 12905
  //   slot 0 chara skill self+1000 → 13905
  // stage 3: soul+300 → 14205
  // stage 4: bg ×1.10 → 15625.5
  // 結婚 ×1.05: 16406.775
  // 燃心 ×1.3: 21328.8075
  // LP ×1.5: 31993.21125
  let v = 12000;
  v = v + 100; v = v * 1.05;  // omoide
  v = v + 200;  // crystal
  v = v + 1000; // skill
  v = v + 300;  // soul
  v = v * 1.10; // bg
  v = v * 1.05; // 結婚
  v = v * 1.3;  // 燃心
  v = v * 1.5;  // LP
  expectClose('C27 完整复合 攻撃力', r.stats['攻撃力'], v);
}

// ===== 真实数据 sanity 测试 =====
console.log('\n--- 真实数据 sanity ---\n');
{
  // R1: 选第一个 SS chara, 通常 lv 1
  const ss = allCharas.find(c => c.rarity === 4 && c.states && c.states['通常']);
  if (ss) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: ss.id});
    const r = computeStats(ss, t[0].tr, t, 1);
    expect('R1 SS 攻撃力 > 0', r.stats['攻撃力'] > 0, true);
    expect('R1 SS HP > 0', r.stats['HP'] > 0, true);
    expect('R1 SS ダメ上限 ≥ 2^31-1', r.damageLimit >= 2147483647, true);
  }
}
{
  // R2: SS 改造 lv max
  const ss = allCharas.find(c => c.rarity === 4 && c.states && c.states['改造']);
  if (ss) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: ss.id});
    t[0].tr = mkTr({state:'改造', jukudo:99, level:255});
    const r = computeStats(ss, t[0].tr, t, 1);
    const expATK = ss.states['改造'].stats?.max?.['攻撃力'];
    if (expATK) {
      // 各种 bunrui=1 自加成会让 r.stats.攻撃力 ≥ expATK
      expect('R2 改造 lv255 攻撃力 ≥ stats.max', r.stats['攻撃力'] >= expATK * 0.99, true);
    }
  }
}

// ===== 输出 =====
console.log('\n===== 测试结果 =====\n');
let mdRows = ['| # | 场景 | 期望 | 实际 | 通过 |', '|---|------|------|------|------|'];
results.forEach((r, i) => {
  const fmt = v => typeof v === 'number' ? v.toFixed(2) : String(v);
  mdRows.push(`| ${i+1} | ${r.label} | ${fmt(r.expected)} | ${fmt(r.actual)} | ${r.ok ? '✓' : '✗'} |`);
  if (!r.ok) console.log(`✗ ${r.label}: expected ${r.expected}, got ${r.actual}`);
});
console.log(`\nPassed: ${pass} / ${pass+fail}`);

const out = mdRows.join('\n');
fs.writeFileSync(path.join(ROOT, 'calculator_test_results.md'), '# 计算器测试结果 (auto-generated)\n\n' +
  `通过: ${pass} / ${pass+fail}\n\n` + out + '\n', 'utf8');
console.log('\n结果已写入 calculator_test_results.md');

process.exit(fail > 0 ? 1 : 0);
