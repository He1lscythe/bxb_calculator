# BxB Crawl — 文件结构说明

## 整体流程

```
fetch_pages.py（可选）
    ↓ 保存 HTML 页面
crawl_chara.py  ──────────────────────────────────────────────
    ↓ 抓取 + 技能分类（两阶段） + 倍率标注                    |
characters_classified.json                         classify_common.py
    ↓                                                   ↑        ↑
characters.html（角色 Viewer）                      crawl_chara.py  crawl_soul.py

crawl_soul.py
    ↓ 抓取 + 技能多效果分类
souls.json
    ↓
souls.html（魂 Viewer）

crawl_crystal.py
    ↓
crystals.json
    ↓
crystals.html（结晶 Viewer）

start.py（本地服务器 :8787）
    ↑ /save POST → 写回 JSON

scripts/build.js（前端构建）
    pages_src/*.html  +  fragments/*  →  pages/*.html  ← GH Pages serve
    （消除 inline 片段重复；详见 Build Pipeline 章节）
```

---

## 爬虫 / 数据处理脚本

| 文件 | 用途 |
|------|------|
| `crawl_chara.py` | **角色主爬虫**。从 altema.jp 抓取魔剣角色数据，进行两阶段技能分类（lookup table → 关键词补漏）、倍率标注（含 calc_type）、sort_id 补全与排序。支持 `--recal`（重算所有分类）和 `--rerun`（重新爬取+重算）。输出 `characters.json` |
| `crawl_soul.py` | **魂爬虫**。抓取 altema.jp 魂页面，每个技能效果独立分类（多 effects 条目），含 calc_type。支持 `--recal` / `--rerun`。输出 `souls.json` |
| `crawl_crystal.py` | **结晶爬虫**。抓取記憶結晶页面，解析效果量，生成含 calc_type 的 effects 数组。支持 `--recal` / `--rerun`。输出 `crystals.json` |
| `crawl_bladegraph.py` | **心象結晶爬虫**。单页全量抓取 altema 心象結晶列表，解析效果文本、scope/condition 检测、bunrui 关键词匹配（每个 bunrui 独立一条 effects）。支持 `--recal` / `--rerun`。输出 `bladegraphs.json` |
| `crawl_masou.py` | **魔装爬虫**。从 altema.jp 魔装页面抓取每个魔剣的魔装数据（按 `chara_id` 关联）。输出 `masou.json` |
| `classify_common.py` | **共享分类模块**。被 crawl_chara.py / crawl_soul.py / crawl_crystal.py / crawl_bladegraph.py 共用，包含：元素/武器类型映射、bunrui 关键词表、scope/condition 检测器、`classify_effect()`、`classify_skill_v2()`（魂多效果模式）、`classify_skill_chara()`（角色单 effects[0] 模式）、`classify_hit_fields()`（bunrui=7 时的 hit_type/hit_per_stage）、倍率提取与 calc_type 推断、lookup-veto 规则集。**注**：所有数据源「文字描述」字段统一为 `effect_text`（chara skill / BD / soul skill / bg / crystal / masou），分类器从该字段读 |
| `build_skilllist_table.py` | 从 altema skilllist 页面构建 `skilllist_table.json`（key = 技能名+效果文本，value = altema bunrui ID 列表） |
| `fetch_pages.py` | 工具脚本。单独抓取并保存 Altema HTML 页面，供调试分析 |
| `download_omoide_icons.py` | 工具脚本。批量下载潜在能力图标到 `omoide_icon/` 目录 |
| `start.py` | 本地服务器（端口 8787）。托管 viewer 页面，并提供 `/save` POST 接口，把前端编辑写回 JSON 文件 |

---

## 辅助 / 一次性脚本

