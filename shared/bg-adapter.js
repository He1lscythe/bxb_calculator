// v2 bladegraphs.json → wiki bladegraphs.json shape
// 让 main js/bg-list.js / shared/bg-spec.js / js/utils.js 1:1 跑起来。
//
// v2 bg.skills[] 多 skill → wiki effects[] 平铺一组 (wiki bg 不分 skill、只一组 effects)

import {
  paramToBunruiAndCondition,
  injectHitStages,
  MATH_TYPE_TO_CALC,
  RANGE_TO_SCOPE,
} from './chara-adapter.js';

function _v2BgSkillToEffect(sk) {
  if (sk.parameter === 'NoEffect') return null;
  const { bunrui, condition } = paramToBunruiAndCondition(sk.parameter);
  const calc_type = MATH_TYPE_TO_CALC[sk.math_type];
  if (calc_type == null) return null;
  // bg scope wiki: 0 自身 / 1 全体 / 3 装備属性·自身 (主要)
  // v2 range All/Single + element_id/weapon_type_id 决定
  let scope;
  if (sk.element_id || sk.weapon_type_id) {
    scope = sk.range === 'All' ? 2 : 3;            // 限定 — 全体 or 自身
  } else {
    scope = sk.range === 'All' ? 1 : 0;             // 无限定
  }
  const eff = {
    bunrui: [bunrui],
    scope,
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

export function v2BgToWiki(b) {
  const effects = (b.skills || []).map(_v2BgSkillToEffect).filter(Boolean);
  // effect_text: 汇总各 skill description (wiki bg 一句话、v2 多 skill 拼接)
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
  };
}

export function adaptBgList(arr) {
  return (arr || []).map(v2BgToWiki);
}
