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

// crystal アイコン URL 解决器：
//   cr.image 缺省 → wiki デフォルト URL
//   cr.image = "http(s)://..." / "//..." → そのまま URL
//   cr.image = repo 相対パス（"icons/crystal/foo.png"）→ pages/ から見て "../" 前缀
// crystal icon: ../icons/crystal/{id}.png — copy_images.py cascade _1 → _2 → _3 → _4 后已归一化无后缀
export const crystalImageSrc = (cr) => {
  const img = cr && cr.image;
  if (img) {
    if (/^(https?:)?\/\//i.test(img)) return img;
    return '../' + img;
  }
  return '../icons/crystal/' + ((cr && cr.id) || 0) + '.png';
};
