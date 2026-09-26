# Hensei Calc Stage Pipeline 设计

> 文档索引: [docs/README.md](README.md)

编成 (hensei) stat 计算流水线设计文档。最终 stat 值 = base 经 **s1〜s8** 顺序 apply 后得出
(下面的 [Stage 表](#stage-表-跟-trace-stage-key-一致) 是唯一权威清单、跟 trace stage key 同名)。

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
分 s1〜s8 stage、按 stage 顺序 apply
       ↓
   final stat
```

## Base 计算 (stage 0)

`calcStat()` ([shared/stats-calc.js](../shared/stats-calc.js)) 在进入 stage 1 之前已完成：

- 等级公式: `max × (1 - (max_max_level - lv) / (max_max_level - 1) × initial / max)`
- 熟度 → 等级上限: `min(max_max_level, initial_max_level + (mature - 1) × 5)`
- **觉醒倍率内嵌** (`AWAKENING_MAX` / `AWAKENING_FULL_MULT`): 满觉醒倍率**按属性区分**（HP / 攻 / 防 / BK）:
  - SS 9 段觉醒满 → HP ×1.33 / 攻 ×1.43 / 防 ×1.28 / BK ×1.46
  - S 14 段 → HP ×1.34 / 攻 ×2.42 / 防 ×1.26 / BK ×1.54
  - AA 36 段 → HP ×1.82 / 攻 ×4.45 / 防 ×1.63 / BK ×1.31
  - A 24 段 → HP ×2.36 / 攻 ×5.37 / 防 ×4.12 / BK ×2.1
- 觉醒倍率应用在 base 算法里、**不进 stage pipeline**
- **例外: 転速 (Speed) 不吃觉醒段** (`_baseStatRaw` 不传 `statKey` → 觉醒不放大): Speed 在熟度决定的 cap 处封顶、超 cap 的觉醒等级不再放大。HP/攻撃力/防御力/ブレイク力 四项照常吃觉醒段、各查各的倍率

omoide memory slot 加成走 stage 1、不参与 base 计算。

> ⚠ **下面整套 stage 表只对 攻撃力 / 防御力 / ブレイク力 三项生效**(只有这 3 项调 `applyStaged`)。
> `HP`(`serverFoldHP`)/ `転速` / `攻速` / `Hit` / `ダメ上限` 走各自独立函数、**不适用 stage 映射** —— 见
> [HP / HitCount](#hp--hitcount--战前-server-fold-不走上面的-ead-分组-pipeline) 和
> [その他 panel 値](#その他-panel-値-4-stat-以外)。転速里 omoide Add 和魔装 Speed Mul 有自己的位置(server-fold 段、Mul 之前)。

## Stage 表 (跟 trace stage key 一致)

| stage | source | math_type 过滤 | 含义 |
|---|---|---|---|
| **s1** | `omoide` (memory slot) | `Addition` | 好感加算 — omoide 槽插入的 memory slot effect |
| **s2a** | `masou` (静的、仅 Attack / Defense) | `Addition` | server 折进 attack / defense 的魔装 — **HP-curve 类 (Vitality_/RemHP_/Break_/FellDown_) 和其它 parameter 除外** |
| **s2b** | 同上 + `燃心` | `Multiply` | server-fold 的倍率 (魔装 Mul、燃心 BH) |
| **s2c** | server-fold floor | — | Stage 2 終: base+omoide+masou+燃心 都是 server 算、返回整数 → floor |
| **s3** | LP tier | (×Total) | 只 Attack、入口 lpMult |
| **s4a** | `chara_skill` / `crystal` / `bg` / `結婚` / `omoide_mul` / `enemy_buff` / 非 server-fold 的魔装 | `Multiply` | 非 soul 类乘算、slot 升序 (含 `AllTarget` 全体化倍率,攻撃力 / ブレイク力 都吃) |
| **s4b** | `soul` / `soul_affinity` | `Multiply` | soul 类乘算 (排非 soul 后)、slot 升序 |
| **s4h** | 任何 source 的 `Vitality_` / `RemHP_` / `FellDown_` | `Multiply` | **HP 曲線池**:同一 parameter 先连乘成池值、再按 r 插值一次(见下) |
| **s4c** | `bd_skill` | `Multiply` | BD buff (战斗时生效) |
| **s5a / s5b / s5c** | 同 s4a / s4b / s4c 分类 | `Addition` | 加算 |
| **s6** | `enemy_break` | Mul → Add | step 48/49、gate enemy.bk |
| **s6b** | `MP` | `Multiply` | MP 不足惩罚 (step 50、在 Add 池和敵BK 之后) |
| **s7_ebd** | EBD 4 格 | (×Total) | 只ブレイク力:属性 × 敵BK 的 ×1.8 / ×1.2 / ×1.5 / ×0.1 (见下文ブレイク力) |
| **s7** | inline ×3 | (×Total) | step 51、只 Attack、enemy.bk gate |
| **s7b** | 出口 ceil | — | 唯一 round 点 |
| **s8** | enemy mods | (×Attack) | 属性相性/難度/有利武器/BD cap、stage 后 ceil (只攻撃力) |
| 独立 | 任何 source | `Repel_Percent` | status 回避率、独立通道、不进 stat pipeline |
| skip | 任何 source | `None` / `Set` / `NoEffect` parameter | 跳过、不渲染、不参与 calc |

s4/s5 的执行顺序 = trace 显示顺序 (2026-06-10 用户决策): 非 soul (slot 升序) → soul (slot 升序) → HP 曲線池 → BD、
逐 effect apply (`shared/stats-calc.js applyStaged`)。Mul 之间可交换,顺序只影响 trace 的展示。

## Apply 公式 (s1〜s8 + ceil、unpacking 03_ead.md §3.3.2 校准 2026-09-26)

按 unpacking §3.3.2 EAD step 表(50 个 d8 step + step 4 / 10b / 51 / 53 四个 Total 层)简化、保留 hensei UI 关心的部分:

```
v = floor(base)                                       Stage 0 base (server-fold floor、01_setup.md §1.5)
v += Σ(stage 1 omoide Addition × cf)                  Stage 1 omoide Add (Frida 抓包 affection_threshold gate)
v += Σ(stage 2a masou Addition × cf)
v *= Π(stage 2b masou Multiply × cf) × 燃心           Stage 2 masou (Add → Mul) + BH
v = floor(v)                                          Stage 2 終 server-fold floor (01_setup §1.1.2:floor((raw+slot)×BH×魔装Mul))
v *= lpMult                                           Stage 3 × LP tier (step 4、× Total 直接层)
v *= Π(s4a 非soul Multiply × cf)                      Stage 4a chara_skill / crystal / bg / 結婚 / omoide_mul / enemy_buff / AllTarget (slot 升序)
v *= Π(s4b soul Multiply × cf)                        Stage 4b soul / soul_affinity (slot 升序、排非 soul 后)
v *= Π_pool(1 + r × (Π v_i − 1))                      Stage 4h HP 曲線池 (step 21/22/23 的 SkillRate wrapper)
v *= Π(s4c bd Multiply)                               Stage 4c BD buff (step 24、只认 range=All)
v += Σ(s5a / s5b / s5c Addition × cf)                 Stage 5 同 4 分类
v *= Π(stage 6a enemy_break Multiply × cf)            Stage 6a Enemy_BreakAttack Mul (step 48、gate enemy.bk)
v += Σ(stage 6b enemy_break Addition × cf)            Stage 6b Enemy_BreakAttack Add (step 49)
v *= mpRate                                           Stage 6b MP 不足惩罚 (step 50)
v *= enemyBkX3                                        Stage 7 × 3 inline (step 51、enemy.bk gate、独立 cached gate)
v = ceil(v)                                           出口 ceil (caller get_Damage frintp + fcvtps、唯一 round 点)
```

**取整位置**:
- Stage 0 base = `floor(_baseStatRaw)` (server-fold 模拟、chara 创建时 server 已 int)
- **Stage 2 終 floor** (2026-06-10 用户确认;unpacking 抓包 38/38 为 floor): base + omoide + masou + 燃心 都是 server-fold、server 返回整数 → `floor(v)`
- Stage 3 起 (client 侧 EAD pipeline) 全程 double、0 中间 round (unpacking §3.12.1: 50 步 d8 链 0 ARM64 rounding 指令)
- 出口 ceil = caller `get_Damage` `frintp + fcvtps`、client pipeline 唯一 round 点

**没有模拟的 EAD step**:
- step 5 `BlazeRankRate`(剑炎槽 Count → `1 + floor(Count/2) × 0.25`、所有 hit 都吃)= enemy bar 的 BD cap,放在 s8
- step 52 `RandomRate`(`{1.00 … 0.95}` 6 档均匀)— stat 显示取 1.00,ギルバト スコア 取 6 档均值
- step 53 `DefenseDamageSkill`(敌方被动:连乘 / 清零 / 每 hit 伤害上限屏障)— 依赖具体敌人,不算
- step 10b `AllTargetRate` 只算技能 / BD buff 里的 `AllTarget`,DamageImpacts 以外的写入者没有
- 敵方属性相性 (step 9) 在游戏里是 server 下发的敌人 `enemy_abilities`、不是固定表 —— s8 的 `_computeEnemyMods` 是 wiki 沿用的硬编码表(普通副本的 ×2 / ×0.5 与 unpacking 观测一致,ギルバト 的 15 / 10 / 0.1 在 unpacking 里没有依据)

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

- **HP** (unpacking 01_setup.md §1.1.1 / §1.1.5): `max_hp = (base + Σ前置slot的HP-Add) × Π自身HP-Mul + Σ后置slot的HP-Add`、**slot 顺序敏感** (自身/靠前 slot 的加算落在乘算"内"、靠后 slot 落在"外")。**终值 `floor` 取整** (server max_hp 为整数、base 已 floor、用户决策 2026-06-19;唯一一次取整、中间不 round)。
- **HitCount** (unpacking 17_hitcount.md §17.2.2): 战斗用的是 server 下发、**已预折叠编队 HitCount 加成**的 `weapon.hit_counts`
  (客户端的 `DeckHitCount` 只给 deck 面板 / 排序用、战斗不调它)。server 的折法 (抓包 273 / 273 吻合):
  每条加成 `h = max(1, trunc(h + v))` **各自截断**。加成来源:
  - 魂的 HitCount job_skill:`v = values[i] × 魂等级倍率`;属性 / 武器 / 魔剣条件按**被作用的魔剣**判 (跟别的魂技能按装备者判不同)
  - 魔剣的 HitCount 技能:描述带熟度阶梯的,游戏取「N + 已达阈值个数」;`chara_revise` 里给这些技能配了线性
    `value_scaling`(如 `0.951 + 0.051 × 熟度`),每条截断后在 9 个阶梯技能里有 8 个与阶梯写法逐熟度等价
    (例外 80245 ヘルゲスト 线性在熟度 20 / 40 升级、描述写 21 / 41,待样本区分)
  - HitCount 结晶:`user_materials.value`

两者都按 **server 拼 weapon_skills 数组的 block 顺序逐 effect 应用、不分组 Mul/Add** (2026-06-19 用户指定、`shared/stats-calc.js orderServerFold`)。
HitCount 的加成全是正数 Add 时逐条截断跟顺序无关;Multiply 类 HitCount(80373 等「ヒット数を2.5倍」)在抓包里没出现过,
它跟 Add 的先后 unpacking 未验证:

```
自身好感(omoide) → 自身costume(masou) →
  1号位[技能(chara_skill/bd/結婚等meta) → 结晶 → costume] →
  2号位[技能 → 结晶 → costume] → 3号位[技能 → 结晶 → costume]  (各 slot 自身的 costume 已在最前面、此处跳过) →
  1/2/3号位 bg → 1/2/3号位 魂(soul)
```

> 上面「他 slot 的 costume」这一段现在基本空转 —— masou effect 缺省 `range='Single'`
> (2026-08-28,见下节),只有 3 件全队魔王装的 11 条 effect 会真的从别的 slot 进来。
> `orderServerFold` 的位次保留不变、以防将来又发现别的全队 costume。

> ⚠ caveat: server 数组的 block 顺序见 unpacking 01_setup.md §1.1.4(旧的 `HOWTO_weapon_skills_order.md` 已归档);
> hensei 是从多 wiki 源自己收集的、按此顺序**尽量贴近**、非逐位精确。HP 的 slot 顺序效应也是实测推算。
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
- 游戏里这个 count 是 `BeforeBlazeCount` = use_all BD 放出瞬间的剑炎槽数 (unpacking §3.4.7 / §3.4.8);
  非 use_all 的 BD 不更新它 → 附加值不叠。master 里 `additional_value ≠ 0` 的 8 条全是 use_all,所以默认取 cost 没问题。
- **range=Single 的 BD buff** 进的是 `IndividualBuff` 池,只有攻速 (`Player.Update`) 和伤害上限 (EAD prologue) 查它;
  攻撃 / 防御 / ブレイク / 転速 查的 `BuffSkillValue` 只认 range=All (unpacking §13.9.7 / §3.8.1)。
  所以 Single 的这几类 BD buff 不算 (master 里 Speed Single 3 条;Attack / Defense / GuardBreak 没有 Single)。

## Defense stat 公式 (unpacking 19_defense.md §19 PAD step 3)

hensei「防御力」显示 = `s10` (玩家防御吸收量、damage units) = `base × Π Mul + Σ Add`。

**用户决策**:
- 只显示玩家防御值、**不算被打时最终伤害** (即不模拟 §19.12 `final_damage = prevTotal × s8 + max(0, prevTotal × (1 - s8) - s10)` 公式中的 final_damage、只显示 s10)
- **SwapAttackDefense=true 模式** (剑魂特殊玩法、§19.2 表)**不考虑**、所有 Attack/Defense chain 按 `swap=false` (正常对战)

简化模型跟 §19 phase 1-5 累积公式数学等价 (mul/add 累积、ARM64 不同 phase 物理位置不影响结果)、跳过 7 phase 内部细分。

**Defense stat 流经的 stage** (跟 Attack 不同点):
- ✅ Stage 1-2 (omoide / masou Add+Mul / 燃心) 同 —— BH 对 attack 和 defense 用同一个倍率 (unpacking §1.1.2)
- ❌ Stage 3 LP × (LP 是 Attack 系 step 4、Defense 不接、`opts.lpMult=1` 默认)
- ✅ Stage 4-5 (other Mul/Add) 同 — 含 `Vitality_Defense` / `RemHP_Defense`(s4h 池)/ `Break_Defense` (`baseParameter` strip → 'Defense')
- ✅ Stage 6 `Enemy_BreakDefense` (master 实际无、兼容)
- ❌ Stage 7 inline ×3 (是 Attack 系 step 51、Defense 不接、`opts.enemyBkX3=1` 默认)
- ✅ 出口 ceil

**ブレイク力** (unpacking 04_ebd.md §4.3.4 / §4.6-§4.7) = 每 hit 的破甲量:`Destruction × AllTargetRate × PSV/BSV(GuardBreak) Mul + Add`,
× MP 惩罚,再 × **属性 × 敵BK 的 4 格净倍率**(s7_ebd),最后 ceil 一次。跟 Attack 不同:
**不查魂的属性 / 武器相性表**(EBD 只查敌方属性表)→ `soul_affinity` 不乘ブレイク力;没有 LP、没有 BK ×3、
没有 HP 曲線 / Break 门;s8 的敌方倍率 (相性 / 難度 / 有利武器 / BD cap) 也不乘。

| | 敌方弱我方属性 | 其它 |
|---|---|---|
| 敵 BK 中 | ×1.8 (`×1.5 × 1.2f × 10 × 0.1f`) | ×1.2 (`× 1.2f × 10 × 0.1f`) |
| 非 BK | ×1.5 (`×1.5 × 10 × 0.1f`) | **×0.1** (`× 0.1f`) |

- 「敌方弱我方属性」= EBD 读到的敌方属性表 rate > 1.0。这跟 EAD step 9 是同一张表,hensei 用攻撃力那张相性表
  (`elementMatchupMult`,普通副本 ×2 / ×0.5、ギルバト 15 / 10 / 0.1)的倍率 > 1 来判。
- 常数 `1.2f` / `0.1f` 是 float 字面量加宽成 double(1.2000000476837158 / 0.10000000149011612、§4.11),
  所以乘出来比十进制值略大:整数 × 0.1 后 ceil 会 +1(例 1000 → 101),游戏也一样。
- 默认敌人 (無属性・非 BK) 下是 ×0.1,所以ブレイク力显示值约为魔剣面板上的 1/10(2026-09-26 用户确认按 unpacking 来)。
- 没模拟:EBD 末尾的 RandomRate (取 1.00) 和 DefenseBreakSkill (敌方被动)。

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
- Break gate `Break_*`: `factor = 1 if hp_pct <= 50 else 0` (IsBreak = HpRate ≤ 0.5、含等号)
- FellDown `FellDown_*`: 自身 hp=0 → 0 (HpEmpty 旁路);否则 `factor = 倒下的队友数 / max(出战人数 − 1, 1)`
  (unpacking §2.5 `PlayerList.FellDownRate`;出战人数 = `teamSize` 内有魔剣的 slot 数)
- 元素/武器/chara 限定不命中: `factor = 0`
- 无 condition: `factor = 1`

一般的 Multiply 按条累乘、用 `factor` 衰减增量:
```
v *= 1 + (value - 1) × factor
```
factor=0 时不衰减 (×1)、factor=1 时全量 (×value)。

**HP 曲線池 (`Vitality_` / `RemHP_` / `FellDown_`) 不是按条插值**(unpacking §2.4 / §2.5 的 SkillRate wrapper、
§7.4.1 `VariableSkillRate`):游戏先把同一 parameter 的全部条目 (各 source、含队友 range=All) 连乘成池值 `P`,
再插值一次:
```
v *= (P > 0 && P ≠ 1) ? 1 + r × (P − 1) : 1          r = 上面的 factor (同一池同一接收方、同一个 r)
```
两条 ×3、HP 50%:池值 9 → `1 + 0.5 × 8 = ×5`;按条插值会是 `2 × 2 = ×4`。HP 100% 或池里只有一条时两种算法相同。
游戏里这三类只有 Multiply(master 0 条 Addition)。`Break_*` 是 0/1 门,按条累乘跟按池等价。

> ℹ 装备面板逐条显示 `1 + (v−1)×factor`:池里只有一条或 HP 100% 时就是真实倍率,
> 多条同池且 HP 不满时只是近似,真实的池级倍率看 trace 的 `s4h_hp_curve`。

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

### Rise_AttackRate 放大器 (meta-pass、2026-06-23 / 2026-09-26 按 unpacking §3.7.2–§3.7.3 改)
`Rise_AttackRate` 是元倍率「**魔剣が持つ攻撃力アップスキルを V 倍受ける(潜在Skill除く)**」。游戏在 Attack 系池
(step 17 / 21 / 22 / 23 / 26 / 41 / 47)的 fold 循环里、**每条 `is_original_skill=true` 的条目** fold 完后 `acc ×= R`,
即 N 条 original 就放大 `R^N`。collectEffects 收完所有 effect 后做一次 meta-pass 复刻:
- 目标自身 (魔剣固有、range=Single) 有 `Rise_AttackRate` (值 V) → 把目标池里每条带 `_orig` 的 **Attack 系**
  (`base_parameter==='Attack'`,含 `Vitality_/RemHP_/Break_/FellDown_Attack`) 增益 ×V:
  - `Multiply M → M·V` (倍率直接 ×V,例 ×1.2 → ×3.0);`Addition A → A·V`。
- **`_orig` = `is_original_skill=true`**(CreateBattleSession 抓包):魔剣自带技能 (`chara_skill`,**包括队友 range=All
  打过来的**,PSV 的 All 查询遍历全队、Rise 也传给了 weapon list)和**結婚** (70204)。
  結晶 (-6) / 画 (-4) / 好感 (memory_slot) / 魔装 (-7) / 公会 (-1) 都是 false,魂的 job_skill 在 `CreateJobSkillList` 里恒 false →
  不放大。`Enemy_BreakAttack` (step 48) 不走 Rise;HitCountKeepDamage 派生的减攻条目是 wiki 自己造的,也不放大。
- 目前仅 2 个魔剣: `1508 蒼き悪竜の渇欲` / `1530 もちもち` (均 V=2.5);它们自身无 Attack-up 技能,放大的是
  自己的結婚条目和队友打过来的魔剣 Attack 技能。(2026-09-26 之前放大的是自己装的结晶 / 魂 / BG,与游戏相反。)

## DamageLimitBreak (DLB) — 每 hit 伤害上限 (ダメ上限)

面板的「ダメ上限」和ギルバト スコア 的每 hit 封顶用它;**攻撃力 stat 本身不被它 clamp**(攻撃力显示的是 clamp 前的 Total)。
按 unpacking [09_damage_clamp.md §9.3 / §9.5](../../unpacking/docs/HOWTO_battle/09_damage_clamp.md#95-updatelimitmaxdamage--0x1939cf4--核心公式):

```
limitMaxDamage = floor((2^31 - 1) × ΠMul + ΣAdd)        Mul 池、Add 池分开 fold,Add 永远在 Mul 外面
final_damage   = clamp(ceil(Total), 0, limitMaxDamage)
```

- `Mul` / `Add` 来自 `DamageLimitBreak` 池(PSV + IndividualBuff,所以 range=Single 的 BD 伤害上限 buff 也算)
- `Enemy_BreakDamageLimitBreak` 只在敵 BK 时加(`baseParameter` strip 成 `DamageLimitBreak`、cf 走 enemy.bk);
  `Blaze_DamageLimitBreak` 只对 BD hit、普通攻击不算
- 默认 `limitMaxDamage = 2^31 - 1` (~21 亿)。2026-09-26 之前是按 effect 顺序一个循环边乘边加,
  Add 排在 Mul 前面时会被 Mul 放大 (master 目前没有 Multiply 型 DLB,实际数值没受影响)。

## Repel_Percent 独立通道

`Repel_Percent` 不影响 stat 数值、是 status 回避率。命中的 parameter 只有 6 个 proc-rate 类:
`Mez` / `Stun` / `InstantDeath` / `BlazeAbsorb` / `RateDamage` / `BlazeLockPurge`。

**独立概率 OR 合并** (`repelRate`、跟游戏一致 —— [11_parameters.md §11.4](../../unpacking/docs/HOWTO_battle/11_parameters.md)
的 `Compute @ 0x146D028` 反编译):

```
p_i        = min(value_i × condition_factor_i, 100) / 100      # value < 0 → 该条不贡献
repel_rate = (1 − Π(1 − p_i)) × 100
```

例: 单条 `Mez Repel_Percent 50` = 50% 免疫麻痺;两条 50% 叠加 = **75%**(不是 100%)、
两条 10% = 19%、任一条 100% → 饱和 100%。

> ⚠ **不是线性累加**。`Compute` 的 `DefaultValue = 0`、逐条 pairwise 合并;OR 满足交换/结合律,
> 所以实现里直接连乘 `Π(1 − p_i)`、跟 fold 顺序无关。
> 2026-09-07 之前这里写的是 `min(100, Σ value × cf)` —— 单条时一样、2 条以上偏高(两个 50% 算成 100%),已改。
> `condition_factor` 先乘进 value 再 clamp,所以 gate 没发动 (cf=0) 的那条自然不贡献。
> 游戏侧是 float32(`s` 寄存器),这里跟 pipeline 其余部分一致用 double、差 ~1e-7,不到显示精度。

命中的 parameter 就是那 6 个 proc-rate 类,`data/` 里实测 594 条:
`BlazeAbsorb` 190 / `InstantDeath` 182 / `Mez` 140 / `Stun` 52 / `RateDamage` 26 / `BlazeLockPurge` 4
(其中 404 条 value=100 即完全回避、36 条 value=null)。

> ℹ `repelRate` 目前**已实现但还没接进 UI** —— 全仓库只有单测调它,hensei 面板还没有回避率这一行。

## 删除的 enum

历史遗留、不再支持:

- **`Set`** (`math_type=2` / `calc_type=4`): master 数据 chara 端无、UI 不渲染、collect 阶段跳过
- **「最終加算」** (`calc_type=2`): 早期 plan 假想字段、master 没对应、彻底废弃
- **「最終乗算」** (`calc_type=3`): 同上

`utils.js` `ctPfx()` 不再覆盖 calc_type 2/3/4。adapter `_MATH_TYPE_TO_CALC` 表只保留 Multiply/Addition/Repel_Percent。

## 实现

实际实现在 [shared/stats-calc.js](../shared/stats-calc.js):
- `collectEffects(team, targetSlotIdx, ctx, opts)` — 3 slot 全 source 收集进 effects[] 池、附 `_source` / `_origin` (装备出处、见下节) / `_src_slot` / `_src_name` (trace 显示)、
  按 `range` + element/weapon/chara 限定决定命中 (`_effectApplies`):
  - **`element_condition` / `weapon_type_condition`**(souls「X属性装備で…」)= 判**装备者(source/equipper)**自身属性·武器、不命中整条不激活 (range=All 时看装备者而非接收方、2026-06-19 扫描确认: souls 全用 *_condition、weapons 全用 target_*)。
  - **`target_element_id` / `weapon_type_id`**(weapons/crystals「X属性の味方…」)= 判**接收方(target)**过滤 (+ `extra_element_id` 扩展接收)。
  - **`weapon_base_id`**(soul「X装備で」master 原生 / crystal·bg「Xのみ・純真/秘録記憶」build_*_aux 反查注入、**统一字段名**)= 判**装备者(source)**那把魔剣 base id 门槛 (跟 `sm.id` 比对、不是 target;range=All 时门槛只判装备者一次、范围交给 range)。chara≡魔剣、同一 base id 空间。*(2026-06-24: 旧实现误比 target、All-range「装備者は X、全体に…」型队友漏吃 → 修为比 sm)*
  HP-curve / gate 类在收集时算好 `condition_factor`
- `applyStaged(base, parameter, effects, opts)` — 按上面 stage 表逐 effect apply (+0/×1 跳过、出口 ceil)
- soul: 收集时 `value × soulMultiplier(rarity, soul_lv)` 一刀切 (所有 math_type、Multiply 直乘是游戏行为、2026-06-10 用户实测确认 ×1.45 → lv50 ×2.175)、
  HitCount `values=[a,b,c]` 数组每段同样 × soulMultiplier (`stageMult` 路径)
- crystal: 收集时 `crystalEffectiveValue(cr, cfg)` (lv/weight/purity 三参公式)
- masou: 收集时补 `range: eff.range || 'Single'` — 见下节

### masou (costume) 的 server fold 与魔王装 (unpacking §1.1.2.1、2026-09-26 抓包对照)

server 按 parameter 把魔装效果分两路,同一条不会两路都走:

| 魔装 parameter | server 的处理 | hensei |
|---|---|---|
| `Attack` / `Defense` (Multiply) | 乘进 `attack` / `defense`,floor 之前 | s2a / s2b |
| `Speed` (Multiply) | 乘进 `speed`,floor 之前 | `_computeSpeed` 的 server-fold 段 |
| `MotionSpeed` (Multiply) | 乘进 `weapon.motion_speed*` | 攻速 Mul 池 (乘法等价) |
| `HP` | 推测折进 `max_hp` | `serverFoldHP` |
| 其余 (SapphireDrop / BlazeAbsorb / Repel 系 / Vitality 系 / DLB / GuardBreak …) | 以 `-7` 条目交给 client PSV | s4a / s5a / s4h |

**魔王装「味方全体の攻撃力」**(1494704 / 1502704 / 1570704,master 1.75)不下发 `-7`,server 把全队倍率
`F = 1.75 + 0.00768 × 持有者熟度` 直接乘进编队每把魔剑的 attack(持有者自己也只乘一次)。hensei 用
`masou_revise` 的 `value_scaling = 0.00768` + range=All 复刻(魔装 source 的 value = `value + value_scaling × 熟度`,
熟度取持有者的)。带【熟度UP】的 -7 Multiply(`Vitality_Attack` / `Vitality_MotionSpeed` 等 master 2.0)同一斜率,
`masou_revise` 里 16 件魔王装的【熟度UP】Multiply 效果全部配了 0.00768。
1529704 的两条【熟度UP】是 Addition:DLB 13 億配 `value_scaling = 5,000,000`(unpacking 单点 152902 熟度 38:
13 億 → 14.9 億,熟度 99 → 17.95 億);B.D.ヒット数 129.5 配 `value_scaling = 0.5`(熟度 99 → 179),两条都是 2026-09-26 用户定的。

### masou (costume) 的 range 缺省 (2026-08-28 修正)

`masou.json` 的 effect **没有 `range` 字段**(1200 条 effect 全无、master 就不给)。而
`_effectApplies` 只拦 `range === 'Single'`,`undefined` 一路放行 —— 所以不兜底时**每条
costume effect 都是全队生效**。魔装是穿在单把魔剣上的外观装备,`effect_text` 绝大多数是
「攻撃力5%UP」这种不带范围词的裸描述(1200 条里 1183 条如此)= 自身,所以缺省反了。

修法两半:

1. `collectEffects` 的 masou 分支补 `range: eff.range || 'Single'`(跟 crystal 的
   `cr._master.range || 'Single'` 同一套兜底)。
2. [build_masou_aux.py](../scripts/master_to_business/build_masou_aux.py) 扫 `effect_text`,
   含「味方全体」→ 往 `masou_revise.json` 注入 `effects[].range = 'All'`。命中 11 条、
   集中在 3 件魔王装:

   | masou id | 魔剣 | 全队 effect |
   |---|---|---|
   | 1494704 | 1494 | 攻撃力×1.75 / 被弾率×0.5 / 麻痺完全回避 |
   | 1502704 | 1502 | 攻撃力×1.75 / BDコスト-1 / ダメ上限+10億 / 麻痺完全回避 |
   | 1570704 | 1570 | 攻撃力×1.75 / BDコスト-1 / HP大回復 / 即死完全回避 |

   (另有 6 条明写「自身の」的 `Vitality_*`/`RemHP_*`,缺省已是 Single、不写 revise。
   「全属性」「パーティ」「チーム」在 masou 文本里 0 命中,不入规则。)

⚠ masou effects 无 id → `deepApply` 对它是**整组替换**([revise-core.js](../shared/revise-core.js) `deepApply`)。
所以脚本写回时以**已有 revise 的 effects 为基**(那里面有人工编辑过的 `value_scaling`)、
按 index 对应前先校验 parameter 序列跟 master 一致,不一致则跳过并告警。脚本幂等、
文本不再命中时会自动清掉过期的 `range`。

UI 侧:魔装 section 是唯一「存在性动态」的一块 —— 216/657 的魔剣没有自己的魔装、
不该白占一行空 label,但队友装上全队魔王装时本槽会收到 masou effect、这时要把容器开出来。
`renderSlot` 的条件是 `chara && (charaMasouList.length || masouPanel)`,
`refreshEffPanels` 用 `_needMasouSection` 比对、不一致时重建该槽。

### 装备面板的显示 (`col{i}c` 魔剣 / `col{i}s` ソウル / `col{i}b` 心象結晶 / `col{i}m` 魔装 / `col{i}r` 記憶結晶)

各装备 section 下 `▶` 展开的那块 (2026-08-28 起) 不再直读静态 master 值、而是**复用同一条 `collectEffects`**、
走 `{ forDisplay: true }` 单独收一遍 (`hensei.html` `_panelEffects`)。计算路径 (`computeStats`) 走默认 opts、不受影响。

- **倍率是解算后的值**:熟度 (`value_scaling × jukudo`) / ソウル Lv (`soulMultiplier`) / 結晶 lv·重量·純度
  (`crystalEffectiveValue`) 已折进 `value`;HP 曲线 (`Vitality_`/`RemHP_`/`Break_`) 和「Xと同編成で」这类
  条件折进 `condition_factor`。面板按跟 `applyStaged` 一致的式子展开 (`Mul → 1+(v-1)×cf`、`Add → v×cf`),
  所以**面板上的数字就是计算真正用的数字**(测试 `装備パネル: 显示行 (発動中) 的条数 == 计算实际用到的装備 effect 条数` 锁死)。
  例外是 HP 曲線池:同池多条且 HP 不满时计算按池插值、面板仍逐条显示(见上面 HP 曲線池一节)。
- **画装在不符的魔剣上**(画级 `element_ids` / `weapon_type_ids` 或技能级 `element_id` / `weapon_type_id` 跟装备者不符):
  server 不下发 (unpacking §1.1.4 的 -4),计算路径丢弃、面板显示为未发动。
- **限时的画技能**(`start_time` / `end_time`、如 7095「攻撃力が25%UP」9:00〜12:00,159 张画各一条):
  游戏里时段外 server 不下发;hensei **按全时段生效算**、不看时刻(2026-09-26 用户决定)。
- **跨 slot 技能落到目标 slot**:`collectEffects` 本来就按 `range` + 属性/武器/魔剣限定 判过命中,
  所以 `range=All` 的技能只要打到本 slot、就出现在本 slot 对应面板里 (橙色左边线 + 「N号位」徽章 + 効果文)。
  例:1680「長剣の魔剣のヒット数を2.5倍にする」在同队有長剣时、会出现在那个長剣的 `魔剣` 面板。
- **未发动的行不消失**:`forDisplay` 下 `condition_factor === 0` 的 effect 打 `_inactive` 保留、
  用取消线 + 条件 tag 显示「发动了会是这个值」(否则条件一变整行凭空消失、看不出魔剣有这技能)。
  `Rise_AttackRate` 放大器的 meta-pass 会跳过 `_inactive`、保证面板跟计算同步。
- **`_origin`**:面板归类用的装备出处。等于 `_source`,但 `omoide_mul` 折回 `omoide`、
  且在 `Enemy_Break*` 把 `_source` 覆写成 `enemy_break` **之前**取值 —— 否则所有 `Enemy_Break*`
  技能 (chara skill 和結晶都有) 会从自己的装备面板里消失。
- 任一 slot 变动都要刷 3 个 slot 的面板 (`refreshEffPanels`,挂在 `refreshAllStats` 里)。它只换
  `.detail-wrap` 的 innerHTML + `▶` 的显隐、不重建整个 slot,所以已展开的面板不会被合回去。

## その他 panel 値 (4 stat 以外)

| 値 | 公式 | 实现 |
|---|---|---|
| Hit1-3 | server 预折叠 (§17.2.2):按 `orderServerFold` 顺序逐 effect、每步 `cur = trunc(cur op val)` + **每步 clamp ≥1**、终 `max(1)` | `_computeImpl` hits loop |
| フルヒット攻撃力 | `floor(Attack × Σhits)` | 同上 |
| ダメ上限 | `floor(2^31-1 × ΠMul + ΣAdd)` DamageLimitBreak 池、Mul / Add 分池 | 同上 |
| 転速 | **两段**:① server-fold `recover = floor((base.Speed + Σ omoide Speed Add) × Π 魔装 Speed Mul)` ② client `latestRecover = max(0, Σ其他Add + (soul_lv/100+1) × ΠMul × recover)`,ΠMul 里 Vitality/RemHP/FellDown_Speed 按池插值。cooldown = `max(1, ceil(6000/latestRecover))` fr。`base.Speed` **不含觉醒段**(熟度 cap 处封顶) | `_computeSpeed` |
| 攻速 1-3 | `motion_speed_i × ΠMul`(**没有 Add 池**、§8.4;Vitality/RemHP_MotionSpeed 按池插值)、帧 = `1 + max(1, ceil(dur/spd × 60))` | `_computeMotionSpeed` |
| BD上限 max | `max(9, floor((9 + Σadd) × Πmul))` BlazeGaugeMaxLevel 池 | `_computeImpl` |
| 初期BD | BlazeGauge Add (mode 1 直接 / mode 2 队伍属性 count) → 在 `blaze_gauge_points` 上 cumsum 反查 level。`blaze_gauge_points` 按 §1.3.3.5 单一公式:`F = Π 魔剣 skill × Π(魂 value × soulMultiplier)`、`pts[i] = floor(100F)` (i<9) / `floor(100 × 1.4k × F)` (i≥9)。魂的 L(level) 取魂等级倍率是 unpacking 的推断,Lv1 以外没有实测 | `computeBlazeGaugePoints` + `bdCapFromBlazeGauge` |

### 転速 两段的依据 (2026-08-23 修正 / 2026-09-26 魔装改进 server-fold)

`07_speed.md §7.6.1` 的 `latestRecover = max(0, add_acc + (PartnerLevel/100+1) × mul_acc × recover)`
里三个量各有明确出处(561 汇编 `0x1B0C53C~0x1B0C588`):

- **`recover` = `WeaponData ObscuredFloat` = server 推的 `speed` 字段**、不是裸曲线值。
  `01_setup.md §1.1.2`: `speed = floor((speed + Σ slot_speed_add) × Π 魔装 Speed Mul)`,并注明 slot Add 来源 =
  `UserWeaponMemorySlot[].weapon_skill` —— 即 **omoide 记憶結晶槽**。
  → omoide 的 Speed Add 和魔装的 Speed Mul 都属 server-fold 段、在 `mul_acc` **之前**、再 `floor`。
- **`add_acc` = `PSV(Speed, Add)` fold** = client passive skill 池、**不含 omoide**。
- **魔装 Speed Mul 是 server-fold**(§1.1.2.1,抓包 6 例 `speed = floor((列表 speed + Σslot Add) × 魔装 Mul)` 全吻合,
  魔装的 Speed 效果不以 `-7` 下发)。2026-08-23 版这里的推论(「costume 以 `-7` 留在 client 数组、所以走 `mul_acc`」)
  依据的是现已归档的 `HOWTO_hp_calc.md` / `HOWTO_weapon_skills_order.md`,-7 只承载 server 不折的那些 parameter。

> 影响面: omoide 数据里 `Speed`+`Addition` 共 **15,233** 条(涉 647 个魔剣、「スピードUP」系),
> 是転速最普遍的加成来源;旧实现把它们放在乘法外面,每点被少算 `(mul_acc − 1)` 倍。
> 对照 `Speed`+`Multiply` 只有 143 条。

---

## UI 控件 ↔ 计算联动 checklist

**每次修改 hensei viewer / stats-calc 必检**。Playwright e2e 测试也按此表覆盖。

### 控件 → tr 字段 → 影响

| 控件 | 字段路径 | 影响 stat / effect | 状态 |
|---|---|---|---|
| **chara state** (通常/改造/極弐) | `tr.state` | 切 state 后 base stat + weapon_skills 来源全变 | ✅ |
| **chara level** slider | `tr.level` | base stat 等级公式 | ✅ |
| **chara 熟度** (jukudo) slider | `tr.jukudo` | base stat lv cap (`initial_max_level + (j-1)*5`) + chara_skill / masou `value + value_scaling × j`(不减 1、跟 unpacking 的 `value + 0.00768 × 熟度` 同形) | ✅ |
| **chara 觉醒** slider | `tr.awakening` | base lv cap +5×awk、stat 走觉醒段公式 | ✅ |
| **chara HP%** slider | `tr.hp` | HP-curve factor (Vitality/RemHP 按池插值、Break ≤ 50%);HP=0 时本 slot 的 FellDown 不发动、队友的 FellDown 系数 = 倒下比例 | ✅ |
| **結婚** toggle | `tr.marriage` | 5 项 stat × {1.0/1.03/1.05}、結晶 slot +1 (state 内 initial_slot+1)。攻/防/BK/転速那 4 条被 Rise 放大 | ✅ |
| **燃心** toggle | `tr.moeshin` | 攻撃力 / 防御力 × 1.3,server-fold (s2b、floor 前)。游戏里 BH 是 1.10–1.30 的连续值,这里取满值 | ✅ |
| **LP** 档 | `tr.lp` | 4 档 (UI `½↑`/`½↓`/`¼↓`/`0` = tier 0/1/2/3): 攻撃力 × `LP_TIER_NORMAL = [1.0, 1.1, 1.5, 2.0]`;Blaze 入口用 `LP_TIER_BLAZE = [1.0, 1.3, 2.0, 5.0]` | ✅ |
| **MP** slider [0, `_master.mp`] | `tr.mp` (null=満) | 攻撃力 / ブレイク力 × MP rate (unpacking §3.9.1,s6b、Add 池之后): `mp_ratio = mp / _master.mp`;`mp_ratio < 0.5 → 1 − (20/21)·√(1 − 2·mp_ratio)`、`≥ 0.5 → 1.0`。境界 ratio 0 → 1/21、ratio 0.5 → 1.0 (旧 have_mp toggle 两端的泛化) | ✅ |
| **BD ON/OFF** toggle | `tr.bd_on` | ON → `bd_skill.effects[]` 当普通 buff 加入 stat、倍率 = `value + additional_value × bd_count`;range=Single 的只算攻速 / ダメ上限。不影响 IsBlaze gate / BD 伤害公式 (未实装) | ✅ |
| **BD 条数** input (仅 bd_on 时显示) | `tr.bd_count` | bd_skill effect 的 `additional_value × bd_count`。默认 `bd_skill.cost`、范围 0..bdCapMax | ✅ |
| **soul level** slider | `tr.soul_lv` | 所有 soul effect `value × soulMultiplier(rarity, lv)` (表: lv≤r×10 → 1+0.01lv; 之后到 75 渐进 +0.3/+0.1)。Multiply 直乘 (×1.45 → lv50 ×2.175、游戏行为)、HitCount values 数组同样缩放 | ✅ |
| **soul 觉醒** slider | `tr.soul_awakening` | soul max_lv += 5 × soul_awakening (cap 75) | ✅ |
| **soul affinity** (元素/武器相性倍率) | (自动、装备 chara 决定) | 攻撃力 × positive_value、防御力 × negative_value;ブレイク力不吃 (EBD 不查魂的相性表) | ✅ |
| **crystal lv** slider | `crystals[i].lv` | `crystalEffectiveValue`: 三因子 (M_L/W/P_max) 或 max_value 线性插值 | ✅ |
| **crystal 重量** slider | `crystals[i].weight` | 三因子公式 weight 维度 (M_W_max + min/max_weight + weight_step revise)。**固定重量约定 (2026-07-02)**: revise 显式填 `min_weight == max_weight`(如 100/100)→ M_W 恒取 M_W_max、⚙ 不显示重量滑条、因子行不显示 range(用于只存在单一重量的结晶,如 M_W_max=1.5 恒 ×1.5);留空(缺省 0/100)行为不变 | ✅ |
| **crystal 純度** slider | `crystals[i].purity` | 三因子公式 purity 维度(固定纯度约定同 weight:`min_purity == max_purity` → 恒 M_P_max)。**lv 维度不适用此约定**(`max_level=1 → M_L=1` 是既有语义) | ✅ |
| **秘録記憶 装備** | `crystals[]` 内容 | 自分の `weapon_base_id` 一致の秘録記憶装備中 → 結晶枠 +1 (desc `[結晶枠+1(上限1)]`、複数でも +1)。`crystalSlotCount` 判定、外すと `syncCrystals` が固定点まで收敛 (slice が秘録本体を外す連鎖対応) | ✅ |
| **target slot** 切换 (1/2/3) | (UI、不存 tr) | 改算哪个 slot 的 stat、跨 slot range='All' buff 仍来自其他 slot | ✅ |
| **omoide picks** (memory slot) | `tr.omoide_picks` | omoide source effect (Add → s1、Mul → s4a)、`_omoide_slots` Frida 抓包数据 + affection_threshold gate | ✅ |
| **enemy element** | `ctx.enemy.element` | 攻撃力 × 属性相性 (s8);ブレイク力按「是否弱点」选 EBD 4 格 (s7_ebd) | ✅ |
| **enemy break** | `ctx.enemy.bk` | Enemy_Break parameter factor = 1 if true | ✅ |

### Source → Stage 映射 (跟 trace stage key 一致)

| _source | Stage | math_type | 触发自 |
|---|---|---|---|
| `omoide` | s1 (Add) | Addition | tr.omoide_picks 选中的 memory slot |
| `omoide_mul` | s4a (Mul) | Multiply | omoide source 的 Mul effect |
| `masou` (静的、Attack / Defense) | s2a (Add) → s2b (Mul) | Add or Mul | 装备 masou.effects、server 折进 attack / defense (§1.1.2.1)。缺省只作用自身 —— 见下节 |
| `masou` (其它) | s4a / s5a / s4h | Mul / Add | HP-curve 前缀 (Vitality_/RemHP_/Break_/FellDown_) 或 Attack / Defense 以外的 parameter — 以 `-7` 走 client PSV |
| **LP tier** | **s3 (× Attack)** | Multiply | `opts.lpMult` 入口决定 (computeStats HpCheck / computeStatsBlaze LpCheck) |
| `chara_skill` | s4a (Mul) / s5a (Add) | Mul / Add | chara state.weapon_skills |
| `bd_skill` | s4c / s5c | Mul / Add | tr.bd_on=true 时 chara.bd_skill.effects (range=Single 只留攻速 / ダメ上限) |
| `crystal` | s4a / s5a | Mul / Add | 装备 crystal (`crystalEffectiveValue` lv/weight/purity) |
| `bg` | s4a / s5a | Mul / Add | 装备 bg.skills (画 / 技能的属性·武器限定按装备者判) |
| `chara_meta` 結婚 | s4a (Mul) | Mul | `tr.marriage`,is_original_skill=true |
| `chara_meta` 燃心 | **s2b** (Mul) | Mul | `tr.moeshin`,server-fold、攻撃 / 防御 |
| `chara_meta` MP | **s6b** (Mul) | Mul | `tr.mp` → `mpRate`、攻撃 / ブレイク、Add 池之后 (step 50)。**LP 不在这里**、走 s3 |
| `enemy_buff` | s4a / s5a | Mul / Add | enemy bar guildTitle / emblems |
| `soul` | **s4b / s5b** (排非 soul 后) | Mul / Add | 装备 soul.skills (× soulMultiplier) |
| `soul_affinity` | **s4b** (Mul) | Mul | soul 元素 + 武器 相性倍率 (固定乘、攻撃 / 防御) |
| HP 曲線池 | **s4h** (Mul) | Mul | 任何 source 的 `Vitality_` / `RemHP_` / `FellDown_` 同 parameter 合一池、`1 + r(Π − 1)` |
| `enemy_break` | **s6 (Mul → Add)** | Mul / Add | parameter 前缀 `Enemy_Break_*`、gate `enemy.bk` (unpacking §3.9 step 48/49) |
| **inline ×3** | **s7 (× Attack)** | Multiply | `opts.enemyBkX3` step 51、enemy.bk gate (unpacking §3.10) |
| **EBD 4 格** | **s7_ebd (× BK)** | Multiply | 只ブレイク力:弱点 × 敵BK 的 ×1.8 / ×1.2 / ×1.5 / ×0.1 (04_ebd §4.6) |
| enemy mods | **s8 (× Attack)** | Multiply | 属性相性 (全局)、難度/BK耐性/有利武器 (guild gate)、BD cap — `_computeEnemyMods` 硬编码倍率、stage 后乘 + ceil |

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

[tests/ui/test_hensei_interactions.spec.js](../tests/ui/test_hensei_interactions.spec.js) 当前 **57 case**
(全 suite 93 case / 6 file、`npx playwright test` 一把跑)。下面的 group 表是 **早期 29 case 的
基线快照**、之后新增的 case (装備パネル / import-export / 短链 / 魔装 range / omoide 懒加载 等) 没往表里加
—— 权威清单看 `npx playwright test --list`,这张表只用来看「哪个控件当初是靠哪个 fixture 锁住的」:

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

测试公式校准依据:
- soul effect: `soulMultiplier(rarity, lv)` × `effect.value` (v1 main:js/stats-calc.js L210)
- LP: 4 档 `[1.0, 1.1, 1.5, 2.0]` 普通 / `[1.0, 1.3, 2.0, 5.0]` Blaze (unpacking §3.5)
- HitCount: 逐段、逐 effect 序贯、按 `orderServerFold`(server 拼接顺序、不分组 Mul/Add)、每步 `cur = trunc(cur op val)` + **每步 clamp ≥1** (2026-06-19 用户确认、unpacking 17_hitcount §17.2.2 server 预折叠「每条各自截断」、替代旧 Mul-then-Add 分组):
  `cur = trunc(cur op effVal); if cur<=0: cur=1` 逐 effect、终值 `max(1, cur)`
  例: base 3、soul Add +6 (×1.8 等级) → floor(3+10.8)=13 → 下一 effect 从 13 起
- soul HitCount `values=[a,b,c]` 数组: 每段 × soulMultiplier (跟单值路径一致吃等级加成)
- omoide Mul → s4a (4 stat);転速 里 omoide Add 走 server-fold 段、omoide Mul 走 `mul_acc`
- omoide `value_scaling`: master/Frida 抓包多为空。description 含「熟度UPにつれて…」字样的 skill 实测真实 scaling = **0.003 / 熟度** (`OMOIDE_FALLBACK_SCALING`、`shared/hensei-helpers.js` `omoideEffectiveScaling`);effect value = `value + 0.003 × 熟度`(不减 1、用户决策,单测 `omoide scaling fallback` 锁住)

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
| s4a_other_mul / s4b_soul_mul | Mul: 非 soul 类 (chara/crystal/bg/魔装/結婚、slot 升序) → soul 类 |
| s4h_hp_curve | HP 曲線池:每个 parameter 一步、src 写「池 ×P (N 条、r=…)」 |
| s4c_bd_mul | BD buff Mul |
| s5a_other_add / s5b_soul_add / s5c_bd_add | Add: 同上分类、计算顺序 = stage 顺序 |
| s6_enemy_break / s6b_mp / s7_ebd / s7_inline3 / s7b_ceil | step48/49 / step50 MP 不足 / EBD 4 格 (只ブレイク力) / step51 / 出口 ceil |
| s8_enemy_mods | 属性相性/難度/有利武器/BD cap (逐因子、链尾=ceil 后显示值) |
| s9_hits | Hit1-3 逐 effect 序贯 (每步 floor、after=floor 后值) + max(1) 终步 |
| s10_damage_limit | DamageLimitBreak fold (先 Mul 池、后 Add 池) + floor 终步 |
| s11_speed | 転速: base.Speed → +omoide Add链 → ×魔装 Mul → floor (server-fold) → ×Mul链 → ×HP 曲線池 → ×partner → +其他Add链 |
| s12_motion | 攻速1-3: motion_speed_i → ×Mul链 (含 HP 曲線池) |

- step.stat ∈ { 攻撃力/防御力/HP/ブレイク力/Hit1-3/ダメ上限/転速/攻速1-3 }、UI 按 tab filter
- UI tab 只渲染相关 stage: 攻撃力等 4 stat → s1-s8; Hit → s9; ダメ上限 → s10; 転速 → s11; 攻速 → s12
- step.src = `{skill/装备名}@S{slot}` (collectEffects 的 `_src_name`)
- speed/motion 实际计算保持 fold (输出 bit 一致)、trace 链为数学等价重演。転速: omoide Add、魔装 Mul 与 floor
  是真实顺序(server-fold 段、不可交换);floor 之后的 Mul / 其他 Add 才是等价重演 (Mul 全在 Add 前)
- 单测: `tests/unit/test_stats_trace.mjs` (gate / on-off 一致 / 各链尾 == 输出 / 链连续性)

---

## ギルバト スコア計算 (`shared/guild-score.js`)

hensei 编成页 guild 模式 (`enemy.mode = guildbattle / guildbattle_special`) 下 `#team-size-bar` 显示
「スコア計算」按钮 → modal 内选「メイン」(carry) 1/2/3号位 + 填「開始秒」(还剩多少秒开始输出 =
输出窗口长度、40=满窗口、小数可、clamp 0〜40+加时 (v1=40)、默认 40)、按「計算」才模拟、
下方明细 (推定ダメージ / 獲得ギルドスコア / 基礎スコア / 難易度ボーナス / 結界ボーナス) —
左侧 label 骨架固定 (只建一次)、メイン 行预留高度、值只在按 計算 时刷新 (切 メイン/開始秒 不清旧值)。
メイン 互斥单选、teamSize 之外的号位 disabled、缩编时 ≥teamSize 回落 1号位、
走 bxb1 hash 持久化 (`mainSlot` 字段、默认 0 省略);開始秒不持久化。

`simulateGuildScore(input)` — 纯函数、stat 输入全部来自 メイン slot 的 `computeStats` 返回:
`aMax` = `stats['攻撃力']`、`dl` = `damageLimit`、`hits` = `hits[3]`、
`durF` = `motionSpeed.durationsFrames[3]`、`cdF/setF` = `speed.cooldownFrames/setFrames`、
外加 UI 的 `startSeconds`。

### 模型 (高频重叠 loop)

```
loopFrames  = (f1+f2+f3) + 1 + (cdF+setF) + 1        # §8.6 十帧模型: 3段攻速 + BT + 転速 + BT
loopSeconds = loopFrames / 60                         # 最小 10fr (攻速 2+2+2 + cd1 + set1 + 2)
offset[i]   = Σ_{j<i} f_j / 60                        # 段 i 起跑偏移 = 前面各段攻速帧累计
perHit      = mean_{r∈{1.00..0.95}} min(dl, aMax×r)   # 波动率 6 档均匀 (03_ead.md §3.9.2)、每档各自吃 dl 封顶

win = clamp(startSeconds, 0, 40)                      # 開始秒 = 剩余输出时间 = 窗口长度 (缺省=满窗口)
for k while k×loopSeconds < win:                      # loop 每 P 重开、hit 列后台并行堆叠 (不等打完)
  for i in 0..2 (N_i > 0):
    start = k×loopSeconds + offset[i]                 # 段 i 的 hit 在 start + h×0.15 (h=0..N_i-1)
    total += count(h: start + h×0.15 < win)           # timestamp < 窗口末尾严格 (恰好落界不计)

totalDamage = floor(perHit × total)                   # 推定ダメージ
```

### ギルドスコア换算 (`computeGuildScore(totalDamage, difficulty)`)

```
基礎スコア score_base   = floor(totalDamage / 1e7)
難易度ボーナス diff     = { Normal: 1, Hard: 5, Lunatic: 10 }[enemy.difficulty]
結界ボーナス barrier    = 2.6 (固定)
獲得ギルドスコア score  = score_base × diff × barrier   # ×26/10 整数运算避 float 噪声、最多 1 位小数
```

- **高频重叠语义**: loop 周期只含动作帧+転速 (~零点几秒)、每个 loop 的 hit 列 (可长达数秒) 并行堆叠、
  40s 内大量重叠 — 实证敲定的模型。offset 只在末尾跨窗口边界的 loop 里影响截断。
- **攻速缺失兜底**: `durF` 全 0 (`_npc_motions` 缺 motion_id) → 有 hit 的段按 2fr、3 段合计回落最小 6fr。
- **v1 固定**: `battleSeconds=40`、`hitInterval=0.15` (普通; Blaze 0.05 未実装)、无加时 buff。
- 返回 `{ totalDamage, totalHits, loops, perHit }` + `{ scoreBase, diffBonus, barrierBonus, score }`。
- 单测: `tests/unit/test_guild_score.mjs` (手算对拍 + 逐 hit 枚举 brute-force 复算、最小 10fr、
  dl 封顶、窗口截断/落界边界、開始秒=剩余窗口、durF 兜底、スコア换算)。
