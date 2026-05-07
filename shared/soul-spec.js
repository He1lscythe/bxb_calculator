// ===== Soul Spec =====
// Usage: import { SOUL_SPEC } from '../shared/soul-spec.js';

export const SOUL_SPEC = {
  searchFields: ['name', 'kana'],
  filters: {
    rarity:  { extract: s => s.rarity || 0 },
    element: { op: 'any', extract: s => s.element || [] },
    type:    { op: 'any', extract: s => s.type    || [] },
  },
  sortFns: {
    id:     s => s.id     || 0,
    rarity: s => s.rarity || 0,
  },
};
