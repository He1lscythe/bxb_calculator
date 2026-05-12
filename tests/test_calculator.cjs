// 测试 hensei.html 计算器逻辑
// 用法: node tests/test_calculator.js
// 镜像 hensei.html 的核心计算函数 (computeStats / _baseStat / _buffApplies / _conditionMet / ...)
// 然后跑一组场景验证：单魔剑/双魔剑/三魔剑、各种 scope/condition/状态

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TESTS_DIR = __dirname;
function load(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
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
function _conditionFactor(condition, hpPct) {
  if (!condition) return 1;
  let h = +hpPct; if (isNaN(h)) h = 100;
  h = Math.max(0, Math.min(100, h));
  if (condition === 1) return h / 100;
  if (condition === 2) return (100 - h) / 100;
  if (condition === 3) return h < 50 ? 1 : 0;
  return 1;
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

  function _applyEf(e, srcJk, srcHp, mode) {
    const ct = e.calc_type ?? 1;
    if (mode === 'add' && ct !== 1) return;
    if (mode === 'mul' && ct !== 0) return;
    let v = _scaledBairitu(e.bairitu || 0, e.bairitu_scaling, srcJk);
    const factor = _conditionFactor(e.condition, srcHp);
    if (mode === 'add') v = v * factor;
    else v = (v - 1) * factor + 1;
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
    const filtered = effects.filter(e => _buffApplies(srcChara, tgt, e));
    if (!filtered.length) return;
    for (const e of filtered) _applyEf(e, srcJk, srcHp, 'add');
    for (const e of filtered) _applyEf(e, srcJk, srcHp, 'mul');
  }

  const selfJk = Math.max(1, tr.jukudo || 1);
  const selfHp = tr.hpPercent ?? 100;
  const picks = _omoidePicksFor(chara, tr);
  for (const info of picks) _applyEf(info, selfJk, selfHp, 'add');
  for (const info of picks) _applyEf(info, selfJk, selfHp, 'mul');

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
// MOCK_E: 破損 攻+3000 (condition=3)
const MOCK_E = {
  id: 999005, name: 'MOCK_E', rarity: 4, element: 5, type: 5,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 6000, 防御力: 3000, HP: 20000, ブレイク力: 2500},
        initial: {攻撃力: 60, 防御力: 30, HP: 200, ブレイク力: 25},
      },
      skills: [{name: 'Hason_攻+3000', effects: [{bunrui:[1], scope:1, condition:3, calc_type:1, bairitu:3000}]}],
    }
  },
};
// MOCK_NAMED_TARGET: 名前 = "魔剣レヴァンテイン=TRUE" (用作 scope=5 的 target)
const MOCK_NAMED_TARGET = {
  id: 999006, name: '魔剣レヴァンテイン=TRUE', rarity: 4, element: 1, type: 1,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 8000, 防御力: 4000, HP: 24000, ブレイク力: 3000},
        initial: {攻撃力: 80, 防御力: 40, HP: 240, ブレイク力: 30},
      },
      skills: [],
    }
  },
};
// MOCK_OTHER: 名前 = "別の魔剣" (不应被 scope=5 buff 命中)
const MOCK_OTHER = {
  id: 999007, name: '別の魔剣', rarity: 4, element: 1, type: 1,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 8000, 防御力: 4000, HP: 24000, ブレイク力: 3000},
        initial: {攻撃力: 80, 防御力: 40, HP: 240, ブレイク力: 30},
      },
      skills: [],
    }
  },
};
// MOCK_NAMED_BG: scope=5 名前限定 攻+1500, name="レヴァンテイン" (子串匹配)
const MOCK_NAMED_BG = {
  id: 999202, name: 'MOCK_NAMED_BG', rarity: 4,
  effects: [{bunrui:[1], scope:5, name:'レヴァンテイン', calc_type:1, bairitu:1500}],
};

