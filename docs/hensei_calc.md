# Hensei Calc 4-Stage Pipeline 设计

编成 (hensei) stat 计算流水线设计文档。最终 stat 值 = base 经 4 stage 顺序 apply 后得出。

## 整体流程

```
chara metadata (lv / 熟度 / 觉醒)
       ↓
calcStat()  ←──── 觉醒倍率内嵌 (比 omoide 优先于 base)
       ↓
   base stat
       ↓
collection: 遍历 3 slot、给每个 effect 打 source tag
       ↓
{ source, parameter, math_type, value, condition_factor }
       ↓
分 4 stage、按 stage 顺序 apply
       ↓
   final stat
```

## Base 计算 (stage 0)

`calcStat()` ([shared/stats-calc.js](../shared/stats-calc.js)) 在进入 stage 1 之前已完成：

- 等级公式: `max × (1 - (max_max_level - lv) / (max_max_level - 1) × initial / max)`
- 熟度 → 等级上限: `min(max_max_level, initial_max_level + (mature - 1) × 5)`
- **觉醒倍率内嵌** (`MAX_AWAKENING` / `AWAKENING_FULL_MULT`): SS 9 段觉醒满 → ×1.43、S 14 段 → ×2.42、AA 36 段 → ×4.45、A 24 段 → ×5.37
- 觉醒倍率应用在 base 算法里、**不进 stage pipeline**

omoide memory slot 加成走 stage 1、不参与 base 计算。

## Stage 表 (跟 trace stage key 一致)

| stage | source | math_type 过滤 | 含义 |
|---|---|---|---|
| **s1** | `omoide` (memory slot) | `Addition` | 好感加算 — omoide 槽插入的 memory slot effect |
| **s2a** | `masou` (静的のみ) | `Addition` | masou 装备 add — **HP-curve 类 (Vitality_/RemHP_/Break_/FellDown_) 除外** |
| **s2b** | `masou` (静的のみ) | `Multiply` | masou 装备 mul — 同上除外 |
| **s2c** | server-fold floor | — | Stage 2 終: base+omoide+masou 都是 server 算、返回整数 → floor |
| **s3** | LP tier | (×Total) | 只 Attack、入口 lpMult |
| **s4a** | `chara_skill` / `bd_skill` / `crystal` / `bg` / `chara_meta` / `omoide_mul` / `enemy_buff` | `Multiply` | 非 soul 类乘算、slot 升序 |
| **s4b** | `soul` / `soul_affinity` | `Multiply` | soul 类乘算 (排非 soul 后)、slot 升序 |
| **s5a** | 非 soul 类 (同 s4a) | `Addition` | 非 soul 类加算 |
| **s5b** | soul 类 | `Addition` | soul 类加算 |
| **s6** | `enemy_break` | Mul → Add | step 48/49、gate enemy.bk |
| **s7** | inline ×3 | (×Total) | step 51、只 Attack、enemy.bk gate |
| **s7b** | 出口 ceil | — | 唯一 round 点 |
| **s8** | enemy mods | (×Attack/BK) | 属性相性/難度/有利武器/BD cap、stage 后 ceil |
| 独立 | 任何 source | `Repel_Percent` | status 回避率、独立通道、不进 stat pipeline |
| skip | 任何 source | `None` / `Set` / `NoEffect` parameter | 跳过、不渲染、不参与 calc |

s4/s5 的执行顺序 = trace 显示顺序 (2026-06-10 用户决策): 非 soul (slot 升序) → soul (slot 升序)、
逐 effect apply (`shared/stats-calc.js applyStaged`)。

## Apply 公式 (7-stage + ceil、unpacking 03_ead.md 校准 2026-06-06)

按 unpacking §3.3 EAD 53 step RVA 顺序简化、保留 hensei UI 关心的部分:

```
v = floor(base)                                       Stage 0 base (server-fold floor、01_setup.md §1.5)
v += Σ(stage 1 omoide Addition × cf)                  Stage 1 omoide Add (Frida 抓包 affection_threshold gate)
v += Σ(stage 2a masou Addition × cf)
v *= Π(stage 2b masou Multiply × cf)                  Stage 2 masou (Add → Mul)
v = floor(v)                                          Stage 2 終 server-fold floor (base+omoide+masou 都 server 算、返回整数)
v *= lpMult                                           Stage 3 × LP tier (step 4、× Total 直接层)
v *= Π(s4a 非soul Multiply × cf)                      Stage 4a chara_skill / bd_skill / crystal / bg / chara_meta / omoide_mul / enemy_buff (slot 升序)
v *= Π(s4b soul Multiply × cf)                        Stage 4b soul / soul_affinity (slot 升序、排非 soul 后)
v += Σ(s5a 非soul Addition × cf)                      Stage 5a 同 4a 分类
v += Σ(s5b soul Addition × cf)                        Stage 5b 同 4b 分类
v *= Π(stage 6a enemy_break Multiply × cf)            Stage 6a Enemy_BreakAttack Mul (step 48、gate enemy.bk)
v += Σ(stage 6b enemy_break Addition × cf)            Stage 6b Enemy_BreakAttack Add (step 49)
v *= enemyBkX3                                        Stage 7 × 3 inline (step 51、enemy.bk gate、独立 cached gate)
v = ceil(v)                                           出口 ceil (caller get_Damage frintp + fcvtps、唯一 round 点)
```

