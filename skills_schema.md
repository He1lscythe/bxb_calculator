# BxB 技能分类 JSON 数据结构文档

---

## crystals.json — 記憶結晶データ

```json
[
  {
    "id":       int,      // 結晶唯一ID（同时用于图片URL）
    "name":     string,   // 結晶名称
    "rarity":   int,      // 稀有度: 1–6
    "効果":     string,   // 効果原文
    "効果量":   string?,  // 効果量テキスト（例 "1.13～5倍"）
    "特殊条件": string?,  // キャラ限定条件文（如有，同 effects[0].name）
    "対象":     string?,  // 効果対象テキスト（例 "火のみ"、"光の騎槍のみ"）
    "上限値":   string?,  // 効果上限ランク
    "入手方法": string?,  // 入手途径
    "effects": [
      {
        "bunrui":      int[],   // 效果分类（见 bunrui 表；可多个，OR条件时亦同列表）
        "scope":       int,     // 见 scope 统一对照表（0/2/3/5）
        "element":     int?,    // scope=3 且属性限定时存在（int，见 element 表）
        "type":        int?,    // scope=3 且武器限定时存在（int，见 type 表）
        "name":        string?, // scope=5 时存在，值与顶层 特殊条件 相同
        "effect_min":  float?,  // 最小效果量
        "effect_max":  float?,  // 最大效果量
        "or":          true?,   // 存在时表示 bunrui 为 OR 关系（如攻撃力UPor速度UP）
        "calc_type":   0|1      // 倍率计算方式
      }
    ]
  }
]
```

> 图片URL：`https://img.altema.jp/bxb/kioku_kessyou/icon/{id}.jpg`
>
> **scope 推断规则**：① `特殊条件` 非空 → scope=5 ② 効果文に `同装備セット` → scope=2 ③ `element` 或 `buki_type` 非0 → scope=3 ④ 其余 → scope=0

---

## bladegraph.json — 心象結晶データ

```json
[
  {
    "id":          int,      // 心象結晶唯一ID
    "name":        string,   // 名称
    "rarity":      int,      // 稀有度: 1–5
    "time_start":  string?,  // 时间限定开始（如 "20:00"；无时间条件则不存在）
    "time_end":    string?,  // 时间限定结束（如 "23:00"）
    "acquisition": string,   // 入手途径
    "illustrator": string?,  // イラスト担当（如有）
    "effect":      string,   // 効果原文（含限定标记，如【辰王ヒメミズチのみ】）
    "effects": [
      {
        "bunrui":    int[],   // 效果分类（单元素列表，每条 effects 对应一个 bunrui）
        "scope":     int,     // 见 scope 对照表（0/3/5）
        "condition": int,     // 发动条件: 0=无条件 1=浑身 2=背水
        "bairitu":   float,   // 倍率（如 25%UP → 1.25）
        "calc_type": 0|1,     // 倍率计算方式（心象結晶均为 0 乘算）
        "element":   int?,    // scope=3 且属性限定时存在（int，见 element 对照表）
        "type":      int?,    // scope=3 且武器限定时存在（int，见 type 对照表；0=全武器）
        "name":      string?  // scope=5 时存在，值为限定魔剣名
      }
    ]
  }
]
```

> 图片URL：`https://img.altema.jp/bxb/blade_graph/icon/{id}.jpg`
>
> **effects 拆分规则**：效果文以 ` & ` 分段；每段匹配到的每个 bunrui 各生成一条 effects 条目。双效果（如「サファイア量とモーション速度が30%UP」）拆为两条，各持相同 bairitu。

---

## souls.json — 魂データ（含技能分类）

