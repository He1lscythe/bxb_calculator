// ===== BG (Bladegraph) Spec =====
// Usage: import { BG_SPEC } from '../shared/bg-spec.js';

const _cardElement = c =>
  (c.effects || []).find(e => e.scope === 3 && e.element != null)?.element ?? 0;

const _cardWeapon = c =>
  (c.effects || []).find(e => e.scope === 3 && e.type != null)?.type ?? 0;

export const BG_SPEC = {
  searchFields: ['name'],
  filters: {
    rarity:  { extract: c => c.rarity },
    element: { extract: _cardElement },
    weapon:  { extract: _cardWeapon },
    bunrui: {
      match: (c, set) => [...set].some(v =>
        (c.effects || []).some(e => (e.bunrui || []).indexOf(v) >= 0)
      ),
    },
    scope: {
      match: (c, set) => [...set].some(v =>
        (c.effects || []).some(e => e.scope === v)
      ),
    },
    condition: {
      match: (c, set) => [...set].some(v =>
        (c.effects || []).some(e => e.condition === v)
      ),
    },
  },
  sortFns: {
    rarity: c => c.rarity || 0,
    id:     c => c.id     || 0,
  },
  _element: _cardElement,
  _weapon:  _cardWeapon,
};
