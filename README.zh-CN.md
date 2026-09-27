# BxB Wiki

[English](README.md) | **简体中文** | [日本語](README.ja.md)

手游《**勇气之剑×火焰之魂**》（ブレイブソード×ブレイズソウル）的非官方 wiki 与编成计算器，
收录 4,500 多条游戏数据。网站界面为日语。

**网站：** https://he1lscythe.github.io/bxb_calculator/

## 功能

- **数据库**：魔剣（角色）、結晶、心象結晶、ソウル，支持筛选、排序，每个技能都按效果、
  作用范围和发动条件打了标签。魔装（服装）数据用在角色页和编成计算器里。
- **编成计算器（編成）**：按游戏本身的规则分阶段计算队伍属性，模拟公会战伤害和得分。
- **结晶模拟器**：调整等级、重量、纯度和剩余 HP，查看结晶倍率的变化。
- **分享**：队伍可以导出为短链接、分享码或 JSON 文件。
- **社区修正**：在浏览器里修改条目并提交，修改会以 pull request 的形式等待审核。

## 工作原理

```
游戏主数据表（由单独的流水线同步到 Cloudflare R2）
        │
        ▼
scripts/master_to_business/build_*.py   Python：原始数据表 → 网站用的 JSON
        │
        ▼
data/*.json  +  *_revise.json            审核通过的社区修正
        │
        ▼
shared/*-adapter.js                      把修正合并进主数据
        │
        ▼
pages/*.html  +  js/  +  shared/         静态页面和编成计算器
```

- **前端**：纯 HTML、CSS 和 JavaScript，不用框架。`scripts/build.js` 把 `pages_src/` 组装成
  `pages/`。长列表用自己写的虚拟滚动（`shared/virtual-list.js`），结晶列表 2,000 多行全部展开也不卡；
  图片懒加载。
- **修正**：`shared/revise-core.js` 把每次修改转成稀疏 diff。在线上网站，`api/save.js`
  （Vercel serverless 函数）把 diff 合并进 `data-staging` 分支，并用 Octokit 开 pull request。
- **短链接**：`api/share.js` 把队伍的分享串存进 Upstash Redis，key 由内容决定
  （SHA-256 经 base64url 编码后的前 10 个字符），所以同一个队伍总是得到同一个链接。
- **CI（GitHub Actions）**：
  - `test.yml`：每次 push 和 pull request 都跑单元测试和 ESLint。
  - `ui.yml`：跑 Playwright 端到端测试。
  - `update-database.yml`：每次上游同步后重建数据，有变化才提交。
  - `sync-main-to-staging.yml`：让 `data-staging` 跟上 `main`。
  - `pages-retry.yml`：GitHub Pages 部署失败时自动重跑。

## 技术栈

JavaScript · HTML/CSS · Python · Node.js · Vercel serverless functions · Upstash Redis ·
GitHub Actions · GitHub Pages · Playwright · ESLint · Prettier

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `pages_src/` | 各页面的 HTML 源文件 |
| `pages/` | 构建后的页面（已提交，直接部署） |
| `js/` | 页面逻辑：列表、渲染、编辑模式、筛选 |
| `shared/` | 共享模块：属性计算、diff 引擎、虚拟列表、adapter、效果标签 |
| `data/` | 网站读取的 JSON（由流水线生成） |
| `icons/` | 游戏图标 |
| `api/` | Vercel serverless 函数（`save.js`、`share.js`） |
| `scripts/` | 构建脚本、本地开发服务器、数据流水线 |
| `tests/unit/` | 单元测试（`node:test`） |
| `tests/ui/` | Playwright 端到端测试 |
| `docs/` | 设计文档：项目结构、数据格式、属性计算 |

## 本地运行

需要 Node.js 20.19+ 和 Python 3。

```bash
npm ci
python scripts/start.py      # http://127.0.0.1:8787/pages/characters.html
```

`start.py` 还提供本地的 `/save` 接口，会把修正写进 `data/*_revise.json`。只需要静态服务器的话，
运行 `node scripts/serve.js`（http://127.0.0.1:8765/）。

`pages/` 已经提交在仓库里，只有改了 `pages_src/` 才需要重新构建：

```bash
npm run build:local          # 或：npm run watch
```

## 测试

```bash
npm test                          # 单元测试
npx playwright install chromium   # 仅首次需要
npm run test:ui                   # 端到端测试（会在 :8765 启动 scripts/serve.js）
npm run lint
```

截至 2026 年 9 月，共有 345 个单元测试和 91 个端到端测试。

## 数据更新

构建脚本读取游戏的主数据表，这些数据表不放在本仓库里。`data/` 里生成好的 JSON 已经提交，
所以网站和测试不依赖它们。要在本地重建，把 `BXB_MASTER_TABLES` 指向主数据表所在的文件夹，然后运行：

```bash
pip install -r scripts/ci/requirements.txt
python scripts/master_to_business/build_all.py
```

## 致谢

- 获取方式和部分效果数值参考了 [altema](https://altema.jp/) wiki。

## 免责声明

本项目是非官方的粉丝作品，与《勇气之剑×火焰之魂》的开发商和发行商无关，也未获其认可。
游戏名称、图像和数据归各自权利人所有。
