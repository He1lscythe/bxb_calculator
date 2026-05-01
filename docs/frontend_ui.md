# 前端 UI 实现细节（魔剣 / 魂 / 結晶 / 心象 / 編成）

本文档记录 viewer 页面里**容易踩坑**的样式实现，主要服务于后续 debug。重点是那些"看代码看不出来、但调试过才知道"的部分。

---

## 1. 移动端全屏 modal 模式（`#detail`）

`index.html` / `soul.html` 两边在桌面是 sidebar + 右侧 detail 双栏；移动端把 `#detail` 翻成全屏 modal 覆盖整个 viewport。

### CSS 模板（必须严格匹配）

```css
/* 桌面默认（必须放在 @media 之前） */
#detail { flex: 1; overflow-y: auto; padding: 20px 24px; }

@media (max-width: 768px) {
  #detail {
    display: none;
    position: fixed; inset: 0; z-index: 200;
    background: var(--bg);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0;
  }
  #detail.show-mob { display: block; }
  #placeholder { display: none; }
  #detail-mob-bar { display: flex; }
  #chara-detail { padding: 0 16px 14px; }   /* 内容内边距 */
}
```

### JS 触发

```js
function selectChar(id) {
  // ...
  if (window.innerWidth <= 768) {
    detail.classList.add('show-mob');
    document.body.style.overflow = 'hidden';   // 锁住背景滚动
  }
}
function closeDetailMob() {
  document.getElementById('detail').classList.remove('show-mob');
  document.body.style.overflow = '';
}
```

### ⚠ 级联顺序陷阱（已修，commit f796cb4）

**默认 `#detail` 规则必须放在 mobile `@media` 块之前**，否则即使在手机上也会被覆盖：

| 顺序错误 | 顺序正确 |
|---------|---------|
| @media 在前，默认在后 | 默认在前，@media 在后 |
| 默认 `padding: 20px 24px` 后写 → 同特异性胜出 → 手机上仍有 20/24px 内边距 → modal 看起来"周边有留白" | 默认先写，@media 后写覆盖 → 手机上 padding:0 真正生效 |

soul.html 是正确顺序，index.html 之前误把默认放在 @media 之后导致 bug。**新增任何 viewer 时务必检查这点**。

---

## 2. mob-bar 顶部阴影 trick

```css
#detail-mob-bar {
  position: sticky; top: 0; z-index: 10;
  background: var(--bg2);
  box-shadow: 0 -100vh 0 0 var(--bg2),  /* ← 关键：向上延伸 100vh */
              0 2px 8px rgba(0,0,0,.4);
}
```

第一段阴影 `0 -100vh 0 0 var(--bg2)` 把 bg2 颜色向上无限延伸，用来盖住：
- 移动浏览器 URL 栏滑入/滑出动画时的瞬时空白
- iOS Safari 下拉橡皮筋暴露的底层

**没有这条阴影**时，用户会看到 modal 顶部出现一闪的 `var(--bg)` 缝隙，体感像"modal 没占满屏"。soul/index 必须保持一致。

---

## 3. 多层 sticky 头部系统

modal 内部需要多个元素同时 sticky，从上到下依次：
1. `#detail-mob-bar` — `top: 0`（固定值）
2. `.chara-header` / `.soul-header` — `top: var(--sticky-bar-h)`
3. `.state-tabs`（仅 chara）— `top: calc(var(--sticky-bar-h) + var(--sticky-header-h))`

### CSS 变量驱动

```css
.chara-header {
  position: sticky;
  top: var(--sticky-bar-h, 0px);
  z-index: 6;
  background: var(--bg);
}
.state-tabs {
  position: sticky;
  top: calc(var(--sticky-bar-h, 0px) + var(--sticky-header-h, 100px));
  z-index: 4;
  background: var(--bg);
}
```

### JS 测量（多帧 + ResizeObserver）