**取整位置**:
- Stage 0 base = `floor(_baseStatRaw)` (server-fold 模拟、chara 创建时 server 已 int)
- **Stage 2 終 floor** (2026-06-10 用户确认): base + omoide + masou 都是 server-fold、server 返回整数 → `floor(v)`
- Stage 3 起 (client 侧 EAD pipeline) 全程 double、0 中间 round (unpacking §3.12.1: 50 步 d8 链 0 ARM64 rounding 指令)
- 出口 ceil = caller `get_Damage` `frintp + fcvtps`、client pipeline 唯一 round 点

**LP tier × Total** (step 4、unpacking §3.5):
- `computeStats` (普通攻击、UI 显示): HpCheck `[1.0, 1.1, 1.5, 2.0]` → tier 0/1/2/3
- `computeStatsBlaze` (BD 攻击伤害、UI 暂不显示): LpCheck `[1.0, 1.3, 2.0, 5.0]`
- 用户决策: **tr.bd_on 不切表**、bd_on 仅 toggle bd_skill.effects 加入 Stage 4 buff
- 由入口函数决定 lpTier 表、`applyStaged` 接 `opts.lpMult` 参数

**Enemy_BreakAttack Stage 6**:
- 不进 stage 4/5 跟其他 source 混
- gate `enemy.bk=true` 时 condition_factor=1、否则 0
- `baseParameter('Enemy_BreakAttack')` → `'Attack'` (本质是 Attack 倍率)

**Stage 7 inline ×3** (unpacking §3.10 step 51):
- enemy.bk=true 时 Total ×= 3
- 跟 Stage 6 Enemy_BreakAttack 用**独立 gate** (cached isBreak vs fresh EnemyGuard.IsBreak)
- 通常两 gate 等价、hensei 简化用同 `enemy.bk` flag

## HP / HitCount — 战前 server-fold (不走上面的 EAD 分组 pipeline)

**攻撃力/防御力/ブレイク力** 走 in-battle EAD pipeline (applyStaged、Mul-then-Add 分组、unpacking 03_ead.md §3.3 逆向实证)。
但 **HP 和 HitCount 是战前 (CreateBattleSession / DeckHitCount) server 一次性 fold 的、客户端不重算**:

- **HP** (unpacking archive/HOWTO_hp_calc.md): `max_hp = (base + Σ前置slot的HP-Add) × Π自身HP-Mul + Σ后置slot的HP-Add`、**slot 顺序敏感** (自身/靠前 slot 的加算落在乘算"内"、靠后 slot 落在"外")。**终值 `floor` 取整** (server max_hp 为整数、base 已 floor、用户决策 2026-06-19;唯一一次取整、中间不 round)。
- **HitCount** (unpacking 17_hitcount.md §17.2.1 / §17.8.3): 逐 effect `cur = trunc(cur op val)` + **每步 clamp ≥1**;per-step clamp **对顺序敏感** (`Mul→clamp→Mul ≠ Mul→Mul→clamp`)。

两者都按 **server 拼 weapon_skills 数组的 block 顺序逐 effect 应用、不分组 Mul/Add** (2026-06-19 用户指定、`shared/stats-calc.js orderServerFold`):

```
自身好感(omoide) → 自身costume(masou) →
  1号位[技能(chara_skill/bd/結婚等meta) → 结晶 → costume] →
  2号位[技能 → 结晶 → costume] → 3号位[技能 → 结晶 → costume]  (各 slot 自身的 costume 已在最前面、此处跳过) →
  1/2/3号位 bg → 1/2/3号位 魂(soul)
```

> ⚠ caveat: server 数组的精确 block 顺序文档本身标注「推测、未验证」(weapon_skills_order.md);hensei 是从多 wiki 源自己收集的、按此顺序**尽量贴近**、非逐位精确。HP 的 slot 顺序效应也是实测推算。
> 实现: `serverFoldHP()` (HP)、`_computeImpl` hits loop (HitCount) 都调 `orderServerFold(list, targetSlotIdx)`。trace 里 HP 走独立 stage `s_hp_fold`。

