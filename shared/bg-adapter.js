// master bladegraphs.json → wiki bladegraphs.json shape
// 让 main js/bg-list.js / shared/bg-spec.js / js/utils.js 1:1 跑起来。
//
// master bg.skills[] 多 skill → wiki effects[] 平铺一组 (wiki bg 不分 skill、只一组 effects)

import {
  paramToBunruiAndCondition,
  injectHitStages,
  MATH_TYPE_TO_CALC,
} from './chara-adapter.js';
import { deepApply } from './revise-core.js';

function _bgSkillToEffect(sk) {
  if (sk.parameter === 'NoEffect') return null;
  const { bunrui, condition } = paramToBunruiAndCondition(sk.parameter);
  const calc_type = MATH_TYPE_TO_CALC[sk.math_type];
  if (calc_type == null) return null;
  const eff = {
    bunrui: [bunrui],
    range: sk.range,                           // master 原生 'All' / 'Single' / 'None' 透传
    condition,
    bairitu: sk.value,
    bairitu_scaling: sk.value_scaling || 0,
    calc_type,
    _parameter: sk.parameter,                  // bg-list renderEffLine 用 PARAMETER_CLASS_LABEL
  };
  if (sk.element_id) eff.element = sk.element_id;
  if (sk.weapon_type_id) eff.weapon = sk.weapon_type_id;
  if (bunrui === 7) injectHitStages(eff, sk);
  return eff;
}

export function bgToWiki(b) {
  const effects = (b.skills || []).map(_bgSkillToEffect).filter(Boolean);
  // effect_text: 汇总各 skill description (wiki bg 一句话、master 多 skill 拼接)
  const effect_text = (b.skills || [])
    .map(sk => sk.description)
    .filter(Boolean)
    .join(' / ');
  return {
    _master: b,                                   // 原 master entry (hensei stats-calc 用)
    id: b.id,
    sort_id: b.id,
    name: b.name,
    rarity: b.rarity,
    acquisition: b.acquisition || '',             // wiki fetch_wiki_acquisition.py 注入
    illustrator: b.author_name || '',
    effect_text,
    effects,
    description: b.description,                   // 保留 flavor text (UI 可能不显示)
    skill_effective_time: b.skill_effective_time || '',
    long_skill_effective_time: b.long_skill_effective_time || '',
    // master 原 skills (给 filter 用、效果分类/条件発動/対象 都要遍历 skills)
    _skills: b.skills || [],
    // build_bg_aux.py 注入的派生字段 (走 bg_revise.json deepApply)
    chara_base_id: b.chara_base_id || null,
  };
}

export function adaptBgList(arr, revise = []) {
  if (!Array.isArray(arr)) return [];
  const reviseById = new Map();
  for (const r of (revise || [])) {
    if (r && r.id != null) reviseById.set(r.id, r);
  }
  const merged = arr.map((b) => {
    const patch = reviseById.get(b.id);
    if (!patch) return b;
    const cloned = JSON.parse(JSON.stringify(b));
    deepApply(cloned, patch);
    return cloned;
  });
  return merged.map(bgToWiki);
}
