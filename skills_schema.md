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
        "bunrui":      int[],   // 效果分类（见 bunrui 表）
        "scope":       int,     // 见 scope 统一对照表（0/1/2/3/5）
        "element":     int?,    // scope=2/3 且属性限定时存在（int，见 element 表）
        "type":        int?,    // scope=2/3 且武器限定时存在（int，见 type 表）
        "name":        string?, // scope=5 时存在，值与顶层 特殊条件 相同
        "condition":   int,     // 发动条件: 0=无条件 1=浑身 2=背水 3=破損
        "bairitu_init": float?, // 初始效果量（最小值）
        "bairitu":     float?,  // 最大效果量（满级时）
        "calc_type":   0|1      // 倍率计算方式
      }
    ]
  }
]
```

> 图片URL：`https://img.altema.jp/bxb/kioku_kessyou/icon/{id}.jpg`
>
> **scope 推断规则**：① `特殊条件` 非空 → scope=5 ② 効果文に `同装備セット` → 有属性/武器词 → scope=2（加 element/type）；无 → scope=1 ③ `element` 或 `buki_type` 非0 → scope=3 ④ 其余 → scope=0

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

## characters.json — 完整魔剑数据（含技能分类）

```json
[
  {
    "id":            int,     // 魔剣唯一ID（URL用ID）
    "sort_id":       int,     // 列表排序ID（listページのID；部分魔剣は id と異なる）
    "name":          string,  // 魔剣名称
    "rarity":        int,     // 稀有度: 1=A 2=AA 3=S 4=SS
    "element":       int,     // 属性 (见下表)
    "element_buff":  int[],   // 可接受 buff 的属性ID列表; 默认=[element]; 全属性=[1,2,3,4,5,6]
    "type":          int,     // 武器种 (见下表)
    "url":           string,  // altema 页面URL
    "omoide_rarity": int,     // 好感稀有度: 1=A 2=AA 3=S 4=SS 5=限定SS（手动via revise）
    "omoide_template": string?,  // 潜在模板key（omoide_templates.json中的key；可选）
    "bd_skill": {              // ブレイズドライブ技能（取最优状态：極弐>改造>通常）
      "name":     string,      // 技能名
      "effect":   string,      // 效果原文
      "cost":     int,         // 消費レベル
      "bdhit":    int,         // 连击数（从 {N}連 解析；无则1）
      "duration": string,      // buff持续时间: "30s" | "3wave" | "1wave" | "数秒" | ""
      "effects": [             // buff效果结构（同技能effects格式）
        { "bunrui": int[], "scope": int, "condition": int, "bairitu": float, "calc_type": 0|1 }
      ],
      "special":  int[]        // BD特殊効果ID列表（见 bd_special 表）；无则 []
    },
    "states": {
      "極弐" | "改造" | "通常": {
        "skills": [
          {
            "name":             string,
            "effect":           string,
            "effects": [
              {
                "bunrui":           int[],
                "scope":            int,     // 0=自身 1=全体 2=条件全体（属性/武器限定）
                "element":          int|int[]?,
                "type":             int|int[]?,
                "condition":        int,     // 0=无 1=浑身 2=背水 3=破損
                "bairitu":          float,
                "bairitu_scaling":  float,   // 熟度每级增量（0=固定）
                "calc_type":        0|1
              }
            ]
          }
        ],
        "stats":      { "max": {...}, "initial": {...} },
        "basic_info": { ... },
        "profile":    { ... }
      }
    },
    "omoide": [
      {
        "threshold": int,   // 好感度閾値（10/200/400/700/1000/2000/...）
        "slots":     int[]  // senzai_table icon ID 列表
      }
    ]
  }
]
```

> **omoide_rarity → 好感稀有度对照**：A=1, AA=2, S=3, SS=4, 限定SS=5。爬虫按 rarity 自动赋值（SS=4），限定SS=5 需手动通过 revise 修改。
>
> **omoide 槽位推算规则**（`fill_omoide_slots`）：star1=threshold10、star2=threshold400、star3=threshold1000（若1000槽数≠400槽数则视为特殊槽，star3由star2各icon+偏移量推算：攻/防/HP/BD攻+6, BK力+4, 速度UP+1）。其余阈值按 omoide_rarity 和改造結晶スロット数 k 推算。详见 structure.md JS 同步机制章节。

---

## bd_special 特殊効果対照表

