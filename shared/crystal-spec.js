// shared/crystal-spec.js
import { rarityOptions, elementOptions, weaponTypeOptions } from './filter-core.js';

export const crystalSpec = {
  facets: [
    { key: 'rarity', label: '★',
      options: rarityOptions(),
      match: (c, sel) => sel.has(c.rarity) },
    { key: 'element', label: '属性',
      options: elementOptions(),
      match: (c, sel) => sel.has(c.element_id) },
    { key: 'weapon', label: '武器',
      options: weaponTypeOptions(),
      match: (c, sel) => sel.has(c.weapon_type_id) },
    { key: 'parameter', label: '効果',
      options: [
        { id: 'Attack', label: '攻撃力' }, { id: 'Defense', label: '防御' }, { id: 'HP', label: 'HP' },
        { id: 'Speed', label: '速度' }, { id: 'MotionSpeed', label: '攻速' },
        { id: 'GuardBreak', label: 'BK' }, { id: 'BlazeAttack', label: 'BD攻撃' },
        { id: 'DamageLimitBreak', label: 'ダメ上限' },
      ],
      match: (c, sel) => sel.has(c.parameter) },
  ],
  sorts: [
    { key: 'id', label: 'ID', getter: (c) => c.id },
    { key: 'rarity', label: '★', getter: (c) => c.rarity ?? 0 },
    { key: 'max_value', label: '最大倍率', getter: (c) => c.max_value ?? 0 },
    { key: 'initial_value', label: '初期倍率', getter: (c) => c.initial_value ?? 0 },
  ],
};
