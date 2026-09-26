# Schema — 按解包 master_tables 设计

> 文档索引: [docs/README.md](README.md)
>
> **Status**: 当前规范 (`npm test` 319/319 @ 2026-09-07)
>
> **Data source**: `<BXB_ROOT>/master_tables/master_data/<latest>/` —— `master_tables/` 与本 repo
> (`bxb_wiki/`) 同级、是 crawl 仓库 `data/master-tables` branch 的 git worktree。路径一律相对
> repo 推 (`PROJECT_ROOT.parent`)、不写死盘符;CI 经 env `BXB_MASTER_TABLES` 覆盖。
> 详见 [scripts/master_to_business/paths.py](../scripts/master_to_business/paths.py)

---

## 1. 设计原则

### 1.1 数据来源单一权威

- `master_tables/*.json` 是游戏服务器下发数据、ground truth
- 所有字段直接透传、不做 NLP 关键词分类
- 信任解包 `initial_*` / `max_*` stats

### 1.2 核心 enum

详见 [scripts/master_to_business/enums.py](../scripts/master_to_business/enums.py):

- `parameter`: 91 项 (#JS JobSkill.Parameter)
- `math_type`: **5 项** — `Multiply` (0) / `Addition` (1) / `Set` (2) / `Repel_Percent` (3) / `None` (4)
- `range`: 3 项 (`All` / `Single` / `None`)
- 条件字段拆分: HP-curve prefix (`Vitality_` / `RemHP_`) + Break gate prefix (`Break_`) + 结构化条件字段 (`element_id` / `weapon_type_id` / `conditional_parameter` 等)

server-fold 字段 (非 master 直给、走 `*_revise.json`):
- crystal: `max_value` (来源 = altema 【効果量】 区间上限、`fetch_wiki_acquisition.py` 每轮刷;`_wiki_aux` 的 6 月快照只作 fill-only 兜底) / `M_L_max` / `M_W_max` / `M_P_max` / `min_weight` / `max_weight` / `min_purity` / `max_purity` / `weight_step` / `purity_step` (slider 刻度)、`range` (`'All'` 缺省 Single、build_crystal_aux 扫 desc 同装備セット 注入)、`weapon_base_id` (int、build_crystal_aux 扫 name 純真/秘録 + 反查 characters.json 注入、含 41 项 OVERRIDE dict 处理 nickname/缩写/substring 多候选;chara≡魔剣 base id、跟 soul 统一字段名;stats-calc 按装备者判)
- bg: `weapon_base_id` (int、build_bg_aux 扫 desc [Xのみ] + element_id/weapon_type_id=0 注入、共用 OVERRIDE dict)
- chara skill / masou skill: `value_scaling` (每熟度增量)
- masou: `effects[].range` (`'All'` 缺省 Single、build_masou_aux 扫 effect_text 味方全体 注入 —— masou master effect **没有** range 字段、1200 条全无,不兜底就会被 stats-calc 当全队;真全队的只有 11 条、集中在 3 件魔王装 1494/1502/1570)。⚠ masou effects 无 id → revise 是**整组替换**,patch 必须写全整个 effects 数组
- chara: `tags` (14 种特性 enum)

### 1.3 id 体系

| 实体 | id 来源 | 备注 |
|---|---|---|
| chara | `weapons.base_id` (4 位、如 1001) | 同 base_id 多 variant 按 evolve_count 聚合到 states |
| chara state | 内嵌 `variant_id` = `weapons.id` (6 位、如 100101) | state 内反查解包 record |
| soul | `jobs.id` (1-991237 大范围) | 不建 wiki name 反查表 |
| crystal | `materials.id` | 同 |
| bladegraph | `pictures.id` | 同 |
| masou | `weapon_costumes.id` | 同 |
| omoide skill | `memory_slot_skills.key` (**8 位数字字符串**、如 `"10000001"`) | `senzai_table.json` 的 key、类型是 string 不是 int |

---

## 2. enum 完整定义

详见 [scripts/master_to_business/enums.py](../scripts/master_to_business/enums.py)。本节摘要 + 链 unpacking docs。

### 2.1 PARAMETER (#JS JobSkill.Parameter)

下表是 **560 (v2.5.34) 编号**:91 项、id 0-90、None=0 是 sentinel。561 (v2.5.35) 在 28 插入 `Blaze_DamageLimitBreak`、
在 67 插入 `Enemy_BreakDamageLimitBreak`(共 93 项、0-92),插入点之后整体后移
(换算见 [11_parameters.md §11.1.1](../../unpacking/docs/HOWTO_battle/11_parameters.md))。
master 里 parameter 存的是名字字符串,本项目也只按名字用,编号只作对照。

| id 范围 | 段 | 说明 |
|---|---|---|
| 1-8 | base damage 池 | Attack / Defense / Heal / GuardBreak / GuardDefense / BlazeAttack / Speed / MotionSpeed |
| 9-13 | drop / 命中 | PlayerHit / EnemyHit / SapphireDrop / Attack_Sapphire / RubyDrop |
| 17-19 | 状态系 | Raise / Mez / Stun |
| 23-26 | aoe / 即死 | DamageLimitBreak / BlazeLock / AllTarget / SuicideAttack |
| 28-35 | RemHP_ (背水)| HP 少越强、HP-curve func `RemHpSkillRate` |
| 36-43 | Vitality_ (浑身) | HP 多越强、HP-curve func `VitalitySkillRate` |
| 44-49 | Break_ (破損) | hard gate IsBreak、整段跳 |
| 50-55 | FellDown_ (倒地) | 队友倒地条件 |
| 56-60 | JustGuard_ / Wave_ | JG 加蓝/减伤/回血、过 wave 回血/回 BD |
| 66-70 | InstantDeath / Random_Attack 等 | 即死 / 暴击 |
| 71-76 | WeaponArts / HP / HitCount | JS-only schema 字段 (BE 没有) |
| 78-87 | BD / EXP / 掉落 | AnyElement / BlazeGauge / EventDropRate / MaterialExp 等 |
| 88-90 | Prayer / Rise_AttackRate / Rise_DefenseRate | 祈祷 / 攻防效果放大 |

完整含义对照: [unpacking/outputs/table.md](../../unpacking/outputs/table.md)(`scripts/tools/gen_table_md.py` 生成,JS# / BE# 为 561 编号)
战斗 step 引用: [unpacking/docs/HOWTO_battle/03_ead.md §3.3.2](../../unpacking/docs/HOWTO_battle/03_ead.md)

### 2.2 MATH_TYPE

**5 项** ([enums.py `MATH_TYPE`](../scripts/master_to_business/enums.py)):

| id | 名前 | hensei での扱い |
|---|---|---|
| 0 | `Multiply` | Mul 池 (`v *= 1 + (value − 1) × cf`) |
| 1 | `Addition` | Add 池 (`v += value × cf`) |
| 2 | `Set` | **skip** — chara 端 master 无、UI 不渲染 |
| 3 | `Repel_Percent` | status 回避率、独立通道、不进 stat pipeline (见 [hensei_calc.md](hensei_calc.md#repel_percent-独立通道)) |
| 4 | `None` | **skip** |

**没有 wiki 推断的 "最终加算 / 最终乗算"**。游戏实际计算 pipeline 不区分"最终"阶段、只分 Mul 池 + Add 池 (EAD step 链内累积)。

> ⚠ 老文档里的 **`Reduce100`** 就是现在的 `Repel_Percent`(同一个 math=3 槽位、旧名)。
> BE 侧 enum 是 `None=0 / Addition=1 / Multiply=2 / Repel_Percent=3`,**跟 #JS 的 Mul/Add 编号互换**。
> 合并式是独立概率 OR:`(1 − Π(1 − p_i)) × 100`、`p_i = clamp(v_i, 0, 100) / 100`
> ([11_parameters.md §11.4](../../unpacking/docs/HOWTO_battle/11_parameters.md));`repelRate` 已按此实现,
> 见 [hensei_calc.md](hensei_calc.md#repel_percent-独立通道)。
> 命中的 parameter 只有 6 个 proc-rate 类:`Mez` / `Stun` / `InstantDeath` / `BlazeAbsorb` /
> `RateDamage` / `BlazeLockPurge`。

### 2.3 RANGE

3 项 — `All` / `Single` / `None`。

master 有 case typo (`'all'` lowercase 1 处)、build script normalize 成 `All`。

### 2.4 条件字段（非单 enum、结构化字段集）

wiki 5 值 `condition` enum 在 master 拆成多字段：

#### HP-curve / hard gate（用 parameter prefix 表达）

| parameter prefix | 含义 | runtime 公式 |
|---|---|---|
| `Vitality_*` | 浑身 (HP 多越强) | `r = clamp(HpRate, 0, 1)`、**池值** `P` → `1 + r(P − 1)` 详 [02_psv_gates.md §2.4](../../unpacking/docs/HOWTO_battle/02_psv_gates.md) |
| `RemHP_*` | 背水 (HP 少越强) | `r = clamp(1 - HpRate, 0, 1)` 同上 |
| `Break_*` | 破損 | hard gate `IsBreak` (`HpRate ≤ 0.5`)、整段跳 |
| `FellDown_*` | 队友倒地 | 自身 `Hp == 0` → 旁路;否则 `r = 倒下的队友 / max(人数 − 1, 1)`,插值同上 (§2.5) |
| `Enemy_*` | 敵端 | `Enemy_BreakAttack` = EAD step 48/49 (敵 BK 时);`Enemy_Attack` / `Enemy_GuardBreak` 等按敵方属性过滤 |

#### 限定条件（独立字段）

| 字段 | 类型 | 含义 |
|---|---|---|
| `element_condition` | int (`TARGET_ELEMENT` 0-6) | 属性限定、0=不限 |
| `weapon_type_condition` | int (`TARGET_WEAPON_TYPE` 0-12) | 武器型限定、0=不限 |
| `enemy_element_id` | int | 敵元素限定 (Enemy_* parameter 用) |
| `weapon_base_id` | int | 特定 chara 限定 (对应 wiki scope=5) |
| `target_element_id` | int | 目标元素限定 (weapon_innate_skills 用) |
| `weapon_type_id` | int | 武器型 (weapon_innate_skills 用) |

#### master 独有 (wiki 没的) 条件字段

| 字段 | 类型 | 含义 |
|---|---|---|
| `greater_than_bust_condition` | int | 胸围 > N 条件 (joke / 隐藏机制?) |
| `less_than_bust_condition` | int | 胸围 < N 条件 |
| `limit_count` | int | 次数限制 |
| `effective_rate` | float | 触发概率 |
| `skill_effect_duration` | float | buff 持续时间 (秒) |
| `just_guard_threshold` | int | JG 判定阈值 |

详见 [enums.py CONDITION_FIELD_NAMES](../scripts/master_to_business/enums.py)。

### 2.5 TARGET_ELEMENT (master elements.json)

0=None / 1=Fire (火) / 2=Water (水) / 3=Wind (風) / 4=Light (光) / 5=Dark (闇) / 6=Neutral (無)

### 2.6 TARGET_WEAPON_TYPE (master weapon_types.json)

0=None / 1-12 = 長剣/大剣/太刀/杖棒/弓矢/連弩/戦斧/騎槍/投擲/拳闘/魔典/大鎌

### 2.7 RARITY / EVOLVE_COUNT

- RARITY: 1=A / 2=AA / 3=S / 4=SS
- EVOLVE_COUNT: 0=通常 / 1=改 (改造) / 2=改極弐 (極弐)

---

## 3. 业务 JSON schema

### 3.1 characters.json

字段位置原则: per-chara (跨 state 不变) 直接放顶层；per-state (随進化变) 放 states.<X> 里。
不再用 `extras` 嵌套层。

```jsonc
{
  // ===== per-chara 字段（顶层、不嵌套）=====
  "id": 1001,                       // base_id 4 位
  "name": "レヴァンテイン",
  "rarity": 4,                      // 1=A 2=AA 3=S 4=SS
  "rarity_code": "4",               // master rarity_code (字符串、不一定跟 rarity 数值同)
  "element_id": 1,
  "weapon_type_id": 1,
  "weapon_tag_ids": "2",            // master 武器分类 (非 chara.tags)
  "tags": [5, 12],                  // chara 特性 tag (从 wiki main 拷)、wiki 没的留 []
  "sort_order": 16911,              // 排序权重
  "min_damage_rate": 0.02,
  "mp": 633,                        // 保有魔力
  "mp_cost": 63,
  "brave_cost": 33,
  "guard_cost": 2,
  "hit_rate_rank": 0,
  "evade_rate_rank": 0,
  "weapon_arts_id": 691,
  "omoide": [],                     // 留空 = view-only 不展示 (实际数据在 data/omoide/{base_id}.json)
  "profile": {                      // 角色 profile (age/cv/height/...)、跨 state 不变
    "age": "27歳", "cv": "...", "height": "...", "weight": "...",
    "three_size": "72/51/75", "three_size_b": 72, "three_size_w": 51, "three_size_h": 75,
    "like": "...", "dislike": "...", "flavor_text": "...", "description": "...",
    "marriage_message": "...", "intro": "..."
  },

  // ===== per-state 字段（嵌套 states.<X>）=====
  "states": {
    "通常": {                        // EVOLVE_COUNT[0]
      "variant_id": 100101,          // weapons.id 6 位
      "evolve_count": 0,
      "evolve_name": "通常",
      "stats": {                     // 全 stat + level/mature/lp/slot 都是 per-state
        "initial_hp": ..., "max_hp": ...,
        "initial_attack": ..., "max_attack": ...,
        "initial_defense": ..., "max_defense": ...,
        "initial_break": ..., "max_break": ...,
        "initial_speed": ..., "max_speed": ...,
        "initial_slot": 3,            // 結晶スロット (per-state、改造で +1)
        "max_attack_rank": "ss", "max_defense_rank": "s",
        "max_mature": 60, "initial_max_level": 60, "max_max_level": 250,
        "max_lp": 6
      },
      "weapon_skills": [
        {
          "id": 80618,
          "name": "...",
          "parameter": "Attack",     // #JS 91 项 enum string
          "math_type": "Multiply",
          "value": 1.05,
          "value_scaling": 0.0,
          "range": "All",
          "target_element_id": 1,
          "weapon_type_id": 0,
          "description": "...",
          // ... 其他 condition 字段
        }
      ],
      "attack_motion_id": 815,        // モーション (per-state、変身でモーション変わる)
      "motion_speed": 2.0,
      "motion_speed2": ..., "motion_speed3": ...,
      "hit_counts": [3, 3, 14],
      "attack_count": 3,
      "attack_hits": "3,3,14",
      "reach_id": 3,
      "size": 1
    },
    "改造": { ... },                  // EVOLVE_COUNT[1]
    "極弐": { ... }                   // EVOLVE_COUNT[2] (optional)
  },

  "bd_skill": {                       // weapons.weapon_arts 内嵌 → 顶层 (跨 state 共享)
    "name": "...",
    "cost": 3,                        // WeaponArtsCost
    "hit_count": 16,                  // WeaponArtsHitCount
    "range": "All",
    "value": 0.8, "value_scaling": 0.0, "additional_value": 33.0,
    "use_all": true, "clip_id": 176,
    "description": "...",
    "effects": [...]
  }
}
```

### 3.2 souls.json

`jobs.json` → souls。
- id = jobs.id
- job_abilities (data_type=Element / WeaponType) → element_affinity / weapon_affinity (含 positive/negative value)
- job_skills → 直接透传 (parameter / math_type / value / range / element_condition 等)

### 3.3 crystals.json

`materials.json` + `material_parameter_ranks.json` → crystals。
- initial_value / max_level / parameter 等直接透传
- material_parameter_ranks 提供 level → value 强化曲线

### 3.4 bladegraphs.json

`pictures.json` → bladegraphs。
- picture_skills 直接透传

### 3.5 masou.json

`weapon_costumes.json` → masou。
- weapon_base_id 关联到 chara id
- weapon_costume_effects → effects

### 3.6 senzai_table.json

`memory_slot_skills.json` → senzai_table。
- key = memory_slot_skills 的 8 位 string key (如 `"10000001"`)、当前 209 条
- value = {name, parameter, math_type, value, description, category_for_memory_slot}

---

## 3.5 计算分工（**三类、不是二分**）

游戏数值 pipeline 分**三**阶段、不是简单 server vs client：

```
master_tables (静态 schema)
    ↓
server pre-fold (玩家点「开始战斗」CreateBattleSession 时一次性算)
    ↓ push user_weapon (含 fold 完的 attack/defense/speed/break_value/max_hp + 8 block weapon_skills[] PSV 池)
client BattleEngine (战斗中 in-battle PSV 路径、EAD/PAD/EBD/PBD 累积链)
    ↓
final damage
```

### 字段分工总表

| 字段 | 类 1: server pre-fold | 类 2: client 战前一次算 | 类 3: client 战斗中动态 | server push 终值? |
|---|---|---|---|---|
| `max_hp` | ✓ **完整**（含 element / marriage / cross-slot Add）| — | ✗ 无路径（BE PassiveSkill enum 没 HP entry）| ✓ 终值 |
| `attack` | ✓ 静态 (slot_Add + BH + 魔装 Attack Mul、含魔王装全队倍率) | — | ✓ 动态 (element / marriage / RemHP / Vitality) | ✗ 半成品 |
| `defense` | 同 attack (魔装 Defense Mul、BH 同一倍率) | — | 同 attack | ✗ 半成品 |
| `speed` | slot_Add + 魔装 Speed Mul (**无 BH**) | — | SpeedSkill + UpdateLatestRecover | ✗ 半成品 |
| `break_value` | 类比 attack (无 BH) | — | ✓ 走 PSV `GuardBreak` 池 | ✗ 半成品 |
| **`hit_counts[]`** | ✓ **server 预折叠编队 HitCount 加成**,每条 `trunc` + ≥1([17_hitcount.md §17.2.2](../../unpacking/docs/HOWTO_battle/17_hitcount.md))| (`DeckHitCount` 只给 UI 面板 / 排序用) | 战斗中只有 `AttackCount` PSV/BSV 修正 (master 0 条) | ✓ |
| **`motion_speed`** | ✓ 魔装 MotionSpeed Mul 折进 `weapon.motion_speed*` | — | ✓ × Fighter.BoostAttackSpeed(PSV/BSV MotionSpeed **Mul 池**、无 Add 池) | — |
| per-hit damage | — | — | ✓ EAD/PAD/EBD/PBD 累积链 | — |

### hit_counts vs 战斗中 stat 的关键区别

| 维度 | hit_counts (server 预折叠) | attack/motionspeed 战斗中 |
|---|---|---|
| 何时算 | server `CreateBattleSession` 时 | 每 hit 触发 EAD/PAD 时 |
| 公式 | **逐条 int 截断** `h = max(1, trunc(h + v))`(抓包 273/273) | **Mul 池 + Add 池分离**（池内结合律 + 交换律) |
| 战斗中变化 | 无（固定） | 动态（HP-curve / Break gate / IsBlaze gate 等条件变化） |
| 加成来源 | 魂 HitCount `values × 魂等级倍率`(条件按**被作用的魔剣**判)/ 魔剣技能(熟度阶梯)/ HitCount 结晶 | PSV / BSV |

客户端 UI 侧的 `JobSkillExtensions.HitCount @ 0x3498EE8`(561)/ `DeckHitCount` 只遍历魂的 job_skills、按 MathType 分组
(先 Multiply 后 Addition),战斗装载不调用它。

### Server-fold 公式 ([01_setup.md §1.1.1-1.1.2](../../unpacking/docs/HOWTO_battle/01_setup.md))

**attack/defense/speed/break_value**（半成品、客户端在战斗中加动态部分）:

```
attack  = floor((raw_attack(含 level/mature/affection) + Σ slot_attack_add) × BH × Π 魔装 Attack Mul)
defense = floor((raw_defense + Σ slot_defense_add) × BH × Π 魔装 Defense Mul)
speed   = floor((speed + Σ slot_speed_add) × Π 魔装 Speed Mul)                         (无 BH)
break   = 类比 attack (无 BH)
# Π 魔装 Mul 含编队里「味方全体」魔王装的全队倍率 F = 1.75 + 0.00768 × 持有者熟度 (§1.1.2.1)
```

取整:抓包里能区分 floor / 四舍五入的 38 个值全是 floor(evidence 2026-09-25 §5)。

**max_hp**（唯一完全 server-fold、slot 顺序影响 ±24%）:

```
max_hp = (max_hp_base + Σ_HP_Add_from_earlier_slots) × Π_HP_Mul + Σ_HP_Add_from_later_slots
```

理由：`JobSkill.Parameter.HP`(561 = 76、560 = 74)在 `BattleEngine.Skill.Parameter` enum 里没对应、客户端 PSV 列表无 HP 类 entry、必须 server 一次性 fold 完。

**BH (Burning Heart) 是连续值** ([01_setup.md §1.1.2](../../unpacking/docs/HOWTO_battle/01_setup.md)):
`burning_heart = true` 时倍率在 **1.10 ~ 1.30** 之间(抓包 37 例都是 0.01 的整数倍、上限 1.30),同一把魔剑在连续场次间逐级变化;
攻撃力和防御力用同一个倍率。旧文的「×1.10(2 把)→ ×1.27(3 把)→ ×1.30」离散阶梯已被推翻。随场次 / 闲置时间怎么增减未量化。

### Server push 的 weapon_skills block ([01_setup.md §1.1.4](../../unpacking/docs/HOWTO_battle/01_setup.md))

进副本时 server 推 `user_weapon.weapon.weapon_skills[]` 按 8 block 优先级追加：

| block | 内容 | 来源 |
|---|---|---|
| 1 | weapon_innate Mul/Add | weapon 自带;不在 BE 枚举里的 parameter 被滤掉 (HP / WeaponArtsCost / HitCount …) |
| 2 | memory_slot Mul 类 | affection slot `category_for_memory_slot` 以 `Skill` 结尾 |
| 3 | materia Attack 类 (`-6`) | materia parameter ∈ {Attack, Vitality_Attack, ...};HitCount 结晶不下发、折进 hit_counts |
| 4 | marriage 4 条固定 | id 70204 (Attack) / 70304 (GuardBreak) / 70404 (Defense) / 70504 (Speed),`is_original_skill=true` |
| 5 | costume / 魔装 (`-7`) | 只含 server 不折叠的魔装效果 (Attack / Defense / Speed / MotionSpeed / HP 不在其中);「味方全体」的 range=All |
| 6 | guild 公会徽章 (`-1`) | `1 + (max_effect_scale − 1) × (Lv − 1) / (max_level − 1)`(Lv1 无效果,攻撃力アップⅠ 满级 1.0625) |
| 7 | memory_slot Add 类 | `category_for_memory_slot = DamageLimitBreak` |
| 8 | materia DLB 类 | materia DamageLimitBreak parameter |
| — | 画 (`-4`) | 同槽位画的 `picture_skills`;画级 / 技能级属性·武器限定、经验类、限时不符的不下发 |

`is_original_skill`:weapon_innate 与 marriage 为 true(Rise 放大对象),其余 block 全 false。
block 顺序对 `Multiply` / `Addition` 池**数学等价**（结合律 + 交换律），`Repel_Percent`(math_type=3)的 OR 合并同样顺序无关;
只有逐步截断的聚合(HitCount)才对顺序敏感。

### 数据流（4 个 master view）([01_setup.md §1.1.2 表](../../unpacking/docs/HOWTO_battle/01_setup.md))

| view 来源 | attack 含义 | slot Add 折叠 | BH 倍率 |
|---|---|---|---|
| `GetUserWeaponList`（准备页） | 纯 raw 镜像 | ✗ | ✗ |
| `CreateBattleSession`（点"进副本"） | base + slot + 当前 BH | ✓ | ✓ |
| 副本结算 response | base + slot + 当前 BH | ✓ | ✓ |
| `UserWeaponDetail`（魔剑详情页） | `buffed_attack`、含静态 Mul 子集 | ✓ | ✓ + 静态 Mul |

### 对前端 hensei calc 的 implication

server fold 公式 docs 完备、但 BH 的变化规律未公开。简化：不读 user_weapon raw、**沿用旧 wiki 等级公式 + master initial_/max_ 字段**（用户决定）
算 raw,再按上面的 server-fold 结构把 slot Add(好感)、魔装 Mul、燃心 折进去后 floor。具体公式见 [hensei_calc.md](hensei_calc.md) Base 计算 / Stage 表。

---

## 3.7 hensei 基础属性 base 计算（简化版）

### 输入字段（全部来自 master `weapons.json`、每个 variant 各自查）

| 字段 | 来源 | 说明 |
|---|---|---|
| `initial_hp/attack/defense/break/speed` | `weapons.initial_*` | 该 variant 1 等级 1 熟度的属性 |
| `max_hp/attack/defense/break/speed` | `weapons.max_*` | 该 variant 最高等级最高熟度的属性 |
| `initial_max_level` | `weapons.initial_max_level` | 该 variant **1 熟度时的等级上限**（替代 wiki 写死表）|
| `max_max_level` | `weapons.max_max_level` | 该 variant **熟度最大时的等级上限**（替代 wiki 写死表）|
| `max_mature` | `weapons.max_mature` | 该 variant 最大熟度（替代 wiki 熟度上限表）|
| `max_lp` | `weapons.max_lp` | 该 variant 最大 LP |
| `rarity` | `weapons.rarity` | 1=A / 2=AA / 3=S / 4=SS |
| `evolve_count` / `evolve_name` | `weapons.evolve_count/evolve_name` | 0=通常 / 1=改 / 2=改極弐 |

**不看 `raw_*` 字段**（那是 user_weapon server fold 字段、不在 master 里）。

### 等级 / 熟度 (3 个 wiki 写死表全废 — master 字段直读)

样本对照确认 master 字段跟 wiki 写死表 100% 一致：

| sample | rarity / evolve | initial_max_level | max_max_level | max_mature | wiki 对照 |
|---|---|---|---|---|---|
| 100101 | SS / 通常 | 60 | 250 | 60 | ✅ 通常 SS |
| 100102 | SS / 改 | 70 | 255 | 99 | ✅ 改造 SS |
| 100201 | S / 通常 | 40 | 200 | 50 | ✅ 通常 S |
| 100202 | S / 改 | 50 | 215 | 75 | ✅ 改造 S |
| 100203 | S / 改極弐 | 60 | 230 | 90 | ✅ 極弐 S |

**熟度 N → 等级上限**（公式不变、3 个参数全从 master 字段读）：

```
熟度上限_at_N = min(max_max_level, initial_max_level + (N − 1) × 5)
```

参数取值：
- `max_max_level` ← master 字段（该 variant）
- `initial_max_level` ← master 字段（该 variant）
- `N` ← 用户输入（1 ≤ N ≤ `max_mature`、`max_mature` 来自 master 字段）

### 觉醒（写死表 — master 无对应字段）

| 稀有度 | SS | S | AA | A |
|---|---|---|---|---|
| 最大觉醒数 | 9 | 14 | 36 | 24 |
| 满觉醒倍率 HP | 1.33 | 1.34 | 1.82 | 2.36 |
| 满觉醒倍率 攻撃力 | 1.43 | 2.42 | 4.45 | 5.37 |
| 满觉醒倍率 防御力 | 1.28 | 1.26 | 1.63 | 4.12 |
| 满觉醒倍率 ブレイク力 | 1.46 | 1.54 | 1.31 | 2.1 |

- 每觉醒 +5 等级、不受其他限制
- `实际等级上限 = 熟度对应上限 + 觉醒数 × 5`
- 满觉醒倍率**按属性区分**（上表）、作用于 HP / 攻撃力 / 防御力 / ブレイク力 4 项;**転速 (Speed) 不吃觉醒段**、在熟度 cap 处封顶

### 等级 → 属性公式（**统一公式**、不分通常 / 改造）

每个 variant (state) 各自查自己的 `initial_*` / `max_*` / `max_max_level`，公式跟通常魔剣完全一样：

```
属性 = max × (1 − (max_max_level − 当前lv) / (max_max_level − 1) × initial / max)
```

参数全部来自 master `weapons.json`（每 variant 各自查）：
- `max` / `initial` ← `weapons.max_*` / `initial_*`
- `max_max_level` ← `weapons.max_max_level`

> 关键修正：master 各 variant 都有自己的 `initial_*` 字段（改造/極弐 不再借用通常的 initial/max 比值）。验证 sample base_id=1001:
> - 通常 100101: `initial_attack=5700, max_attack=12000`
> - 改造 100102: `initial_attack=7410, max_attack=15600`
>
> wiki 原公式假设改造 initial 用通常的、是因为 wiki 只爬到通常的 stats（改造的没 wiki page 写明 initial）。master 直给、不需绕。

**觉醒下属性扩展**（lv > cap = 熟度上限）：

```
1. 先按上式取 lv = cap 算 k（分母仍用 max_max_level、不是 cap）
2. 最终 = k × (1 + (当前lv − cap) / (最大觉醒数 × 5) × (该属性的满觉醒倍率 − 1))
```

满觉醒倍率按属性查上面"觉醒"表（HP / 攻撃力 / 防御力 / ブレイク力 各有一行）。

### Burning Heart (BH) — 简化为二元 toggle

| 状态 | 倍率 |
|---|---|
| BH on | ×1.3 |
| BH off (默认) | ×1.0 |

游戏里是 1.10–1.30 的连续值、变化规律未量化 → 简化成二态、on 取满值 1.3(UI toggle「燃心」、`mkTr` 默认 off)。
作用:**攻撃力和防御力**(server fold 用同一个 BH 倍率、floor 之前乘;HP / 転速 / ブレイク力不吃)。

### 結婚 / LP (详见 [hensei_calc.md](hensei_calc.md) chara_meta source)

**結婚倍率**（作用**攻防 HP BK speed 5 项**）：

| 状态 | 倍率 | 結晶 slot | max_lp |
|---|---|---|---|
| 未結婚 | ×1.00 | +0 | +0 |
| 結婚（花无）| ×1.03 | +1 | +3 |
| 結婚（花有）| ×1.05 | +1 | +3 |

**LP**（剩余 LP / 总 LP、`max_lp` 来自 master + 結婚加成）：**4 档**、仅作用攻撃力

| tier | UI | 普通攻击 (`LP_TIER_NORMAL`) | Blaze (`LP_TIER_BLAZE`) |
|---|---|---|---|
| 0 | `½↑` 正常 (> 1/2 LP) | ×1.0 | ×1.0 |
| 1 | `½↓` 低 LP (≤ 1/2 LP) | ×1.1 | ×1.3 |
| 2 | `¼↓` 危機 (≤ 1/4 LP) | ×1.5 | ×2.0 |
| 3 | `0` LP 尽 | ×2.0 | ×5.0 |

---

## 4. 计算 pipeline 参考 (前端 hensei calc)

### 4.1 EAD step 表 (561)

详见 [unpacking/docs/HOWTO_battle/03_ead.md §3.3.2](../../unpacking/docs/HOWTO_battle/03_ead.md) — 50 个 d8 step + 4 个直接改 Total 的层 (step 4 / 10b / 51 / 53)。

简表 (非攻防互换 = 默认路径):

| step | 内容 |
|---|---|
| 1-3 | `+ BlazeAttack` / `× BeforeUsedCount × Additon` / `× Boost` —— 只有 BD hit |
| 4 | LP tier × Total (普通 HpCheck `[1.0, 1.1, 1.5, 2.0]`、BD LpCheck `[1.0, 1.3, 2.0, 5.0]`) |
| 5 | `BlazeRankRate = 1 + floor(剑炎槽 Count / 2) × 0.25` —— **所有 hit 都吃** |
| 6-10 | ability matchup:魂的属性 / 武器 positive_value,敌方属性表 (server 下发) |
| 10b | × `AllTargetRate` (全体化倍率、无条件) |
| 17-23 | Attack Mul 主池 (含 Rise) / Random_Attack / Enemy_Attack / JG / RemHP / Vitality / FellDown |
| 24-26 | BD buff Mul / 道具 / Break_Attack (自身 HpRate ≤ 0.5) |
| 27-38 | Blaze 链 —— 只有 BD hit |
| 41-47 | Attack Add 主池 / Random / Enemy / JG / BD buff Add / 道具 / Break Add |
| 48-49 | Enemy_BreakAttack Mul / Add (敌方 break 中) |
| 50 | MP 不足惩罚 (sqrt) |
| 51 | × 3 (敌方 break 中) |
| 52 | RandomRate (`{1.00 … 0.95}` 6 档均匀) |
| 53 | DefenseDamageSkill (敌方被动:连乘 / 清零 / 每 hit 伤害上限屏障) |

EAD 出口在 `BattleDamage.get_Damage`:先按 `[0, limitMaxDamage]` clamp、区间内再 `ceil`。

### 4.2 HP-curve scale 公式（前端复刻）

- `RemHpSkillRate @ 0x193F2EC` / `VitalitySkillRate @ 0x193F410` / `FellDownSkillRate @ 0x193F530`(561)已反编译 (§2.4 / §2.5):
  先 fold 整个池得 `P`,`r = clamp(1 − HpRate, 0, 1)`(RemHP)/ `clamp(HpRate, 0, 1)`(Vitality)/ `FellDownRate`(FellDown),
  返回 `P > 0 && P ≠ 1 ? 1 + r(P − 1) : 1.0`。**是对池值插值一次、不是每条插值**。
- 転速 / 攻速 走 `BattleMath.VariableSkillRate`,同一公式。

### 4.3 IsBlaze / IsBreak gate

- IsBlaze gate: EAD step 1-3 + 27-38 在 `IsBlaze=true` 才跑;step 4 按 IsBlaze 选 LP 表;step 5 不受 gate
- 自身 IsBreak (`HpRate ≤ 0.5`): EAD step 26 / 34 / 35 / 47 (Break_* 池)
- 敌方 break: step 48 / 49 (`EnemyGuard.IsBreak` 现调)、step 51 ×3 (入参 isBreak 快照)
- 详 [02_psv_gates.md §2.2 / §2.3](../../unpacking/docs/HOWTO_battle/02_psv_gates.md)

---

## 5. 跨参考

| 主题 | 链接 |
|---|---|
| #JS vs #BE 偏移 / sentinel | [unpacking/docs/HOWTO_battle/11_parameters.md](../../unpacking/docs/HOWTO_battle/11_parameters.md) |
| EAD step 表反编译 | [unpacking/docs/HOWTO_battle/03_ead.md](../../unpacking/docs/HOWTO_battle/03_ead.md) |
| EBD (敵端破甲) | [04_ebd.md](../../unpacking/docs/HOWTO_battle/04_ebd.md) |
| PAD (玩家端攻) | [05_pad.md](../../unpacking/docs/HOWTO_battle/05_pad.md) |
| PBD (玩家端破甲) | [06_pbd.md](../../unpacking/docs/HOWTO_battle/06_pbd.md) |
| Damage clamp / DamageLimitBreak | [09_damage_clamp.md](../../unpacking/docs/HOWTO_battle/09_damage_clamp.md) |
| 战斗 setup | [01_setup.md](../../unpacking/docs/HOWTO_battle/01_setup.md) |
| RVA 表 | [A_rva_table.md](../../unpacking/docs/HOWTO_battle/A_rva_table.md) |

