# 项目结构

按解包 `master_tables/` 重建的项目结构、`refactor/unpacking-source` branch (长期独立、永不 merge 回 main)。

**baseline**: npm test 135/135 全绿、5 类 image 覆盖率 100% (chara/masou/crystal/bg/soul)。

---

## 数据 pipeline

```
BxB/master_tables/master_data/<latest>/*.json   (解包源数据、ground truth、git worktree)
    │
    ▼
scripts/master_to_business/build_*.py            (8 个 build script、详见下方)
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
- sparse diff core: [shared/revise-core.js](../shared/revise-core.js) (`computeDiff` / `deepApply` / 撤回 / tombstone null)
- 一次性 wiki 提取产物: `data/_wiki_aux.json` (含 `crystal_max_value` / `chara_tags` / `chara_skill_value_scaling` / `masou_value_scaling`、永不重跑)

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
| icons/ | 本地图标资源 (.gitignore 排除、`copy_images.py` 从 D:/bxb 拷) |
| omoide_icon/ | Frida 抓的 omoide icon (.gitignore 排除) |
| [docs/](../docs/) | 项目文档 |
| [tests/unit/](../tests/unit/) | 单测 (npm test 135/135) |
| [tests/ui/](../tests/ui/) | Playwright e2e 测试 |
| audit/ | `audit_dead_code.mjs` 输出 (.gitignore 排除) |
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
| [build_bladegraphs.py](../scripts/master_to_business/build_bladegraphs.py) | `pictures.json` | `data/bladegraphs.json` |
| [build_characters.py](../scripts/master_to_business/build_characters.py) | `weapons.json` + `weapon_innate_skills.json` + `_wiki_aux.json` | `data/characters.json` |
| [build_masou.py](../scripts/master_to_business/build_masou.py) | `weapon_costumes.json` + `_wiki_aux.json` | `data/masou.json` |
| [build_omoide.py](../scripts/master_to_business/build_omoide.py) | `unpacking/draft/out/memory_slot/summary/*.json` (Frida 抓) | `data/omoide/{base_id}.json` |
| [build_all.py](../scripts/master_to_business/build_all.py) | 上面全部 | 跑全套 + 错误报告 |

**Utility 模块** (反复使用、被 build script import):

| 模块 | 用途 |
|---|---|
| [paths.py](../scripts/master_to_business/paths.py) | 自动 detect 最新 `master_tables/` + 提供 `master_file()` helper |
| [enums.py](../scripts/master_to_business/enums.py) | #JS 91 项 parameter / 3 math_type / 各 enum 映射 |
| [image_paths.py](../scripts/master_to_business/image_paths.py) | master id → D:/bxb 本地 image path 反查 |
| [copy_images.py](../scripts/master_to_business/copy_images.py) | 数据更新时拷 D:/bxb → `icons/` (含 soul 7 张 fallback 段) |
| [gen_motion_table.py](../scripts/master_to_business/gen_motion_table.py) | `characters.json` → `docs/motion_table.md` (master 改 motion_id 后重跑) |
| [fetch_wiki_acquisition.py](../scripts/master_to_business/fetch_wiki_acquisition.py) | 抓 altema wiki「入手方法」字段、patch 进 `data/crystals.json` (字段 `入手方法`) + `data/bladegraphs.json` (字段 `acquisition`)、按 name 匹配 |
| [dump_npc_motions.py](../scripts/master_to_business/dump_npc_motions.py) | UnityPy 解 `D:/bxb/_dat_cache/assets/npc-motion-*.dat` → `data/_npc_motions.json` (chara motion clip duration、weapons.json 变后重生、小时级) |
| [build_memory_slot_skills.py](../scripts/master_to_business/build_memory_slot_skills.py) | 从 HouseTop response (cross-repo `unpacking/draft/out/account/` + `bxb_wiki/data/omoide/`) → `data/_memory_slot_skills.json` (senzai 反查表、秒级) |

### scripts/ci/ — 云端自动更新数据库 (GitHub Actions, 免模拟器/ADB)

`.github/workflows/update-database.yml` 每天 JST 16:01 + 00:01 跑、纯 HTTP 从游戏 API 拉最新 master 重建业务 JSON。逆向 + 协议见 `unpacking/HOWTO_api_replay.md`。

| 脚本 | 用途 |
|---|---|
| [maken2_api.py](../scripts/ci/maken2_api.py) | 游戏 API 客户端: `login` (设备指纹 + 静态 bootstrap key) → session → `get_master_data` (X-Session 头) / `get_asset_version`。maken2 AES-256-CBC+gzip+msgpack。凭据走 env `BXB_UNIQUE_KEY`/`BXB_BOOTSTRAP_KEY` (GitHub secrets) |
| [master_tables_archive.py](../scripts/ci/master_tables_archive.py) | master dict → `master_data/<JST日期>/` 快照 (split + 派生 weapon_innate_skills/arts/effects) + changelog + 索引。port 自 unpacking split_tables/build_skill_id_index/update_master_tables |
| [diff_master_tables.py](../scripts/ci/diff_master_tables.py) | changelog 引擎 (整体 port 自 unpacking;CI 版加"空字段归一"——API 省略空字段、避免与 ADB 版 schema 差异误报全表) |
| [revise_safety.py](../scripts/ci/revise_safety.py) | revise 字段级安全检查 (防用户手填字段被冲、丢条目/字段则中止提交) |
| [cdn.py](../scripts/ci/cdn.py) | 资源 CDN 客户端 (无鉴权): `current` 版本号 → `version-{ver}.gz` manifest (gzip+msgpack) → `{name}.v{ver}.dat` 资源 |
| [extract_assets.py](../scripts/ci/extract_assets.py) | port parse_unity_dat_v4: `.dat` → PNG / npc-motion 时长。`extract_png` = luma/chroma 配对 YCoCg 合成 + 跳退化贴图(≤4×4/全透明/纯单色)+ 忽略 Sprite 用其 backing Texture2D(本版本 Sprite.image 抛错);无图返回 `[]`(notify/sync 不收) |
| [sync_icons.py](../scripts/ci/sync_icons.py) | manifest 驱动: 缺失 icon → 下 .dat → extract → copy_images。重建结果与本地 copy_images 逐字节一致 |
| [sync_npc_motions.py](../scripts/ci/sync_npc_motions.py) | 增量补 `_npc_motions.json` (manifest npc-motion vs 基线、只下缺的) |
| [run_update.py](../scripts/ci/run_update.py) | 编排: A (master→6 表)、B (fetch_wiki+aux→revise+安全检查)、C (asset-version→icons+npc-motion)、D (快照+changelog)。各模块失败优雅降级 |
| [notify.py](../scripts/ci/notify.py) | 更新后发 Telegram 频道通知: `master_data` changelog → Telegraph 文章、`asset_version` delta → 解 PNG→R2→Telegraph 图册。Telegraph 用固定账号 (secret `TELEGRAPH_TOKEN`) `createPage`,page path 记进 `master_tables/state/telegraph_index.json` (随 data/master-tables 提交);同一快照重生 changelog 时 `editPage` **原地更新** (URL 不变、频道旧链接自动指向新内容、不重发)。无 `TELEGRAPH_TOKEN` 则退回匿名建页 (不可编辑) |

提交去向: data/*.json + `_npc_motions.json` + `icons/` → **main** (→sync 流 data-staging + Pages);crystal_revise/bg_revise → **data-staging** (安全检查通过且有变更);master_data + asset_version 快照 + `state/telegraph_index.json` → **data/master-tables**。`paths.py`/`copy_images.py` 都加了 env 覆盖 (`BXB_MASTER_TABLES`/`BXB_ASSETS_DIR`) 让 CI 指向 checkout/临时目录、本地默认不变。

> asset-version 流程 (2026-06-12 抓包确认、`Maken.HTTP.Get/Download` @ OnePlus): `GET bxb-asset.grimoire.codes/version_lz4/android/current` → 版本号、`/version-{ver}.gz` → manifest、`package_lz4/android/{name}.v{ver}.dat` → 资源,全程**无鉴权纯 CDN**。新动作 (npc-motion) + 新实体图 (icons) 都增量自动补。全量 npc-motion 重生 / 重绘图强刷仍走本地 (罕见)。

---

## shared/ — JS 共享模块

| 模块 | 用途 |
|---|---|
| [stats-calc.js](../shared/stats-calc.js) | hensei 7-stage stat 计算 (HP-curve / Break gate / 4 stage apply / DLB cap / Speed / MotionSpeed / enemy mods)、`ctx.traceEnabled` 时返回 dev trace (stat-trace modal 数据源、见 hensei_calc.md) |
| [hensei-helpers.js](../shared/hensei-helpers.js) | UI 用 lv/觉醒/熟度表 + soulMultiplier / crystalEffectiveValue / crystalMaxBairitu / BlazeGauge 系统 |
| [revise-core.js](../shared/revise-core.js) | sparse diff core (`computeDiff` 三参含撤回 + `deepApply` + tombstone null)。数组 (2026-06-19):带 id 对象数组 (weapon_skills/soul.skills) 按 **id** 局部 patch (robust 到重排);标量数组 (tags)/无 id 数组 (masou effects) 整组替换;已弃用 index 稀疏 |
| [save-client.js](../shared/save-client.js) | POST /save 路由 (local `start.py:8787` / Vercel `/api/save.js`) + toast 反馈 |
| [chara-adapter.js](../shared/chara-adapter.js) / [soul-adapter.js](../shared/soul-adapter.js) / [crystal-adapter.js](../shared/crystal-adapter.js) / [masou-adapter.js](../shared/masou-adapter.js) | master → wiki shape adapter (含 `deepApply(master, revise)` wrap) |
| [image-paths.js](../shared/image-paths.js) | master id → `icons/` 相对路径 + `charaIconStack` 叠层 helper (marriage 框 + element + weapon_type、含 `lazy: 'native'\|'io'` 选项) |
| [virtual-list.js](../shared/virtual-list.js) | 简单 virtual scrolling、屏幕外 row 不在 DOM、用在 cr-list / bg-list (2063+506 expand all 不卡) |
| [lazy-img.js](../shared/lazy-img.js) | IntersectionObserver-based img lazy、`setupLazyImg(scrollRoot)` swap `data-src→src`、适用自定义 scroll 容器 (native HTML5 lazy 只看 document viewport、容器 scroll 失效) |
| [constants.js](../shared/constants.js) | PARAMETER (91) / MATH_TYPE / RANGE / ELEMENT / WEAPON / CONDITION 等 enum |
| [parameter-class.js](../shared/parameter-class.js) | PARAMETER_CLASS (35 类効果分类) + PARAMETER_CLASS_LABEL/SHORT |
| [filter-core.js](../shared/filter-core.js) | viewer filter 通用 utility (applySpec / renderSpecFilters / sort / reset) |
| [chara-spec.js](../shared/chara-spec.js) / [soul-spec.js](../shared/soul-spec.js) / [crystal-spec.js](../shared/crystal-spec.js) / [bg-spec.js](../shared/bg-spec.js) | 4 viewer 各自 filter spec (facet / sort options) |
| [data-loader.js](../shared/data-loader.js) | fetch data/*.json (cache + loadAll) |

---

## js/ — viewer 业务代码

5 viewer 各自一套 list / render / edit + 公共 nav / utils / state:

| 模块 | 用途 |
|---|---|
| `js/nav.js` | 顶部 navbar + revise bar (未保存 N 条修正) |
| `js/utils.js` | DOM / 字符串 / 数字格式 utility |
| `js/state.js` | 全局 state (allCharas / allSouls / 各 reviseData / sessionReviseIds 等) |
| `js/render.js` | chara list/render (主 viewer) |
| `js/edit.js` / `chara-edit.js` | chara edit modal (tags + skills value_scaling + masou_overrides) |
| `js/soul-render.js` / `soul-edit.js` | soul viewer + tags edit |
| `js/cr-list.js` / `cr-edit.js` / `cr-state.js` | crystal viewer + inline 8 字段 edit |
| `js/bg-list.js` / `bg-edit.js` | bladegraph viewer + edit module (用户决策保留、HTML 暂不暴露按钮) |
| `js/omoide-view.js` | omoide picker modal (hensei + chara 详情页用) |

hensei calc 主入口在 [pages_src/hensei.html](../pages_src/hensei.html) 内、调用 `shared/stats-calc.js`。

---

## data/ — 业务 JSON

**Master 数据** (build_*.py 输出):
- `characters.json` (654 chara) / `souls.json` (488) / `crystals.json` (2063) / `bladegraphs.json` (506) / `masou.json` (712) / `senzai_table.json` / `motions.json`
- `guildtitles.json` / `guildemblems.json` (手工维护、无 build script)
- `omoide/{base_id}.json` (638 file、Frida 抓、2026-06-09 起入 git tracked)

**Revise** (用户编辑产物、4 bucket):
- `chara_revise.json` / `soul_revise.json` / `crystal_revise.json` / `masou_revise.json`

**Audit / 一次性产物**:
- `_wiki_aux.json` — 一次性 wiki 提取 (crystal_max_value + chara_tags + chara_skill_value_scaling + masou_value_scaling)、永不重跑
- `_audit_crystals_null_math.json` — math_type 反查失败的 crystal audit
- `_wiki_unmatched_crystals.json` — wiki_aux 未匹配的 crystal audit

---

## Dev server / Build / Test

| 命令 | 用途 |
|---|---|
| `python scripts/start.py` | 本地 dev server (端口 8787) + `POST /save` endpoint 写回 `data/*_revise.json` |
| `node scripts/serve.js` | 纯静态 dev server (不含 /save) |
| `node scripts/build.js` | 全量 build (`pages_src/` + fragments → `pages/`)、用户开 `--watch` 模式自动重 build |
| `npm test` | 264/264 单测 (tests/unit/) |
| `npx playwright test` | UI e2e (tests/ui/、5 viewer 渲染 + hensei 装备联动) |

**保存流程**:
1. viewer edit mode → `computeDiff(orig, edit, prev)` → 入 `state.reviseData[id]` + `sessionReviseIds.add`
2. 顶部 revise bar 显示 "未保存 N 条修正"、点 "保存" → `submitRevise(body)` POST /save
3. local: `start.py` deep merge 入 `data/*_revise.json` + 写盘
4. Vercel 生产: `/api/save.js` 推 `data-staging` branch + 自动 PR
5. `data-staging` branch 单向积累、不合回 main (本 branch 是 refactor/unpacking-source、user memory 决策)

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

# 4. (按需) 拷 D:/bxb 图标 → icons/ (含 soul 7 张 fallback)
python scripts/master_to_business/copy_images.py

# 5. (按需) chara master 改 motion_id 后重新生成 motion table
python scripts/master_to_business/gen_motion_table.py
```

## Cleanup 历史 (2026-06-09)

本次清理:
- 删 `scripts/master_to_business/migrate_old_revise.py` (一次性 init、跑过了)
- 删 `data/bd_special.json` + `data/bd_special_durations.json` (wiki 时代残留)
- 删 整个 `draft/` 目录 (12 file、2026-05 早期临时工作)
- 重写本文件
- 新增 `fetch_wiki_acquisition.py` (反复使用、抓 wiki「入手方法」字段 patch crystal/bg)
