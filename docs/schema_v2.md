# Schema v2 — 按解包 master_tables 设计

> **Status**: v2 当前规范 (Phase 0-8 重构完成、npm test 135/135)
>
> **Scope**: refactor/unpacking-source branch 限定、永不 merge 回 main
>
> **Data source**: `F:/OneDrive - Northeastern University/Game/BxB/unpacking/master_tables/<latest>/`
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
- `math_type`: 3 项 (`Multiply` / `Addition` / `Set`)
- `range`: 3 项 (`All` / `Single` / `None`)
- 条件字段拆分: HP-curve prefix (`Vitality_` / `RemHP_`) + Break gate prefix (`Break_`) + 结构化条件字段 (`element_id` / `weapon_type_id` / `conditional_parameter` 等)

server-fold 字段 (非 master 直给、走 `*_revise.json`):
- crystal: `max_value` / `M_L_max` / `M_W_max` / `M_P_max` / `min_weight` / `max_weight` / `min_purity` / `max_purity` / `weight_step` / `purity_step` (slider 刻度)、`range` (`'All'` 缺省 Single、build_crystal_aux 扫 desc 同装備セット 注入)、`chara_base_id` (int、build_crystal_aux 扫 name 純真/秘録 + 反查 characters.json 注入、含 41 项 OVERRIDE dict 处理 nickname/缩写/substring 多候选)
- bg: `chara_base_id` (int、build_bg_aux 扫 desc [Xのみ] + element_id/weapon_type_id=0 注入、共用 OVERRIDE dict)
- chara skill / masou skill: `value_scaling` (每熟度增量)
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
| omoide icon | `memory_slot_skills.key` (5 位字符串) | senzai_table key 类型变 string |

---

## 2. enum 完整定义

详见 [scripts/master_to_business/enums.py](../scripts/master_to_business/enums.py)。本节摘要 + 链 unpacking docs。

### 2.1 PARAMETER (#JS JobSkill.Parameter)

完整 91 项、id 范围 0-90、None=0 是 sentinel。

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

完整含义对照: [unpacking/table.md L228-345](../../unpacking/table.md)
战斗 stage 引用: [unpacking/HOWTO_battle/03_ead.md §3.2](../../unpacking/HOWTO_battle/03_ead.md)

### 2.2 MATH_TYPE

3 项 — `Multiply` (0) / `Addition` (1) / `Set` (2)。

**没有 wiki 推断的 "最终加算 / 最终乗算"**。游戏实际计算 pipeline 不区分"最终"阶段、只分 Mul 池 + Add 池 (50 步 EAD 内累积)。

### 2.3 RANGE

3 项 — `All` / `Single` / `None`。

master 有 case typo (`'all'` lowercase 1 处)、build script normalize 成 `All`。

### 2.4 条件字段（非单 enum、结构化字段集）

wiki 5 值 `condition` enum 在 v2 拆成多字段：

#### HP-curve / hard gate（用 parameter prefix 表达）

| parameter prefix | 含义 | runtime 公式 |
|---|---|---|
| `Vitality_*` | 浑身 (HP 多越强) | `scale = clamp(HpRate, 0, 1)` 详 [02_psv_gates.md](../../unpacking/HOWTO_battle/02_psv_gates.md) |
| `RemHP_*` | 背水 (HP 少越强) | `scale = clamp(1 - HpRate, 0, 1)` 同上 |
| `Break_*` | 破損 | hard gate `IsBreak`、整段跳 |
| `FellDown_*` | 队友倒地 | hard gate `Hp == 0` |
| `Enemy_*` | 敵端 (PSV 末段) | EBD step 47-48 / PBD 类似 |

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

## 3. 业务 JSON schema (Phase 2 起填)

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
  "omoide": [],                     // Phase 8 抓包后填、留空 = view-only 不展示
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

### 3.2 souls.json (Phase 2)

`jobs.json` → souls。
- id = jobs.id
- job_abilities (data_type=Element / WeaponType) → element_affinity / weapon_affinity (含 positive/negative value)
- job_skills → 直接透传 (parameter / math_type / value / range / element_condition 等)