// MOCK_TRUE_END: 浑身 multiplicative ×5 攻撃力 (模拟「真解放-TRUE END-」jk=99 状态)
//   skill: bairitu=3 + scaling=2/99，jk=99 → effective bairitu = 5
// 测试时直接给 bairitu=5（绕过 scaling，更明确）
const MOCK_TRUE_END = {
  id: 999008, name: 'MOCK_TRUE_END', rarity: 4, element: 1, type: 1,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 10000, 防御力: 5000, HP: 30000, ブレイク力: 4000},
        initial: {攻撃力: 100, 防御力: 50, HP: 300, ブレイク力: 40},
      },
      skills: [{name: 'Konshin_攻×5', effects: [{bunrui:[1], scope:0, condition:1, calc_type:0, bairitu:5}]}],
    }
  },
};
// MOCK_FAFNIR: 背水 multiplicative ×7 攻撃力 (模拟「暴蝕魔竜 -Blaze mod. Ullr&Fafnir-」)
const MOCK_FAFNIR = {
  id: 999009, name: 'MOCK_FAFNIR', rarity: 4, element: 1, type: 1,
  states: {
    '通常': {
      stats: {
        max: {攻撃力: 10000, 防御力: 5000, HP: 30000, ブレイク力: 4000},
        initial: {攻撃力: 100, 防御力: 50, HP: 300, ブレイク力: 40},
      },
      skills: [{name: 'Haisui_攻×7', effects: [{bunrui:[1], scope:0, condition:2, calc_type:0, bairitu:7}]}],
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
allCharas.push(MOCK_A, MOCK_B, MOCK_C, MOCK_D, MOCK_E, MOCK_NAMED_TARGET, MOCK_OTHER, MOCK_TRUE_END, MOCK_FAFNIR);
allSouls.push(MOCK_SOUL_X);
allBGs.push(MOCK_BG_X, MOCK_NAMED_BG);
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

// ----- 浑身 condition=1 (linear with HP%) -----
// MOCK_D: 加算 condition=1 +2000，effective = 2000 × (hp/100)
// base 攻 = 7000 * (1 - 249/249 * 70/7000) = 7000 * 0.99 = 6930
{
  // C13 hp=100 → factor=1 → +2000 满
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  const r = computeStats(MOCK_D, t[0].tr, t, 1);
  expectClose('C13 浑身加算 hp=100 (factor=1)', r.stats['攻撃力'], 6930 + 2000);
}
{
  // C14 hp=50 → factor=0.5 → +1000
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  const r = computeStats(MOCK_D, t[0].tr, t, 1);
  expectClose('C14 浑身加算 hp=50 (factor=0.5)', r.stats['攻撃力'], 6930 + 1000);
}
{
  // C15 hp=0 → factor=0 → +0
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:0});
  const r = computeStats(MOCK_D, t[0].tr, t, 1);
  expectClose('C15 浑身加算 hp=0 (factor=0)', r.stats['攻撃力'], 6930);
}
// MOCK_TRUE_END: 乘算 condition=1 ×5，effective = (5-1)×(hp/100) + 1
// base 攻 = 10000 * (1 - 249/249 * 100/10000) = 9900
{
  // C15a hp=100 → factor=1 → effective ×5
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999008});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  const r = computeStats(MOCK_TRUE_END, t[0].tr, t, 1);
  expectClose('C15a 浑身乘算 hp=100 → ×5', r.stats['攻撃力'], 9900 * 5);
}
{
  // C15b hp=50 → factor=0.5 → effective (5-1)*0.5+1 = 3
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999008});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  const r = computeStats(MOCK_TRUE_END, t[0].tr, t, 1);
  expectClose('C15b 浑身乘算 hp=50 → ×3 (用户例)', r.stats['攻撃力'], 9900 * 3);
}
{
  // C15c hp=75 → factor=0.75 → effective (5-1)*0.75+1 = 4
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999008});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:75});
  const r = computeStats(MOCK_TRUE_END, t[0].tr, t, 1);
  expectClose('C15c 浑身乘算 hp=75 → ×4 (用户例)', r.stats['攻撃力'], 9900 * 4);
}
{
  // C15d hp=0 → factor=0 → effective ×1 (无 buff)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999008});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:0});
  const r = computeStats(MOCK_TRUE_END, t[0].tr, t, 1);
  expectClose('C15d 浑身乘算 hp=0 → ×1', r.stats['攻撃力'], 9900);
}