```js
function _measureStickyHeights() {
  const isMob = window.innerWidth <= 768;
  const bar = document.getElementById('detail-mob-bar');
  const header = document.querySelector('#chara-detail .chara-header');
  const barH = (isMob && bar) ? bar.getBoundingClientRect().height : 0;
  const headerH = header ? header.getBoundingClientRect().height : 100;
  document.documentElement.style.setProperty('--sticky-bar-h', barH + 'px');
  document.documentElement.style.setProperty('--sticky-header-h', headerH + 'px');
  // 直接写 state-tabs.style.top 作为 backup
  const stateTabs = document.querySelector('#chara-detail .state-tabs');
  if (stateTabs) stateTabs.style.top = (barH + headerH) + 'px';
}
function setupStickyHeights() {
  // 双 rAF 保证 layout 完成
  requestAnimationFrame(() => requestAnimationFrame(_measureStickyHeights));
  setTimeout(_measureStickyHeights, 100);   // 字体/图片加载兜底
  // 进入编辑模式时高度变化 → 自动重测
  if ('ResizeObserver' in window) {
    if (_stickyResizeObserver) _stickyResizeObserver.disconnect();
    _stickyResizeObserver = new ResizeObserver(_scheduleMeasure);
    _stickyResizeObserver.observe(document.querySelector('#chara-detail .chara-header'));
  }
}
```

每次 `detail.innerHTML = ...` 之后都要调用 `setupStickyHeights()`。

### ⚠ sticky 失效的两种典型原因

1. **任何祖先有 `overflow: hidden`** → sticky 整条链断掉。`#page-wrap` / `#layout` / `#sidebar` 在桌面有 `overflow: hidden`，移动端必须 `overflow: visible`。
2. **同特异性的另一条规则覆盖了 `top`** —— 见下一节 `.edit-mode-active` 案例。

---

## 4. `.edit-mode-active` 的边界（已修，commit ac5e7db）

### 教训

`.edit-mode-active` 这个**独立类选择器**和 `.chara-header` 同特异性 (0,1,0)，源码中靠后会覆盖前者。曾经犯的错：

```css
/* ❌ 错误：.edit-mode-active 自己写 sticky */
.chara-header { position: sticky; top: var(--sticky-bar-h); z-index: 6; ... }
.edit-mode-active { ... position: sticky; top: 0; z-index: 5; ... }
/* 结果：编辑模式下 chara-header 实际粘在 top:0（被 z-index:10 mob-bar 遮住），
   state-tabs 粘在 barH+headerH，中间露出 barH 高的滚动内容（スキル構成 标题） */
```

### 正确做法

```css
/* ✅ .edit-mode-active 只负责视觉样式 */
.edit-mode-active {
  background: var(--bg2);
  border: 1px solid rgba(91,127,255,.3);
  border-bottom: 2px solid rgba(91,127,255,.4);
  border-radius: 10px 10px 0 0;
  padding: 14px;
  /* 不要写 position/top/z-index —— 由 .chara-header 统一提供 */
}
```

**通用原则**：派生 modifier class（`.x-active`、`.x-loading`）只改视觉样式（颜色/边框/padding），**不要重复写定位**，免得和基类的 sticky/positioning 起冲突。

---

## 5. chara-header CSS Grid 布局矩阵

桌面/移动 × 查看/编辑 共四种 grid 配置。统一用 `grid-template-areas` 切换，避免 DOM 重排。

| 模式 | columns | areas |
|------|---------|-------|
| 桌面 view | `1fr auto` | `"title latent" / "meta edit"` |
| 桌面 edit | `1fr auto` | `"title title" / "selects actions"` |
| 移动 view | `1fr 1fr` | `"title title" / "meta meta" / "latent edit"` |
| 移动 view（无 omoide）| `1fr` | `"title" / "meta" / "edit"` |
| 移动 edit | `1fr` | `"title" / "selects" / "actions"` |

```css
.chara-header { display: grid; grid-template-columns: 1fr auto;
  grid-template-areas: "title latent" "meta edit"; gap: 10px 8px; }
.chara-header.edit-mode-active { grid-template-areas: "title title" "selects actions"; }
@media (max-width: 768px) {
  .chara-header:not(.edit-mode-active) {
    grid-template-columns: 1fr 1fr;
    grid-template-areas: "title title" "meta meta" "latent edit";
  }
  .chara-header.edit-mode-active {
    grid-template-columns: 1fr;
    grid-template-areas: "title" "selects" "actions";
  }
}
```

**子元素只声明 `grid-area`，不在不同 media 下重复**：