### 3.3 crystals.json (Phase 2)

`materials.json` + `material_parameter_ranks.json` → crystals。
- initial_value / max_level / parameter 等直接透传
- material_parameter_ranks 提供 level → value 强化曲线

### 3.4 bladegraphs.json (Phase 2)

`pictures.json` → bladegraphs。
- picture_skills 直接透传

### 3.5 masou.json (Phase 2)

`weapon_costumes.json` → masou。
- weapon_base_id 关联到 chara id
- weapon_costume_effects → effects

### 3.6 senzai_table.json (Phase 2)

`memory_slot_skills.json` → senzai_table。
- key = memory_slot_skills 的 string key (如 "10000001")
- value = {name, parameter, math_type, value, description, category_for_memory_slot}

---

## 3.5 计算分工（**三类、不是二分**）

游戏数值 pipeline 分**三**阶段、不是简单 server vs client：

```
master_tables (静态 schema)
    ↓
server pre-fold (玩家点「开始战斗」CreateBattleSession 时一次性算)
    ↓ push user_weapon (含 fold 完的 attack/defense/speed/break_value/max_hp + 8 block weapon_skills[] PSV 池)
client BattleEngine (战斗中 in-battle PSV 路径、EAD/PAD/EBD/PBD 50 步 d8 累积)
    ↓
final damage
```

### 字段分工总表

| 字段 | 类 1: server pre-fold | 类 2: client 战前一次算 | 类 3: client 战斗中动态 | server push 终值? |
|---|---|---|---|---|
| `max_hp` | ✓ **完整**（含 element / marriage / cross-slot Add）| — | ✗ 无路径（BE PassiveSkill enum 没 HP entry）| ✓ 终值 |
| `attack` | ✓ 静态 (slot_Add + BH + costume_Mul) | — | ✓ 动态 (element / marriage / RemHP / Vitality) | ✗ 半成品 |
| `defense` | 同 attack | — | 同 attack | ✗ 半成品 |
| `speed` | 同 attack (无 BH multiplier) | — | 同 attack + SpeedSkill + UpdateLatestRecover | ✗ 半成品 |
| `break_value` | 同 attack | — | ✓ 走 PSV `GuardBreak` 池 | ✗ 半成品 |
| **`hit_counts'[]`** | — | ✓ **战前 DeckHitCount 顺序累积 + int 截断**（[01_setup.md §1.4](../../unpacking/HOWTO_battle/01_setup.md)）| ✗ 战斗中不重算 | — |
| **`motion_speed`** | — | — | ✓ base master `motion_speed1/2/3` × Fighter.BoostAttackSpeed(PSV MotionSpeed=8) | — |
| per-hit damage | — | — | ✓ 50 步 EAD/PAD/EBD/PBD d8 累积 | — |

### 类 2 / 类 3 关键区别

| 维度 | 类 2: hit_counts 战前 | 类 3: attack/motionspeed 战斗中 |
|---|---|---|
| 何时算 | deck 装好、点「进副本」前 | 每 hit 触发 EAD/PAD 时 |
| 公式 | **顺序累积、逐 skill int 截断**（Mul/Add 混在同一序列） | **Mul 池 + Add 池分离**（结合律 + 交换律、math 等价） |
| 战斗中变化 | 无（固定） | 动态（HP-curve / Break gate / IsBlaze gate 等条件变化） |
| math_type 编号 | **#JS vs #BE 反转**（JS Mul=1 / Add=2、BE Mul=2 / Add=1）| 用 BE 编号 |
| Addition 位置策略 | **放前面累积更划算**（避免后续乘法小数被截断丢） | 池内无所谓（结合律满足）|

`HitCount / AttackCount / WeaponArtsHitCount` 都走类 2 顺序累积、共用 `JobSkillExtensions.HitCount @ 0x34A974C`。

### Server-fold 公式 ([01_setup.md §1.1.1-1.1.2](../../unpacking/HOWTO_battle/01_setup.md))

**attack/defense/speed/break_value**（半成品、客户端在战斗中加动态部分）:

```
attack  = (raw_attack(含 level/mature/affection) + Σ slot_attack_add) × BH_multiplier   ← int 截断
defense = (raw_defense + Σ slot_defense_add) × BH_multiplier                            ← int 截断
speed   = raw_speed + Σ slot_speed_add                                                  (无 BH multiplier)
break   = 类比 attack
```

**max_hp**（唯一完全 server-fold、slot 顺序影响 ±24%）:

```
max_hp = (max_hp_base + Σ_HP_Add_from_earlier_slots) × Π_HP_Mul + Σ_HP_Add_from_later_slots
```

理由：`JobSkill.Parameter.HP=74` 在 `BattleEngine.Skill.Parameter` enum 里没对应、客户端 PSV 列表无 HP 类 entry、必须 server 一次性 fold 完。

**BH (Burning Heart) 离散梯度** ([01_setup.md L53](../../unpacking/HOWTO_battle/01_setup.md)):

| BH 把数 | multiplier |
|---|---|
| 0-1 | ×1.0 |
| 2 | ×1.10 |
| 3 | ×1.27 |
| ≥4 | ×1.30 (饱和) |

**docs 注明"闲置时随时间衰减、精确衰减率未量化"** — 衰减公式没公开。

### Server push 的 8-block PSV 池 ([01_setup.md §1.1.4](../../unpacking/HOWTO_battle/01_setup.md))

进副本时 server 推 `user_weapon.weapon.weapon_skills[]` 按 8 block 优先级追加：

| block | 内容 | 来源 |
|---|---|---|
| 1 | weapon_innate Mul/Add | weapon 自带 (不含 HP / WeaponArtsCost) |
| 2 | memory_slot Mul 类 | affection slot `category_for_memory_slot` 以 `Skill` 结尾 |
| 3 | materia Attack 类 | materia parameter ∈ {Attack, Vitality_Attack, ...} |
| 4 | marriage 4 条固定 | id 70204 (Attack) / 70304 (GuardBreak) / 70404 (Defense) / 70504 (Speed) |
| 5 | costume / 魔装 | weapon_costume_effects |
| 6 | guild 公会加成 | Attack Mul 1.0625 等 |
| 7 | memory_slot Add 类 | `category_for_memory_slot = DamageLimitBreak` |
| 8 | materia DLB 类 | materia DamageLimitBreak parameter |

block 顺序对 `Multiply` / `Addition` 池**数学等价**（结合律 + 交换律），对 `Reduce100` (math_type=3) / stack 上限 / 优先级 skill **不等价**。

### 数据流（4 个 master view）([01_setup.md §1.1.2 表](../../unpacking/HOWTO_battle/01_setup.md))

| view 来源 | attack 含义 | slot Add 折叠 | BH 倍率 |
|---|---|---|---|
| `GetUserWeaponList`（准备页） | 纯 raw 镜像 | ✗ | ✗ |
| `CreateBattleSession`（点"进副本"） | base + slot + 当前 BH | ✓ | ✓ |
| 副本结算 response | base + slot + 当前 BH | ✓ | ✓ |
| `UserWeaponDetail`（魔剑详情页） | `buffed_attack`、含静态 Mul 子集 | ✓ | ✓ + 静态 Mul |

### 对前端 hensei calc 的 implication

server fold 公式 docs 完备、但 BH 衰减率未公开。v2 简化：不复刻 server fold、不读 user_weapon raw、**沿用旧 wiki 等级公式 + master initial_/max_ 字段**（用户决定）。具体公式见 [hensei_calc.md](hensei_calc.md) Base 计算段。

---

## 3.7 hensei 基础属性 base 计算（v2 简化版、Phase 3 前端复刻）

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
| 满觉醒倍率 | 1.43 | 2.42 | 4.45 | 5.37 |

