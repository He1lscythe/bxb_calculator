// shared/soul-spec.js
import { rarityOptions } from './filter-core.js';

export const soulSpec = {
  facets: [
    { key: 'rarity', label: '★',
      options: rarityOptions(),
      match: (s, sel) => sel.has(s.rarity) },
    { key: 'partner', label: 'タイプ',
      options: [{ id: 0, label: '通常' }, { id: 1, label: 'パートナー' }],
      match: (s, sel) => sel.has(s.only_partner ? 1 : 0) },
  ],
  sorts: [
    { key: 'id', label: 'ID', getter: (s) => s.id },
    { key: 'rarity', label: '★', getter: (s) => s.rarity ?? 0 },
    { key: 'max_level', label: 'lv', getter: (s) => s.max_level ?? 0 },
  ],
};