```json
[
  {
    "id":        int,      // 魂唯一ID（同时用于图片URL）
    "name":      string,   // 魂名称
    "kana":      string,   // 读音，用于搜索
    "rarity":    int,      // 星级 1–5
    "max_level": int,      // 最大等级
    "url":       string,   // altema wiki页面URL
    "image":     string,   // banner图片URL (https://img.altema.jp/bxb/soul/banner/{id}.jpg)
    "element":   int[],    // 得意属性ID列表（level >= 1），由 element_affinity 推算
    "type":      int[],    // 得意武器ID列表（level >= 1），由 weapon_affinity 推算
    "element_affinity": {
      "火" | "水" | "風" | "光" | "闇" | "無": {
        "level":  int,    // 适性等级: -2=超苦手 -1=苦手 0=普通 1=得意 2=超得意
        "effect": float   // 实际倍率（默认1，预留给用户填写）
      }
    },
    "weapon_affinity": {
      "長剣" | "大剣" | ... | "大鎌": {
        "level":  int,
        "effect": float
      }
    },
    "skills": [
      {
        "name":    string,  // 技能名（含【】）
        "effect":  string,  // 效果原文
        "effects": [
          {
            "bunrui":    int[],  // 效果分类（见下表，与魔剣相同）
            "scope":     int,    // 效果范围: 0=自身无条件 1=全体无条件 3=装備条件→自身 4=装備条件→全体
            "element":   int|int[]?,  // scope=3/4 且属性限定时存在，多属性时为数组
            "type":      int|int[]?,  // scope=3/4 且武器限定时存在，多武器时为数组
            "condition": int,    // 发动条件: 0=无条件 1=浑身 2=背水 3=破損
            "bairitu":   float,  // 倍率（乘率型: UP值+1，例 77%UP→1.77）
            "calc_type": 0|1    // 倍率计算方式: 0=乘算（乘以 bairitu）1=加算（加上 bairitu）
          }
          // 一个技能可有多个 effects 条目，每条对应一种效果
        ]
      }
    ],
    "acquisition": { string: string }  // 入手方法
  }
]
```

> **element / type 推算规则**：`element_affinity` / `weapon_affinity` 中 `level >= 1`（得意・超得意）的 ID 升序排列。过滤器仅使用这两个字段。

---

## characters_classified.json — 完整魔剑数据（含技能分类）

```json
[
  {
    "id":       int,      // 魔剣唯一ID
    "name":     string,   // 魔剣名称
    "rarity":   int,      // 稀有度: 3=★3, 4=★4
    "element":      int,      // 属性 (见下表)
    "type":         int,      // 武器种 (见下表)
    "element_buff": int[],    // 可接受 buff 的属性ID列表; 默认=[element]; 有"他魔剣からのスキル効果を受けられる"技能时扩展; 全属性=[1,2,3,4,5,6]
    "states": {
      "改造" | "通常": {
        "skills": [
          {
            "name":             string,  // 技能名
            "effect":           string,  // 效果原文
            "effects": [
              {
                "bunrui":           int[],   // 效果分类，可多个 (见下表)
                "scope":            int,     // 效果对象范围: 0=自身 1=全体 2=条件全体（属性/武器限定）
                "element":          int|int[]?,  // 仅当 scope=2 且限定属性时存在，多属性时为数组
                "type":             int|int[]?,  // 仅当 scope=2 且限定武器种时存在，多武器时为数组
                "condition":        int,     // 发动条件: 0=无条件 1=浑身 2=背水 3=破損
                "bairitu":          float,   // 倍率
                "bairitu_scaling":  float,   // 熟度每级增量（0 表示固定值）
                "calc_type":        0|1      // 倍率计算方式: 0=乘算（乘以 bairitu）1=加算（加上 bairitu）
              }
            ]
          }
        ],
        "bd_skill":   { "name": string, "effect": string, "cost": int },
        "basic_info": { ... }
      }
    }
  }
]
```

---

## element 属性对照表

| element | 属性 |
|---------|------|
| 1 | 火 |
| 2 | 水 |
| 3 | 風 |
| 4 | 光 |
| 5 | 闇 |
| 6 | 無 |

---

## type 武器种对照表

| type | 武器 |
|------|------|
| 1 | 長剣 |
| 2 | 大剣 |
| 3 | 太刀 |
| 4 | 杖棒 |
| 5 | 弓矢 |
| 6 | 連弩 |
| 7 | 戦斧 |
| 8 | 騎槍 |
| 9 | 投擲 |
| 10 | 拳闘 |
| 11 | 魔典 |
| 12 | 大鎌 |