### HitCountKeepDamage (双效果、2026-06-19 用户)

`HitCountKeepDamage` parameter 有两个效果:
1. **加 hit**:跟普通 HitCount 一样计入段数(`serverFoldHitCount` filter 含它)。
2. **减攻(保伤)**:加了 B 段的同时把 Attack ×= `A / (A + B)`,让フルヒット = Attack×段数 保持不变。
   - `A` = 目标魔剣**原始 hit_counts 之和**(characters.json、未经任何计算);`B` = 本效果加 hit 总量(`value × 3` 或 `Σvalues[]`)。
   - 这条减攻 `math_type=Multiply`、`parameter=Attack`,进 **Attack PSV 池**(applyStaged Stage 4 Mul、跟原 source 同 stage)。
   - 实现在 `collectEffects` 的 `pushEff`:推完 hit entry 后,若是 HitCountKeepDamage 再派生一条 Attack Mul effect。

### BD 条数 (bd_count、2026-06-19 用户)

`tr.bd_on=ON` 时 bd_skill.effects 当 buff 加入。各 effect 倍率/值 = `value + additional_value × bd_count`:
- `bd_count` 来自 hensei BD toggle 右侧输入框(`tr.bd_count`、默认 = `bd_skill.cost`、范围 0..bdCapMax)。
- 例 天業剣クリーフォート bd effect `value=20.48, additional_value=1.36`,bd_count=7 → 20.48 + 1.36×7 = 30.00。

## Defense stat 公式 (unpacking 19_defense.md §19 PAD step 3)

hensei「防御力」显示 = `s10` (玩家防御吸收量、damage units) = `base × Π Mul + Σ Add`。

**用户决策**:
- 只显示玩家防御值、**不算被打时最终伤害** (即不模拟 §19.12 `final_damage = prevTotal × s8 + max(0, prevTotal × (1 - s8) - s10)` 公式中的 final_damage、只显示 s10)
- **SwapAttackDefense=true 模式** (剑魂特殊玩法、§19.2 表)**不考虑**、所有 Attack/Defense chain 按 `swap=false` (正常对战)

简化模型跟 §19 phase 1-5 累积公式数学等价 (mul/add 累积、ARM64 不同 phase 物理位置不影响结果)、跳过 7 phase 内部细分。

**Defense stat 流经的 stage** (跟 Attack 不同点):
- ✅ Stage 1-2 (omoide / masou Add+Mul) 同
- ❌ Stage 3 LP × (LP 是 Attack 系 step 4、Defense 不接、`opts.lpMult=1` 默认)
- ✅ Stage 4-5 (other Mul/Add) 同 — 含 `Vitality_Defense` / `RemHP_Defense` / `Break_Defense` (`baseParameter` strip → 'Defense'、被 stage 4 filter 接到)
- ✅ Stage 6 `Enemy_BreakDefense` (master 实际无、兼容)
- ❌ Stage 7 inline ×3 (是 Attack 系 step 51、Defense 不接、`opts.enemyBkX3=1` 默认)
- ✅ 出口 ceil

**soul_affinity 给 Defense 用 negative_value** (§19 phase 2 ElementDefRate × WeaponDefRate 对应):
- Attack/BK 路径用 soul `positive_value` (§3 EAD step 7-8)
- Defense 路径用 soul `negative_value` (§19 phase 2)

**未实施 / 暂略**:
- `MinDamageRate` (master `min_damage_rate` 2-5%): 保底伤害比例、计算 incoming damage 用、UI 不显示
- `JustGuard_MinDamage` (PSV param 62): JG 时修正保底比例、同上
- §19.4 7 phase 内部细分 (用户决策简化、数学等价无影响)

`condition_factor` 在 collection 阶段算好、跟 value 配套存（`hp_pct` = **接收方 target 自身 HP%**，range=All 的 HP-curve buff 从别 slot 来时看接收方而非 source，2026-06-19 修正）：
- HP-curve `Vitality_*`: `factor = hp_pct / 100`
- HP-curve `RemHP_*`: `factor = (100 - hp_pct) / 100`
- Break gate `Break_*`: `factor = 1 if hp_pct < 50 else 0`
- FellDown gate `FellDown_*`: `factor = 1 if any_teammate_hp_zero else 0`
- 元素/武器/chara 限定不命中: `factor = 0`
- 无 condition: `factor = 1`

Multiply 池累乘使用 `factor` 衰减增量、非整体倍率:
```
v *= 1 + (value - 1) × factor
```
factor=0 时不衰减 (×1)、factor=1 时全量 (×value)。