// ----- 背水 condition=2 (linear with damage%) -----
// MOCK_FAFNIR: 乘算 condition=2 ×7，effective = (7-1)×((100-hp)/100) + 1
{
  // C15e hp=0 → factor=1 → effective ×7
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999009});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:0});
  const r = computeStats(MOCK_FAFNIR, t[0].tr, t, 1);
  expectClose('C15e 背水乘算 hp=0 → ×7', r.stats['攻撃力'], 9900 * 7);
}
{
  // C15f hp=25 → factor=0.75 → effective (7-1)*0.75+1 = 5.5 (用户例)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999009});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:25});
  const r = computeStats(MOCK_FAFNIR, t[0].tr, t, 1);
  expectClose('C15f 背水乘算 hp=25 → ×5.5 (用户例)', r.stats['攻撃力'], 9900 * 5.5);
}
{
  // C15g hp=50 → factor=0.5 → effective (7-1)*0.5+1 = 4
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999009});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  const r = computeStats(MOCK_FAFNIR, t[0].tr, t, 1);
  expectClose('C15g 背水乘算 hp=50 → ×4', r.stats['攻撃力'], 9900 * 4);
}
{
  // C15h hp=100 → factor=0 → effective ×1 (无 buff)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999009});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  const r = computeStats(MOCK_FAFNIR, t[0].tr, t, 1);
  expectClose('C15h 背水乘算 hp=100 → ×1', r.stats['攻撃力'], 9900);
}

// ----- 破損 condition=3 (binary: HP < 50) -----
// MOCK_E: 加算 condition=3 +3000，factor=1 if hp<50 else 0
// base 攻 = 6000 * (1 - 249/249 * 60/6000) = 5940
{
  // C28 hp=49 → factor=1 → +3000
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999005});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:49});
  const r = computeStats(MOCK_E, t[0].tr, t, 1);
  expectClose('C28 破損 hp=49 (factor=1)', r.stats['攻撃力'], 5940 + 3000);
}
{
  // C29 hp=50 → factor=0 → 不触发 (严格 <50)
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999005});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  const r = computeStats(MOCK_E, t[0].tr, t, 1);
  expectClose('C29 破損 hp=50 边界 (factor=0)', r.stats['攻撃力'], 5940);
}
{
  // C30 hp=10 → factor=1 → +3000
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999005});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:10});
  const r = computeStats(MOCK_E, t[0].tr, t, 1);
  expectClose('C30 破損 hp=10 (factor=1)', r.stats['攻撃力'], 5940 + 3000);
}
{
  // C31: 跨格 source HP=10 (slot 0) 破損生效, target slot 1
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999005});  // E 破損 全体+3000
  t[1] = mkSlot({chara: 999001});  // A
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:10});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  const rA = computeStats(MOCK_A, t[1].tr, t, 2);
  expectClose('C31 source HP=10 破損 → 全体+3000', rA.stats['攻撃力'], 9900 + 3000 + 1000);
}

// ----- scope=5 名前限定 (验证 buff 实际应用) -----
{
  // C32: target 名字含子串 "レヴァンテイン" → bg 攻+1500 应用
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999006, bg: 999202});  // MOCK_NAMED_TARGET ("魔剣レヴァンテイン=TRUE") + bg scope=5 name="レヴァンテイン"
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  const r = computeStats(MOCK_NAMED_TARGET, t[0].tr, t, 1);
  // base 攻 = 8000 * (1 - 249/249 * 80/8000) = 8000 * 0.99 = 7920
  // bg scope=5 name="レヴァンテイン" 包含于 target.name "魔剣レヴァンテイン=TRUE" → +1500
  expectClose('C32 scope=5 名前匹配 → buff 应用', r.stats['攻撃力'], 7920 + 1500);
}
{
  // C33: target 名字 "別の魔剣" 不含 → buff 不应用
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999007, bg: 999202});  // MOCK_OTHER + bg scope=5 name="レヴァンテイン"
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  const r = computeStats(MOCK_OTHER, t[0].tr, t, 1);
  // base 7920, name 不匹配 → buff 不应用
  expectClose('C33 scope=5 名前不匹配 → buff 不应用', r.stats['攻撃力'], 7920);
}
{
  // C34: 跨格场景 — bg 装在 slot 0 (任意 chara), target slot 1 名字匹配
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999001, bg: 999202});  // MOCK_A + scope=5 name="レヴァンテイン" bg
  t[1] = mkSlot({chara: 999006});  // MOCK_NAMED_TARGET ("魔剣レヴァンテイン=TRUE")
  t[2] = mkSlot({chara: 999007});  // MOCK_OTHER
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1});
  t[2].tr = mkTr({state:'通常', jukudo:1, level:1});
  const rNamed = computeStats(MOCK_NAMED_TARGET, t[1].tr, t, 3);
  const rOther = computeStats(MOCK_OTHER, t[2].tr, t, 3);
  // NAMED: 7920 + bg+1500 + B(slot1?) 不存在; A 自身 scope=0 不影响别格 → 7920 + 1500 = 9420
  expectClose('C34 跨格 scope=5 名前匹配 target', rNamed.stats['攻撃力'], 7920 + 1500);
  // OTHER: 7920, name 不匹配 → 7920
  expectClose('C34 跨格 scope=5 名前不匹配 target', rOther.stats['攻撃力'], 7920);
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