> **注意**：`風魔典` 不是独立的武器种，而是 風(element:3) + 魔典(type:11) 的双条件。出现 `風魔典の魔剣` 时，分类结果为 `scope:2, element:3, type:11`。

---

## scope 范围对照表（统一）

所有数据（魔剣技能 / 魂技能 / 記憶結晶 / 心象結晶）共用同一套 scope 编码，含义相同：

| scope | 含义 | element | type | name | 适用数据 |
|-------|------|---------|------|------|---------|
| 0 | 全体 / 制限なし | 无 | 无 | 无 | 全て |
| 1 | 自分のみ（装備キャラ自身） | 无 | 无 | 无 | characters, souls |
| 2 | 同装備セット全体 | 无 | 无 | 无 | 全て |
| 3 | 特定属性/武器種限定 | 属性限定時存在，多属性为数组（characters/souls）或单值 int（crystals/bladegraph） | 武器限定時存在，同上 | 无 | 全て |
| 4 | 特定キャラ群（装備条件を満たす全セット） | 同 scope=3 | 同上 | 无 | characters, souls |
| 5 | 特定キャラ限定 | 无 | 无 | 魔剣名 / キャラ名（str） | 全て |

**各データの検出ロジック**：
- **characters.json 魔剣技能**：scope=0/1 は classify ロジックが判断；scope=2 は `同装備セット` キーワード
- **souls.json 魂技能**：scope=3/4 は `装備で` 等のキーワードと全队关键词で判定
- **crystals.json 記憶結晶**：① `特殊条件` 非空 → scope=5 ② `同装備セット` in 効果 → scope=2 ③ element/buki_type 非0 → scope=3 ④ 其余 → scope=0
- **bladegraph.json 心象結晶**：① `data-contents.type` 非空（単一武器）→ scope=3 ② `data-contents.zokusei` 非0 → scope=3 ③ `【〇〇のみ】` かつ属性/武器名でない → scope=5 ④ 其余 → scope=0

---

## bunrui 效果分类表

| bunrui | 效果名 | 备注 |
|--------|--------|------|
| 1 | 攻撃力UP | |
| 2 | ブレイク力UP | |
| 3 | BD攻撃力UP | |
| 4 | スピードUP | |
| 5 | 攻撃モーションUP | |
| 6 | BDゲージUP | 无明确目标时 scope 默认为 1（全体） |
| 7 | ヒット数UP | |
| 8 | 攻撃全体化 | |
| 9 | 状態異常回避 | |
| 10 | HPUP | |
| 11 | HP回復 | |
| 12 | 防御力UP | |
| 13 | 被ダメ軽減 | |
| 14 | サファイアUP | |
| 15 | ルビーUP | |
| 16 | その他 | |
| 17 | ダメージ上限UP | |
| 18 | ゲージ最大値UP | 无明确目标时 scope 默认为 1（全体） |
| 19 | 結晶枠UP | |
| 20 | 獲得EXPUP | |
| 21 | BDヒット数UP | 效果文含 B.D.ヒット 时单独分类，不归入 bunrui 7 |

---

## calc_type 倍率计算方式对照表

| calc_type | 含义 | 典型例 |
|-----------|------|--------|
| 0 | 乘算（multiplicative）：基础值 × bairitu | 攻撃力 50%UP → bairitu=1.5 |
| 1 | 加算（additive）：基础值 + bairitu | ヒット数+3 → bairitu=3 |

`calc_type` 在以下四类数据中均有使用，编码含义相同：

| 数据源 | 推断规则 |
|--------|---------|
| `characters_classified.json` 魔剣技能 | 由效果文字正则模式决定；无法识别时按 bunrui 判断（ADD_BUNRUI → 1） |
| `souls.json` 魂技能 | 同上，按各 effects 条目独立判断 |
| `senzai_table.json` 潜在能力 | bairitu 为小数且 0 < bairitu < 10（如 1.05）→ 0；否则 → 1 |
| `crystals.json` 記憶結晶 | bunrui ∈ {6,7,9,11,16,17,19} → 1；其余 → 0 |

