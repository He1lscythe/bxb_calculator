// v2 crystals.json → wiki crystals.json shape
// 让 main js/cr-list.js / shared/crystal-spec.js / js/utils.js 1:1 跑起来。
//
// v2 crystal 平铺单 effect 字段 → wiki effects[] 包成数组 (一个 crystal 一般一个 effect)
//
// Phase 7 Session 1: master crystals.json 不再含 max_value、改读 data/crystal_revise.json 补
// adaptCrystalList(arr, revise = []) 内 deepApply 把 revise patch 合到 master、再转 wiki shape

import {
  paramToBunruiAndCondition,
  injectHitStages,
  MATH_TYPE_TO_CALC,
} from './chara-adapter.js';
import { deepApply } from './revise-core.js';
import { crystalMaxBairitu } from './hensei-helpers.js';

function _v2CrystalToWikiEffect(c) {
  const { bunrui, condition } = paramToBunruiAndCondition(c.parameter);
  const calc_type = MATH_TYPE_TO_CALC[c.math_type];
  if (calc_type == null) return null;
  // scope: element/weapon 限定 → 2; 否则 0 (自身/制限なし)
  // crystal 没 range 字段、按 element_id / weapon_type_id 决定
  let scope = 0;
  const eff = {
    bunrui: [bunrui],
    scope,
    condition,
    bairitu: crystalMaxBairitu(c),                 // 三因子任一非 null → initial × Π；否则 master.max_value
    bairitu_init: c.initial_value,                 // 初期値 (master 直读)
    bairitu_scaling: 0,
    calc_type,
    _parameter: c.parameter,                    // v2 原 parameter (cr-list renderEffLine 用)
  };
  if (c.element_id) {
    eff.element = c.element_id;
    eff.scope = 2;
  }
  if (c.weapon_type_id) {
    eff.weapon = c.weapon_type_id;
    eff.scope = 2;
  }
  // HitCount 注入 stage 字段
  if (bunrui === 7) injectHitStages(eff, c);
  return eff;
}

export function v2CrystalToWiki(c) {
  // NoEffect 不过滤 (用户决策、归到「その他」类)、但生成 placeholder effect 避免 render 报空
  const eff = c.parameter === 'NoEffect' ? null : _v2CrystalToWikiEffect(c);
  return {
    _master: c,                            // 原 master entry (hensei stats-calc 用)
    id: c.id,
    sort_id: c.id,
    name: c.name,
    rarity: c.rarity,
    max_level: c.max_level,
    description: c.description,
    '入手方法': c['入手方法'] || '',           // wiki fetch_wiki_acquisition.py 注入
    effects: eff ? [eff] : [],
    // master 原字段 (给 filter 用)
    parameter: c.parameter,
    math_type: c.math_type,
    element_id: c.element_id || 0,
    weapon_type_id: c.weapon_type_id || 0,
    conditional_parameter: c.conditional_parameter || false,
  };
}

export function adaptCrystalList(arr, revise = []) {
  if (!Array.isArray(arr)) return [];
  // 先 deepApply revise patch 到每个 master entry (复制后 in-place 修改、不污染原 fetch 数据)
  const reviseById = new Map();
  for (const r of (revise || [])) {
    if (r && r.id != null) reviseById.set(r.id, r);
  }
  const merged = arr.map((c) => {
    const patch = reviseById.get(c.id);
    if (!patch) return c;
    const cloned = JSON.parse(JSON.stringify(c));
    deepApply(cloned, patch);
    return cloned;
  });
  return merged.map(v2CrystalToWiki);
}
