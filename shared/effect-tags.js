// shared/effect-tags.js — 効果 tag (分類 / scope / 発動条件) 的唯一实现
//
// 在这之前 characters / souls / crystals / bladegraphs / hensei 各有一份拷贝,
// 结果就是慢慢漂移: cond 有两套 enum、scope 有的认 weapon_base_id 有的不认、
// utils 的「限」只显示属性把武器丢了。语义集中到这里、各页只决定用什么 HTML 壳。
//
// 输入是 **wiki shape 的 effect** (adapter 输出):
//   { _parameter | _parameters[], element?, weapon?, weapon_base_id?, range? }
// master shape 的 effect (hensei 装备面板的 resolved effect) 由 caller 先搭壳、
// 见 normalizeMasterEffect()。
//
// 三层 API:
//   语义层  effectParams / effectScope / effectCondition — 只返数据、不带 HTML
//   HTML 层 paramBadgesHtml / scopeTagHtml / condTagHtml / effectTagsHtml
//          (用 bunrui-tag / scope-tag / cond-tag 这套 class、characters/souls/hensei 共用)
//   cr-list / bg-list 的行 badge 是另一套 class (badge bunrui-sm / badge scope5)、
//   走语义层自己拼 HTML。

import { ELEMENT, WEAPON } from './constants.js';
import {
  PARAMETER_CLASS_SHORT,
  COND_TRIGGER_LABEL,
  classifyParameter,
  conditionTrigger,
} from './parameter-class.js';

// effect → master parameter 数组 (BD effect 折叠了多 parameter → _parameters)
export function effectParams(eff) {
  if (!eff) return [];
  if (Array.isArray(eff._parameters)) return eff._parameters;
  return eff._parameter ? [eff._parameter] : [];
}

// id (或 id 数组) → 'A/B' 形式的 label。0 / 空 = master 里的「未设定」、当作没有限定 → null
function _joinIds(v, map) {
  if (v == null) return null;
  const ids = (Array.isArray(v) ? v : [v]).filter(Boolean);
  if (!ids.length) return null;
  return ids.map((id) => map[id] || id).join('/');
}

// 効果的适用范围。判定顺序「魔剣限定 > 属性/武器限定 > range」全页统一。
//   { kind: 'chara' | 'lim' | 'all' | 'self', label }
// 属性和武器同时存在时拼成「火·太刀」两个都出 —— 只出一个会漏掉限定条件。
export function effectScope(eff) {
  if (!eff) return { kind: 'self', label: '自' };
  if (eff.weapon_base_id) return { kind: 'chara', label: 'キャラ限' };
  const el = _joinIds(eff.element, ELEMENT);
  const wp = _joinIds(eff.weapon, WEAPON);
  if (el || wp) return { kind: 'lim', label: [el, wp].filter(Boolean).join('·') };
  if (eff.range === 'All') return { kind: 'all', label: '全' };
  return { kind: 'self', label: '自' };
}

// 発動条件。直接判 master parameter 的前缀 (conditionTrigger)、跟各 spec 的 condition_trigger
// filter 同一套 enum。id 0 (通常) 不出 tag → 返 null。
//   { id: 1..5, label } | null
export function effectCondition(eff) {
  const id = conditionTrigger(effectParams(eff)[0]);
  return id ? { id, label: COND_TRIGGER_LABEL[id] || '' } : null;
}

// 展开详情用的长格式 scope label:「火属性のみ」「太刀/大剣のみ」。cr-list / bg-list 各有一份
// 一模一样的拷贝、合到这里。属性优先 (两者都有时只出属性 —— 原实现如此、保持不变)。
export function effectScopeLongLabel(eff) {
  if (!eff) return '';
  if (eff.element) return (ELEMENT[eff.element] || '') + '属性のみ';
  if (eff.weapon != null) return (_joinIds(eff.weapon, WEAPON) || '') + 'のみ';
  return '';
}

// ---- HTML 层 (bunrui-tag / scope-tag / cond-tag) ----

export function paramBadgesHtml(eff) {
  return effectParams(eff)
    .map((p) => {
      const cls = classifyParameter(p);
      return '<span class="bunrui-tag">' + (PARAMETER_CLASS_SHORT[cls] || cls) + '</span>';
    })
    .join('');
}

const _SCOPE_CLS = { chara: 'scope-lim', lim: 'scope-lim', all: 'scope-all', self: 'scope-self' };

export function scopeTagHtml(eff) {
  const s = effectScope(eff);
  return '<span class="scope-tag ' + _SCOPE_CLS[s.kind] + '">' + s.label + '</span>';
}

export function condTagHtml(eff) {
  const c = effectCondition(eff);
  return c ? '<span class="cond-tag cond-' + c.id + '">' + c.label + '</span>' : '';
}

// 分類 + scope + 条件 (倍率各页自己另外插)
export function effectTagsHtml(eff) {
  return paramBadgesHtml(eff) + scopeTagHtml(eff) + condTagHtml(eff);
}

// hensei 装备面板拿到的是 collectEffects 解算后的 effect (master shape) → 把 scope 判定
// 需要的那几个字段搭成 wiki shape。
//   souls 用 *_condition (判装备者)、weapons/crystals 用 target_element_id /
//   weapon_type_id (判接收方) —— 语义相反,但显示上都是「限」。
export function normalizeMasterEffect(raw, parameter) {
  const r = raw || {};
  return {
    _parameter: parameter,
    range: r.range,
    element: r.target_element_id || r.element_condition || null,
    weapon: r.weapon_type_id || r.weapon_type_condition || null,
    weapon_base_id: r.weapon_base_id || null,
  };
}