| 文件 | 用途 | 状态 |
|------|------|------|
| `classify_calc_type.py` | 独立诊断脚本。对全量魔剣/魂技能重新推算 calc_type 并生成差异报告（Discrepancy A/B/C）。现已被 pipeline 覆盖，保留供核查 | 可重复运行 |
| `audit_chara.py` | 角色数据质检脚本。检查 bairitu / scope 等字段合理性 | 可重复运行 |
| `audit_chara_classify.py` | 技能分类质检脚本。统计未分类/低置信度条目 | 可重复运行 |
| `extract_e3_e6.py` | 提取 bunrui=3（BD攻撃力）/ bunrui=6（BDゲージ）中 scope=0/self 的技能列表，用于人工核查 | 可重复运行 |
| `fix_threshold_100.py` | 一次性修复：将 omoide threshold=100 改为 10，并从 threshold=200 复制 slots | 已完成 |
| `migrate_omoide.py` | 一次性迁移：将旧格式 omoide 数据迁移至新阈值列表 | 已完成 |
| `parse_latent_sample.py` | 开发潜在能力抓取逻辑时使用的测试脚本 | 已完成 |
| `parse_latent_b_sample.py` | B 类潜在能力解析测试脚本 | 已完成 |

---

## JSON 数据文件

### Data Layering（三层数据 pipeline）

每个 entity 有最多三层 data file：

- **`data/{entity}.json`** — crawler 输出，wiki source of truth。`crawl_*.py --rerun` 会重写
- **`data/{entity}_extra.json`** — 手加的完整 entry（wiki 扒不到的），用户维护。crawler 不动
- **`data/{entity}_revise.json`** — 对 base+extra 任一 entry 的字段级 patch（sparse diff）。edit UI 自动写

**加载顺序**：`base → concat(extra) → applyRevise(revise)`。所有 viewer 页面（hensei / characters / souls / crystals / bladegraphs）都按这个顺序合并。

| 何时改哪个文件 | 操作 |
|--------------|------|
| 重新爬 wiki 数据 | 跑 crawler，base 被重写 |
| 想新增 wiki 没有的 entry | 在 `*_extra.json` 加完整 entry（id 用 high range 避开 base id 空间） |
| 想字段级微调任何 entry（不管 base 还是 extra） | 用 edit UI；自动写到 `*_revise.json` |
| 想彻底删一个手加 entry | 从 `*_extra.json` 删行 |
| 想撤销字段微调 | 删 `*_revise.json` 对应 patch |

存在的 extra 文件（默认 `[]`）：`characters_extra.json` / `souls_extra.json` / `bladegraphs_extra.json` / `crystals_extra.json` / `masou_extra.json`。omoide_revise / omoide_templates 是 chara 字段补丁、不需要 extra 层。

### 详细文件清单

