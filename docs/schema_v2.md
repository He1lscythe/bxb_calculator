# Schema v2 — 按解包 master_tables 设计

> **Status**: WIP (Phase 1 enum + 设计原则)、Phase 2 起填实际 build script 输出 schema
>
> **Scope**: refactor/unpacking-source branch 限定、永不 merge 回 main
>
> **Data source**: `F:/OneDrive - Northeastern University/Game/BxB/unpacking/master_tables/<latest>/`
> 详见 [scripts/master_to_business/paths.py](../scripts/master_to_business/paths.py)

---

## 1. 设计原则

### 1.1 完全脱离 wiki 推断体系

wiki crawl 项目的核心 enum 在 v2 全部废弃：

| 旧 wiki enum | 用途 | v2 替代 |
|---|---|---|
| `bunrui` (21 种 int) | 技能分类 | `parameter` (#JS 91 项字符串)、信息更全 |
| `calc_type` (4 种 int) | 倍率作用方式 | `math_type` (3 种字符串)、删 wiki 推断的 2/3 "最终加算/最终乗算" |
| `scope` (5 种 int) | 作用范围 | `range` (3 种字符串) + 多条件字段 (`element_condition` 等) |
| `condition` (5 种 int) | 触发条件 | 分散到 parameter prefix (HP-curve / Break) + 多条件字段 |

### 1.2 数据来源单一权威

- `master_tables/*.json` 是游戏服务器下发数据、ground truth
- 不做 classify (wiki 那种 NLP 关键词扫)、所有字段直接透传
- 不跟 wiki 数据 cross-check stats、信任解包 `initial_*` / `max_*`

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

```jsonc
{
  "id": 1001,                       // base_id 4 位
  "name": "レヴァンテイン",
  "rarity": 4,
  "element_id": 1,
  "weapon_type_id": 1,
  "states": {
    "通常": {                       // EVOLVE_COUNT[0]
      "variant_id": 100101,         // weapons.id 6 位
      "stats": {
        "initial_hp": ..., "max_hp": ...,
        "initial_attack": ..., "max_attack": ...,
        "initial_defense": ..., "max_defense": ...,
        "initial_break": ..., "max_break": ...,
        "initial_speed": ..., "max_speed": ...
      },
      "weapon_skills": [
        {
          "innate_id": 10101,        // weapon_innate_skills key
          "name": "...",
          "parameter": "Attack",     // #JS 1
          "math_type": "Multiply",
          "value": 1.05,
          "range": "All",
          "target_element_id": 1,
          "weapon_type_id": 0,
          "description": "..."
        }
      ]
    },
    "改造": { ... },                // EVOLVE_COUNT[1]
    "極弐": { ... }                 // EVOLVE_COUNT[2] (optional)
  },
  "bd_skill": {                    // weapons.weapon_arts 内嵌 → 顶层 (跨 state 共享)
    "name": "...",
    "cost": 3,                     // WeaponArtsCost
    "hit_count": 16,               // WeaponArtsHitCount
    "range": "All",
    "duration_type": "Timer",
    "duration_value": 30.0,
    "effects": [...]
  },
  "omoide": []                     // Phase 1+ 留空、待抓包 (memory_slot_skills 关联)
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

---

## 6. Phase 进度跟踪

| Phase | 状态 | 输出 |
|---|---|---|
| 0 分支 + paths.py | ✅ done | scripts/master_to_business/paths.py |
| 1a enums.py 骨架 | ✅ done | 7 enum + EVOLVE_COUNT |
| 1b PARAMETER 91 项 | ✅ done | #JS 完整 enum |
| 1c RANGE + 条件字段说明 | ✅ done | RANGE + CONDITION_FIELD_NAMES |
| 1d schema_v2.md outline | ✅ done | 本文档 |
| 2 build scripts (6 个) | 🚧 pending | data/*.json |
| 3 前端 rewrite | 🚧 pending | shared/* + pages_src/* |
| 4 测试 | 🚧 pending | tests/* 全重写 |
| 5 清理（不 merge）| 🚧 pending | 删 wiki crawl 代码 |