// ----- 浑身 condition=1 cross-slot (factor 看 source) -----
{
  // C25: D(slot 0, hp=100) 浑身 +2000 全体, factor=1 → +2000
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[1] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  const rA = computeStats(MOCK_A, t[1].tr, t, 2);
  expectClose('C25 source HP=100 浑身全体 → +2000', rA.stats['攻撃力'], 9900 + 2000 + 1000);
}
{
  // C26: D(slot 0, hp=50) 浑身 factor=0.5 → +1000 全体
  const t = emptyTeam();
  t[0] = mkSlot({chara: 999004});
  t[1] = mkSlot({chara: 999001});
  t[0].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:50});
  t[1].tr = mkTr({state:'通常', jukudo:1, level:1, hpPercent:100});
  const rA = computeStats(MOCK_A, t[1].tr, t, 2);
  expectClose('C26 source HP=50 浑身 factor=0.5 → +1000', rA.stats['攻撃力'], 9900 + 1000 + 1000);
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

// R1-R4: 跨稀有度 单魔剣 默认 tr 计算 — 确保不崩溃且数值合理
const realCharas = allCharas.filter(c => c.id < 999000); // 排除 mock
const byRarity = {1:[],2:[],3:[],4:[]};
realCharas.forEach(c => { if(byRarity[c.rarity]) byRarity[c.rarity].push(c); });
[4,3,2,1].forEach(r => {
  const c = byRarity[r]?.[0];
  if (!c) return;
  const t = emptyTeam();
  t[0] = mkSlot({chara: c.id});
  t[0].tr = mkTr({});
  let res, crashed = false;
  try { res = computeStats(c, t[0].tr, t, 1); } catch(e) { crashed = true; }
  const lbl = `R[${{1:'A',2:'AA',3:'S',4:'SS'}[r]}] ${c.name||c.id} 默认 tr`;
  expect(lbl + ' 不崩溃', !crashed, true);
  if (!crashed && res) {
    expect(lbl + ' 攻撃力 > 0', res.stats['攻撃力'] > 0, true);
    expect(lbl + ' HP > 0', res.stats['HP'] > 0, true);
  }
});

// R5: 全数据库扫描 — 每个 chara 默认 tr 不崩溃
{
  let crashed = 0, statsOk = 0;
  const failures = [];
  for (const c of realCharas) {
    if (!c.states) continue;
    const t = emptyTeam();
    t[0] = mkSlot({chara: c.id});
    t[0].tr = mkTr({});
    try {
      const r = computeStats(c, t[0].tr, t, 1);
      if (r && r.stats['攻撃力'] >= 0 && r.stats['HP'] >= 0) statsOk++;
    } catch(e) {
      crashed++;
      if (failures.length < 3) failures.push(`${c.id}/${c.name}: ${e.message}`);
    }
  }
  expect(`R5 全 ${realCharas.length} 魔剣 默认计算 无崩溃`, crashed, 0);
  if (failures.length) console.log('  样本失败:', failures);
  expect(`R5 全 ${realCharas.length} 魔剣 默认计算 数值正常`, statsOk, realCharas.filter(c=>c.states).length);
}

// R6: SS 改造 lv 最大 stats → 攻 ≥ 改造 stats.max（含自加成可能略高）
{
  const ss = realCharas.find(c => c.rarity === 4 && c.states?.['改造']?.stats?.max?.['攻撃力']);
  if (ss) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: ss.id});
    t[0].tr = mkTr({state:'改造', jukudo:99, level:255});
    const r = computeStats(ss, t[0].tr, t, 1);
    const expATK = ss.states['改造'].stats.max['攻撃力'];
    expect(`R6 ${ss.name} 改造 lv255 攻 ≥ stats.max`, r.stats['攻撃力'] >= expATK * 0.99, true);
  }
}