---

## condition 发动条件对照表

| condition | 含义 | 触发文本特征 |
|-----------|------|-------------|
| 0 | 无条件 | — |
| 1 | 浑身（HP越多效果越高） | 残HPが多いほど / 損傷率が低いほど |
| 2 | 背水（HP越少效果越高） | 残HPが少ないほど / 損傷率が高いほど / HPを消耗するほど |
| 3 | 破損（HP低于50%触发） | 破損状態 |

---

## altema.jp bunrui 对照表（魔剣技能 skilllist）

altema skilllist 页面（`/bxb/skilllist`）`data-value.bunrui` 与我们的 bunrui 对应关系：

| altema ID | 名称 | 我们的 bunrui |
|-----------|------|--------------|
| 1 | 攻撃力UP | 1 |
| 2 | 防御力UP | 12 |
| 3 | HP上昇 | 10 |
| 4 | スピードUP | 4 |
| 5 | BD攻撃力UP | 3 |
| 6 | 即死（回避） | 9 |
| 7 | 勇気分解（回避） | 9 |
| 8 | 行動不能（回避） | 9 |
| 9 | 割合ダメージ（回避） | 9 |
| 10 | HP回復 | 11 |
| 11 | 復活 | 16 |
| 12 | ブレイズゲージ回復 | 6 |
| 13 | ルビーUP | 15 |
| 14 | ヒット数UP | 7 |
| 15 | 魔導バリア強化 | 13 |
| 16 | サファイアUP | 14 |
| 17 | モーション速度UP | 5 |
| 18 | クリティカル | 16 |
| 19 | 全体攻撃 | 8 |
| 20 | 属性不一致効果 | 16 |
| 21 | ブレイク力 | 2 |
| 22 | 麻痺（回避） | 9 |
| 23 | 修理短縮 | 16 |
| 24 | 能力低下 | 16 |
| 25 | ソウルEXP | 20 |
| 26 | BDゲージ最大値UP | 18 |
| 27 | BDロック | 16 |
| 28 | スキル付与 | 16 |
| 29 | BDヒット数UP | 21 |
| 30 | サファイア減少 | 14 |
| 31 | BDコストダウン | 16 |
| 32 | アイテム量UP | 16 |
| 33 | 命中率UP | 16 |
| 34 | ダメージ上限UP | 17 |
| 35 | BDレベル上限UP | 18 |
| 36 | 被弾率減少 | 16 |
| 37 | BDゲージ上昇効率UP | 6 |
| 38 | 記憶結晶EXPUP | 19 |
| 39 | 自傷 | 16 |

---

## altema.jp ソウルスキル category_id 对照表（魂技能 soulskill）

altema soulskill 页面（`/bxb/soulskill`）`data-obj.category_id` 与我们的 bunrui 对应关系。
DOWN 系归入同一 bunrui，用 bairitu 表达方向（乘率型 < 1，加算型为负值）。

