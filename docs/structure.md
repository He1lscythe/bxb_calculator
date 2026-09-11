# 项目结构

> 文档索引: [docs/README.md](README.md)

按解包 `master_tables/` 重建的项目结构。

**baseline** (2026-09-07): `npm test` 319/319 全绿、`npx playwright test` 93/93、
`npm run lint` 0 problem、5 类 image 覆盖率 100% (chara/masou/crystal/bg/soul)。

---

## 数据 pipeline

```
BxB/master_tables/master_data/<latest>/*.json   (解包源数据、ground truth、git worktree)
    │
    ▼
scripts/master_to_business/build_*.py            (12 个 build_*.py、含 build_all 编排、详见下方)
    │
    ▼
data/*.json    (业务 JSON: master + revise + audit)
    │
    ▼  +  data/*_revise.json  (4 bucket: chara / soul / crystal / masou)
    │     │
    │     ▼
shared/*-adapter.js                              (deepApply(master, revise))
    │
    ▼
js/*-list.js / *-render.js / hensei.html         (viewer 渲染 + hensei 计算)
```

**关键模块**:
- master 数据来源: [scripts/master_to_business/paths.py](../scripts/master_to_business/paths.py) 自动 detect `BxB/master_tables/master_data/` 下最新日期文件夹 (git worktree、`data/master-tables` branch)
- 4 bucket revise: `chara_revise.json` (tags + skill value_scaling) / `soul_revise.json` (tags) / `crystal_revise.json` (max_value / M_L/W/P_max / min_max weight/purity) / `masou_revise.json` (skill value_scaling)
  - `M_L_max` / `M_W_max` / `M_P_max` **不填 1** — 缺省即 1 (`parseFactor(null)=1`)，显式写 1 反而让 `crystalDimAvailability` 判成「该维度可调」、⚙ 里多出一条拖不动的滑条。cr-edit 里 `def: 1` 只是 placeholder、不会落盘
- sparse diff core: [shared/revise-core.js](../shared/revise-core.js) (`computeDiff` / `deepApply` / 撤回 / tombstone null)
- wiki 提取产物: `data/_wiki_aux.json` —— **2026-06-09 的一次性快照**、不再重跑。3 个 key 现状各不相同 (原有的 `chara_tags` 300 条已于 2026-09-11 删除 —— 没有任何消费方,`characters.json` 的 `tags` 一直是 `[]`,真正生效的 tag 在 `chara_revise.json`):
  | key | 现状 |
  |---|---|
  | `crystal_max_value` (1220) | **已被 live 抓取接管** (2026-09-11)。[fetch_wiki_acquisition.py](../scripts/master_to_business/fetch_wiki_acquisition.py) 每轮从 altema 的 【効果量】 区间上限取 `max_value`;这里的快照只作 `build_crystals` 的 **fill-only** 兜底 (曾经每轮覆盖 revise、把用户改的值刷回去) |
  | `chara_skill_value_scaling` (89) | 仍是唯一来源、`build_characters` 读。altema 无对应结构化字段、只能靠 `chara_revise` 手工覆盖 |
  | `masou_value_scaling` | 空 dict、预留接口、`build_masou` 读到就是 no-op |

### 仓库外路径约定

仓库内不写开发机绝对路径。跨 repo / 机器相关的位置都经
[paths.py](../scripts/master_to_business/paths.py) 解析、文档与注释里用占位符指代:

| 占位符 | 含义 | 解析顺序 |
|---|---|---|
| `master_tables/` | 解包 master JSON (git worktree) | env `BXB_MASTER_TABLES` → `<repo 上一级>/master_tables` |
| `unpacking/` | 抓包/解包产物 (跨 repo) | env `BXB_UNPACKING` → `<repo 上一级>/unpacking` |
| `<assets>` | 解包出来的图片/motion 资源根 | env `BXB_ASSETS_DIR` → `_local_paths.json` 的 `assets_dir` |

`_local_paths.json` 与 `docs/local_env.md` 都 untracked、只记本机实际位置;CI 一律走 env。

---

## 目录结构

