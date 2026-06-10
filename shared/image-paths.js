// shared/image-paths.js — master id → icons/ 相对路径
//
// 资源位置: crawl/icons/ (从 D:\bxb 拷过来、见 scripts/master_to_business/copy_images.py)
// .gitignore 排除、~150MB 不入 git
//
// 命名规则:
// - chara : icons/chara/{weapons.id 6位}.png
// - masou : icons/masou/{weapon_costumes.id 7位}.png
// - crystal: icons/crystal/{materials.id}_{1或2}.png
// - bg    : icons/bg/{pictures.id}.png
// - soul  : icons/soul/{jobs.texture_id}.png  ← 用 texture_id 不是 jobs.id
//
// browser 端不能 fs check、用 <img onerror="this.style.display='none'"> fallback text-only

const BASE = '../icons';

export const charaIcon = (variantId) => `${BASE}/chara/${variantId}.png`;
export const masouIcon = (costumeId) => `${BASE}/masou/${costumeId}.png`;
export const bgIcon = (pictureId) => `${BASE}/bg/${pictureId}.png`;
export const soulIcon = (textureId) => `${BASE}/soul/${textureId}.png`;

// crystal multi-suffix: 优先 _1、img onerror 时 fallback _2
export const crystalIcon = (materialId, suffix = 1) =>
  `${BASE}/crystal/${materialId}_${suffix}.png`;

// chara icon 叠层资源 (尺寸都跟 chara icon 100×100 配合好):
// - marriage 框 100×100 (=base)、level 1/2/3 红→粉→金渐变
// - weapon_type_42 42×42 (左上角)
// - element_list 33×33 (右上角)
export const marriageOverlay = (level = 2) => `${BASE}/_misc/marriage_${level}.png`;
export const weaponTypeIcon = (weaponTypeId) => `${BASE}/_app_icons/icon_weapon_type_42_${weaponTypeId}.png`;
export const elementIcon = (elementId) => `${BASE}/_app_icons/icon_element_list_${elementId}.png`;

// chara icon 叠层 HTML 生成器 — 4 层 z-index: base / marriage / type / element
// 用法:
//   container.innerHTML = charaIconStack({
//     variantId: c.id, name: c.name,
//     elementId: c.element, weaponTypeId: c.weapon,
//     marriageLevel: 2,  // 0 = 不叠 marriage、1/2/3 = 红/粉/金
//   });
// lazy 模式:
//   'native' (默认): `loading="lazy"`、native HTML5 lazy、适用 document-scroll 场景 (slot card 等)
//   'io': src→data-src、caller 需调 setupLazyImg(scrollRoot)、适用自定义 scroll 容器 (modal list 等)
export const charaIconStack = ({
  variantId, name = '', elementId, weaponTypeId, marriageLevel = 0, className = 'chara-thumb',
  lazy = 'native',
}) => {
  const safe = String(name).replace(/"/g, '&quot;');
  const onerr = `onerror="this.style.visibility='hidden'"`;
  const srcAttr = (s) => lazy === 'io' ? `data-src="${s}"` : `src="${s}" loading="lazy"`;
  const layers = [
    `<img class="ct-base" ${srcAttr(charaIcon(variantId))} alt="${safe}" ${onerr}>`,
  ];
  if (marriageLevel) {
    layers.push(`<img class="ct-marriage" ${srcAttr(marriageOverlay(marriageLevel))} alt="" ${onerr}>`);
  }
  if (weaponTypeId) {
    layers.push(`<img class="ct-type" ${srcAttr(weaponTypeIcon(weaponTypeId))} alt="" ${onerr}>`);
  }
  if (elementId) {
    layers.push(`<img class="ct-element" ${srcAttr(elementIcon(elementId))} alt="" ${onerr}>`);
  }
  return `<div class="${className}">${layers.join('')}</div>`;
};

// 通用 <img> 标签生成器、含 onerror text fallback
// 用法:
//   container.innerHTML = imgWithFallback(charaIcon(100101), name);
export const imgWithFallback = (src, alt = '') => {
  const safe = String(alt).replace(/"/g, '&quot;');
  return `<img src="${src}" loading="lazy" alt="${safe}" onerror="this.style.display='none'" class="icon">`;
};
