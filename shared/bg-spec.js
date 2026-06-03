// shared/bg-spec.js
import { rarityOptions, elementOptions, weaponTypeOptions } from './filter-core.js';

export const bgSpec = {
  facets: [
    { key: 'rarity', label: '★',
      options: rarityOptions(),
      match: (b, sel) => sel.has(b.rarity) },
    { key: 'element', label: '属性 (限定)',
      options: elementOptions(),
      match: (b, sel) => (b.element_ids || []).some(e => sel.has(e)) },
    { key: 'weapon', label: '武器 (限定)',
      options: weaponTypeOptions(),
      match: (b, sel) => (b.weapon_type_ids || []).some(w => sel.has(w)) },
    { key: 'time', label: '時間限定',
      options: [{ id: 1, label: 'あり' }, { id: 0, label: 'なし' }],
      match: (b, sel) => {
        const has = !!(b.skill_effective_time || b.long_skill_effective_time);
        return sel.has(has ? 1 : 0);
      } },
  ],
  sorts: [
    { key: 'id', label: 'ID', getter: (b) => b.id },
    { key: 'rarity', label: '★', getter: (b) => b.rarity ?? 0 },
  ],
};