| 路径 | 用途 |
|---|---|
| [scripts/](../scripts/) | 反复使用的脚本 (build / dev server / cleanup 工具) |
| [scripts/master_to_business/](../scripts/master_to_business/) | build pipeline + utility |
| [shared/](../shared/) | JS 共享模块 (跨 viewer 复用) |
| [js/](../js/) | viewer 业务代码 (5 viewer 各自 list / render / edit) |
| [pages_src/](../pages_src/) | HTML 源 (5 viewer + 攻略 iframe 包装页 `dungeon_yggdrasil.html` + `_loading.html` partial) |
| pages/ | build 产物 (已 tracked、deploy 用)。另含静态拷入的 `dungeon_map.html` (攻略地图、自包含单文件、非 build 产物;更新时直接覆盖、wrapper 用 iframe 嵌它) |
| [data/](../data/) | 业务 JSON (master + revise + audit + wiki_aux + derived _*) |
| icons/ | 本地图标资源 (.gitignore 排除、`copy_images.py` 从 `<assets>` 拷) |
| omoide_icon/ | Frida 抓的 omoide icon (.gitignore 排除) |
| [docs/](../docs/) | 项目文档 |
| [api/](../api/) | Vercel serverless function (`save.js` revise 落 data-staging + PR、`share.js` 短链 KV) |
| [css/](../css/) | 各 viewer 样式 + `base.css` / `shared.css` / `nav.css` |
| [cloudflare/](../cloudflare/) | `dispatch-worker/` —— 用 CF Cron Trigger 可靠触发 GitHub `workflow_dispatch` (GitHub 原生 schedule 高峰会丢跑)。只有 `wrangler.toml` tracked、`src/worker.js` 与其 `README.md` 都 gitignored (只在本机) |
| [tests/unit/](../tests/unit/) | 单测 (`npm test`、14 file / 319 case) |
| [tests/ui/](../tests/ui/) | Playwright e2e (`npx playwright test`、6 file / 93 case) |
| audit/ | `audit_dead_code.mjs` 输出 + `crystal_factors/` 反推脚本 (.gitignore 排除) |
| draft/ | 本机一次性脚本 (.gitignore 排除)、当前只有 `decrypt_scenario_mu3.py` (.NET 版 scenario 解密、比 CI 的纯 Python 快) |
| `../master_tables/` | master_tables (bxb_wiki 仓库 `data/master-tables` branch 的 git worktree、跟 bxb_wiki 同级、`BxB/master_tables/`) |
| `../data_staging/` | data-staging branch 的常驻 git worktree (2026-06-10 建、跟 bxb_wiki 同级)。revise 同步 / main→data-staging 本地 merge 都在这里做 (`*_revise.json` 在 main gitignored、data-staging tracked — 此 worktree 是它们的 git 归宿) |

---

## scripts/ — 反复使用脚本

### 根目录

