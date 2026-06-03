// shared/chara-spec.js — character viewer filter + sort spec
import { rarityOptions, elementOptions, weaponTypeOptions } from './filter-core.js';

export const charaSpec = {
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
    { key: 'state', label: '状態',
      options: [{ id: 0, label: '通常' }, { id: 1, label: '改造' }, { id: 2, label: '極弐' }],
      match: (c, sel) => Object.values(c.states || {}).some(s => sel.has(s.evolve_count)) },
    { key: 'tags', label: '特性',
      options: [
        { id: 1, label: '時止め' }, { id: 2, label: '麻痺' }, { id: 3, label: '強制BK' },
        { id: 4, label: '弱体解除' }, { id: 5, label: 'BDバフ' }, { id: 6, label: 'AOE' },
        { id: 7, label: '13倍' }, { id: 8, label: '回復' }, { id: 9, label: '復活' },
        { id: 10, label: 'BD回復' }, { id: 11, label: 'ルビー' }, { id: 12, label: 'ダメ上限' },
        { id: 13, label: 'HIT' }, { id: 14, label: 'BDHIT' },
      ],
      match: (c, sel) => (c.tags || []).some(t => sel.has(t)) },
  ],
  sorts: [
    { key: 'id', label: 'ID', getter: (c) => c.id },
    { key: 'sort_order', label: '実装順', getter: (c) => c.extras?.sort_order ?? 0 },
    { key: 'rarity', label: '★', getter: (c) => c.rarity ?? 0 },
    { key: 'max_attack', label: '攻撃力', getter: (c) => {
      const max = Math.max(...Object.values(c.states || {}).map(s => s.stats?.max_attack || 0));
      return max;
    } },
    { key: 'max_hp', label: 'HP', getter: (c) => {
      return Math.max(...Object.values(c.states || {}).map(s => s.stats?.max_hp || 0));
    } },
    { key: 'max_defense', label: '防御力', getter: (c) => {
      return Math.max(...Object.values(c.states || {}).map(s => s.stats?.max_defense || 0));
    } },
    { key: 'max_break', label: 'BK', getter: (c) => {
      return Math.max(...Object.values(c.states || {}).map(s => s.stats?.max_break || 0));
    } },
    { key: 'max_speed', label: '速度', getter: (c) => {
      return Math.max(...Object.values(c.states || {}).map(s => s.stats?.max_speed || 0));
    } },
  ],
};
