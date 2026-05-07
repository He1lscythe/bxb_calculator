// ===== Crystal Spec =====
// Usage: import { CRYSTAL_SPEC } from '../shared/crystal-spec.js';

const _crystalElement = c =>
  (c.effects || []).find(e => (e.scope === 2 || e.scope === 3) && e.element != null)?.element ?? 0;

const _crystalWeapon = c =>
  (c.effects || []).find(e => (e.scope === 2 || e.scope === 3) && e.type != null)?.type ?? 0;

const _crystalScope = c =>
  ((c.effects || [])[0] || {}).scope || 0;

export const CRYSTAL_SPEC = {
  searchFields: ['name'],
  filters: {
    rarity:    { extract: c => c.rarity },
    element:   { extract: _crystalElement },
    weapon:    { extract: _crystalWeapon },
    scope:     { extract: _crystalScope },
    bunrui: {
      match: (c, set) => [...set].some(v =>
        (c.effects || []).some(e => (e.bunrui || []).indexOf(v) >= 0)
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
  _element: _crystalElement,
  _weapon:  _crystalWeapon,
  _scope:   _crystalScope,
};
