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

// 通用 <img> 标签生成器、含 onerror text fallback
// 用法:
//   container.innerHTML = imgWithFallback(charaIcon(100101), name);
export const imgWithFallback = (src, alt = '') => {
  const safe = String(alt).replace(/"/g, '&quot;');
  return `<img src="${src}" alt="${safe}" onerror="this.style.display='none'" class="icon">`;
};
