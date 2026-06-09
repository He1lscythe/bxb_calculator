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

## Stage 表

| stage | source | math_type 过滤 | 含义 |
|---|---|---|---|
| **1** | `omoide` (memory slot) | `Addition` | 好感加算 — omoide 槽插入的 memory slot effect |
| **2a** | `masou` | `Addition` | masou 装备 add 部分 |
| **2b** | `masou` | `Multiply` | masou 装备 mul 部分 |
| **3** | `chara_skill` / `crystal` / `bg` / `soul` | `Multiply` | 其他乘算 |
| **4** | `chara_skill` / `crystal` / `bg` / `soul` | `Addition` | 最后加算 |
| 独立 | 任何 source | `Repel_Percent` | status 回避率、独立通道、不进 stat pipeline |
| skip | 任何 source | `None` / `Set` / `NoEffect` parameter | 跳过、不渲染、不参与 calc |

## Apply 公式 (7-stage + ceil、unpacking 03_ead.md 校准 2026-06-06)

按 unpacking §3.3 EAD 53 step RVA 顺序简化、保留 hensei UI 关心的部分:

```
v = floor(base)                                       Stage 0 base (server-fold floor、01_setup.md §1.5)
v += Σ(stage 1 omoide Addition × cf)                  Stage 1 omoide Add (Frida 抓包 affection_threshold gate)
v += Σ(stage 2a masou Addition × cf)
v *= Π(stage 2b masou Multiply × cf)                  Stage 2 masou (Add → Mul)
v *= lpMult                                           Stage 3 × LP tier (step 4、× Total 直接层)
v *= Π(stage 4 other Multiply × cf)                   Stage 4 other Mul (chara_skill / bd_skill / crystal / bg / soul / chara_meta / soul_affinity / omoide_mul)
v += Σ(stage 5 other Addition × cf)                   Stage 5 other Add
v *= Π(stage 6a enemy_break Multiply × cf)            Stage 6a Enemy_BreakAttack Mul (step 48、gate enemy.bk)
v += Σ(stage 6b enemy_break Addition × cf)            Stage 6b Enemy_BreakAttack Add (step 49)
v *= enemyBkX3                                        Stage 7 × 3 inline (step 51、enemy.bk gate、独立 cached gate)
v = ceil(v)                                           出口 ceil (caller get_Damage frintp + fcvtps、唯一 round 点)
```

**取整位置** (unpacking §3.12 audit):
- Stage 0 base = `floor(_baseStatRaw)` (server-fold 模拟、chara 创建时 server 已 int)
- 中间 stage 全程 double、**0 round** (docs §3.12.1: EAD 50 步 d8 链全函数 0 ARM64 rounding 指令)
- 出口 ceil = caller `get_Damage` `frintp + fcvtps`、整 pipeline 唯一 round 点

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

## Defense stat 公式 (unpacking 19_defense.md §19 PAD step 3)

hensei「防御力」显示 = `s10` (玩家防御吸收量、damage units) = `base × Π Mul + Σ Add`。

**用户决策**:
- 只显示玩家防御值、**不算被打时最终伤害** (即不模拟 §19.12 `final_damage = prevTotal × s8 + max(0, prevTotal × (1 - s8) - s10)` 公式中的 final_damage、只显示 s10)
- **SwapAttackDefense=true 模式** (剑魂特殊玩法、§19.2 表)**不考虑**、所有 Attack/Defense chain 按 `swap=false` (正常对战)

v2 简化模型跟 §19 phase 1-5 累积公式数学等价 (mul/add 累积、ARM64 不同 phase 物理位置不影响结果)、跳过 7 phase 内部细分。

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

`condition_factor` 在 collection 阶段算好、跟 value 配套存：
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

## 实现 sketch

`shared/stats-calc.js` 加 helper (待 hensei viewer 阶段落地):

```js
const STAGE = { OMOIDE: 1, MASOU: 2, OTHER_MUL: 3, OTHER_ADD: 4 };

// collection 时打 tag
export function tagEffect(eff, source) {
  let stage;
  if (source === 'omoide') stage = STAGE.OMOIDE;
  else if (source === 'masou') stage = STAGE.MASOU;
  else if (eff.math_type === 'Multiply') stage = STAGE.OTHER_MUL;
  else if (eff.math_type === 'Addition') stage = STAGE.OTHER_ADD;
  else stage = null;  // Repel_Percent / 未识别 → 独立处理
  return { ...eff, _source: source, _stage: stage };
}

export function applyStaged(base, parameter, effects) {
  const same = effects.filter(e => e.parameter === parameter);
  const pick = (stage, mt) => same.filter(e => e._stage === stage && e.math_type === mt);
  const sumAdd = arr => arr.reduce((s, e) => s + e.value * (e.condition_factor ?? 1), 0);
  const prodMul = arr => arr.reduce((p, e) => p * (1 + (e.value - 1) * (e.condition_factor ?? 1)), 1);

  let v = base;
  v += sumAdd(pick(STAGE.OMOIDE, 'Addition'));           // stage 1
  v += sumAdd(pick(STAGE.MASOU, 'Addition'));            // stage 2a
  v *= prodMul(pick(STAGE.MASOU, 'Multiply'));           // stage 2b
  v = Math.floor(v);                                     // ★ stage 2 后 floor
  v *= prodMul(pick(STAGE.OTHER_MUL, 'Multiply'));       // stage 3
  v += sumAdd(pick(STAGE.OTHER_ADD, 'Addition'));        // stage 4
  return Math.ceil(v);                                   // ★ 最终 ceil
}
```