### 専属条件 override (`SKILL_COND_OVERRIDE`、2026-06-23 / 扩展 2026-06-24)
个别魔剣技能的触发条件**只在 description 文字里、master 无结构化字段** → 用 `stats-calc.js` 的 `SKILL_COND_OVERRIDE` 表 (skill_id → 条件对象) 手动标,`pushEff` 命中 (仅 `source==='chara_skill'`) 时换算 factor:
- `{ type:'mp_not_full' }` — `60009` **気高き悪食の世界樹**: `factor = 1 if curMp < maxMp else 0` (魔力未満で `Attack ×3`)。区别于通用 **mpRate** (所有魔剣自身基础攻击/ブレイク随 `mp_ratio<0.5` 缩放);这是**个別技能专属触发**、解耦。
- `{ type:'team_has', wbid:<base id> }` — 「**Xと同編成で**」(队伍含指定魔剣才发动): `factor = 1 if 队伍任一 slot 的 chara._master.id === wbid else 0`。共 8 条 (master 无字段、伙伴名只在描述):

  | skill_id | 来源魔剣 | 伙伴 (wbid) | 效果 | range |
  |---|---|---|---|---|
  | 60007 / 80442 | アマツミカボシ | アマテラス (1176) | ヒット数+10 / ダメ上限+30億 | Single |
  | 60066 | — | 練刀･有里村正 (1519) | 攻撃モーション加速 | Single |
  | 60067 | — | 練刀･七詩村正 (1518) | 攻撃力×1.5 | Single |
  | 80181 | — | 司書王使･吽形 (1606) | 味方全体ダメ上限+1.3億 | All |
  | 80182 | — | 司書王使･阿形 (1605) | 味方全体ヒット数+1 | All |
  | 80198 | — | 魔天猫ルコ (1182) | 味方全体ダメ上限+2.2億 | All |
  | 80199 | — | 魔天猫リーナ×ロスト (1528) | 全属性攻撃モーション加速 | All |

- 新增同类 (条件只在描述的专属技能) → 表加一行 + `pushEff` 加对应 factor 分支即可。

### Rise_AttackRate 放大器 (meta-pass、2026-06-23)
`Rise_AttackRate` 是元倍率「**魔剣が持つ攻撃力アップスキルを V 倍受ける(潜在Skill除く)**」。collectEffects 收完所有 effect 后做一次 meta-pass:
- 目标自身 (魔剣固有) 有 `Rise_AttackRate` (值 V) → 把目标**自身 loadout** (`_src_slot===target`) 的 **Attack 系** (`base_parameter==='Attack'`,含条件式 `Vitality_/RemHP_/Break_/FellDown_Attack`) 增益 ×V:
  - `Multiply M → M·V` (倍率直接 ×V,例 ×1.2 → ×3.0);`Addition A → A·V`。
- **source 限** `chara_skill / crystal / bg / soul`;**排除** `omoide`(「潜在Skill除く」、因 `is_original_skill` 在自身/omoide 全为 true 无法区分,故按 source 排)、`chara_meta`(結婚/燃心/LP/MP)、`soul_affinity`、`enemy_buff`、`Rise` 自身。
- 目前仅 2 个魔剣: `1508 蒼き悪竜の渇欲` / `1530 もちもち` (均 V=2.5);它们自身无 Attack-up 技能,放大的是装在该角色上的结晶/魂/BG/技能 Attack 增益。

## DamageLimitBreak (DLB) — 伤害输出 cap、跟 stat 显示无关

hensei viewer **只显示 stat (Attack / Defense / HP / BK)**、不算伤害输出、所以 DLB cap 不进 stats-calc。

