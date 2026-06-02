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
}
# 反查
MATH_TYPE_BY_NAME = {v: k for k, v in MATH_TYPE.items()}

# ============================================================
# Parameter (#JS) — JobSkill.Parameter 完整 enum
# 91 项 + sentinel/extension = 105 行 (含 BE-only / sentinel)
#
# Phase 1b 填充：从 unpacking/table.md L228-345 的跨表合并表 copy 全表
# 暂留空、当前只 cover demo 用、build script 先 fail 提示要填
# ============================================================
PARAMETER = {
    # TODO Phase 1b: 填 91 项完整 #JS Parameter
    # 优先级排序: base damage 池 (Attack/Defense/Speed/MotionSpeed/HP) 先
    # 然后 HP-curve (RemHP_* / Vitality_* / FellDown_*)
    # 然后 Break gate / JG / Wave
    # 最后 sentinel + JS-only schema 字段 (WeaponArtsCost / HP / HitCount)
}
PARAMETER_BY_NAME: dict = {}  # 反查、Phase 1b 同步生成


# ============================================================
# target_scope — 技能作用范围
# 来源: weapons.weapon_skills[].range / jobs.job_skills[].range
# ============================================================
TARGET_SCOPE = {
    # TODO Phase 1c: master 实际只见 "All" / "Single" 2 值（前面 explore 调研）
    # 但要确认是字符串 enum 还是 int enum、是否还有 None / Self / Party 等
    # 暂留空
}


# ============================================================
# condition_type — 触发条件
# 来源: master_tables 直给字段（替代 wiki classify_common._detect_condition NLP）
# ============================================================
CONDITION_TYPE = {
    # TODO Phase 1c: 等价 wiki 5 值 (0=無 1=浑身 2=背水 3=破損 4=敵BK)
    # master 可能 enum 不同、需读 weapon_skills/job_skills 实际 distinct 值
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
    print(f"PARAMETER: {len(PARAMETER)} values (Phase 1b 填充中)")
    print(f"TARGET_SCOPE: {len(TARGET_SCOPE)} values (Phase 1c 填充中)")
    print(f"CONDITION_TYPE: {len(CONDITION_TYPE)} values (Phase 1c 填充中)")
    print(f"TARGET_ELEMENT: {len(TARGET_ELEMENT)} values")
    print(f"TARGET_WEAPON_TYPE: {len(TARGET_WEAPON_TYPE)} values")
    print(f"RARITY: {len(RARITY)} values")
    print(f"EVOLVE_COUNT: {len(EVOLVE_COUNT)} values")
