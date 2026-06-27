// souls.json (master_tables schema) → wiki souls.json shape
// 让 js/soul-render.js / js/utils.js / shared/soul-spec.js 直接消费。
//
// 复用 chara-adapter 的:
//   paramToBunruiAndCondition / MATH_TYPE_TO_CALC / injectHitStages

import {
  paramToBunruiAndCondition,
  injectHitStages,
  MATH_TYPE_TO_CALC,
} from './chara-adapter.js';
import { deepApply } from './revise-core.js';
import { ELEMENT, WEAPON } from './constants.js';

// master rank (int -4..5) → wiki level (-2..2、5 档)
// 看 master data: rank -4=d / -3=dplus / -2=cplus / -1=c / 0=b / 1=bplus / 2=a / 3=aplus / 4=s / 5=splus
function rankToWikiLevel(rank) {
  if (rank == null) return 0;
  if (rank <= -3) return -2;       // d / dplus → 超苦手
  if (rank <= -1) return -1;       // c / cplus → 苦手
  if (rank === 0) return 0;        // b → 普通
  if (rank <= 2) return 1;         // bplus / a → 得意
  return 2;                        // aplus / s / splus / ss → 超得意
}

// master affinity ({"1": {positive_value, negative_value, rank, ...}, ...})
// → { affinity: wiki shape, ids: 得意 id array (level>=1、给 filter 用) }
function _elementAffinityToWiki(aff) {
  const out = {};
  const ids = [];
  if (!aff) return { affinity: out, ids };
  for (const [k, v] of Object.entries(aff)) {
    const elemId = +k;
    const elemName = ELEMENT[elemId];
    if (!elemName) continue;
    const level = rankToWikiLevel(v.rank);
    out[elemName] = {
      level,
      atk_effect: v.positive_value ?? 1,
      def_effect: v.negative_value ?? 1,
    };
    if (level >= 1) ids.push(elemId);
  }
  return { affinity: out, ids };
}

function _weaponAffinityToWiki(aff) {
  const out = {};
  const ids = [];
  if (!aff) return { affinity: out, ids };
  for (const [k, v] of Object.entries(aff)) {
    const wpnId = +k;
    const wpnName = WEAPON[wpnId];
    if (!wpnName) continue;
    const level = rankToWikiLevel(v.rank);
    out[wpnName] = {
      level,
      atk_effect: v.positive_value ?? 1,
      def_effect: v.negative_value ?? 1,
    };
    if (level >= 1) ids.push(wpnId);
  }
  return { affinity: out, ids };
}

// master soul skill → wiki skill (含 effects[])。返回 null 表示该 skill 跳过。
function _soulSkillToWiki(sk) {
  if (sk.parameter === 'NoEffect') return null;
  const { bunrui, condition } = paramToBunruiAndCondition(sk.parameter);
  const calc_type = MATH_TYPE_TO_CALC[sk.math_type];
  if (calc_type == null) return null;
  const eff = {
    bunrui: [bunrui],
    range: sk.range,             // master 原 'All' / 'Single' / 'None' 透传
    condition,
    bairitu: sk.value,
    bairitu_scaling: sk.value_scaling || 0,
    calc_type,
    _parameter: sk.parameter,   // soul renderRightTags 用 PARAMETER_CLASS_SHORT 反查
  };
  // HitCount (bunrui=7) — 注入 stage 分段字段 (soul 可能 values=[a,b,c] 只给特定段加)
  if (bunrui === 7) injectHitStages(eff, sk);
  // 元素 / 武器 / chara 限定 — 透传 master 字段、不再用 scope 编码
  if (sk.element_condition) eff.element = sk.element_condition;
  if (sk.weapon_type_condition) eff.weapon = sk.weapon_type_condition;
  if (sk.weapon_base_id) eff.weapon_base_id = sk.weapon_base_id;
  return {
    name: sk.name || '',
    effect_text: sk.description || '',
    effects: [eff],
    _displayable: sk.displayable !== false,  // 用户决策: displayable=false 时 UI 50% 透明
  };
}

export function soulToWiki(s) {
  // 屏蔽 6 位 id soul (placeholder 无技能、~42 个、其中 1 个有 skills 接受丢失)
  if (s.id != null && s.id >= 100000) return null;
  const skills = (s.skills || []).map(_soulSkillToWiki).filter(Boolean);
  // wikiId = texture_id (跟 icons/soul/{texture_id}.png 文件名对齐)、fallback s.id
  const wikiId = s.texture_id ?? s.id;
  const elemAff = _elementAffinityToWiki(s.element_affinity);
  const wpnAff = _weaponAffinityToWiki(s.weapon_affinity);
  return {
    _master: s,                                   // 原 master entry (hensei stats-calc 用)
    id: wikiId,
    sort_id: s.sort_order ?? wikiId,
    master_id: s.id,                              // master jobs.id (hensei link 等)
    name: s.name,
    rarity: s.rarity,
    max_level: s.max_level,
    image: null,                                  // soul-render 走 ../icons/soul/{id}.png
    url: null,
    tags: Array.isArray(s.tags) ? s.tags : [],    // tags 走 soul_revise.json (deepApply 注入)
    acquisition: {},                              // master 没"入手場所"字段
    element: elemAff.ids,                         // SOUL_SPEC.filters.element 用、得意属性 id 数组 (level>=1)
    weapon: wpnAff.ids,                           // SOUL_SPEC.filters.weapon 用、得意武器 id 数组
    element_affinity: elemAff.affinity,
    weapon_affinity: wpnAff.affinity,
    skills,
  };
}

// 加 revise 参数、deepApply patch 合到 master 再转 wiki shape
export function adaptSoulList(arr, revise = []) {
  if (!Array.isArray(arr)) return [];
  const reviseById = new Map();
  for (const r of (revise || [])) {
    if (r && r.id != null) reviseById.set(r.id, r);
  }
  const merged = arr.map((s) => {
    const patch = reviseById.get(s.id);
    if (!patch) return s;
    const cloned = JSON.parse(JSON.stringify(s));
    deepApply(cloned, patch);
    return cloned;
  });
  return merged.map(soulToWiki).filter(Boolean);
}