| 文件 | 说明 |
|------|------|
| `characters.json` | **主角色数据**（含两阶段技能分类 + bairitu/bairitu_scaling + calc_type）。crawl_chara.py 输出，characters.html 读取。爬取过程中也作为断点续传存档 |
| `characters_extra.json` | 手加的完整 chara entry（wiki 扒不到）。默认 `[]`。format 同 `characters.json` |
| `characters_revise.json` | 角色手动修正 diff（**非 omoide 字段**）。仅存变更字段。页面加载时通过 deepApply 叠加到 base+extra 上 |
| `omoide_revise.json` | 角色潜在開放 diff（`omoide` / `omoide_template` / `omoide_rarity` 字段）。与 characters_revise 分离，页面加载后单独叠加。**注：`omoide_template != null` 时 revise 不写 `omoide` 字段；运行时 `resolveOmoideTemplates` 用 templates 还原 slots** |
| `omoide_templates.json` | 潜在開放槽位模板库。格式：`[{id, name, omoide:[...40 entries...]}]`。id 自增，通过 UI 编辑保存。**chara 引用方式是 live reference**（chara.omoide_template = id），template 内容更新后所有引用 chara 自动跟随 |
| `souls.json` | **魂数据**（含多效果分类 + bairitu + calc_type + bunrui=7 时 hit_type/hit_per_stage）。souls.html 读取 |
| `souls_extra.json` | 手加的完整 soul entry。默认 `[]` |
| `souls_revise.json` | 魂手动修正数据 |
| `crystals.json` | **記憶結晶数据**（含 effects 数组、bairitu_init/bairitu、scope/condition/calc_type、bunrui=7 时 hit_type/hit_per_stage）。crystals.html 读取 |
| `crystals_extra.json` | 手加的完整 crystal entry。默认 `[]` |
| `crystals_revise.json` | 結晶手动修正数据 |
| `bladegraphs.json` | **心象結晶数据**（含 effects 数组、bairitu、scope/condition/calc_type）。bladegraphs.html 读取 |
| `bladegraphs_extra.json` | 手加的完整 bladegraph entry。默认 `[]` |
| `bladegraphs_revise.json` | 心象結晶手动修正数据 |
| `masou.json` | **魔装数据**（每个 entry 关联 `chara_id`，含 effects 数组、effect_text、image URL）。crawl_masou.py 输出，characters.html 魔装 modal + hensei.html 魔装 picker 读取 |
| `masou_extra.json` | 手加的完整 masou entry。默认 `[]` |
| `masou_revise.json` | 魔装手动修正数据 |
| `guildtitles.json` | 公会役職データ（hensei 用，含 `effect_text` 描述与 effects 数组）。手动维护 |
| `guildemblems.json` | 紋章データ（hensei 用，含 rarity / guild_only / effect_text / effects）。手动维护 |
| `senzai_table.json` | **潜在能力表**。key = altema 图标 ID，value 含 koka/syosai/bunrui/bairitu/bairitu_scaling/calc_type。手动维护 |
| `soulskill_table.json` | 魂技能 lookup table（从 soulskill 页面构建）。key = 技能名+効果，value = soulskill category_id 列表 |
| `skilllist_table.json` | 角色技能 lookup table（从 skilllist 页面构建）。key = 技能名+効果，value = altema bunrui ID 列表 |
| `bd_special.json` | **BD 特殊効果**。`{char_id (sort_id): [special_ids]}`。crawl_chara 从 `tokitomebd`/`mahibd`/`buffbd` 三个页面爬取 |
| `bd_special_durations.json` | **BD 特殊効果精确时长**。`{base_sort_id: {sid: 'Xs'}}`。`_elevate_bd` 在 `parse_bd_duration` 返回 `'数秒'` 时用此覆盖 |

---

## 文档

| 文件 | 说明 |
|------|------|
| `structure.md` | 本文件。项目文件结构总览（爬虫 / 数据文件 / 前端 / Save 机制） |
| `skills_schema.md` | 完整 JSON 结构说明。包括 element/武器类型映射、bunrui 分类表（21种）、scope/condition/calc_type 定义、分类流程（两阶段）、爬虫参数表、Filter / Sort 共享 spec 系统、Revise 文件稀疏 index 格式 |
| `chara_training.md` | 魔剣 練度・状態。改造状态、熟度上限、等级公式、結婚/LP/燃心、觉醒倍率 |
| `senzai_icon_table.md` | 潜在開放 icon ID → 効果名/詳細/倍率/熟度補正/算法/分類 对照表 |
| `motion_table.md` | モーション 出現数表（魔剣攻击动作分类） |
| `frontend_ui.md` | **viewer 页面 UI/CSS 实现细节**。移动端全屏 modal、sticky 头部链、CSS 级联陷阱、grid 布局矩阵、z-index 栈速查、modal 调试 checklist |

---

## 前端文件

