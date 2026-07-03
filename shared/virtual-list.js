// shared/virtual-list.js — 简单 virtual scrolling
//
// 只 render viewport ±buffer 内的 row、屏幕外 row 不在 DOM (img 也不 fetch)。
// 设计目标: crystal/bg viewer expand all 2063+506 行不卡。
//
// 不依赖框架、原生 DOM API。row 高度动态测量 + cache。
//
// 用法:
//   const vl = new VirtualList({
//     container,                     // <div id="crystal-list">
//     items,                         // [crystal, ...]
//     getRowId: (c) => c.id,
//     renderRow: (c) => '<div class="crystal-row" id="row-' + c.id + '">...</div>',
//     estimateHeight: (c) => state.expandedIds.has(c.id) ? 420 : 48,
//     bufferPx: 600,                 // viewport 上下各预渲染 ±600px
//   });
//
//   vl.setItems(filtered);           // filter / sort 变化时
//   vl.invalidateRow(id);            // 单 row 高度变了 (expand/collapse/edit)
//   vl.refresh();                    // 强制重 render visible (内容变但高度不变)
//   vl.destroy();                    // teardown

export class VirtualList {
  constructor({ container, items, getRowId, renderRow, estimateHeight, bufferPx = 600, gap = 0, onMeasure = null }) {
    this.container = container;
    this.items = items || [];
    this.getRowId = getRowId;
    this.renderRow = renderRow;
    this.estimateHeight = estimateHeight;
    this.bufferPx = bufferPx;
    this.gap = gap;
    this.onMeasure = onMeasure;   // (item, realHeight) — 外部可用来更新 kind-wise estimate

    this.heights = new Map();           // id → 测量过的真实 height
    this.layout = [];                   // [{id, top, height, item}] 按 items 顺序
    this.totalHeight = 0;
    this.visibleNodes = new Map();      // id → DOM element (在 container 内 absolute positioned)

    // container 可能是 flex item (flex: 1)、style.height 会被 flex 父 override
    // → 在 container 内放 inner wrapper、wrapper 撑 totalHeight、scrollHeight 正确
    this.container.innerHTML = '';
    this.inner = document.createElement('div');
    this.inner.style.position = 'relative';
    this.inner.style.width = '100%';
    this.container.appendChild(this.inner);

    // 必须先撑高 inner、container.scrollHeight 才反映实际内容；
    // 否则空 inner 时 scrollHeight ≈ clientHeight、_findScrollParent 的 `scrollHeight > clientHeight`
    // 判定失败、错误 fallback 到 window、PC 上 #bg-list (flex:1 overflow:auto) 的 scroll 事件接不到、_render 不重跑、只显示顶部几行
    this._computeLayout();
    this.inner.style.height = `${this.totalHeight}px`;

    // 找 scroll 父元素 (默认 window、若 container.parentElement overflow:auto 则用它)
    this._scrollEl = _findScrollParent(this.container);

    this._scheduled = false;
    this._scrollHandler = () => this._schedule();
    this._resizeHandler = () => this._onResize();
    this._scrollEl.addEventListener('scroll', this._scrollHandler, { passive: true });
    window.addEventListener('resize', this._resizeHandler, { passive: true });

    // ResizeObserver 兜底: row mount 后尺寸再变 (img async load 撑高 / 字体加载 / scrollbar 宽度变化
    // 导致 text re-wrap) 时重测。_render 的同步 measure 只反映 append 那一刻、之后的变化全靠这里。
    this._roScheduled = false;
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const node = entry.target;
        const id = node._vlistId;
        if (id == null || this.visibleNodes.get(id) !== node) continue;
        const real = node.offsetHeight;
        if (real > 0 && real !== this.heights.get(id)) {
          this.heights.set(id, real);
          const item = this.items.find((x) => this.getRowId(x) === id);
          if (item) this.onMeasure?.(item, real);
          changed = true;
        }
      }
      if (changed && !this._roScheduled) {
        this._roScheduled = true;
        requestAnimationFrame(() => {
          this._roScheduled = false;
          this._relayout();
        });
      }
    }) : null;

    this._render();
  }

  setItems(items) {
    this.items = items || [];
    // 高度缓存按 id、但行高依赖渲染 kind (collapsed / expanded / edit)。
    // expandAll / collapseAll / applyFilters 改 kind 但不走 invalidateRow → 旧 kind 高度残留、
    // totalHeight 失真 (虚高→底部空白 / 虚低→底部被截)。setItems = item/上下文变了、清掉重测。
    this.heights.clear();
    // visible nodes 可能 stale (内容要重新 render)、清掉、_render 会重新 build + 测量
    for (const node of this.visibleNodes.values()) this._removeNode(node);
    this.visibleNodes.clear();
    this._relayout();
  }

  // 单 row 高度变化 (expand/collapse/edit/saveEdit) — 重测 + 重排后续 top
  invalidateRow(id) {
    this.heights.delete(id);
    // 立即重 render 该 row (若 visible) + 测量 + 重排
    const node = this.visibleNodes.get(id);
    if (node) {
      const item = this.items.find((x) => this.getRowId(x) === id);
      if (item) {
        const newNode = this._buildNode(item, parseInt(node.style.top, 10) || 0);
        this._ro?.unobserve(node);
        node.replaceWith(newNode);
        this.visibleNodes.set(id, newNode);
        // 测量真实高
        requestAnimationFrame(() => {
          const real = newNode.offsetHeight;
          if (real > 0) this.heights.set(id, real);
          this._relayout();
        });
        return;
      }
    }
    // 不 visible: 只清 cache、下次进 viewport 重测、相当于估算高度先用
    this._relayout();
  }

  // 内容变但高度不变 (例如 filter UI tag toggle on row hd)
  refresh() {
    this._render();
  }

  destroy() {
    this._scrollEl.removeEventListener('scroll', this._scrollHandler);
    window.removeEventListener('resize', this._resizeHandler);
    this._ro?.disconnect();
    for (const node of this.visibleNodes.values()) node.remove();
    this.visibleNodes.clear();
  }

  // ─────── 内部 ───────

  _computeLayout() {
    // 重算 layout (id, top, height) + totalHeight、含 gap 之间间隙
    let y = 0;
    this.layout = this.items.map((item, i) => {
      const id = this.getRowId(item);
      const h = this.heights.get(id) ?? this.estimateHeight(item);
      const entry = { id, top: y, height: h, item };
      y += h + (i < this.items.length - 1 ? this.gap : 0);
      return entry;
    });
    this.totalHeight = y;
  }

  _relayout() {
    this._computeLayout();
    this.inner.style.height = `${this.totalHeight}px`;
    // 内容高度变化会改变滚动归属:构造时内容比容器短 (scrollHeight==clientHeight、如"搜到 1 条"
    // 时销毁重建) → _findScrollParent 误回退 window、之后 setItems 变长列表滚动接不到事件 →
    // 只剩初始那窗行、下面空白。每次 relayout (inner 高度已更新) 重探测一次、变了就迁移监听。
    this._rebindScroll();
    // 已 mount 的 node、top 可能变化、同步更新
    for (const e of this.layout) {
      const node = this.visibleNodes.get(e.id);
      if (node) node.style.top = `${e.top}px`;
    }
    this._render();
  }

  _rebindScroll() {
    const el = _findScrollParent(this.container);
    if (el !== this._scrollEl) {
      this._scrollEl.removeEventListener('scroll', this._scrollHandler);
      this._scrollEl = el;
      this._scrollEl.addEventListener('scroll', this._scrollHandler, { passive: true });
    }
  }

  _schedule() {
    if (this._scheduled) return;
    this._scheduled = true;
    requestAnimationFrame(() => {
      this._scheduled = false;
      this._render();
    });
  }

  // resize: scroll 父元素可能随响应式断点变化 (desktop #list overflow:auto ↔ mobile overflow:visible→window)。
  // 重新检测、变了就把 scroll 监听迁到新元素 — 否则滚动接不到 (只显示初始那批、往下空白)、
  // 或虚拟化按错容器算 (mobile overflow:visible 时 container.clientHeight=全内容 → 全量渲染、占内存)。
  _onResize() {
    this._rebindScroll();
    this._schedule();
  }

  _render() {
    if (!this.layout.length) {
      for (const node of this.visibleNodes.values()) this._removeNode(node);
      this.visibleNodes.clear();
      return;
    }
    // 算 visible range — 区分两种 case:
    // (a) container 自己是 scroll element (overflow:auto)、row 是 container 子 + absolute、坐标系内 = scrollTop..scrollTop+clientHeight
    // (b) scroll element 是 container 的 ancestor (window 等)、用 getBoundingClientRect 算 container 在 viewport 的位置
    let visTop, visBottom;
    if (this._scrollEl === this.container) {
      visTop = this.container.scrollTop - this.bufferPx;
      visBottom = this.container.scrollTop + this.container.clientHeight + this.bufferPx;
    } else {
      const containerRect = this.container.getBoundingClientRect();
      const sv = this._scrollEl === window
        ? { top: 0, bottom: window.innerHeight }
        : (() => { const r = this._scrollEl.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })();
      visTop = sv.top - containerRect.top - this.bufferPx;
      visBottom = sv.bottom - containerRect.top + this.bufferPx;
    }

    // linear 找 first/last visible (2063 OK、binary search 优化可后续)
    const needIds = new Set();
    for (const e of this.layout) {
      if (e.top + e.height < visTop) continue;
      if (e.top > visBottom) break;
      needIds.add(e.id);
    }

    // 移除 off-screen nodes
    for (const [id, node] of this.visibleNodes) {
      if (!needIds.has(id)) {
        this._removeNode(node);
        this.visibleNodes.delete(id);
      }
    }

    // 加入 / 更新 visible nodes + 测量
    let needsRelayout = false;
    for (const e of this.layout) {
      if (!needIds.has(e.id)) continue;
      if (this.visibleNodes.has(e.id)) continue;   // 已 in DOM
      const node = this._buildNode(e.item, e.top);
      this.inner.appendChild(node);
      this.visibleNodes.set(e.id, node);

      const real = node.offsetHeight;
      const had = this.heights.get(e.id);
      const dec = decideMeasure(real, had, e.height);
      if (dec.shouldCache) this.heights.set(e.id, real);
      if (dec.shouldRelayout) needsRelayout = true;
      if (dec.shouldNotify) this.onMeasure?.(e.item, real);
    }
    if (needsRelayout) {
      // 用 rAF 避免 sync layout thrashing
      requestAnimationFrame(() => this._relayout());
    }
  }

  _buildNode(item, top) {
    // renderRow 返回 HTML string、wrap 成 element + absolute position
    const tmp = document.createElement('div');
    tmp.innerHTML = this.renderRow(item);
    const node = tmp.firstElementChild;
    node.style.position = 'absolute';
    node.style.top = `${top}px`;
    node.style.left = '0';
    node.style.right = '0';
    node._vlistId = this.getRowId(item);   // RO callback 反查 row id
    this._ro?.observe(node);
    return node;
  }

  _removeNode(node) {
    this._ro?.unobserve(node);
    node.remove();
  }
}

// row 测量后行为决策 — 纯函数、可单测
//
// shouldCache = real > 0 (测到真高就缓存、不论是否等于 estimate):
//   每个 row 缓存自己的真实高度、避免后续别的 row 更新 kindH 时本 row 的 estimate 漂移导致 layout 错位。
// shouldRelayout = real ≠ estimate (相等时 layout 已正确)。
// shouldNotify = prevCached ≠ real (避免重复触发 onMeasure callback)。
export const decideMeasure = (real, prevCached, estimate) => {
  if (!(real > 0)) return { shouldCache: false, shouldRelayout: false, shouldNotify: false };
  return {
    shouldCache: true,
    shouldRelayout: real !== estimate,
    shouldNotify: prevCached !== real,
  };
};

function _findScrollParent(el) {
  // 找真正能滚的祖先 (有 overflow:scroll/auto + 内容确实 > 容器)
  // mobile 上 #crystal-list overflow:visible、body overflow:auto 但 body 是 viewport、用 window 才对
  let cur = el;
  while (cur && cur !== document.documentElement && cur !== document.body) {
    const cs = getComputedStyle(cur);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowY === 'overlay')
        && cur.scrollHeight > cur.clientHeight) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return window;
}