## 跨 slot effect 收集

3 slot 各自的 chara_skill / soul / crystal / bg / masou / omoide effect 全部收到一个 effects[] 池、附 `_source` 标签、按 effect.range + target_element_id + weapon_type_id 决定 target slot 是否命中 (命中决定 condition_factor 是否 = 0)、然后走上面 applyStaged()。

具体 collection 实现在 hensei viewer 阶段落地、暂不实现。

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
| **MP** toggle | `tr.have_mp` | 攻撃力 / ブレイク力 × {1.0 / (1/21)} (なし時) | ✅ |
| **BD ON/OFF** toggle | `tr.bd_on` | ON → `bd_skill.effects[]` 当普通 buff 加入 stat (例: Attack ×50)。不影响 IsBlaze gate / BD 伤害公式 (Phase 8) | ✅ |
| **soul level** slider | `tr.soul_lv` | soul effect value 按 (soul_lv / soul_max_lv) 线性 scale | ✅ |
| **soul 觉醒** slider | `tr.soul_awakening` | soul max_lv += 5 × soul_awakening | ✅ |
| **soul affinity** (元素/武器相性倍率) | (自动、装备 chara 决定) | 攻撃力/ブレイク力 × positive_value、防御力 × negative_value | ✅ |
| **crystal lv** slider | `crystals[i].lv` | effect value 在 `initial_value → max_value` 线性插值 | ✅ |
| **crystal 重量段** slider | `crystals[i].weight` | effect 値衰减 | ❌ master 无、Phase 7 edit 手填 |
| **crystal 純度段** slider | `crystals[i].purity` | effect 値増強 | ❌ 同上 |
| **target slot** 切换 (1/2/3) | (UI、不存 tr) | 改算哪个 slot 的 stat、跨 slot range='All' buff 仍来自其他 slot | ✅ |
| **omoide picks** (memory slot) | `tr.omoide_picks` | omoide source Add effect (stage 1) | ❌ master 无 owned-slot 数据、Phase 8 抓包 |
| **enemy element** | `ctx.enemy.element` | 元素相性倍率参考、影响显示 (实际伤害公式 Phase 8) | UI only |
| **enemy break** | `ctx.enemy.bk` | Enemy_Break parameter factor = 1 if true | ✅ |

### Source → Stage 映射 (4-stage pipeline)

| _source | Stage | math_type | 触发自 |
|---|---|---|---|
| `omoide` | 1 (Add) | Addition | tr.omoide_picks 选中的 memory slot |
| `omoide_mul` | 4 (Mul) | Multiply | omoide source 的 Mul effect |
| `masou` | 2 (Add → Mul) | Add or Mul | 装备 masou.effects |
| `chara_skill` | 4 (Mul) / 5 (Add) | Mul / Add | chara state.weapon_skills |
| `bd_skill` | 4 / 5 | Mul / Add | tr.bd_on=true 时 chara.bd_skill.effects |
| `enemy_break` | **6 (Mul → Add)** | Mul / Add | parameter 前缀 `Enemy_Break_*`、gate `enemy.bk` (unpacking §3.9 step 48/49) |
| **LP tier** | **3 (× Attack)** | Multiply | `opts.lpMult` 入口决定 (computeStats HpCheck / computeStatsBlaze LpCheck) |
| **inline ×3** | **7 (× Attack)** | Multiply | `opts.enemyBkX3` step 51、enemy.bk gate (unpacking §3.10) |
| `crystal` | 3 / 4 | Mul / Add | 装备 crystal (按 lv 插值) |
| `bg` | 3 / 4 | Mul / Add | 装备 bg.skills |
| `soul` | 3 / 4 | Mul / Add | 装备 soul.skills (按 soul_lv scale) |
| `chara_meta` | 3 (Mul) | Mul | 3 种 chara metadata 倍率: 結婚 (`tr.marriage`) / 燃心 (`tr.moeshin`) / MP 装備 (`tr.have_mp`)。**LP 不在这里**、走独立 stage 6 `lp_tier` source |
| `soul_affinity` | 3 (Mul) | Mul | soul 元素 + 武器 相性倍率 (固定乘) |

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
- HitCount: 逐段 `max(1, floor(base[i] × Π Mul + Σ Add))` (unpacking §17.3)
- omoide Mul → stage 3 (用户决策)