| 脚本 | 用途 |
|---|---|
| [build.js](../scripts/build.js) | 静态 build (pages_src/*.html + fragments → pages/*.html)、支持 `--watch` 模式 |
| [serve.js](../scripts/serve.js) | 本地静态 dev server |
| [start.py](../scripts/start.py) | 本地 dev server + `POST /save` endpoint (写回 `data/*_revise.json`) |
| [audit_dead_code.mjs](../scripts/audit_dead_code.mjs) | dead exports / redundant exports / dead imports / arity mismatch 4 份报告 |
| [fix_dead_imports.mjs](../scripts/fix_dead_imports.mjs) | 读 audit 报告、batch 删 dead imports (含 `--dry-run` 模式) |

### scripts/master_to_business/ — build pipeline + utility

**Build scripts** (master → data、跑一次再跑 idempotent):

| 脚本 | 输入 | 输出 |
|---|---|---|
| [build_senzai.py](../scripts/master_to_business/build_senzai.py) | `data/_memory_slot_skills.json` | `data/senzai_table.json` |
| [build_souls.py](../scripts/master_to_business/build_souls.py) | `jobs.json` | `data/souls.json` |
| [build_crystals.py](../scripts/master_to_business/build_crystals.py) | `materials.json` + `_wiki_aux.json` | `data/crystals.json` + `data/crystal_revise.json` + audit |
| [build_crystal_aux.py](../scripts/master_to_business/build_crystal_aux.py) | `data/crystals.json` + `data/characters.json` | `data/crystal_revise.json` (注入 `range` / `weapon_base_id`) |
| [build_bladegraphs.py](../scripts/master_to_business/build_bladegraphs.py) | `pictures.json` | `data/bladegraphs.json` |
| [build_bg_aux.py](../scripts/master_to_business/build_bg_aux.py) | `data/bladegraphs.json` + `data/characters.json` | `data/bg_revise.json` (注入 `weapon_base_id`) |
| [build_characters.py](../scripts/master_to_business/build_characters.py) | `weapons.json` + `weapon_innate_skills.json` + `_wiki_aux.json` | `data/characters.json` |
| [build_masou.py](../scripts/master_to_business/build_masou.py) | `weapon_costumes.json` + `_wiki_aux.json` | `data/masou.json` |
| [build_masou_aux.py](../scripts/master_to_business/build_masou_aux.py) | `data/masou.json` | `data/masou_revise.json` (注入 `effects[].range`) |
| [build_omoide.py](../scripts/master_to_business/build_omoide.py) | `unpacking/draft/out/memory_slot/summary/*.json` (Frida 抓) | `data/omoide/{base_id}.json` |
| [build_all.py](../scripts/master_to_business/build_all.py) | 上面全部 | 跑全套 + 错误报告 |

**Utility 模块** (反复使用、被 build script import):

| 模块 | 用途 |
|---|---|
| [paths.py](../scripts/master_to_business/paths.py) | 自动 detect 最新 `master_tables/` + 提供 `master_file()` / `assets_dir()` helper |
| [enums.py](../scripts/master_to_business/enums.py) | #JS 91 项 parameter / 5 math_type / 3 range / TARGET_ELEMENT / TARGET_WEAPON_TYPE 等 master enum 映射 (**JS 侧的 `shared/constants.js` 不含这些**) |
| [image_paths.py](../scripts/master_to_business/image_paths.py) | master id → `icons/` 本地 image path 反查 |
| [copy_images.py](../scripts/master_to_business/copy_images.py) | 数据更新时拷 `<assets>` → `icons/` (含 soul 7 张 fallback 段) |
| [gen_motion_table.py](../scripts/master_to_business/gen_motion_table.py) | `characters.json` → `docs/motion_table.md` (master 改 motion_id 后重跑) |
| [fetch_wiki_acquisition.py](../scripts/master_to_business/fetch_wiki_acquisition.py) | 抓 altema wiki → patch `crystal_revise.json` (`入手方法` + **`max_value`**) + `bg_revise.json` (`acquisition`)、按 name 匹配 (NFKC + 装飾符/accent fallback)。`max_value` 取 【効果量】 区间上限、和数字 (億/万/千 複合) 解析;**单位换算**: 「効果量下限 ÷ master `initial_value` ≥ 50」→ altema 用的是百分数而 master 用分数 (只有 `Wave_Heal` 那 9 条)、÷100 —— **不能拿「带不带 %」判**,`BlazeAbsorb`/`Mez` 等 19 条也带 % 但 master 本就存百分数;整数值写成 int (不然 `2`→`2.0` 刷出 150 行无意义 diff);**有三因子且原本没有 max_value 的不写** (那些 series 故意只给因子)、原本就有的照常刷新。403 会退避重试 4 次。CI 每轮由 `run_update` 模块 B 调 |
| [dump_npc_motions.py](../scripts/master_to_business/dump_npc_motions.py) | UnityPy 解 `<assets>/_dat_cache/assets/npc-motion-*.dat` → `data/_npc_motions.json` 全量基线 (日常由 CI `sync_npc_motions.py` 增量补、本脚本只在需要重建时手动跑、小时级) |
| [build_memory_slot_skills.py](../scripts/master_to_business/build_memory_slot_skills.py) | 从 HouseTop response (cross-repo `unpacking/draft/out/account/` + `bxb_wiki/data/omoide/`) → `data/_memory_slot_skills.json` (senzai 反查表、秒级) |

### scripts/ci/ — 云端自动更新数据库 (GitHub Actions)

`.github/workflows/update-database.yml` 每天 JST 16:01 + 00:01 跑、纯 HTTP 从游戏 API 拉最新 master 重建业务 JSON。
**它只有 `workflow_dispatch`、没有 GitHub `schedule`** —— 原生 cron 高峰会丢跑,定时改由
`cloudflare/dispatch-worker` 的 CF Cron Trigger 调 dispatch API
(UTC 07:01 / 15:01 = JST 16:01 / 00:01)。本仓库其余 workflow 同理、全是 dispatch-only。

手动重发 workflow `repost-telegraph.yml`(渲染/合成逻辑更新后重生成历史页;走 telegraph_index → `editPage` 原地更新、URL 不变、不重发频道)。输入 `kind` 二选一 + `target`(留空=最新):
- `kind=asset-version` — 图册重发(`target`=asset_version 号)
- `kind=master-data` — changelog 重发(`target`=文件夹名如 `2026_07_08_16_00_00`;自动找前置快照重跑 `diff_master_tables.py` 重写 `changelog.md` → notify → changelog+index 回提交 data/master-tables)

| 脚本 | 用途 |
|---|---|
| [master_tables_archive.py](../scripts/ci/master_tables_archive.py) | master dict → `master_data/<JST日期>/` 快照 (split + 派生 weapon_innate_skills/arts/effects) + changelog + 索引。port 自 unpacking split_tables/build_skill_id_index/update_master_tables |
| [diff_master_tables.py](../scripts/ci/diff_master_tables.py) | changelog 引擎 (整体 port 自 unpacking;CI 版加"空字段归一"——API 省略空字段、避免与 ADB 版 schema 差异误报全表) |
| [revise_safety.py](../scripts/ci/revise_safety.py) | revise 字段级安全检查 (防用户手填字段被冲、丢条目/字段则中止提交) |
| [cdn.py](../scripts/ci/cdn.py) | 资源 CDN 客户端 (无鉴权): `current` 版本号 → `version-{ver}.gz` manifest (gzip+msgpack) → `{name}.v{ver}.dat` 资源 |
| [extract_assets.py](../scripts/ci/extract_assets.py) | port parse_unity_dat_v4: `.dat` → PNG / npc-motion 时长。`extract_png` = luma/chroma 配对 YCoCg 合成 + 跳退化贴图(≤4×4/全透明/纯单色)+ 忽略 Sprite 用其 backing Texture2D(本版本 Sprite.image 抛错);无图返回 `[]`(notify/sync 不收) |
| [sync_icons.py](../scripts/ci/sync_icons.py) | manifest 驱动: 缺失 icon → 下 .dat → extract → copy_images。重建结果与本地 copy_images 逐字节一致 |
| [sync_npc_motions.py](../scripts/ci/sync_npc_motions.py) | 增量补 `_npc_motions.json` (manifest npc-motion vs 基线、只下缺的) |
| [sync_scenario.py](../scripts/ci/sync_scenario.py) | 监测 `utage3_scenario_version`(login 响应)、新版从 CDN `scenario_lz4/android/scenario-{ver}.mu3` 下载 → **Rijndael-256-CBC 解密**(256bit block/ZeroPadding、纯 Python `pycryptoplus`、全量 ~2.5min、只在有新版时跑)→ ① 存 UnityFS 累积 `scenario/unity3d/scenario-{ver}.unity3d`(git 自动 delta、每版 ~40KB)② UnityPy `read_typetree` 抽 `AdvChapterData.importGridList` → 每本 `scenario/{book}.tsv`(Utage 原生命令表、多 grid 用 `# sheet名` 分段、裁尾部空 cell、cell 内 `\t\r\n\\` 转义)。`unity3d/` 文件已存在=unchanged。本地 Windows 有更快的 `.NET` 版 `draft/decrypt_scenario_mu3.py` |
| [build_rarity4_ids.py](../scripts/ci/build_rarity4_ids.py) | 快照的 `weapons.json` → `rarity==4` 的 `base_id` 去重清单(一把魔剑多个进化形态 `id=base_id*100+n`,必须按 base_id 去重)。与现版对比,**只在有新增时**才写 `--out`(无新增不写文件 → 调用方 `[ -f ]` 跳过上传);只减不增 → `::warning::` 拒绝更新。新增会打 `::notice::` 带魔剑名 |
| [run_update.py](../scripts/ci/run_update.py) | 编排: **npc-motion 预取 (build 前、新动作当轮进 build_characters)** → A (master→6 表)、B (fetch_wiki+aux→revise+安全检查)、C (asset-version→icons+快照、manifest 复用预取)、D (快照+changelog)。各模块失败优雅降级 |
| [notify.py](../scripts/ci/notify.py) | 更新后发 Telegram 频道通知: `master_data` changelog → Telegraph 文章、`asset_version` delta → 解 PNG→R2→Telegraph 图册。Telegraph 用固定账号 (secret `TELEGRAPH_TOKEN`) `createPage`,page path 记进 `master_tables/state/telegraph_index.json` (随 data/master-tables 提交);同一快照重生 changelog 时 `editPage` **原地更新** (URL 不变、频道旧链接自动指向新内容、不重发)。无 `TELEGRAPH_TOKEN` 则退回匿名建页 (不可编辑) |

提交去向: data/*.json + `_npc_motions.json` + `icons/` → **main** (→sync 流 data-staging + Pages);crystal_revise/bg_revise/masou_revise → **data-staging** (安全检查通过且有变更);master_data + asset_version 快照 + `state/telegraph_index.json` + `scenario/`(`unity3d/scenario-<ver>.unity3d` 累积 + `{book}.tsv` 每本可读表)→ **data/master-tables**。scenario 版本(`utage3_scenario_version`)独立于 master_data 跳、单独 commit + 发 `#scenario` 频道消息(版本号 + 新增/修改的 book 列表 — sync 写盘前比对旧 TSV 内容得出、进 summary、notify 读;无 Telegraph 页);二进制 ~6MB/版 git 自动 delta(每版 ~40KB)、TSV 约 15.5MB 文本(整游戏剧情、每版只 diff 变化的 book);翻译回灌以 `.unity3d` 为无损母本叠加 Text、TSV 只作对照。`paths.py`/`copy_images.py` 都加了 env 覆盖 (`BXB_MASTER_TABLES`/`BXB_ASSETS_DIR`) 让 CI 指向 checkout/临时目录、本地默认不变。

> asset-version 流程 (2026-06-12 抓包确认、`Maken.HTTP.Get/Download` @ OnePlus): `GET bxb-asset.grimoire.codes/version_lz4/android/current` → 版本号、`/version-{ver}.gz` → manifest、`package_lz4/android/{name}.v{ver}.dat` → 资源,全程**无鉴权纯 CDN**。新动作 (npc-motion) + 新实体图 (icons) 都增量自动补。全量 npc-motion 重生 / 重绘图强刷仍走本地 (罕见)。

---

## shared/ — JS 共享模块

| 模块 | 用途 |
|---|---|
| [stats-calc.js](../shared/stats-calc.js) | hensei stat 计算 —— `applyStaged` 的 s1〜s8 stage 链 (HP-curve / Break gate / server-fold floor / LP / DLB cap / Speed / MotionSpeed / enemy mods)、`ctx.traceEnabled` 时返回 dev trace (stat-trace modal 数据源)。stage 清单见 [hensei_calc.md](hensei_calc.md) |
| [hensei-helpers.js](../shared/hensei-helpers.js) | UI 用 lv/觉醒/熟度参数 (`charaLvParams` master 直读 states.stats、硬编码表仅 fallback) + soulMultiplier / crystalEffectiveValue / crystalMaxBairitu / BlazeGauge 系统 |
| [guild-score.js](../shared/guild-score.js) | ギルバト 40s ダメージ/スコア模拟 (`simulateGuildScore` 高频重叠 loop + 6 档波动率均值、開始秒=剩余输出窗口、`computeGuildScore` 基礎×難易度×結界2.6 换算、纯函数、见 hensei_calc.md) |
| [revise-core.js](../shared/revise-core.js) | sparse diff core (`computeDiff` 三参含撤回 + `deepApply` + tombstone null)。数组 (2026-06-19):带 id 对象数组 (weapon_skills/soul.skills) 按 **id** 局部 patch (robust 到重排);标量数组 (tags)/无 id 数组 (masou effects) 整组替换;已弃用 index 稀疏 |
| [save-client.js](../shared/save-client.js) | POST /save 路由 (local `start.py:8787` / Vercel `/api/save.js`) + toast 反馈 |
| [chara-adapter.js](../shared/chara-adapter.js) / [soul-adapter.js](../shared/soul-adapter.js) / [crystal-adapter.js](../shared/crystal-adapter.js) / [masou-adapter.js](../shared/masou-adapter.js) / [bg-adapter.js](../shared/bg-adapter.js) | master → wiki shape adapter (含 `deepApply(master, revise)` wrap)。bg 是 view-only、其 adapter 只做形状转换、无 revise 通路 |
| [image-paths.js](../shared/image-paths.js) | master id → `icons/` 相对路径 + `charaIconStack` 叠层 helper (marriage 框 + element + weapon_type、含 `lazy: 'native'\|'io'` 选项) |
| [virtual-list.js](../shared/virtual-list.js) | 简单 virtual scrolling、屏幕外 row 不在 DOM、用在 cr-list / bg-list (2100+518 expand all 不卡) + hensei 实体选择器 #em-list (5 类型共用、crystal 2100 行秒开) |
| [lazy-img.js](../shared/lazy-img.js) | IntersectionObserver-based img lazy、`setupLazyImg(scrollRoot)` swap `data-src→src`、适用自定义 scroll 容器 (native HTML5 lazy 只看 document viewport、容器 scroll 失效) |
| [constants.js](../shared/constants.js) | **前端 UI enum**: ELEMENT / ELEM_COLOR / ELEMS_ORDER / WEAPON / WEAPONS_ORDER / RARITY / CHARA_TAG (14) / SOUL_TAG (8) + `renderFilterToggles` / `renderElementFilterToggles`。⚠ PARAMETER (91) / MATH_TYPE (5) / RANGE 这些 master enum **不在这里**、只在 Python 侧 [enums.py](../scripts/master_to_business/enums.py) |
| [parameter-class.js](../shared/parameter-class.js) | `classifyParameter` (master parameter → 35 类効果分类 int) + PARAMETER_CLASS_LABEL/SHORT + `conditionTrigger` / COND_TRIGGER_LABEL (発動条件 0..5) + `crystalScopeTags` / `bgScopeTags` / SCOPE_LABEL + **`HP_CURVE_PFX` / `conditionFactor`** (残HP 条件係数、`stats-calc.js` re-export 保持旧 import 路径;結晶頁只为 5 行函数不必拉 1300 行的 stats-calc) |
| [effect-tags.js](../shared/effect-tags.js) | 効果 tag (分類 / scope / 発動条件) 的**唯一实现**。语义层 `effectParams` / `effectScope` / `effectCondition` / `effectScopeLongLabel` + HTML 层 `paramBadgesHtml` / `scopeTagHtml` / `condTagHtml` / `effectTagsHtml` + `normalizeMasterEffect` (hensei 的 master shape → wiki shape)。characters / souls / crystals / bladegraphs / hensei 全走这一份 —— 以前各有拷贝、漂出过两套条件 enum 和三种 scope 覆盖 |
| [filter-core.js](../shared/filter-core.js) | viewer filter 通用 utility (applySpec / renderSpecFilters / sort / reset) |
| [chara-spec.js](../shared/chara-spec.js) / [soul-spec.js](../shared/soul-spec.js) / [crystal-spec.js](../shared/crystal-spec.js) / [bg-spec.js](../shared/bg-spec.js) | 4 viewer 各自 filter spec (facet / sort options) |

> ⚠ 曾计划的 `shared/data-loader.js` (统一 fetch data/*.json + cache + loadAll) **从未落地**、文件不存在。
> 实际 data fetch 是**各页面 inline** 的:`pages_src/{characters,souls,crystals,bladegraphs,hensei}.html`
> 各自 `fetch('../data/*.json')`,另有 [omoide-view.js](../js/omoide-view.js) 的 omoide 懒加载。
> 要集中化就得先建这个模块。

---

## js/ — viewer 业务代码

5 viewer 各自一套 list / render / edit + 公共 nav / utils / state:

| 模块 | 用途 |
|---|---|
| `js/nav.js` | 顶部 navbar + revise bar (未保存 N 条修正) |
| `js/utils.js` | DOM / 字符串 / 数字格式 utility + `?説明` popover (`toggleHelpPopover`、hensei stats 与結晶倍率式共用) |
| `js/state.js` | 全局 state (allCharas / allSouls / 各 reviseData / sessionReviseIds 等) |
| `js/render.js` | chara list/render (主 viewer) |
| `js/chara-edit.js` | chara edit modal (tags + skills value_scaling + 嵌入 masou_overrides) |
| `js/filter.js` | chara viewer filter / sort 接线 (走 `shared/filter-core.js` + `chara-spec.js`) |
| `js/soul-render.js` / `soul-edit.js` / `soul-filter.js` / `soul-state.js` | soul viewer 渲染 + tags edit + filter + 独立 state |
| `js/cr-list.js` / `cr-edit.js` / `cr-state.js` | crystal viewer + inline 8 字段 edit + 独立 state |
| `js/cr-sim.js` | 結晶倍率シミュレータ modal (⚙ から Lv/重量/純度/残HP を動かす、計算は crystalEffectiveValue + conditionFactor をそのまま呼ぶ) |
| `js/bg-list.js` / `bg-state.js` | bladegraph viewer (**view-only**) + 独立 state |
| `js/omoide-view.js` | omoide picker modal (hensei + chara 详情页用) |

> ⚠ **`js/bg-edit.js` 已删、bg edit 不复活** —— 见 [bladegraphs.html:97](../pages_src/bladegraphs.html#L97):
> 「master 数据 100% 准确、无 server-fold 字段需补」。页面里 `enterEditMode / cancelEdit / saveEdit /
> saveRevise / reRenderBgEdit` 全是 `_noop` stub;`bg-state.js` 仍留 `editingId` 字段与
> `_ensureBgOriginal` 懒克隆 helper 作为将来复活的脚手架(bladegraphs.html:140-141),当前无消费方。
> 同理 `js/edit.js` 从不存在,chara edit 全在 `js/chara-edit.js`。

hensei calc 主入口在 [pages_src/hensei.html](../pages_src/hensei.html) 内、调用 `shared/stats-calc.js`。

---

## data/ — 业务 JSON

**Master 数据** (build_*.py 输出):
- `characters.json` (657 chara) / `souls.json` (496) / `crystals.json` (2100) / `bladegraphs.json` (518) / `masou.json` (722) / `senzai_table.json` (209) — 件数随 master 每日更新增长、这里只记 2026-09-07 的量级
  - ⚠ 没有 `data/motions.json`。motion 数据是 `build_characters.py` **inline 进 characters.json** 的:
    段时长 `states[].motion_durations` 来自 `data/_npc_motions.json`、モーション名来自 master 的
    `attack_motions.json`。消费方 [stats-calc.js `_computeMotionSpeed`](../shared/stats-calc.js)。
- `guildtitles.json` / `guildemblems.json` (手工维护、无 build script)
- `omoide/{base_id}.json` (647 file、Frida 抓、2026-06-09 起入 git tracked)

**Revise** (用户编辑产物、4 bucket):
- `chara_revise.json` / `soul_revise.json` / `crystal_revise.json` / `masou_revise.json`

**Audit / 一次性产物**:
- `_wiki_aux.json` — 2026-06-09 一次性 wiki 快照。`crystal_max_value` 已改由 live 抓取接管 (仅作 fill-only 兜底)、`masou_value_scaling` 空 dict;只有 `chara_skill_value_scaling` 还是唯一来源。详见上方「关键模块」
- `_audit_crystals_null_math.json` / `_wiki_unmatched_crystals.json` — build_crystals 每轮重生的诊断输出、gitignored 不入库 (2026-07-04 起)

---

## Dev server / Build / Test

| 命令 | 用途 |
|---|---|
| `python scripts/start.py` | 本地 dev server (端口 8787) + `POST /save` endpoint 写回 `data/*_revise.json` |
| `node scripts/serve.js` | 纯静态 dev server (不含 /save) |
| `node scripts/build.js` | 全量 build (`pages_src/` + fragments → `pages/`)、用户开 `--watch` 模式自动重 build |
| `npm test` | 319/319 单测 (tests/unit/、14 file) |
| `npx playwright test` | 93/93 UI e2e (tests/ui/、6 file): hensei 装备联动 57 / edit flow 14 / 効果 tag 8 / 結晶 UI 8 / 結晶 virtual list 3 / 短链 3 |

**保存流程**:
1. viewer edit mode → `computeDiff(orig, edit, prev)` → 入 `state.reviseData[id]` + `sessionReviseIds.add`
2. 顶部 revise bar 显示 "未保存 N 条修正"、点 "保存" → `submitRevise(body)` POST /save
3. local: `start.py` deep merge 入 `data/*_revise.json` + 写盘
4. Vercel 生产: `/api/save.js` 推 `data-staging` branch + 自动 PR
5. `data-staging` branch **单向积累、永不合回 main** (main → data-staging 同步代码 OK、反向禁止;`*_revise.json` 故意只活在 data-staging)

**数值输入分式支持 (2026-06-20)**: edit mode 的 `value_scaling` (chara skill / masou) 和 crystal `max_value` / `M_L/W/P_max` **既接受分式字符串 (`"5/1.13"`) 也接受小数/整数**。分式存 string、小数/整数存 number (`parseBairituVal`);hensei 计算时由 `parseHit` / `parseFactor` / chara-adapter `_parseFrac` 展开成数字。测试见 [tests/unit/test_fraction_support.mjs](../tests/unit/test_fraction_support.mjs)(覆盖所有消费点)。

**分享 (export/import)**: `_henseiCompact` → deflate-raw + base64url → `#hash` / .json 文件。`omoide_picks` 非空时随之导出(装备 chara 时 auto-equip「攻撃優先」会写入)。导入 (`_applyHenseiConfig`) 对每个魔剣**懒加载 omoide 数据**(`_ensureOmoideLoaded`、`autoEquip=false` 保留导入的 picks)→ 恢复好感显示 + 计算;否则 `_omoide_slots` 未加载、好感行不渲染且 omoide buff 不生效。

**短链 (2026-06-21)**: export 三按钮 = `copy url`(短链)/ `copy code`(`bxb1:` 串、同旧)/ `.json`。`copy url` 把 `bxb1:` 串 POST 到短链 API,拿回 key 拼成 `…/hensei.html#s:<key>` 复制。打开 `#s:<key>` 时 GET 反查回 `bxb1:` 串再走 `_decodeHensei`/`_applyHenseiConfig`。存储 **Upstash Redis (Vercel KV)**:key = `sha256(串)→base64url 前10位`(内容寻址幂等、TTL 2 年);端点 [api/share.js](../api/share.js)(`POST {hash}→{key}` / `GET ?k=→{hash}`),local 镜像 = `start.py` 的 `/share`(存 `data/_shortlinks.json`、gitignored、test-only)。key 算法 JS↔Python 一致(测试 [tests/unit/test_shortlink_key.mjs](../tests/unit/test_shortlink_key.mjs))。客户端路由复用 hensei 自带 `IS_LOCAL_DEV`(local→`/share`、否则→`bxb-calculator.vercel.app/api/share`)。旧的长 `#bxb1:` 链接仍兼容。**部署前置**:Vercel 接 Upstash 集成注入 `KV_REST_API_URL`/`KV_REST_API_TOKEN`(或 `UPSTASH_REDIS_REST_*`)。

---

## 数据更新 workflow

```bash
# 1. 跑解包脚本 / 拿最新 unpacking/master_tables/<latest>/
# (在 unpacking 仓库内、不属于本项目)

# 2. master → business JSON (data/*.json)
python scripts/master_to_business/build_all.py

# 3. wiki 抓「入手方法」、patch 进 data/crystals.json + data/bladegraphs.json
python scripts/master_to_business/fetch_wiki_acquisition.py

# 4. (按需) 拷 <assets> 图标 → icons/ (含 soul 7 张 fallback)
python scripts/master_to_business/copy_images.py

# 5. (按需) chara master 改 motion_id 后重新生成 motion table
python scripts/master_to_business/gen_motion_table.py
```