```css
.chara-header .chara-title  { grid-area: title; }
.chara-header > .btn-latent { grid-area: latent; }
.chara-header > .btn-edit   { grid-area: edit; }
.chara-header > .chara-meta { grid-area: meta; }
.chara-header.edit-mode-active .chara-edit-meta { grid-area: selects; }
.chara-header.edit-mode-active .edit-actions    { grid-area: actions; }
```

### 按钮文案桌面/移动差异

`潜在開放`（桌面）↔ `潜在`（移动）通过两个 span + CSS show/hide：

```html
<button class="btn-latent">
  <span class="btn-text-desk">潜在開放</span>
  <span class="btn-text-mob">潜在</span>
</button>
```
```css
.btn-text-desk { display: inline; }
.btn-text-mob  { display: none; }
@media (max-width: 768px) {
  .btn-text-desk { display: none; }
  .btn-text-mob  { display: inline; }
}
```

⚠ 默认规则必须在 @media **之前**（同 §1 陷阱）。

---

## 6. modal 内容 DOM 顺序（chara）

`renderDetail` / `renderEditDetail` 必须按以下顺序输出，**state-tabs 必须紧跟 chara-header**，sticky 才能保持紧贴：

```js
return `
  <div class="chara-header">...</div>
  <div class="state-tabs">${tabs}</div>
  ${bdSection}    // ← 放在 state-tabs 之后
  ${contents}     // state-content（含 スキル構成）
`;
```

### ⚠ 错误顺序后果

把 `bdSection` 插到 chara-header 和 state-tabs 之间，sticky 计算偏差时 bdSection 内容会从夹缝中露出。即便 sticky 计算正确，DOM 上让 state-tabs 紧跟 chara-header 也是更稳的兜底。

---

## 7. modal 上下页导航

```js
function navChara(dir) {
  if (filteredChars.length === 0) return;
  const idx = filteredChars.findIndex(c => c.id === selectedId);
  const base = idx < 0 ? 0 : idx;
  const newIdx = ((base + dir) % filteredChars.length + filteredChars.length) % filteredChars.length;
  selectChar(filteredChars[newIdx].id);
}
```

- 永远基于**当前过滤后**的 `filteredChars`，不是 `allChars`
- 双取模 `((x % n) + n) % n` 保证 `dir = -1` 时 idx=0 能 wrap 到末尾
- mob-bar 显示 `${idx+1} / ${filteredChars.length}`

---

## 8. 移动端 tap 响应优化

```css
@media (max-width: 768px) {
  button, [onclick], .ftog, .picker-btn, .char-item,
  .crystal-row-hd, .bg-row-hd, .soul-item {
    touch-action: manipulation;
  }
}
```

`touch-action: manipulation` 关闭浏览器在双击缩放上的 300ms 等待，让 tap 立即触发。Android Chrome 上效果尤其明显。

mob-bar 的导航按钮额外加 `user-select: none; -webkit-touch-callout: none;` 防长按弹出复制菜单。

---

## 9. z-index 栈速查

| 层 | z-index | 备注 |
|---|---------|------|
| `#prompt-modal` | 2000 | 二次确认弹窗 |
| `#latent-modal` | 1000 | 潜在能力弹窗 |
| `#topbar`（nav.js） | 100 | 桌面顶栏 |
| `#nav-hamburger` 展开后的 `#page-nav` | 99 | 移动端菜单 |
| `#filters`（mobile sticky）| 50 | 必须低于 hamburger 否则盖住菜单 |
| **modal `#detail`** | **200** | 全屏 |
| `#detail-mob-bar` | 10 | modal 内顶栏 |
| `.chara-header`（sticky）| 6 | modal 内 |
| `.state-tabs`（sticky）| 4 | modal 内 |

**改 z-index 之前一定查这张表**，特别是 hamburger 和 filter 的相对关系（之前出过 filter 盖住菜单的 bug）。

---

## 10. 筛选面板（mobile 折叠）

桌面: filter 面板常驻 sidebar。移动: 折叠成 `絞り込み` 按钮，点击展开 `#filters-body`。

