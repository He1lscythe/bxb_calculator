"""master_tables enum 完整定义 — 全部按 #JS (JobSkill.Parameter) 体系。

参考:
- F:/.../unpacking/table.md (跨表合并 105 项 enum)
- F:/.../unpacking/HOWTO_battle/11_parameters.md (#JS vs #BE 区别)
- F:/.../unpacking/HOWTO_battle/02_psv_gates.md (HP-curve / Break gate)

关键设计:
- master_tables 用 #JS (91 项 JobSkill.Parameter)、BattleEngine runtime 用 #BE (87 项)
- 两者 1-1 大致对齐但有偏移 (Mez/Stun 起 +1)
- 本项目数据层只用 #JS、所有 build script 输出 parameter 字段 = #JS id
- runtime calc 阶段（前端 hensei）才映射到 #BE id 走 EAD 50 步 pipeline

不引入 wiki bunrui (21 种) 概念 — 已废弃、直接用 #JS Parameter 原值。
"""

# ============================================================
# math_type — 倍率作用方式
# 来源: weapons.weapon_skills[].math_type / jobs.job_skills[].math_type
# ============================================================
MATH_TYPE = {
    0: "Multiply",     # 乘算 — fmul 池累乘 (默认值 1.0)
    1: "Addition",     # 加算 — fadd 池累加 (默认值 0)
    2: "Set",          # 設定値 — 直接覆盖
    3: "Repel_Percent",  # 概率回避 — value=N 表示 N% 概率完全免疫该 parameter (soul 対麻痺適正 等)
    4: "None",           # BD 特殊効果占位 — 不走数值运算、靠 effect_id 触发 hardcoded 机制 (強制ブレイク / 弱体解除 / 時止め 等)
}
# 反查
MATH_TYPE_BY_NAME = {v: k for k, v in MATH_TYPE.items()}

# ============================================================
# Parameter (#JS) — JobSkill.Parameter 完整 enum (91 项 + None=0)
# 来源: unpacking/table.md L228-345 跨表合并表
# 注释 = 业务含义 (中文 from table.md 注列)
# 注: BE-only (Enemy_BreakAttack 等 13 项) 不在此、runtime calc 时另建 #JS↔#BE 映射表
# ============================================================
PARAMETER = {
    0: "None",
    1: "Attack",                          # 攻击力
    2: "Defense",                         # 防御力
    3: "Heal",                            # 血量
    4: "GuardBreak",                      # 破甲力
    5: "GuardDefense",                    # 格挡防御
    6: "BlazeAttack",                     # BD攻击力
    7: "Speed",                           # 转速
    8: "MotionSpeed",                     # 攻速
    9: "PlayerHit",                       # 命中率
    10: "EnemyHit",                       # 闪避率
    11: "SapphireDrop",                   # 打蓝
    12: "Attack_Sapphire",
    13: "RubyDrop",                       # 打红
    14: "TimeHeal",
    15: "TimeHeal_Main",
    16: "AttackCount",
    17: "Raise",                          # 复活
    18: "Mez",                            # 麻痹
    19: "Stun",                           # 眩晕
    20: "TheWorld",
    21: "ForceBreak",
    22: "DamageHeal",
    23: "DamageLimitBreak",               # 破限
    24: "BlazeLock",
    25: "AllTarget",                      # aoe（攻）
    26: "SuicideAttack",                  # 扣血攻击
    27: "Blaze13",
    28: "RemHP_Attack",                   # 背水攻
    29: "RemHP_Defense",                  # 背水防
    30: "RemHP_BlazeAttack",              # 背水BD攻
    31: "RemHP_PlayerHit",                # 背水命中
    32: "RemHP_EnemyHit",
    33: "RemHP_Speed",                    # 背水转速
    34: "RemHP_MotionSpeed",              # 背水攻速
    35: "RemHP_Sapphire",                 # 背水打蓝
    36: "Vitality_Attack",                # 浑身攻
    37: "Vitality_Defense",               # 浑身防
    38: "Vitality_BlazeAttack",           # 浑身BD攻
    39: "Vitality_PlayerHit",
    40: "Vitality_EnemyHit",              # 浑身闪避
    41: "Vitality_Speed",                 # 浑身转速
    42: "Vitality_MotionSpeed",           # 浑身攻速
    43: "Vitality_Sapphire",              # 浑身打蓝
    44: "Break_Attack",                   # 破损攻
    45: "Break_Defense",                  # 破损防
    46: "Break_BlazeAttack",
    47: "Break_PlayerHit",
    48: "Break_EnemyHit",
    49: "Break_Speed",                    # 破损转速
    50: "FellDown_Attack",                # 队友倒地攻
    51: "FellDown_Defense",
    52: "FellDown_BlazeAttack",
    53: "FellDown_PlayerHit",
    54: "FellDown_EnemyHit",
    55: "FellDown_Speed",                 # 队友倒地转速
    56: "JustGuard_Sapphire",             # JG加蓝
    57: "JustGuard_MinDamage",            # JG减伤
    58: "JustGuard_Heal",                 # JG回血
    59: "Wave_Heal",                      # 过w回血
    60: "Wave_BlazeUP",                   # 过w回BD
    61: "Enemy_Attack",
    62: "Enemy_Defense",
    63: "Enemy_GuardBreak",
    64: "Enemy_GuardDefense",
    65: "Enemy_BlazeAttack",
    66: "InstantDeath",                   # 即死
    67: "BlazeAbsorb",                    # 分解
    68: "RateDamage",                     # 百分比伤害
    69: "BlazeLockPurge",                 # BD锁
    70: "Random_Attack",                  # 暴击
    71: "WeaponArtsCost",                 # bd cost
    72: "WeaponArtsHitCount",             # bd hit
    73: "WeaponArtsHitCountKeepDamage",   # bd hit
    74: "HP",                             # HP
    75: "HitCount",                       # hit
    76: "HitCountKeepDamage",             # hit
    77: "UserExp",                        # 用户exp
    78: "AnyElement",                     # 属性移植
    79: "BarrierInvokePermission",
    80: "BlazeGauge",                     # 开局bd条
    81: "BlazeGaugePointRate",            # bd条获取效率
    82: "BlazeGaugeMaxLevel",             # 最大bd
    83: "EventDropRate",                  # 活动掉落
    84: "EventSupplyBonus",
    85: "GuildBattleTimeLimit",
    86: "MaterialExp",                    # 结晶经验
    87: "JobExp",                         # 魂经验
    88: "Prayer",
    89: "Rise_AttackRate",                # 攻击效果放大
    90: "Rise_DefenseRate",
}