| special ID | 効果名 | 検出方法 |
|---|---|---|
| 1 | 時止め | altema.jp/bxb/tokitomebd ページ |
| 2 | 麻痺 | altema.jp/bxb/mahibd ページ |
| 3 | 強制ブレイク | 效果文テキスト検索（`強制ブレイク`） |
| 5 | 弱体解除 | 效果文テキスト検索（`弱体化解除` / `弱体化を解除`） |
| 6 | 高倍率バフ | altema.jp/bxb/buffbd ページ |

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

## effects[] 字段对照表

各数据源 effects 数组的字段分布。`✓` 表示所有条目均有此字段，`条件` 表示特定 scope 值时才出现，`—` 表示该数据源不存在。

| 字段 | characters | souls | bladegraph | crystals | 说明 |
|------|------------|-------|------------|---------|------|
| `bunrui` | ✓ | ✓ | ✓ | ✓ | `int[]`，效果分类（见 bunrui 表） |
| `scope` | ✓ | ✓ | ✓ | ✓ | `int`，见 scope 表 |
| `condition` | ✓ | ✓ | ✓ | ✓ | `int`，见 condition 表 |
| `bairitu` | ✓ | ✓ | ✓ | ✓ | `float`，效果值 / 倍率（满级） |
| `calc_type` | ✓ | ✓ | ✓ | ✓ | `0\|1`，见 calc_type 表 |
| `element` | scope=2时 | scope=3/4时 | scope=3时 | scope=2/3时 | `int`，属性限定（见 element 表） |
| `type` | scope=2时 | scope=3/4时 | scope=3时 | scope=2/3时 | `int`，武器种限定（见 type 表） |
| `name` | — | — | scope=5时 | scope=5时 | `string`，限定魔剣名 / キャラ名 |
| `bairitu_init` | — | — | — | 有区间时 | `float`，效果初始值（最小值，对应 1 ★）；缺失时与 `bairitu` 相同 |
| `bairitu_scaling` | ✓ | — | — | — | `float`，熟度每级增量；0 = 固定值 |
| `hit_type` | bunrui=7时 | bunrui=7时 | — | bunrui=7时 | `int`，ヒット計算方式（见下表） |
| `hit_per_stage` | bunrui=7时 | bunrui=7时 | — | bunrui=7时 | `int[3]`，各段ヒット値 `[1撃目, 2撃目, 3撃目]` |

> **souls / characters 的 `element` / `type` 多值情况**：当一个技能同时限定多个属性或武器种时，值为 `int[]`（如 `[1, 3]`）。其余数据源均为单 `int`。

---

## scope 范围对照表（统一）

所有数据共用同一套 scope 编码。各数据源实际出现的值：

| 数据源 | scope 实际值 |
|--------|-------------|
| characters | 0, 1, 2 |
| souls | 0, 1, 3, 4 |
| bladegraph | 0, 3, 5 |
| crystals | 0, 1, 2, 3, 5 |

| scope | 含义 | 作用范围 | element/type | name |
|-------|------|---------|-------------|------|
| 0 | 无条件，对自身作用 | 装備キャラ自身 | 无 | 无 |
| 1 | 无条件，对全队作用 | 同装備セット全体 | 无 | 无 |
| 2 | 队内符合属性/武器条件的角色受益 | 同装備セット内の条件一致キャラ | 存在 | 无 |
| 3 | 自身符合属性/武器条件才受益 | 装備キャラ自身（条件一致時のみ） | 存在 | 无 |
| 4 | 自身符合条件时，全队受益 | 同装備セット全体（装備キャラが条件一致時） | 存在 | 无 |
| 5 | 特定魔剣名限定 | 指定魔剣装備キャラ自身 | 无 | 存在 |

**各数据的 scope 检测逻辑**：
- **characters**：scope=0/1 由 classify 逻辑判断；scope=2 检测效果文中的 `同装備セット` 关键词（附 element/type）
- **souls**：scope=3/4 由 `装備で` 等关键词与全队关键词组合判定
- **crystals**：① `特殊条件` 非空 → scope=5 ② 効果文含 `同装備セット` → 有属性/武器词 → scope=2；无 → scope=1 ③ element/buki_type 非0 → scope=3 ④ 其余 → scope=0
- **bladegraph**：① `data-contents.type` 非空（武器限定）→ scope=3 ② `data-contents.zokusei` 非0（属性限定）→ scope=3 ③ 効果文含 `【〇〇のみ】` 且非属性/武器名 → scope=5 ④ 其余 → scope=0