如果未来加伤害预估面板、再按 unpacking [09_damage_clamp.md §9.5](../../unpacking/HOWTO_battle/09_damage_clamp.md#95-updatelimitmaxdamage--0x1943078--核心公式) 实现：

```
limitMaxDamage = floor((2^31 - 1) × multiply + addition)
final_damage = clamp(Total, 0, limitMaxDamage)
```

`multiply` / `addition` 来自 `DamageLimitBreak` parameter 池 (jobs / weapons / materials 共 544 个 skill、详 §9.10) 的 Mul / Add fold。默认 `limitMaxDamage = 2^31 - 1` (~21 亿)。

## Repel_Percent 独立通道

`Repel_Percent` 不影响 stat 数值、是 status 回避率：

```
repel_rate(status) = Σ(value × condition_factor for effect.parameter matches status)
clamp(repel_rate, 0, 100)
```

例: `Mez Repel_Percent 50` 表示 50% 几率全免疫麻痺。多 effect 累加、cap 100%。

## 删除的 enum

历史遗留、不再支持:

- **`Set`** (`math_type=2` / `calc_type=4`): master 数据 chara 端无、UI 不渲染、collect 阶段跳过
- **「最終加算」** (`calc_type=2`): 早期 plan 假想字段、master 没对应、彻底废弃
- **「最終乗算」** (`calc_type=3`): 同上

`utils.js` `ctPfx()` 不再覆盖 calc_type 2/3/4。adapter `_MATH_TYPE_TO_CALC` 表只保留 Multiply/Addition/Repel_Percent。

## 实现

实际实现在 [shared/stats-calc.js](../shared/stats-calc.js):
- `collectEffects(team, targetSlotIdx, ctx)` — 3 slot 全 source 收集进 effects[] 池、附 `_source` / `_src_slot` / `_src_name` (trace 显示)、
  按 `range` + element/weapon/chara 限定决定命中 (`_effectApplies`):
  - **`element_condition` / `weapon_type_condition`**(souls「X属性装備で…」)= 判**装备者(source/equipper)**自身属性·武器、不命中整条不激活 (range=All 时看装备者而非接收方、2026-06-19 扫描确认: souls 全用 *_condition、weapons 全用 target_*)。
  - **`target_element_id` / `weapon_type_id`**(weapons/crystals「X属性の味方…」)= 判**接收方(target)**过滤 (+ `extra_element_id` 扩展接收)。
  - **`weapon_base_id`**(soul「X装備で」master 原生 / crystal·bg「Xのみ・純真/秘録記憶」build_*_aux 反查注入、**统一字段名**)= 判**装备者(source)**那把魔剣 base id 门槛 (跟 `sm.id` 比对、不是 target;range=All 时门槛只判装备者一次、范围交给 range)。chara≡魔剣、同一 base id 空间。*(2026-06-24: 旧实现误比 target、All-range「装備者は X、全体に…」型队友漏吃 → 修为比 sm)*
  HP-curve / gate 类在收集时算好 `condition_factor`
- `applyStaged(base, parameter, effects, opts)` — 按上面 stage 表逐 effect apply (+0/×1 跳过、出口 ceil)
- soul: 收集时 `value × soulMultiplier(rarity, soul_lv)` 一刀切 (所有 math_type、Multiply 直乘是游戏行为、2026-06-10 用户实测确认 ×1.45 → lv50 ×2.175)、
  HitCount `values=[a,b,c]` 数组每段同样 × soulMultiplier (`stageMult` 路径)
- crystal: 收集时 `crystalEffectiveValue(cr, cfg)` (lv/weight/purity 三参公式)

## その他 panel 値 (4 stat 以外)

| 値 | 公式 | 实现 |
|---|---|---|
| Hit1-3 | 战前 server-fold:按 `orderServerFold` 顺序逐 effect、每步 `cur = trunc(cur op val)` + **每步 clamp ≥1**(顺序敏感、见上节)、终 `max(1)` | `_computeImpl` hits loop |
| フルヒット攻撃力 | `floor(Attack × Σhits)` | 同上 |
| ダメ上限 | `floor(2^31-1 × ΠMul + ΣAdd)` DamageLimitBreak 池、单 loop 按 effects 顺序 | 同上 |
| 転速 | `latestRecover = ΣAdd + (soul_lv/100+1) × ΠMul × base.Speed`、cooldown = `max(1, ceil(6000/recover))` fr | `_computeSpeed` |
| 攻速 1-3 | `motion_speed_i × ΠMul + ΣAdd`、帧 = `1 + max(1, ceil(dur/spd × 60))` | `_computeMotionSpeed` |
| BD上限 max | `max(9, floor((9 + Σadd) × Πmul))` BlazeGaugeMaxLevel 池 | `_computeImpl` |
| 初期BD | BlazeGauge Add (mode 1 直接 / mode 2 队伍属性 count) → cumsum 反查 level | `computeBlazeGaugePoints` + `bdCapFromBlazeGauge` |

---

## UI 控件 ↔ 计算联动 checklist

**每次修改 hensei viewer / stats-calc 必检**。Playwright e2e 测试也按此表覆盖。

### 控件 → tr 字段 → 影响

| 控件 | 字段路径 | 影响 stat / effect | 状态 |
|---|---|---|---|
| **chara state** (通常/改造/極弐) | `tr.state` | 切 state 后 base stat + weapon_skills 来源全变 | ✅ |
| **chara level** slider | `tr.level` | base stat 等级公式 | ✅ |
| **chara 熟度** (jukudo) slider | `tr.jukudo` | base stat lv cap (`initial_max_level + (j-1)*5`) + chara_skill value_scaling × (j-1) | ✅ |
| **chara 觉醒** slider | `tr.awakening` | base lv cap +5×awk、stat 走觉醒段公式 | ✅ |
| **chara HP%** slider | `tr.hp` | HP-curve factor (Vitality/RemHP linear、Break < 50%) | ✅ |
| **結婚** toggle | `tr.marriage` | 5 项 stat × {1.0/1.03/1.05}、結晶 slot +1 (state 内 initial_slot+1) | ✅ |
| **燃心** toggle | `tr.moeshin` | 攻撃力 × 1.3 | ✅ |
| **LP** 档 | `tr.lp` | 攻撃力 × {1.0/1.1/1.5} | ✅ |
| **MP** slider [0, `_master.mp`] | `tr.mp` (null=満) | 攻撃力 / ブレイク力 × MP rate (unpacking §3.9.1): `mp_ratio = mp / _master.mp`;`mp_ratio < 0.5 → 1 − (20/21)·√(1 − 2·mp_ratio)`、`≥ 0.5 → 1.0`。境界 ratio 0 → 1/21、ratio 0.5 → 1.0 (旧 have_mp toggle 两端的泛化) | ✅ |
| **BD ON/OFF** toggle | `tr.bd_on` | ON → `bd_skill.effects[]` 当普通 buff 加入 stat、倍率 = `value + additional_value × bd_count`。不影响 IsBlaze gate / BD 伤害公式 (Phase 8) | ✅ |
| **BD 条数** input (仅 bd_on 时显示) | `tr.bd_count` | bd_skill effect 的 `additional_value × bd_count`。默认 `bd_skill.cost`、范围 0..bdCapMax | ✅ |
| **soul level** slider | `tr.soul_lv` | 所有 soul effect `value × soulMultiplier(rarity, lv)` (表: lv≤r×10 → 1+0.01lv; 之后到 75 渐进 +0.3/+0.1)。Multiply 直乘 (×1.45 → lv50 ×2.175、游戏行为)、HitCount values 数组同样缩放 | ✅ |
| **soul 觉醒** slider | `tr.soul_awakening` | soul max_lv += 5 × soul_awakening (cap 75) | ✅ |
| **soul affinity** (元素/武器相性倍率) | (自动、装备 chara 决定) | 攻撃力/ブレイク力 × positive_value、防御力 × negative_value | ✅ |
| **crystal lv** slider | `crystals[i].lv` | `crystalEffectiveValue`: 三因子 (M_L/W/P_max) 或 max_value 线性插值 | ✅ |
| **crystal 重量** slider | `crystals[i].weight` | 三因子公式 weight 维度 (M_W_max + min/max_weight + weight_step revise)。**固定重量约定 (2026-07-02)**: revise 显式填 `min_weight == max_weight`(如 100/100)→ M_W 恒取 M_W_max、⚙ 不显示重量滑条、因子行不显示 range(用于只存在单一重量的结晶,如 M_W_max=1.5 恒 ×1.5);留空(缺省 0/100)行为不变 | ✅ |
| **crystal 純度** slider | `crystals[i].purity` | 三因子公式 purity 维度(固定纯度约定同 weight:`min_purity == max_purity` → 恒 M_P_max)。**lv 维度不适用此约定**(`max_level=1 → M_L=1` 是既有语义) | ✅ |
| **秘録記憶 装備** | `crystals[]` 内容 | 自分の `weapon_base_id` 一致の秘録記憶装備中 → 結晶枠 +1 (desc `[結晶枠+1(上限1)]`、複数でも +1)。`crystalSlotCount` 判定、外すと `syncCrystals` が固定点まで收敛 (slice が秘録本体を外す連鎖対応) | ✅ |
| **target slot** 切换 (1/2/3) | (UI、不存 tr) | 改算哪个 slot 的 stat、跨 slot range='All' buff 仍来自其他 slot | ✅ |
| **omoide picks** (memory slot) | `tr.omoide_picks` | omoide source effect (Add → s1、Mul → s4a)、`_omoide_slots` Frida 抓包数据 + affection_threshold gate | ✅ |
| **enemy element** | `ctx.enemy.element` | 元素相性倍率参考、影响显示 (实际伤害公式 Phase 8) | UI only |
| **enemy break** | `ctx.enemy.bk` | Enemy_Break parameter factor = 1 if true | ✅ |

### Source → Stage 映射 (跟 trace stage key 一致)

| _source | Stage | math_type | 触发自 |
|---|---|---|---|
| `omoide` | s1 (Add) | Addition | tr.omoide_picks 选中的 memory slot |
| `omoide_mul` | s4a (Mul) | Multiply | omoide source 的 Mul effect |
| `masou` (静的) | s2a (Add) → s2b (Mul) | Add or Mul | 装备 masou.effects、parameter 无 HP-curve 前缀 (server-fold 可) |
| `masou` (動的) | s4a / s5a | Mul / Add | parameter 含 Vitality_/RemHP_/Break_/FellDown_ 前缀 — client 动态值、不能 server-fold (2026-06-10 用户决策) |
| **LP tier** | **s3 (× Attack)** | Multiply | `opts.lpMult` 入口决定 (computeStats HpCheck / computeStatsBlaze LpCheck) |
| `chara_skill` | s4a (Mul) / s5a (Add) | Mul / Add | chara state.weapon_skills |
| `bd_skill` | s4a / s5a | Mul / Add | tr.bd_on=true 时 chara.bd_skill.effects |
| `crystal` | s4a / s5a | Mul / Add | 装备 crystal (`crystalEffectiveValue` lv/weight/purity) |
| `bg` | s4a / s5a | Mul / Add | 装备 bg.skills |
| `chara_meta` | s4a (Mul) | Mul | 結婚 (`tr.marriage`) / 燃心 (`tr.moeshin`) / MP (`tr.mp` → `mpRate`、攻撃/ブレイク)。**LP 不在这里**、走 s3 |
| `enemy_buff` | s4a / s5a | Mul / Add | enemy bar guildTitle / emblems |
| `soul` | **s4b / s5b** (排非 soul 后) | Mul / Add | 装备 soul.skills (× soulMultiplier) |
| `soul_affinity` | **s4b** (Mul) | Mul | soul 元素 + 武器 相性倍率 (固定乘) |
| `enemy_break` | **s6 (Mul → Add)** | Mul / Add | parameter 前缀 `Enemy_Break_*`、gate `enemy.bk` (unpacking §3.9 step 48/49) |
| **inline ×3** | **s7 (× Attack)** | Multiply | `opts.enemyBkX3` step 51、enemy.bk gate (unpacking §3.10) |
| enemy mods | **s8 (× Attack/BK)** | Multiply | 属性相性 (全局)、難度/BK耐性/有利武器 (guild gate)、BD cap — `_computeEnemyMods` 硬编码倍率、stage 后乘 + ceil |

### 验证调试

console 输入 `window.__DEBUG_STATS = true` → 切控件时输出：
```
[stats slot 0] {chara name} effects: <N> sources: [<src list>] stats: {HP, 攻撃力, 防御力, ブレイク力, フルヒット攻撃力}
```

### Playwright e2e 测试覆盖目标

每控件 1 个 test case：
1. setup: target slot 装入 chara (用 master `variant_id` 6 位、例 100101)
2. read base stat (`#slot-{N} .stats-cell:nth-child(M) .stats-val`、M=1 攻撃力max)
3. 改控件 → assert stat 数值变化方向 + 量级合理 (e.g. LP 档从 0→2 攻撃力 should ×1.5)

[tests/ui/test_hensei_interactions.spec.js](../tests/ui/test_hensei_interactions.spec.js) **Phase 6.6 完整实施 (29/29 pass)**:

**HP-curve / condition gate × stat 覆盖矩阵** (master 数据决定可测组合):

| stat \\ prefix | Vitality_ | RemHP_ | Break_ | FellDown_ | Enemy_Break |
|---|---|---|---|---|---|
| Attack | ✓ 107601 | ✓ 111601 | ✓ 124901 | ✓ 107701 | ✓ 107701 |
| Defense | ✓ 129301 | ✗ master 无 | ✓ 158901 | ✗ master 无 | ✗ master 无 |
| HP | ✗ master 无 | ✗ master 无 | ✗ master 无 | ✗ master 无 | ✗ master 无 |
| GuardBreak (BK) | ✗ master 无 | ✗ master 无 | ✗ master 无 | ✗ master 无 | ✗ master 无 |

✗ master 无 = 数据里压根没有该 skill、无 fixture 可测、不写 e2e。

| group | n | 覆盖 | fixture |
|---|---|---|---|
| smoke | 2 | page load + setChara render | — |
| chara_meta | 8 | 結婚 0→1/0→2、燃心、LP 0→1/0→2/0→3、LP3+bd_on Blaze、MP あり→なし | 100101 |
| chara base | 4 | state 切换、level 单调、jukudo、awakening | 100101 |
| HP-curve | 6 | Vitality_Attack (107601) / Vitality_Defense (129301) / RemHP_Attack (111601) / Break_Attack (124901) / Break_Defense (158901) / FellDown_Attack (107701 + 队友倒地) / setHpSlider/setHpInput UI 回归 | 多 fixture |
| BD | 1 | bd_on toggle | 100101 |
| omoide | 2 | 无 picks → stat = base / equipAllOmoide → stat 增加 | 100101 |
| soul | 3 | 装入 / lv 1→max / awakening 0→max | 100101 + soul 1508 (5★ Atk Mul range=All) |
| crystal | 1 | 装入 + lv 1→20 → effect init→max | 100101 + crystal 120101 |
| enemy_break | 1 | enemy.bk OFF→ON → Enemy_BreakAttack 激活 | 107701 |

跑测：`npx playwright test tests/ui/test_hensei_interactions.spec.js`

测试公式校准依据 (Phase 6.1 Step 0):
- soul effect: `soulMultiplier(rarity, lv)` × `effect.value` (v1 main:js/stats-calc.js L210)
- LP: 4 档 `[1.0, 1.1, 1.5, 2.0]` 普通 / `[1.0, 1.3, 2.0, 5.0]` Blaze (unpacking §3.8)
- HitCount: 逐段、逐 effect 序贯、按 `orderServerFold`(server 拼接顺序、不分组 Mul/Add)、每步 `cur = trunc(cur op val)` + **每步 clamp ≥1** (2026-06-19 用户确认、unpacking 17_hitcount §17.2.1/§17.8.3、替代旧 Mul-then-Add 分组):
  `cur = trunc(cur op effVal); if cur<=0: cur=1` 逐 effect、终值 `max(1, cur)`
  例: base 3、soul Add +6 (×1.8 等级) → floor(3+10.8)=13 → 下一 effect 从 13 起
- soul HitCount `values=[a,b,c]` 数组: 每段 × soulMultiplier (跟单值路径一致吃等级加成)
- omoide Mul → stage 3
- omoide `value_scaling`: master/Frida 抓包多为空。description 含「熟度UPにつれて…」字样的 skill 实测真实 scaling = **0.003 / 熟度** (`OMOIDE_FALLBACK_SCALING`、`shared/hensei-helpers.js` `omoideEffectiveScaling`);effect value = `value + 0.003 × (熟度-1)`

---

## 計算 trace (dev 専用)

`computeStats(chara, tr, slotIdx, ctx)` — `ctx.traceEnabled=true` 时返回值带 `trace` 字段、
hensei stat-trace modal (stats-cell 点击) 的数据源。Pages 生产环境 (非 localhost/LAN) 不传 flag、零开销。

```js
trace = {
  base: { 攻撃力, 防御力, HP, ブレイク力 },     // applyStaged 入口 base
  damageLimitBase: 2147483647,
  hitsBase: [h1, h2, h3],
  speedBase: base.Speed,                        // 転速链起点
  motionBase: [m1, m2, m3],                     // 攻速链起点 (motion_speed 1-3)
  stages: [{ key, label, steps: [{ src, stat, op, val, before, after }] }],
}
```

| stage key | 内容 |
|---|---|
| s1_omoide_add / s2a_masou_add / s2b_masou_mul / s2c_floor | applyStaged Stage 1-2 + server-fold floor |
| s3_lp | LP tier ×Total (只攻撃力) |
| s4a_other_mul / s4b_soul_mul | Mul: 非 soul 类 (chara/crystal/bg/魔装/meta、slot 升序) → soul 类 |
| s5a_other_add / s5b_soul_add | Add: 同上分类、计算顺序 = stage 顺序 |
| s6_enemy_break / s7_inline3 / s7b_ceil | step48/49 / step51 / 出口 ceil |
| s8_enemy_mods | 属性相性/難度/有利武器/BD cap (逐因子、链尾=ceil 后显示值) |
| s9_hits | Hit1-3 逐 effect 序贯 (每步 floor、after=floor 后值) + max(1) 终步 |
| s10_damage_limit | DamageLimitBreak fold + floor 终步 |
| s11_speed | 転速: recover → ×Mul链 → ×partner → +Add链 (fold 等价重演) |
| s12_motion | 攻速1-3: motion_speed_i → ×Mul链 → +Add链 |

- step.stat ∈ { 攻撃力/防御力/HP/ブレイク力/Hit1-3/ダメ上限/転速/攻速1-3 }、UI 按 tab filter
- UI tab 只渲染相关 stage: 攻撃力等 4 stat → s1-s8; Hit → s9; ダメ上限 → s10; 転速 → s11; 攻速 → s12
- step.src = `{skill/装备名}@S{slot}` (collectEffects 的 `_src_name`)
- speed/motion 实际计算保持 fold (输出 bit 一致)、trace 链为数学等价重演 (Mul 全在 Add 前)
- 单测: `tests/unit/test_stats_trace.mjs` (gate / on-off 一致 / 各链尾 == 输出 / 链连续性)