# ============================================================
# PARAMETER_BE_ONLY — BE# (BattleEngine.Skill.Parameter) 独有的 13 项
# 这些不在 #JS JobSkill.Parameter 里、但 master 数据 / runtime 用到
# 来源: unpacking/table.md L228-345 跨表合并表 (JS# = '—' 行)
# key = BE# (避开 JS# 0-90 区间)
# ============================================================
PARAMETER_BE_ONLY = {
    18: "RaiseBreak",
    28: "JustGuardTime",
    30: "CancelDebuff",
    71: "Enemy_BreakAttack",              # 破甲攻击 (weapons.json 84 处实际用)
    76: "Random_Begin",                   # sentinel 边界
    78: "Random_Defense",                 # EAD swap path 池 (master 0 占用、runtime 入参)
    79: "Random_End",                     # sentinel
    80: "Condition_Begin",                # sentinel
    81: "Condition_End",                  # sentinel
    82: "Condition_Count_Begin",          # sentinel
    83: "Condition_Count_JG_Attack",      # EAD step 19 JG count Attack 池
    84: "Condition_Count_JG_Defense",     # EAD step 13 swap path
    85: "Condition_Count_End",            # sentinel
}

# ============================================================
# PARAMETER_EXTENSION — 既不在 #JS 也不在 #BE、master 独有 / sentinel
# memory_slot_skills.json 独有的扩展 enum
# ============================================================
PARAMETER_EXTENSION = {
    "MaterialSlotQuantity",   # senzai 「記憶結晶装備数UP」用 (2 entry)
    "NoEffect",               # sentinel (jobs/weapons/materials 各几个占位 entry)
}

# 反查 — 合并三类、用 set 验证 build script 出现的 parameter 是否合法
PARAMETER_BY_NAME = {v: k for k, v in PARAMETER.items()}
PARAMETER_ALL_NAMES = (
    set(PARAMETER.values())
    | set(PARAMETER_BE_ONLY.values())
    | PARAMETER_EXTENSION
)


# ============================================================
# range — 技能作用范围
# 来源: jobs.job_skills[].range / weapon_innate_skills.range / weapon_arts_effects.range
# 实测 distinct: {'All', 'Single', 'None', 'all'}
# 注: 'all' lowercase 是 master typo (jobs.json 有 1 处)、build script normalize 成 'All'
# ============================================================
RANGE = {
    "All": "All",         # 全体
    "Single": "Single",   # 单体
    "None": "None",       # 无目标 (passive / self-only)
}
RANGE_NORMALIZE = {"all": "All"}  # case 修正