---

## bunrui 效果分类表

| bunrui | 效果名 | 备注 |
|--------|--------|------|
| 1 | 攻撃力UP | |
| 2 | ブレイク力UP | |
| 3 | BD攻撃力UP | |
| 4 | スピードUP | |
| 5 | 攻撃モーションUP | |
| 6 | BDゲージUP | BD ゲージ量増加（≠ bunrui 18 の最大値UP）。无明确目标时 scope 默认为 1（全体） |
| 7 | ヒット数UP | bunrui=7 的 effects 条目额外含 `hit_type` 和 `hit_per_stage` 字段（见 hit 对照表） |
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
| 18 | BDゲージ最大値UP | BD 最大級数の上限上昇（≠ bunrui 6 のゲージ量増加）。无明确目标时 scope 默认为 1（全体） |
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
| `characters.json` 魔剣技能 | 由效果文字正则模式决定；无法识别时按 bunrui 判断（ADD_BUNRUI → 1） |
| `souls.json` 魂技能 | 同上，按各 effects 条目独立判断 |
| `senzai_table.json` 潜在能力 | bairitu 为小数且 0 < bairitu < 10（如 1.05）→ 0；否则 → 1 |
| `crystals.json` 記憶結晶 | bunrui ∈ {6,7,9,11,16,17,19} → 1；其余 → 0 |

---

## hit_type / hit_per_stage 对照表（bunrui=7 专用）

仅当 `bunrui` 包含 7（ヒット数UP）时，effects 条目额外含以下字段：

| hit_type | 含义 | 效果文特征 | hit_per_stage 语义 |
|----------|------|-----------|-------------------|
| 0 | 減衰なし加算 | `ダメージ減衰なし` | 各段增加的 hit 数（int delta） |
| 1 | ダメージ維持加算 | `合計ダメージ維持` | 各段增加的 hit 数（int delta，等效伤害不变） |
| 2 | 乗算 | `N倍にする` / `N%UP`（calc_type=0） | 各段乘数（float，如 [2.5, 2.5, 2.5]） |
| 3 | 設定値 | `それぞれ1にする` / `ヒット数を代償に` | 各段强制设为该 hit 数（int 绝对值） |

`hit_per_stage: [a, b, c]`：三个值分别对应第一撃、第二撃、第三撃。
- hit_type=0/1/3：int，0 表示该段无变化（加算时）或待测（设置时）
- hit_type=2：float，即 bairitu 值（calc_type=0 的乘数）

