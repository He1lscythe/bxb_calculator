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
export const charaIconStack = ({
  variantId, name = '', elementId, weaponTypeId, marriageLevel = 0, className = 'chara-thumb',
}) => {
  const safe = String(name).replace(/"/g, '&quot;');
  const hideErr = `onerror="this.style.visibility='hidden'"`;
  const layers = [
    `<img class="ct-base" src="${charaIcon(variantId)}" alt="${safe}" ${hideErr}>`,
  ];
  if (marriageLevel) {
    layers.push(`<img class="ct-marriage" src="${marriageOverlay(marriageLevel)}" alt="" ${hideErr}>`);
  }
  if (weaponTypeId) {
    layers.push(`<img class="ct-type" src="${weaponTypeIcon(weaponTypeId)}" alt="" ${hideErr}>`);
  }
  if (elementId) {
    layers.push(`<img class="ct-element" src="${elementIcon(elementId)}" alt="" ${hideErr}>`);
  }
  return `<div class="${className}">${layers.join('')}</div>`;
};

// 通用 <img> 标签生成器、含 onerror text fallback
// 用法:
//   container.innerHTML = imgWithFallback(charaIcon(100101), name);
export const imgWithFallback = (src, alt = '') => {
  const safe = String(alt).replace(/"/g, '&quot;');
  return `<img src="${src}" alt="${safe}" onerror="this.style.display='none'" class="icon">`;
};
