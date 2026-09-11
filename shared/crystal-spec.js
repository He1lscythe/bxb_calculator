// ===== Crystal Spec =====
// Usage: import { CRYSTAL_SPEC } from '../shared/crystal-spec.js';

import { classifyParameter, conditionTrigger, crystalScopeTags } from './parameter-class.js';

export const CRYSTAL_SPEC = {
  searchFields: ['name'],
  filters: {
    rarity: { extract: (c) => c.rarity },
    // element / weapon 用 op:'any' + array 含 0、跟 bg 统一逻辑、选「全」(0) 命中无限定 entry
    element: { op: 'any', extract: (c) => [c.element_id || 0] },
    weapon: { op: 'any', extract: (c) => [c.weapon_type_id || 0] },
    effect: { extract: (c) => classifyParameter(c.parameter) },
    condition_trigger: { extract: (c) => conditionTrigger(c.parameter) },
    scope: { op: 'any', extract: (c) => crystalScopeTags(c) },
  },
  sortFns: {
    rarity: (c) => c.rarity || 0,
    id: (c) => c.id || 0,
  },
};

// crystal icon URL 解析器:
//   cr.image 缺省 → wiki 默认 URL
//   cr.image = "http(s)://..." / "//..." → 原样当 URL
//   cr.image = 仓库内相对路径 ("icons/crystal/foo.png") → 相对 pages/ 加 "../" 前缀
// crystal icon: ../icons/crystal/{id}.png — copy_images.py cascade _1 → _2 → _3 → _4 后已归一化无后缀
export const crystalImageSrc = (cr) => {
  const img = cr && cr.image;
  if (img) {
    if (/^(https?:)?\/\//i.test(img)) return img;
    return '../' + img;
  }
  return '../icons/crystal/' + ((cr && cr.id) || 0) + '.png';
};