// R7: 等级单调性 — lv 1 → cap 攻撃力非递减
{
  const ss = realCharas.find(c => c.rarity === 4 && c.states?.['通常']?.stats?.initial && c.states?.['通常']?.stats?.max);
  if (ss) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: ss.id});
    t[0].tr = mkTr({state:'通常', jukudo:1});
    const cap = _capLevel(ss, t[0].tr) || 60;
    let prev = -Infinity, monotonic = true;
    for (let lv = 1; lv <= cap; lv += 5) {
      t[0].tr.level = lv;
      const r = computeStats(ss, t[0].tr, t, 1);
      if (r.stats['攻撃力'] + 1e-6 < prev) { monotonic = false; break; }
      prev = r.stats['攻撃力'];
    }
    expect(`R7 ${ss.name} 攻撃力随等级非递减`, monotonic, true);
  }
}

// R8: 熟度单调性 — jk 1 → max 时 ダメ上限/攻撃力 非递减（scaling 仅会增加）
{
  const ss = realCharas.find(c => c.rarity === 4 && c.states?.['改造']);
  if (ss) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: ss.id});
    t[0].tr = mkTr({state:'改造', level:1});
    let prev = -Infinity, monotonic = true;
    const jMax = JUKUDO_MAX_TBL[ss.rarity]?.['改造'] || 99;
    for (let jk = 1; jk <= jMax; jk += 10) {
      t[0].tr.jukudo = jk;
      const r = computeStats(ss, t[0].tr, t, 1);
      if (r.stats['攻撃力'] + 1e-6 < prev) { monotonic = false; break; }
      prev = r.stats['攻撃力'];
    }
    expect(`R8 ${ss.name} 攻撃力随熟度非递减 (改造)`, monotonic, true);
  }
}

// R9-R10: 找一个有 bunrui=17 (ダメ上限) 的 chara, 验证 damageLimit > 2^31-1
{
  let found = null;
  for (const c of realCharas) {
    if (!c.states) continue;
    for (const stKey of Object.keys(c.states)) {
      const skills = c.states[stKey].skills || [];
      for (const sk of skills) {
        for (const e of sk.effects || []) {
          if ((e.bunrui||[]).includes(17)) { found = {c, stKey, sk:sk.name}; break; }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (found) break;
  }
  if (found) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: found.c.id});
    t[0].tr = mkTr({state: found.stKey, jukudo:1, level:1});
    const r = computeStats(found.c, t[0].tr, t, 1);
    expect(`R9 ${found.c.name} bunrui=17 → ダメ上限 > 2^31-1`, r.damageLimit > 2147483647, true);
  }
}

