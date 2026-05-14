// ===== Crystal Spec =====
// Usage: import { CRYSTAL_SPEC } from '../shared/crystal-spec.js';

const _crystalElement = c =>
  (c.effects || []).find(e => (e.scope === 2 || e.scope === 3) && e.element != null)?.element ?? 0;

const _crystalWeapon = c =>
  (c.effects || []).find(e => (e.scope === 2 || e.scope === 3) && e.weapon != null)?.weapon ?? 0;

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

// crystal アイコン URL 解决器：
//   cr.image 缺省 → wiki デフォルト URL
//   cr.image = "http(s)://..." / "//..." → そのまま URL
//   cr.image = repo 相対パス（"icon/crystal/foo.png"）→ pages/ から見て "../" 前缀
// guildemblem.image / masou.image と同じ約定。
export const crystalImageSrc = (cr) => {
  const img = cr && cr.image;
  if (img) {
    if (/^(https?:)?\/\//i.test(img)) return img;
    return '../' + img;
  }
  return 'https://img.altema.jp/bxb/kioku_kessyou/icon/' + (((cr && cr.id) || 0) % 100000) + '.jpg';
};