# ============================================================
# 条件字段说明（不是单一 enum！）
# ============================================================
# wiki 把"条件"折叠成 5 值 CONDITION enum (浑身/背水/破損/敵BK/無) — 丢信息
# master 把条件分散到多字段、表达更丰富：
#
# 1. HP-curve / Break / FellDown — 通过 parameter prefix 表达
#    - Vitality_* = 浑身 (HP 多越强)、HP-curve func: VitalitySkillRate
#    - RemHP_*    = 背水 (HP 少越强)、HP-curve func: RemHpSkillRate
#    - Break_*    = 破損 (HP < 阈值)、hard gate: IsBreak
#    - FellDown_* = 队友倒地、hard gate
#    详见 unpacking/HOWTO_battle/02_psv_gates.md
#
# 2. 限定条件 — 独立字段
#    - element_condition: int (target_element_id 同 enum)
#    - weapon_type_condition: int (target_weapon_type_id 同 enum)
#    - enemy_element_id: int (敵元素限定、Enemy_* parameter 用)
#    - weapon_base_id: int (特定 chara 限定、对应 wiki scope=5)
#    - is_blaze: bool (是否 BD 模式、IsBlaze gate)
#
# 3. master 独有 (wiki 没的) 条件字段
#    - greater_than_bust_condition / less_than_bust_condition: 胸围限定 (joke / 隐藏机制?)
#    - limit_count: 次数限制
#    - effective_rate: 触发概率
#    - skill_effect_duration: buff 持续时间
#    - just_guard_threshold: JG 阈值
#
# Phase 2 build script 不做 condition flatten — 透传所有字段、前端按需 decode
# ============================================================
CONDITION_FIELD_NAMES = [
    'element_condition',
    'weapon_type_condition',
    'enemy_element_id',
    'weapon_base_id',
    'greater_than_bust_condition',
    'less_than_bust_condition',
    'limit_count',
    'effective_rate',
    'skill_effect_duration',
    'just_guard_threshold',
]


# ============================================================
# PARAMETER_MATH_TYPE — 默认 math_type 映射 (105 项、按 parameter)
# 来源: unpacking/table.md L227-353 跨表合并表 math_type 列 (主类型)
# 用于: build_crystals (master materials.json 无 math_type 字段、按 parameter 查表补)
# null = 该 parameter 在 master 没 skill 实例或 0 占用 (Enemy_*/sentinel/废弃)
# ============================================================
PARAMETER_MATH_TYPE = {
    "None": None,
    "Attack": "Multiply", "Defense": "Multiply", "Heal": "Addition",
    "GuardBreak": "Multiply", "GuardDefense": "Multiply", "BlazeAttack": "Multiply",
    "Speed": "Multiply", "MotionSpeed": "Multiply",
    "PlayerHit": "Multiply", "EnemyHit": "Multiply",
    "SapphireDrop": "Multiply", "Attack_Sapphire": None, "RubyDrop": "Multiply",
    "TimeHeal": None, "TimeHeal_Main": None, "AttackCount": None,
    "Raise": "Multiply", "RaiseBreak": None,
    "Mez": "Repel_Percent", "Stun": "Repel_Percent",
    "TheWorld": None, "ForceBreak": None, "DamageHeal": None,
    "DamageLimitBreak": "Addition", "BlazeLock": None,
    "AllTarget": "Multiply", "SuicideAttack": "Addition",
    "JustGuardTime": None, "Blaze13": None, "CancelDebuff": None,
    "Rise_AttackRate": "Multiply", "Rise_DefenseRate": None,
    "RemHP_Attack": "Multiply", "RemHP_Defense": "Multiply", "RemHP_BlazeAttack": "Multiply",
    "RemHP_PlayerHit": "Multiply", "RemHP_EnemyHit": None,
    "RemHP_Speed": "Multiply", "RemHP_MotionSpeed": "Multiply", "RemHP_Sapphire": "Multiply",
    "Vitality_Attack": "Multiply", "Vitality_Defense": "Multiply", "Vitality_BlazeAttack": "Multiply",
    "Vitality_PlayerHit": None, "Vitality_EnemyHit": "Multiply",
    "Vitality_Speed": "Multiply", "Vitality_MotionSpeed": "Multiply", "Vitality_Sapphire": "Multiply",
    "Break_Attack": "Multiply", "Break_Defense": "Multiply", "Break_BlazeAttack": "Multiply",
    "Break_PlayerHit": "Multiply", "Break_EnemyHit": "Multiply", "Break_Speed": "Multiply",
    "FellDown_Attack": "Multiply", "FellDown_Defense": "Multiply", "FellDown_BlazeAttack": "Multiply",
    "FellDown_PlayerHit": "Multiply", "FellDown_EnemyHit": "Multiply", "FellDown_Speed": "Multiply",
    "JustGuard_Sapphire": "Multiply", "JustGuard_MinDamage": "Multiply", "JustGuard_Heal": "Addition",
    "Wave_Heal": "Multiply", "Wave_BlazeUP": "Addition",
    "Enemy_Attack": None, "Enemy_Defense": None,
    "Enemy_GuardBreak": None, "Enemy_GuardDefense": None, "Enemy_BlazeAttack": None,
    "Enemy_BreakAttack": "Multiply",
    "InstantDeath": "Repel_Percent", "BlazeAbsorb": "Repel_Percent",
    "RateDamage": "Repel_Percent", "BlazeLockPurge": "Repel_Percent",
    "Random_Begin": None, "Random_Attack": "Multiply", "Random_Defense": None, "Random_End": None,
    "Condition_Begin": None, "Condition_End": None,
    "Condition_Count_Begin": None,
    "Condition_Count_JG_Attack": None, "Condition_Count_JG_Defense": None,
    "Condition_Count_End": None,
    "Prayer": None,
    "WeaponArtsCost": "Addition", "WeaponArtsHitCount": "Multiply", "WeaponArtsHitCountKeepDamage": "Multiply",
    "HP": "Multiply", "HitCount": "Addition", "HitCountKeepDamage": "Addition",
    "UserExp": "Multiply", "AnyElement": "Multiply",
    "BarrierInvokePermission": None,
    "BlazeGauge": "Addition", "BlazeGaugePointRate": "Multiply", "BlazeGaugeMaxLevel": "Addition",
    "EventDropRate": "Multiply", "EventSupplyBonus": None, "GuildBattleTimeLimit": None,
    "MaterialExp": "Multiply", "JobExp": "Multiply",
    "MaterialSlotQuantity": "Addition",   # senzai 独有 (master 实际 Addition)
    "NoEffect": None,                      # sentinel
}