// R11-R12: 找一个有 bairitu_scaling 的 chara skill, 验证 jk 增大时 buff 增大
{
  let found = null;
  for (const c of realCharas) {
    if (!c.states) continue;
    for (const stKey of Object.keys(c.states)) {
      const skills = c.states[stKey].skills || [];
      for (const sk of skills) {
        for (const e of sk.effects || []) {
          if (e.bairitu_scaling && (e.bunrui||[]).some(b=>_BUNRUI_TO_STAT[b])) {
            found = {c, stKey, ef:e}; break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (found) break;
  }
  if (found) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: found.c.id});
    t[0].tr = mkTr({state: found.stKey, jukudo:1, level:1});
    const r1 = computeStats(found.c, t[0].tr, t, 1);
    t[0].tr.jukudo = JUKUDO_MAX_TBL[found.c.rarity]?.[found.stKey] || 50;
    const rN = computeStats(found.c, t[0].tr, t, 1);
    expect(`R11 ${found.c.name} bairitu_scaling: jk大时 buff 更强`, rN.stats['攻撃力'] >= r1.stats['攻撃力'], true);
  }
}

// R13: 找有 condition=2 (背水) 的 chara, hp=10 触发, hp=100 不触发
{
  let found = null;
  for (const c of realCharas) {
    if (!c.states) continue;
    for (const stKey of Object.keys(c.states)) {
      const skills = c.states[stKey].skills || [];
      for (const sk of skills) {
        for (const e of sk.effects || []) {
          if (e.condition === 2 && (e.bunrui||[]).some(b=>_BUNRUI_TO_STAT[b])
              && (e.scope===0 || e.scope===1) && (e.bairitu||0) > 0) {
            found = {c, stKey, ef:e}; break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (found) break;
  }
  if (found) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: found.c.id});
    t[0].tr = mkTr({state: found.stKey, jukudo:1, level:1, hpPercent:100});
    const rHi = computeStats(found.c, t[0].tr, t, 1);
    t[0].tr.hpPercent = 10;
    const rLo = computeStats(found.c, t[0].tr, t, 1);
    expect(`R13 ${found.c.name} 背水 hp=10 ≥ hp=100 (背水触发)`,
      rLo.stats['攻撃力'] + 1e-6 >= rHi.stats['攻撃力'], true);
  }
}

// R14: 全 souls 装备扫描 — 任一 chara 装备任一 soul 不崩溃
{
  const baseCh = realCharas.find(c => c.states?.['通常']);
  if (baseCh) {
    let crashed = 0;
    const failures = [];
    for (const s of allSouls.filter(s => s.id < 999000)) {
      const t = emptyTeam();
      t[0] = mkSlot({chara: baseCh.id, soul: s.id});
      try { computeStats(baseCh, t[0].tr, t, 1); }
      catch(e) {
        crashed++;
        if (failures.length < 3) failures.push(`${s.id}/${s.name}: ${e.message}`);
      }
    }
    expect(`R14 全 ${allSouls.filter(s=>s.id<999000).length} ソウル 装备 不崩溃`, crashed, 0);
    if (failures.length) console.log('  样本失败:', failures);
  }
}

// R15: 全 crystals 装备扫描
{
  const baseCh = realCharas.find(c => c.states?.['通常']);
  if (baseCh) {
    let crashed = 0;
    const failures = [];
    for (const cr of allCrystals.filter(c => c.id < 999000)) {
      const t = emptyTeam();
      t[0] = mkSlot({chara: baseCh.id, crystals:[cr.id]});
      try { computeStats(baseCh, t[0].tr, t, 1); }
      catch(e) {
        crashed++;
        if (failures.length < 3) failures.push(`${cr.id}/${cr.name}: ${e.message}`);
      }
    }
    expect(`R15 全 ${allCrystals.filter(c=>c.id<999000).length} 結晶 装备 不崩溃`, crashed, 0);
    if (failures.length) console.log('  样本失败:', failures);
  }
}

// R16: 全 bg 装备扫描
{
  const baseCh = realCharas.find(c => c.states?.['通常']);
  if (baseCh) {
    let crashed = 0;
    const failures = [];
    for (const bg of allBGs.filter(b => b.id < 999000)) {
      const t = emptyTeam();
      t[0] = mkSlot({chara: baseCh.id, bg: bg.id});
      try { computeStats(baseCh, t[0].tr, t, 1); }
      catch(e) {
        crashed++;
        if (failures.length < 3) failures.push(`${bg.id}/${bg.name}: ${e.message}`);
      }
    }
    expect(`R16 全 ${allBGs.filter(b=>b.id<999000).length} bladegraph 装备 不崩溃`, crashed, 0);
    if (failures.length) console.log('  样本失败:', failures);
  }
}

// R17: 全 omoide picks 装备扫描 — 每个 chara 各自 omoide 任意 pick 都能算
{
  let crashed = 0, totalPicks = 0;
  const failures = [];
  for (const c of realCharas) {
    if (!c.omoide || !c.omoide.length) continue;
    for (const row of c.omoide) {
      for (const iconId of (row.slots||[])) {
        const t = emptyTeam();
        t[0] = mkSlot({chara: c.id});
        t[0].tr = mkTr({affinity: row.threshold, omoide_picks:{[row.threshold]: iconId}});
        totalPicks++;
        try { computeStats(c, t[0].tr, t, 1); }
        catch(e) {
          crashed++;
          if (failures.length < 3) failures.push(`${c.id}/${c.name} thresh=${row.threshold} icon=${iconId}: ${e.message}`);
        }
      }
    }
  }
  expect(`R17 ${totalPicks} 个 omoide pick 装备 不崩溃`, crashed, 0);
  if (failures.length) console.log('  样本失败:', failures);
}

// R18: 随机三人队 fuzz — 50 组随机 chara/soul/bg/crystal 不崩溃
{
  function pickRandom(arr) {
    const real = arr.filter(x => x.id < 999000);
    return real[Math.floor(Math.random()*real.length)];
  }
  let crashed = 0;
  const failures = [];
  for (let i = 0; i < 50; i++) {
    const t = emptyTeam();
    const charas = [pickRandom(allCharas), pickRandom(allCharas), pickRandom(allCharas)];
    for (let s = 0; s < 3; s++) {
      const c = charas[s];
      if (!c.states) continue;
      const stOpts = c.rarity === 4 ? ['通常','改造'] : ['通常','改造','極弐'];
      const stKey = stOpts.find(k => c.states[k]) || '通常';
      t[s] = mkSlot({
        chara: c.id,
        soul: pickRandom(allSouls).id,
        bg: pickRandom(allBGs).id,
        crystals: [pickRandom(allCrystals).id, pickRandom(allCrystals).id, pickRandom(allCrystals).id],
      });
      t[s].tr = mkTr({
        state: stKey,
        jukudo: Math.floor(Math.random() * 30) + 1,
        level: Math.floor(Math.random() * 100) + 1,
        awakening: Math.floor(Math.random() * 5),
        marriage: Math.floor(Math.random() * 3),
        moeshin: Math.random() < 0.3,
        lp: Math.floor(Math.random() * 3),
        hpPercent: Math.floor(Math.random() * 101),
        affinity: 50000,
        omoide_picks: {},
      });
    }
    for (let s = 0; s < 3; s++) {
      try {
        const c = allCharas.find(x => x.id === t[s].chara);
        if (c) computeStats(c, t[s].tr, t, 3);
      } catch(e) {
        crashed++;
        if (failures.length < 3) failures.push(`team[${i}] slot${s}: ${e.message}`);
      }
    }
  }
  expect('R18 50 组随机三人队 fuzz 不崩溃', crashed, 0);
  if (failures.length) console.log('  样本失败:', failures);
}

// R19: scope=2/3/4/5 实数据采样 — 跨所有 entity 类型找代表样本验证不崩溃
{
  // chara skills 只有 scope 0/1/2; souls 有 0/1/3/4; crystals 有 0/1/2/3/5; bg 有 0/3/5
  const tgtChara = realCharas.find(c => c.states?.['通常']);

  function tryWithCrystal(crId) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: tgtChara.id, crystals:[crId]});
    return computeStats(tgtChara, t[0].tr, t, 1);
  }
  function tryWithSoul(soulId) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: tgtChara.id, soul: soulId});
    return computeStats(tgtChara, t[0].tr, t, 1);
  }
  function tryWithBg(bgId) {
    const t = emptyTeam();
    t[0] = mkSlot({chara: tgtChara.id, bg: bgId});
    return computeStats(tgtChara, t[0].tr, t, 1);
  }

  // scope=2 — chara skills 大量 / crystals 也有 → 用 crystal 采样
  const cr2 = allCrystals.find(c => c.id<999000 && (c.effects||[]).some(e => e.scope === 2));
  expect(`R19a scope=2 (crystal ${cr2?.name}) 不崩溃`, !!(cr2 && (()=>{try{tryWithCrystal(cr2.id);return true;}catch(e){return false;}})()), true);

  // scope=3 — souls 主要 (1257) / crystals (597) / bg (58)
  const so3 = allSouls.find(s => s.id<999000 && (s.skills||[]).some(sk => (sk.effects||[]).some(e => e.scope === 3)));
  expect(`R19b scope=3 (soul ${so3?.name}) 不崩溃`, !!(so3 && (()=>{try{tryWithSoul(so3.id);return true;}catch(e){return false;}})()), true);
  const cr3 = allCrystals.find(c => c.id<999000 && (c.effects||[]).some(e => e.scope === 3));
  expect(`R19c scope=3 (crystal ${cr3?.name}) 不崩溃`, !!(cr3 && (()=>{try{tryWithCrystal(cr3.id);return true;}catch(e){return false;}})()), true);

  // scope=4 — souls 仅有 (198)
  const so4 = allSouls.find(s => s.id<999000 && (s.skills||[]).some(sk => (sk.effects||[]).some(e => e.scope === 4)));
  expect(`R19d scope=4 (soul ${so4?.name}) 不崩溃`, !!(so4 && (()=>{try{tryWithSoul(so4.id);return true;}catch(e){return false;}})()), true);

  // scope=5 — crystals (139) / bg (129)
  const cr5 = allCrystals.find(c => c.id<999000 && (c.effects||[]).some(e => e.scope === 5));
  expect(`R19e scope=5 (crystal ${cr5?.name}) 不崩溃`, !!(cr5 && (()=>{try{tryWithCrystal(cr5.id);return true;}catch(e){return false;}})()), true);
  const bg5 = allBGs.find(b => b.id<999000 && (b.effects||[]).some(e => e.scope === 5));
  expect(`R19f scope=5 (bg ${bg5?.name}) 不崩溃`, !!(bg5 && (()=>{try{tryWithBg(bg5.id);return true;}catch(e){return false;}})()), true);
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

