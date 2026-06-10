// IntersectionObserver-based lazy img loader、按内部 scroll 容器进度按需 fetch。
//
// 背景: HTML5 native `<img loading="lazy">` 只看 document viewport、
// 不看自定义 scroll 容器。当 list 在 overflow:auto 子元素里、整个 list
// 在 document viewport 内 → native lazy 失效、全 img 立即 fetch。
//
// 用法:
//   1. 渲染 img 用 `data-src` 不用 `src` (没 src → 浏览器不 fetch)
//        `<img data-src="../icons/soul/${id}.png" ...>`
//   2. 拿 scroll 容器 + 调 setupLazyImg(scrollRoot)
//        setupLazyImg(document.getElementById('soul-list'))
//      → 自动 observe 容器内全部 [data-src] img、屏幕外不 fetch、滚到附近时 swap src
//
// 重复调用同一 scrollRoot OK — 内部 disconnect 旧的、build 新 IO。

const _observers = new WeakMap();

export const setupLazyImg = (scrollRoot, { rootMargin = '300px' } = {}) => {
  const old = _observers.get(scrollRoot);
  if (old) old.disconnect();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target;
      const src = img.dataset.src;
      if (src) {
        img.src = src;
        img.removeAttribute('data-src');
      }
      io.unobserve(img);
    }
  }, { root: scrollRoot, rootMargin });
  _observers.set(scrollRoot, io);
  scrollRoot.querySelectorAll('img[data-src]').forEach((img) => io.observe(img));
  return io;
};
