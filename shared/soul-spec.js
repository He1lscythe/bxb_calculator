// ===== Soul Spec =====
// Usage: import { SOUL_SPEC } from '../shared/soul-spec.js';

export const SOUL_SPEC = {
  searchFields: ['name', 'kana'],
  filters: {
    rarity:  { extract: s => s.rarity || 0 },
    element: { op: 'any', extract: s => s.element || [] },
    weapon:    { op: 'any', extract: s => s.weapon    || [] },
    tags:    { op: 'all', extract: s => s.tags    || [] },
  },
  sortFns: {
    id:     s => s.id     || 0,
    rarity: s => s.rarity || 0,
  },
};