// 真实数据库统计 (运行时计算)
function countScopes(items, getEffectsList) {
  const r = {};
  for (const x of items) {
    if (x.id >= 999000) continue;
    for (const list of getEffectsList(x)) {
      for (const e of list || []) {
        if (e.scope != null) r[e.scope] = (r[e.scope]||0) + 1;
      }
    }
  }
  return r;
}
const charaScopes = countScopes(allCharas, c => {
  if (!c.states) return [];
  return Object.values(c.states).flatMap(st => (st.skills||[]).map(sk => sk.effects));
});
const soulScopes = countScopes(allSouls, s => (s.skills||[]).map(sk => sk.effects));
const crystalScopes = countScopes(allCrystals, c => [c.effects]);
const bgScopes = countScopes(allBGs, b => [b.effects]);

const realCharaCount = allCharas.filter(c => c.id < 999000).length;
const realSoulCount = allSouls.filter(s => s.id < 999000).length;
const realCrystalCount = allCrystals.filter(c => c.id < 999000).length;
const realBgCount = allBGs.filter(b => b.id < 999000).length;

function fmtScope(name, counts) {
  return `| ${name} | ${counts[0]||0} | ${counts[1]||0} | ${counts[2]||0} | ${counts[3]||0} | ${counts[4]||0} | ${counts[5]||0} |`;
}