| category_id | 名称 | 我们的 bunrui | 备注 |
|-------------|------|--------------|------|
| 1 | 攻撃力UP | 1 | |
| 2 | 防御力UP | 12 | |
| 3 | スピードUP | 4 | |
| 4 | モーション速度UP | 5 | |
| 5 | BD攻撃力UP | 3 | |
| 6 | ブレイク力UP | 2 | |
| 7 | 攻撃ヒット数UP | 7 | |
| 8 | BDヒット数UP | 21 | |
| 9 | 命中率UP | 16 | 无独立分类 |
| 10 | 回避率UP | 16 | |
| 11 | BDゲージUP | 6 | |
| 12 | HP UP | 10 | |
| 13 | ルビーUP | 15 | |
| 14 | サファイアUP | 14 | |
| 15 | 攻撃力DOWN | 1 | bairitu < 1（例: 20%DOWN → 0.80） |
| 16 | 防御力DOWN | 12 | |
| 17 | スピードDOWN | 4 | 常见于代价型技能 |
| 18 | モーション速度DOWN | 5 | |
| 19 | ブレイク力DOWN | 2 | |
| 20 | 攻撃ヒット数DOWN | 7 | bairitu 为负值（例: -2） |
| 21 | BD攻撃力DOWN | 3 | |
| 22 | BDヒット数DOWN | 21 | |
| 23 | 命中率DOWN | 16 | |
| 24 | 回避率DOWN | 16 | |
| 25 | HPDOWN | 10 | HP消耗型代价 |
| 26 | ルビーDOWN | 15 | |
| 27 | サファイアDOWN | 14 | |
| 28 | 攻撃全体化 | 8 | |
| 29 | 麻痺回避/無効 | 9 | |
| 30 | 即死回避/無効 | 9 | |
| 31 | 勇気分解回避/無効 | 9 | |
| 32 | クリティカル | 16 | |
| 33 | BDコスト+ | 16 | |
| 34 | BDコスト- | 16 | |
| 35 | バリア強化 | 13 | |
| 36 | 行動不能(スタン)回避/無効 | 9 | |
| 37 | 割合攻撃回避/無効 | 9 | |
| 38 | 攻撃力ランダム | 16 | |
| 39 | モーション速度ランダム | 16 | |
| 40 | 属性反転 | 16 | |
| 41 | 復活 | 16 | |
| 42 | 魔剣使い経験値UP | 20 | |
| 43 | HP回復 | 11 | |
| 44 | 特定の魔剣対象 | — | 仅影响 scope/element/type，不对应 bunrui |
| 45 | アイテム量UP | 16 | |
| 46 | 記憶結晶経験値DOWN | 16 | |
| 47 | ダメージ上限UP | 17 | |

---

## element_id 特殊说明

| 值 | 含义 | 备注 |
|----|------|------|
| 1〜6 | 火水風光闇 + 無属性 | 与 filter 标签 value 相同 |
| 7 | 无属性（别ID） | data-obj 内有时用 7 而非 6 |
| 9, 11 | 投擲(type 9)・魔典(type 11) | OR条件武器种混入 element_id 的情况 |

---

## 技能分类流程（classify_common.py）

分类逻辑统一在 `classify_common.py`，两个脚本共用。

### 两步法（Two-Pass）

**Step 1 — lookup 表（主）**
- 魂技能：以 `skill_name + skill_effect` 为 key 查 `soulskill_table.json`，得到 soulskill `category_id` 列表，通过 `CAT_TO_BUNRUI_SOULSKILL` 映射为 bunrui
- 魔剣技能：同上查 `skilllist_table.json`，通过 `CAT_TO_BUNRUI_SKILLLIST` 映射

**Step 2 — 关键词扫描（补）**
- 调用 `classify_effect()` 对效果文本做关键词匹配
- 已被 Step 1 覆盖的 bunrui 跳过，只补充新增的

### 魂 vs 魔剣的结构差异

| 项目 | 魂（souls.json） | 魔剣（characters_classified.json） |
|------|-----------------|-----------------------------------|
| effects 条目数 | 每个 bunrui 一条 | 单条（effects[0]） |
| bairitu 来源 | 按 bunrui 关键词位置提取 | SKILL_TABLE 或效果文本提取 |
| bairitu_scaling | 无 | 有（熟度每级增量） |

### lookup 表构建

| 文件 | 来源 | 构建方法 |
|------|------|---------|
| `soulskill_table.json` | altema `/bxb/soulskill` 页面（本地存为 `soulskill.html`） | 解析 `data-obj` 属性 |
| `skilllist_table.json` | altema `/bxb/skilllist` 页面（本地存为 `skilllist.html`） | 解析 `data-value` 属性，效果文本取 `<br>` 前内容 |

---

## 爬虫脚本参数

| 参数 | 网络爬取 | 技能分类/倍率重算 |
|------|---------|----------------|
| 不加参数 | 只爬新增数据 | 只重算新增数据 |
| `--recal` | 只爬新增数据 | 全部重算 |
| `--rerun` | 全部重新爬取 | 全部重算 |

适用于 `crawl_soul.py` 和 `crawl_chara.py`。`crawl_crystal.py` 为单页全量抓取，三种模式行为相同。