# ============================================================
# target_element — 元素属性
# 来源: master_tables.elements.json
# ============================================================
TARGET_ELEMENT = {
    0: "None",     # 无属性 / 不限定
    1: "Fire",     # 火
    2: "Water",    # 水
    3: "Wind",     # 風
    4: "Light",    # 光
    5: "Dark",     # 闇
    6: "Neutral",  # 無
}
TARGET_ELEMENT_BY_NAME = {v: k for k, v in TARGET_ELEMENT.items()}


# ============================================================
# target_weapon_type — 武器类型
# 来源: master_tables.weapon_types.json
# ============================================================
TARGET_WEAPON_TYPE = {
    0: "None",         # 无限定
    1: "Longsword",    # 長剣
    2: "Greatsword",   # 大剣
    3: "Katana",       # 太刀
    4: "Staff",        # 杖棒
    5: "Bow",          # 弓矢
    6: "Crossbow",     # 連弩
    7: "Axe",          # 戦斧
    8: "Lance",        # 騎槍
    9: "Thrown",       # 投擲
    10: "Fist",        # 拳闘
    11: "Grimoire",    # 魔典
    12: "Scythe",      # 大鎌
}
TARGET_WEAPON_TYPE_BY_NAME = {v: k for k, v in TARGET_WEAPON_TYPE.items()}


# ============================================================
# rarity — 稀有度
# 来源: master_tables.rarities.json
# ============================================================
RARITY = {
    1: "A",
    2: "AA",
    3: "S",
    4: "SS",
}


# ============================================================
# evolve_count — chara state 进化层级
# 来源: weapons.evolve_count + weapons.evolve_name
# ============================================================
EVOLVE_COUNT = {
    0: "通常",
    1: "改",       # = 改造
    2: "改極弐",   # = 極弐
}


if __name__ == "__main__":
    print("=== enum schema summary ===")
    print(f"MATH_TYPE: {len(MATH_TYPE)} values")
    print(f"PARAMETER: {len(PARAMETER)} values (#JS 91 项)")
    print(f"RANGE: {len(RANGE)} values (+ normalize)")
    print(f"CONDITION_FIELD_NAMES: {len(CONDITION_FIELD_NAMES)} fields (非 enum、字段名列表)")
    print(f"TARGET_ELEMENT: {len(TARGET_ELEMENT)} values")
    print(f"TARGET_WEAPON_TYPE: {len(TARGET_WEAPON_TYPE)} values")
    print(f"RARITY: {len(RARITY)} values")
    print(f"EVOLVE_COUNT: {len(EVOLVE_COUNT)} values")