- 每觉醒 +5 等级、不受其他限制
- `实际等级上限 = 熟度对应上限 + 觉醒数 × 5`

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
2. 最终 = k × (1 + (当前lv − cap) / (最大觉醒数 × 5) × (满觉醒倍率 − 1))
```

### Burning Heart (BH) — v2 简化为二元 toggle

| 状态 | 倍率 |
|---|---|
| BH on (默认) | ×1.3 |
| BH off | ×1.0 |

**不实现衰减**（docs §1.1.2 衰减率未公开）、UI 加 toggle、默认 on。
作用：仅攻撃力（同 wiki "燃心" 概念、跟 server fold 的 BH multiplier 同源但简化为二态）。

### 結婚 / LP (详见 [hensei_calc.md](hensei_calc.md) chara_meta source)

**結婚倍率**（作用**攻防 HP BK speed 5 项**）：

| 状态 | 倍率 | 結晶 slot | max_lp |
|---|---|---|---|
| 未結婚 | ×1.00 | +0 | +0 |
| 結婚（花无）| ×1.03 | +1 | +3 |
| 結婚（花有）| ×1.05 | +1 | +3 |

**LP**（剩余 LP / 总 LP、`max_lp` 来自 master + 結婚加成）：

- 正常（> 1/2 LP）×1.0
- 低 LP（≤ 1/2 LP）×1.1
- 危機（≤ 1/4 LP）×1.5
- 仅作用攻撃力

---

## 4. 计算 pipeline 参考 (Phase 3 前端 hensei calc)

### 4.1 50 步 EAD / PAD / EBD / PBD

详见 [unpacking/HOWTO_battle/03_ead.md §3.2](../../unpacking/HOWTO_battle/03_ead.md) — 完整 50 步 d8 累积器、含 gate / Mul 池 / Add 池 / BD 链。

简表：

| step 区间 | 内容 |
|---|---|
| 1-4 | base + BlazeAttack + Blaze 倍率链 + BlazeRankRate |
| 5-9 | ability matchup (Element/Weapon/AttackAbility) |
| 10-25 | Defense Mul / Attack Mul / Break Mul (+ HP-curve scale + IsBreak hard gate) |
| 26-37 | Blaze 链 (12 步、IsBlaze gate 控制) |
| 38-46 | Defense Add / Attack Add / Break Add |
| 47-48 | Enemy_BreakAttack Mul/Add (PSV 末段) |
| 49 | MP 不足惩罚 (sqrt) |
| 50 | RandomRate (×0.95~1.00 单边衰减) |

后 step 50 直接 `ceil` → `BattleDamage.Total` → DamageLimitBreak clamp → 输出。

### 4.2 HP-curve scale 公式（Phase 3 前端复刻）

- `RemHpSkillRate @ 0x19485CC` — 待 Frida 实测精确公式
- `VitalitySkillRate @ 0x19486F0` — 同
- 占位公式: `scale = clamp(HpRate, 0, 1)` (Vitality) / `scale = clamp(1 - HpRate, 0, 1)` (RemHP)

### 4.3 IsBlaze / IsBreak gate

- IsBlaze gate: EAD step 1-4 + 26-37 (全 Blaze 链) 在 `IsBlaze=true` 才激活
- IsBreak gate: EAD step 25 / 46 (Break Mul/Add) 在 `IsBreak=true` 才激活
- 详 [02_psv_gates.md §2.2](../../unpacking/HOWTO_battle/02_psv_gates.md)

---

## 5. 跨参考

| 主题 | 链接 |
|---|---|
| #JS vs #BE 偏移 / sentinel | [unpacking/HOWTO_battle/11_parameters.md](../../unpacking/HOWTO_battle/11_parameters.md) |
| EAD 50 步反编译 | [unpacking/HOWTO_battle/03_ead.md](../../unpacking/HOWTO_battle/03_ead.md) |
| EBD (敵端破甲) | [04_ebd.md](../../unpacking/HOWTO_battle/04_ebd.md) |
| PAD (玩家端攻) | [05_pad.md](../../unpacking/HOWTO_battle/05_pad.md) |
| PBD (玩家端破甲) | [06_pbd.md](../../unpacking/HOWTO_battle/06_pbd.md) |
| Damage clamp / DamageLimitBreak | [09_damage_clamp.md](../../unpacking/HOWTO_battle/09_damage_clamp.md) |
| 战斗 setup | [01_setup.md](../../unpacking/HOWTO_battle/01_setup.md) |
| RVA 表 | [A_rva_table.md](../../unpacking/HOWTO_battle/A_rva_table.md) |