> **源文件在 `pages_src/`**，**构建产物在 `pages/`**（GH Pages 直接 serve，浏览器访问的也是 `pages/`）。
> 编辑 `pages_src/`，运行 `node scripts/build.js` 或 `npm run build` 重建 `pages/`。详见下文 [Build Pipeline](#build-pipeline)。

| 文件 | 说明 |
|------|------|
| `characters.html` | 角色数据库 Viewer。读取 `characters.json`，支持筛选、浏览、编辑（含 calc_type 切换）、潜在能力弹窗 |
| `souls.html` | 魂数据库 Viewer。读取 `souls.json`，支持筛选、浏览、编辑（含 calc_type 切换） |
| `crystals.html` | 结晶数据库 Viewer。读取 `crystals.json`，支持筛选、浏览、编辑（含 calc_type 切换） |
| `bladegraphs.html` | 心象結晶数据库 Viewer。读取 `bladegraphs.json`，支持筛选（属性/武器/bunrui/条件类型）、浏览、编辑（★/属性/武器/bunrui/倍率） |
| `hensei.html` | 编成 / 伤害模拟器（团队组合 + stats 计算） |
| `js/nav.js` | 注入顶部导航栏（魔剣/結晶/心象/ソウル/編成），各 viewer 共用 |
| `shared/constants.js` | 全 viewer 共享的纯数据常量 + UI 渲染助手。<br>常量：`RARITY` / `ELEMENT` / `ELEM_COLOR` / `ELEM_CSS_VAR` / `ELEMS_ORDER` / `WEAPON` / `WEAPONS_ORDER` / `BUNRUI`（长，详情/编辑下拉）/ `BUNRUI_SHORT`（badge / 紧凑标签）/ `BUNRUI_FILTER`（filter 按钮专用，比 SHORT 长比 BUNRUI 短）/ `BD_SPECIAL` / `BD_SPECIAL_COLOR` / `OMOIDE_THRESHOLDS` / `SCOPE`（长）/ `SCOPE_SHORT`（filter 按钮）/ `CONDITION`。<br>助手：`renderFilterToggles(field, map, opts)` / `renderElementFilterToggles(field, opts)` / `renderEditSelect(map, currentVal, onchangeExpr, opts)` / `renderEditCheckboxes(map, selected, onchangeExpr, opts)`，统一 `.ftog` / `.edit-select` / `.bunrui-check` 三种样式，所有 viewer 的 filter 按钮 / 编辑下拉 / 多选 checkbox 都从这里派生 |
| `shared/filter-core.js` | 共用 filter+sort 引擎（声明式 spec 驱动）。详见 `skills_schema.md`「Filter / Sort 共享 spec 系统」 |
| `shared/chara-spec.js` | chara 的 filter/sort spec，含 `maxHit`/`maxBdhit` 工具函数 |
| `shared/soul-spec.js` | soul 的 filter/sort spec |
| `shared/crystal-spec.js` | crystal 的 filter/sort spec |
| `shared/bg-spec.js` | bladegraph 的 filter/sort spec |
| `omoide_icon/` | 潜在能力图标目录（从 altema 下载）。由 `download_omoide_icons.py` 生成 |

---

## Build Pipeline

为消除 5 个 viewer page 之间共享的 inline 片段（如 loading-screen 内联 CSS）多处重复，引入轻量构建步骤：从 `pages_src/` 生成 `pages/`，支持 `{{include}}` partial 解析。

### 目录关系

```
pages_src/         ← 你编辑这里（页面源 + partials）
├── characters.html
├── souls.html
├── crystals.html
├── bladegraphs.html
├── hensei.html
└── _loading.html  ← partial（`_` 前缀；build 时不会作为页面输出）

scripts/
└── build.js       ← node 脚本，~70 行，零依赖

pages/             ← 构建产物（git 跟踪、GH Pages serve、浏览器访问）
├── characters.html ← 顶部带 banner 警告 "AUTO-GENERATED ... DO NOT EDIT"
└── ...
```

### Include 语法 + Partial 约定

`pages_src/*.html` 中可写：

```html
{{include _loading.html}}
{{include subdir/_foo.html}}
```

- **`_` 前缀文件 = partial**：`buildAll` 跳过它们（不生成对应 `pages/` 输出），但能被 include
- 解析时按 `pages_src/` 为根做相对路径解析
- 嵌套 include 支持（partial 可以 include 别的 partial）
- 循环检测（A → B → A 会报错）
- 最大嵌套深度 10

### 命令

| 命令 | 行为 |
|---|---|
| `node scripts/build.js` 或 `npm run build` | 一次性 build 所有 page |
| `node scripts/build.js --watch` 或 `npm run watch` | 持续运行，监视 `pages_src/`，改动 150ms debounce 后自动 rebuild |

### 开发流

两个 terminal：

```bash
# Terminal 1 — 本地 server
python scripts/start.py

# Terminal 2 — watch 模式自动 rebuild
node scripts/build.js --watch
```

改 `pages_src/*` → watch 自动 rebuild → 浏览器 F5 即看到新版本。

### 不需要 build 的修改

- 改 `js/*.js` / `shared/*.js` —— 浏览器直接 fetch 这些 ES module，**不**经过 build
- 改 `css/*.css` —— 各 page 直接 `<link>`，也**不**经过 build
- 改 `data/*.json` —— 数据文件，无需 build

### 何时该写 partial

- 同一段 HTML/inline CSS/inline JS 在 ≥ 2 个 page 中**完全一样**且未来同改
- 文件名加 `_` 前缀（`pages_src/_xxx.html`）让 build 跳过它
- 否则不写（避免过度抽象）

### 何时不该 inline 进 partial

- ES module 文件（`js/*` / `shared/*`）—— 浏览器有 module 缓存，inline 反而失去优势，让浏览器 fetch 即可
- page 之间 **不**共享的 page-specific 片段 —— 直接写在 `pages_src/<page>.html` 里

---

## Revise 仓库结构（单向积累，main / data-staging 永不合回）

```
GitHub Pages (live)
    ↑ deploy from main（只 serve code + base data；revise/extra fetch 404 → 空数组、不应用）
main branch                 ← code + base data only
    ↓ 每次 main push 后、admin 在 data-staging 上 `git merge main`（保持 data-staging 代码新鲜）
data-staging branch          ← code + base data + *_revise.json + *_extra.json + omoide_templates.json
    ↑ admin 手動 merge proposal/save-XXX → data-staging
proposal/save-{ts}-{rand}   ← API（Vercel /api/save）每次 POST 自动开
    ↑ POST from frontend
ユーザー編集
```

**关键：data-staging 单向积累、永远不合回 main。** revise/extra 故意只活在 data-staging，main 上 gitignored 让它们不污染 main 树。GitHub Pages 只看 main，所以 live 上只显示 base data；revise/extra 仅给本地 / 离线计算 / 数据校对工作流使用。

- `*_revise.json` / `*_extra.json` / `omoide_templates.json` **仅在 data-staging branch 跟踪**（main 上 gitignored）
- 用户在 GitHub Pages 上修正 → POST → API 创建 PR 到 `data-staging`
- admin review/merge PR 到 data-staging。**不要 `git merge data-staging` 到 main**——一旦 merge，revise/extra 会作为 tracked file 进 main 树、之后 gitignore 失效，main 边界就模糊了
- main 上代码改动 push 后，进 data-staging worktree 跑 `git merge main` 把代码带过来；data-staging 因此始终领先 main 若干个 commit（一半是 merge-main 同步，一半是真实数据更新——属于设计预期，不需要处理）
- 本地直接编辑数据（不经 PR）：

```bash
git checkout data-staging
git pull origin data-staging
# 编辑 data/*_revise.json 或 data/*_extra.json
git add data/ && git commit -m "..." && git push
```

**API 字段级 deepMerge + null 撤回**：

| 角色 | 行为 |
|---|---|
| 前端 `computeDiff(orig, modified, prevRevise)` | 用户撤回字段（modified 跟 base 相同但 prev 里有）→ emit `field: null` 撤回标记 |
| API `deepMerge(target, source)` | source 是 plain object → 字段级合并；source[k] === null → 删除 result[k]；空 dict 自动 prune |
| `mergeById` | deepMerge 后只剩 `{id, name}` 的空 entry 直接丢弃 |
| 落盘 revise.json | 永远不含 null（撤回标记仅在传输阶段存在） |

start.py `_deep_merge` / `_merge_by_id` 与 Vercel api/save.js 同语义（local + remote 行为一致）。

**撤回标记如何产生（prev-revise pattern — 4 个 viewer 统一）：**

所有 viewer (souls / bladegraphs / crystal / chara) 的 `saveEdit` 都传 prev 给 computeDiff：

```js
const prevRevise = state.reviseData[id];   // chara 还合并 omoideReviseData
const newDiff = computeDiff(state.originalData[id], state.editData, prevRevise);
const meaningful = Object.keys(newDiff).some(k => k !== 'id' && k !== 'name');
if (meaningful) state.reviseData[id] = newDiff;
else            delete state.reviseData[id];
```

[js/diff.js `_deepDiff`](js/diff.js#L24) 的 prev 规则：

| 情形 | emit |
|---|---|
| mval == oval, prev 有值 | `null`（撤回标记） |
| mval == oval, prev 无 | `_NOOP`（不入 diff） |
| mval / oval 任一 nullish (null/undefined), 另一 defined | 视 nullish 等价：撤回或新设，但**源无字段 + prev 无字段 + 撤回 null** 时不写冗余 null |
| mval ≠ oval | emit mval |

特殊情况由各 viewer 自管：
- **crystal**：[js/cr-edit.js setCrystal* handlers](js/cr-edit.js#L132) 在 UI 用户清字段 (level_max / weight_step / scope 0/1 时的 element/type / 等) 时显式 `editData.X = null`，diff 看到 nullish vs defined → emit null
- **chara**：dual-revise 文件，prev 是 `Object.assign({}, charRevise, omoideRevise)`，diff 后按 OMOIDE_KEYS 拆回两个 revise
- **chara omoide_template override**（非 retraction）：[js/edit.js:194](js/edit.js#L194) `if (hasOmoide && omoideDiff.omoide_template != null) omoideDiff.omoide = null` —— template 选中时 omoide 数组冗余，强制清

**saveRevise 后 refresh**：submit 成功后用**无 prev** 的 computeDiff 重算 state.reviseData，去除 null 撤回标记，防止下次 saveEdit 拿到 stale prev 重复 emit。例 [js/soul-edit.js:147](js/soul-edit.js#L147)。

**等价性：** local `start.py _deep_merge` 与 Vercel `api/save.js deepMerge` 实现等价（都把 source[k] === null 转为 pop）。GitHub Pages 走 Vercel API、127.0.0.1 走 start.py，行为一致。落盘 revise.json 永远不含 null（撤回标记仅传输阶段存在）。

**enforceScopeConstraints**（[shared/effect-constraints.js](../shared/effect-constraints.js)）：base+revise 合并后扫一遍 effects，强制 `scope ∈ {0, 1}` 删 element/type。修复 server pop 后 base.element 仍残留导致 edit 模式 element 仍选中的 bug。crystal / bladegraphs / hensei 加载时调用。

---

## 前端 Save 机制

各数据 Viewer（characters / souls / crystals / bladegraphs）共享统一的 **revise-only** 保存流程。基础 JSON（characters.json 等）只有爬虫能写，UI 只修改 revise。

### 稀疏 index diff 格式

`computeDiff` / `_deepDiff` 对**等长全是 object 的数组**（如 `skills`、`effects`、`omoide`）使用 index-keyed 稀疏格式，仅记录变了的下标。详见 `skills_schema.md`「Revise 文件稀疏 index 格式」。

```json
"skills": { "2": { "effects": { "0": { "bunrui": [1] } } } }
```

合并端（`deepApply` JS 客户端、`deep_update` Python 服务端）通过「target 是数组 + patch 是 object 且所有 key 是数字」识别。


### 核心原则

```
基础 JSON      ←  只有爬虫更新（pure parser 输出）
revise JSON    ←  只有 UI 更新
页面显示       =  基础 + deepApply(characters_revise) + deepApply(omoide_revise)
```

> **重要**：`crawl_*.py` 的 `--recal` **不再** merge revise 进 base JSON（之前是 Phase 3
> 步骤）。base JSON 始终是 parser 单一来源，revise 仅在前端叠加。这样：
>
> - 用户删除 revise 条目 → 刷新即可看到 parser 默认值（不必等下次 recal）
> - parser 改进 → recal 后立即体现，不被 stale revise 覆盖
> - base JSON 不被污染、回滚一致

### 字段分流（characters.html 专属）

characters.html 对角色的 revise 分成两个文件：

| 文件 | 包含字段 |
|------|---------|
| `characters_revise.json` | 除 omoide 外的所有字段（rarity、states、bd_skill 等） |
| `omoide_revise.json` | `omoide` / `omoide_template` / `omoide_rarity` |

判断逻辑在 `saveEdit()`：
```javascript
const OMOIDE_KEYS = new Set(['omoide', 'omoide_template', 'omoide_rarity']);
// diff 中属于 OMOIDE_KEYS 的字段 → omoideReviseData
// 其余字段 → reviseData
```

### omoide_template 压缩（saveEdit 中）

`omoide_template != null`（玩家选/换了 template）时，revise 不存完整 `omoide` 数组 —— 显式注入 `omoide: null` 触发 server `_deep_merge` 清掉 stale 字段：

```javascript
if (hasOmoide && omoideDiff.omoide_template != null) {
  omoideDiff.omoide = null;  // 让 server 把 revise.omoide 字段 pop 掉
}
```

运行时 `resolveOmoideTemplates(charas, templates)`（[shared/omoide.js](../shared/omoide.js)）在 fetch 后还原 slots：找到 chara.omoide_template 对应 template，把 template.omoide 深拷贝覆盖 chara.omoide。template 找不到则保留 chara.omoide 原值（降级）。

脱离 template（玩家手改 slot）时 `_syncTemplateSelect` 会把 `omoide_template` 置 null。save 时 diff 含 `omoide_template: null` + 完整 `omoide`，注入条件 false，两者都进 revise；server pop 掉 `omoide_template`、保留 `omoide` 作显式 override。

### 相关变量

| 变量 | 位置 | 说明 |
|------|------|------|
| `reviseData` | 各页面 | `{ id: obj, ... }`，当前会话积累的非 omoide diff |
| `omoideReviseData` | characters.html | `{ id: obj, ... }`，当前会话积累的 omoide diff |
| `sessionReviseIds` | 各页面 | `Set<id>`，**本次会话**中实际改动过的 id，控制 Save 按钮显示 |
| `originalData` | 各页面 | `{ id: obj, ... }`，页面加载时对基础数据的快照，整个会话不变 |

### 数据流

```
页面加载
  └─ fetch characters.json → allChars
       └─ originalData[id] = deepcopy(c)         ← 快照，会话内不变
  └─ fetch characters_revise.json
       └─ reviseData[id] = c
       └─ deepApply(allChars[idx], c)
  └─ fetch omoide_revise.json
       └─ omoideReviseData[id] = c
       └─ deepApply(allChars[idx], c)            ← omoide 字段叠加

用户进入编辑模式
  └─ enterEditMode(id)：editData = deepcopy(allChars[id])  ← 含两份 revise 叠加后的值

用户点击「保存」（saveEdit）
  └─ prevMerged = { ...reviseData[id], ...omoideReviseData[id] }
  └─ diff = computeDiff(originalData[id], editData, prevMerged)  ← prev-revise pattern
  └─ 按 OMOIDE_KEYS 拆分 diff
       ├─ 非 omoide 字段 → reviseData[id]
       └─ omoide 字段    → omoideReviseData[id]
  └─ 应用 omoide_template 非 null 时 omoide=null override（不是 retraction）

用户点击顶部 Save 按钮（saveRevise）
  └─ POST /save { revise: [...], omoide_revise: [...] }
  └─ 成功：用无 prev 的 computeDiff refresh reviseData / omoideReviseData
           （去除 null 撤回标记，下次 save 不重复 emit）
  └─ sessionReviseIds 清空
```

### updateReviseBar()（nav.js 全局）

```js
function updateReviseBar() {
  var sr = (typeof sessionReviseIds !== 'undefined') ? sessionReviseIds : new Set();
  var count = sr.size;
  bar.style.display = count > 0 ? 'flex' : 'none';
  btn.textContent   = count > 0 ? 'Save (' + count + ')' : 'Save';
  status.textContent = '';
}
```

- 读各页面自己的 `sessionReviseIds`（`let` 顶层变量，全局可见）
- Save 按钮的 `onclick` 用 `typeof saveRevise==='function'&&saveRevise()`，对无编辑功能的页面（hensei）安全

---


## 运行时文件（gitignored）

| 文件 | 说明 |
|------|------|
| `progress.json` | 角色爬虫进度，增量爬取时跳过已完成项；含 part-level 状态（见下） |
| `soul_progress.json` | 魂爬虫进度，同上 |
| `skilllist.html` | skilllist 页面缓存，build_skilllist_table.py 使用 |
| `soulskill.html` | soulskill 页面缓存，build_skilllist_table 脚本使用 |

### progress.json 结构（part-level retry）

```jsonc
{
  "completed_data_ids": ["1647", ...],   // altema list data_id（曾抓过）
  "saved_chara_ids":    [1647, ...],     // 详情页 final_id（chara.id）
  "parts": {                             // key = chara.id (string)、value = 6 part 状态
    "1647": {
      "bd_skill":    false,    // wiki 缺失 → 下次脚本会 retry 整页
      "skills":      true,
      "基本情報":     true,
      "ステータス":    true,
      "プロフィール":  true,
      "潜在解放":    true
    }
  }
}
```

**6 part 完整判定**（[scripts/crawl_chara.py](scripts/crawl_chara.py) `_chara_parts_status()`）：

| Part | 数据位置 | 判定 |
|---|---|---|
| `bd_skill` | `chara.bd_skill.name` | 顶层 bd_skill 存在 + name 非空 |
| `skills` | `chara.states[X].skills` | 任一 state 有非空 skills |
| `基本情報` | `chara.states[X].basic_info` | 任一 state 有非空 basic_info |
| `ステータス` | `chara.states[X].stats` | 任一 state 有非空 stats |
| `プロフィール` | `chara.states[X].profile` | 任一 state 有非空 profile |
| `潜在解放` | `chara.omoide` | 非空 array |

**retry 行为：** wiki 是单页混合 HTML，无法只重抓单个 part。某 chara 任意 part = false → 下次脚本**整页重抓**（已有的 part 也重新解析覆盖）。

**Pending 判定**（[scripts/crawl_chara.py](scripts/crawl_chara.py) main 内 `_should_skip()`）：
- `--rerun`：跳过判定，重抓全部
- 未抓过（`data_id ∉ completed_data_ids`）：重抓
- 已抓但 `parts` 不全 ✓：重抓（这是新行为）
- 已抓且 `parts` 全 ✓：跳过

**Migration**：旧 progress.json 没 `parts` 字段时，脚本第一次跑会从 characters.json 自动推断并写入。手填 base 数据者注意：`--recal` 会重算 tag、`-rerun` 会重抓 wiki、玩家手改请走 `characters_revise.json`。