const coverageMd = `

## 真实数据覆盖统计

| 数据 | 数量 | 覆盖测试 |
|---|---|---|
| 魔剣 | ${realCharaCount} | R5 全部默认计算无崩溃；R[A/AA/S/SS] 各稀有度首个采样 |
| ソウル | ${realSoulCount} | R14 全部装备不崩溃；scope=3/4 真实样本 (R19b/d) |
| 結晶 | ${realCrystalCount} | R15 全部装备不崩溃；scope=2/3/5 真实样本 (R19a/c/e) |
| bladegraph | ${realBgCount} | R16 全部装备不崩溃；scope=5 真实样本 (R19f) |

**scope 数据库分布** (真实数据扫描，scope: 0=自身/1=全体/2=全体限定/3=自身限定/4=魂全体限/5=名前限定)：

| 类型 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
${fmtScope('chara skills', charaScopes)}
${fmtScope('魂 skills', soulScopes)}
${fmtScope('結晶 effects', crystalScopes)}
${fmtScope('bg effects', bgScopes)}

**condition factor 公式** (基于 source slot 的 \`tr.hpPercent\`)：

| condition | 含义 | factor | 测试 |
|---|---|---|---|
| 0 | 无条件 | 1 | 全部默认 case |
| 1 | 浑身 | \`HP%/100\` (线性) | C13-C15 加算 + C15a-d 乘算（用户例 ×5）+ C25/C26 跨格 |
| 2 | 背水 | \`(100-HP%)/100\` (线性) | C15e-h 乘算（用户例 ×7）+ R13 (バハムート=イフ 实数据) |
| 3 | 破損 | \`HP%<50 ? 1 : 0\` (二元) | C28-C31 受控 mock + 实数据 fuzz |

**应用方式**：加算 \`effective = bairitu × factor\`；乗算 \`effective = (bairitu − 1) × factor + 1\`。

**特性回归覆盖**：
- bunrui=17 ダメ上限 → R9 凰竜剣レヴァンテイン=TRUE
- bairitu_scaling jk 增大效果 → R11 凰竜剣レヴァンテイン=TRUE
- 等级单调性 → R7
- 熟度单调性 → R8
- scope=5 名前匹配 buff 应用 → C32-C34 受控 mock 验证
- 50 组随机三人队 fuzz → R18
`;

fs.writeFileSync(path.join(TESTS_DIR, 'calculator_test_results.md'),
  '# 计算器测试结果\n\n' +
  '测试脚本: `node tests/test_calculator.js`\n\n' +
  `**通过: ${pass} / ${pass+fail}** ${fail===0?'✓':'✗'}\n\n` +
  '前 ' + (results.findIndex(r => r.label.startsWith('R')) ) + ' 项为受控 mock 验证（精确数值），其余为真实数据 sanity（含全数据库扫描和随机 fuzz）。\n\n' +
  '## 详细结果\n\n' + out + '\n' + coverageMd, 'utf8');
console.log('\n结果已写入 calculator_test_results.md');

process.exit(fail > 0 ? 1 : 0);
