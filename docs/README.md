# docs/ 索引

本目录 4 份 tracked 文档的分工。改代码前先看 [structure.md](structure.md) 定位模块,改计算逻辑前看
[hensei_calc.md](hensei_calc.md) 确认 stage 顺序,改数据字段前看 [schema.md](schema.md)。

| 文档 | 内容 | 什么时候看 |
|---|---|---|
| [structure.md](structure.md) | **项目结构地图** —— `shared/` `js/` `data/` `scripts/` `api/` 各模块职责、build pipeline、CI workflow、短链/存档等子系统 | 找「某个功能在哪个文件」 |
| [hensei_calc.md](hensei_calc.md) | **编成 stat 计算流水线** —— base 公式、4-stage apply 顺序、各 source 的 stage 位次、転速/攻速/Hit/ダメ上限 的独立算法、trace stage 清单 | 改 `shared/stats-calc.js` 或对数值有疑问 |
| [schema.md](schema.md) | **数据字段规范** —— master_tables 各表字段含义、server-fold vs client-PSV 分工、business JSON 的形状约定 | 改 `scripts/master_to_business/build_*.py` 或 `data/*.json` 结构 |
| [senzai_icon_table.md](senzai_icon_table.md) | **潜在開放 icon 対照表** —— 旧 wiki 的 icon id → 効果名/詳細/倍率/熟度補正/算法/分類 | 查旧 wiki latent icon 的含义 |

本目录另有几份 **untracked**(.gitignore 排除、只在本机)的参考:`local_env.md`(占位符 →
本机实际路径)、`motion_table.md`(`gen_motion_table.py` 生成)、`crystal_factor_infer.md`
(結晶三因子反推报告)、`*_doc_cn.md`(游戏客户端细节、不入公开仓库)。

## 跨 repo 引用约定

`schema.md` / `hensei_calc.md` 里形如 `../../unpacking/docs/HOWTO_battle/*.md` 的链接指向**另一个 repo**
(`unpacking/`,与本 repo 同级、内含 Frida 抓包 + 逆向文档)。它不在本仓库里,所以这些链接在 GitHub 上
打不开、只在本地完整签出时可用。目录布局见
[scripts/master_to_business/paths.py](../scripts/master_to_business/paths.py) 的 docstring。