```html
<div id="filters">
  <div class="search-row">
    <input id="search">
    <span id="char-count-mob"></span>   <!-- 移动端搜索框旁的计数 -->
  </div>
  <div class="actions-row">
    <button class="filter-toggle-btn">▼ 絞り込み</button>
    <select id="f-sort">...</select>
    <button id="sort-dir">↓</button>
    <button class="btn-reset-filters">リセット</button>
  </div>
  <div id="filters-body">...</div>
  <div id="char-count"></div>           <!-- 桌面端计数 -->
</div>
```

```css
/* 桌面 */
.filter-toggle-btn { display: none; }
#filters-body { display: flex; flex-direction: column; gap: 8px; }
#char-count-mob { display: none; }

@media (max-width: 768px) {
  .filter-toggle-btn { display: block; }
  #filters-body { display: none; }     /* 默认折叠，JS toggleFilters 切 display */
  #char-count-mob { display: block; }
  #char-count { display: none; }
  #filters {
    position: sticky;
    top: 52px;                          /* 留给 #topbar */
    z-index: 50;
    background: var(--bg2);
  }
}
```

「自动收起」逻辑：用户在面板展开后向下滚 30px+ 自动 toggle 收起（避免误判 click 时立刻收起）。

---

## 11. 数值显示约定

- 倍率：`×1.25` / `×3` / `+5%`
- 数値（攻撃力等）：`toLocaleString('ja-JP')` 加千分位
- ダメージ上限 / 大数値：`万` / `億` 单位（crystals/bladegraph 的 `fmt()`）

```js
function fmt(n) {
  if (n == null) return '-';
  if (typeof n === 'number') {
    var a = Math.abs(n);
    if (a >= 100000000) return (Math.round(n / 100000000 * 10) / 10) + '億';
    if (a >= 10000)     return (Math.round(n / 10000 * 10) / 10) + '万';
    return n.toLocaleString('ja-JP');
  }
  return String(n);
}
```

---

## 12. 编辑模式刷新流程

进入编辑：
```
enterEditMode(id)
  └─ editData = deepcopy(allChars[id])
  └─ detail.innerHTML = renderEditDetail(editData)
  └─ setupStickyHeights()    // 高度变化必须重测
```

保存：见 `structure.md` 「前端 Save 机制」章节，diff 拆 `OMOIDE_KEYS` → `reviseData` / `omoideReviseData`。

取消：直接 `detail.innerHTML = renderDetail(allChars[id])` 回滚（`allChars` 始终是 base+revise 叠加后的当前态，editData 的修改没 commit 不影响它）。

---

## 13. 调试 checklist（modal 显示异常时）

按这个顺序查：

1. **modal 大小不对** → `#detail` 的 `padding: 0` 是否被晚于 @media 的默认规则覆盖？(§1 陷阱)
2. **顶部一闪缝隙** → mob-bar 是否有 `0 -100vh 0 0 var(--bg2)` 阴影？(§2)
3. **sticky 元素不粘** → 任何祖先 `overflow: hidden`？(§3)
4. **sticky 元素位置错** → `--sticky-bar-h` / `--sticky-header-h` 测量了吗？开 DevTools 看 CSS 变量值。
5. **sticky 元素中间露内容** → `.edit-mode-active` 之类的派生类有没有重写 `top` ？(§4)
6. **chara-header 布局错位** → grid-template-areas 是不是只在某个 media 下定义？(§5)
7. **state-tabs 不紧贴** → DOM 里 state-tabs 是否紧跟 chara-header？(§6)
8. **tap 慢** → `touch-action: manipulation` 是否覆盖到了？(§8)
9. **z-index 错** → 查 §9 表。

---

## 14. 与 soul.html / crystals.html / bladegraph.html 的一致性

`soul.html` 的 modal 模式是 index.html 的参考实现，两边样式必须保持一致。如果 index 出现 soul 没有的视觉问题，**diff 两边的相关 CSS 是最快的定位手段**：

```bash
diff <(grep "#detail-mob-bar" pages/soul.html) \
     <(grep "#detail-mob-bar" pages/index.html)
```

`crystals.html` / `bladegraph.html` 没有移动端全屏 modal（数据展现是 row-list 形式），但 `#topbar` sticky 和 `#filters` sticky 的逻辑相同，调位置时同样按 §9 z-index 表来。