**BD技能特殊规则**（`is_bd=True`）：效果文中 `+N` 无 `それぞれ` 时，视为 N 次总 hit 平均分配：hit_per_stage = [N//3, N//3, N//3]；有 `それぞれ` 时与普通技能相同，[N, N, N]。

**爬虫自动检测覆盖的特殊情况：**

| 效果文模式 | hit_type | hit_per_stage |
|-----------|----------|---------------|
| `それぞれ+N` / `全段+N` | 0 | [N, N, N] |
| `1撃目ヒット数+N` | 0 | [N, 0, 0] |
| `2撃目ヒット数+N` | 0 | [0, N, 0] |
| `第三撃のみ+N` | 0 | [0, 0, N] |
| `N倍にする` / `N%UP`（calc_type=0） | 2 | [N, N, N]（float） |
| `ヒット数それぞれ1にする` | 3 | [1, 1, 1] |
| `1撃目2撃目のヒット数を代償に3撃目増加` | 3 | [1, 1, 0]（第三撃需手动测试后填入） |
| `合計ダメージ維持でヒット数増加`（结晶） | 1 | [N, N, N] |
| BD `+N`（无 `それぞれ`） | 0 | [N//3, N//3, N//3] |
| BD `それぞれ+N` | 0 | [N, N, N] |

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
- bunrui=1 严格匹配 `攻撃力|攻撃と|攻撃・`（避免 `攻撃を回避` / `攻撃した時` 等误触发）

**Step 3 — Veto 规则（修正 lookup 误标）**

altema lookup table 偶尔会把技能误归到错误的 bunrui，以下 veto 规则在两步合并后纠正：

| veto | 触发条件 | 动作 | 解决案例 |
|------|---------|------|---------|
| HP cost | effect 含 `HPを.*消費\|HPを.*犠牲` | discard 10（HP） | HP 消費型技能 |
| BD攻撃力 subsume | 3 ∈ covered | discard 1（攻撃力） | BD攻撃 + 攻撃力混入 |
| ヒット数→攻撃力 | 7 ∈ covered, 1 ∈ covered, effect 不含 `攻撃力` | discard 1 | LOVE SO PAIN 等 |
| lookup-only 16 | 16 ∈ covered, 16 ∉ kw_result, 还有其他 bunrui | discard 16 | スピードDOWN 等被誤標 16 |
| lookup-only 10 | 10 ∈ covered, 12 ∈ covered, 10 ∉ kw_result | discard 10 | 防御力技能誤標 HP |
| BDコスト→16 | 6 ∈ covered, 16 ∈ covered, effect 含 `B.D.コスト\|BDコスト` | discard 6 | 珍獣姫モティヒツディンヌ |
| lookup-only 12 | 12 ∈ covered, 12 ∉ kw_result, effect 不含 `防御力` | discard 12 | イミティション=サタニア 聖剣の系譜 |
| lookup-only 18 | 18 ∈ covered, 18 ∉ kw_result, effect 不含 `ゲージの最大値` | discard 18 | 卯王ミオ 不帰の結界 |

### 魂 vs 魔剣的结构差异

| 项目 | 魂（souls.json） | 魔剣（characters.json） |
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

## BD 特殊効果時間（mahibd / tokitomebd / buffbd）

`crawl_bd_special()` 爬取 altema 三个特殊効果页面（時止め=1 / 麻痺=2 / 高倍率バフ=6），输出两个文件：

| 文件 | 用途 |
|------|------|
| `bd_special.json` | `{char_id: [special_ids]}`（角色 → 持有的特殊効果ID列表） |
| `bd_special_durations.json` | `{base_sort_id: {sid: 'Xs'}}`（角色 → 各効果的精确秒数） |

**名字匹配机制**：altema 的 `mahibd`/`tokitomebd` 页面里 `【極弐】` 版本用独立 sort_id（库内仍是 base char 的 state），缩写名也常见（如 `クサナギ:Blaze` ↔ DB `神劍クサナギノツルギ:Blaze`）。爬取时对每行：
1. 提取 `cells[0]` 名字，去掉 `【...】` 括号 → base name
2. 在 `char_name_map`（exact + suffix-fallback）查 base sort_id
3. 用 base sort_id 作为 `duration_map` 的 key（库内查得到才存）

**Duration 覆盖规则**：在 `_elevate_bd` 里，当 `parse_bd_duration(effect)` 返回 `'数秒'` 且角色在 `bd_special_durations` 中有精确秒数时，用页面值覆盖；其他情况（已有明确秒数 / wave / 空）保持原值。

---

## Revise 文件稀疏 index 格式

四种数据源（characters / souls / crystals / bladegraph）+ omoide 的 revise 文件均使用稀疏 index 格式，仅记录实际变化的字段，未变项不出现。

**触发条件**（在 `_deepDiff` 里）：

```
原数组与改后数组都是 array，长度相同，元素都是 object → 转为 {idx: patch} 形式
```

例如 `skills` 数组中只改了 index 2 的某字段：

```json
{
  "id": 1407,
  "states": {
    "改造": {
      "skills": {
        "2": {
          "effects": {
            "0": { "bunrui": [1] }
          }
        }
      }
    }
  }
}
```

**合并条件**（在 `deepApply` / `deep_update` 里）：

```
target 是 array + patch 是 object + patch 所有 key 都是数字字符串 → 按 index 应用 patch
```

任一条件不满足时退化为：dict 递归合并 / 全量替换。

**实现位置**：

| 端 | 文件 |
|----|------|
| JS 客户端 | `index.html`, `soul.html`, `crystals.html`, `bladegraph.html`（`_deepDiff` + `deepApply`） |
| Python 服务端 | `scripts/crawl_chara.py`, `crawl_soul.py`, `crawl_crystal.py`, `crawl_bladegraph.py`（`deep_update`） |

---

## 爬虫脚本参数

| 参数 | 网络爬取 | 技能分类/倍率重算 |
|------|---------|----------------|
| 不加参数 | 只爬新增数据 | 只重算新增数据 |
| `--recal` | 只爬新增数据 | 全部重算 |
| `--rerun` | 全部重新爬取 | 全部重算 |

适用于 `crawl_soul.py` 和 `crawl_chara.py`。`crawl_crystal.py` 为单页全量抓取，三种模式行为相同。
