"""build_characters.py — weapons.json → data/characters.json

按 base_id 聚合 weapons (1665 variant entry → ~656 chara)。
state 名按 evolve_count: 0=通常 / 1=改造 / 2=極弐 (内部 evolve_name 透传)。

每 state 内含:
- variant_id (= weapons.id 6 位)
- stats (initial_/max_ × 5 项 + max_mature/initial_max_level/max_max_level/max_lp)
- weapon_skills[] 透传 (含 value_scaling 从 wiki aux 按 name 匹配补)

bd_skill 提到顶层 (跨 state 共享、来自 weapons[0].weapon_arts 内嵌)。

omoide / tags 留空 (plan 决策、待未来抓包)。

用法: python scripts/master_to_business/build_characters.py
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import master_file  # noqa: E402
from enums import PARAMETER_ALL_NAMES, MATH_TYPE_BY_NAME, RANGE_NORMALIZE  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
OUT = DATA_DIR / "characters.json"
WIKI_AUX = DATA_DIR / "_wiki_aux.json"
AUDIT_TAGS_UNMATCHED = DATA_DIR / "_audit_chara_tags_unmatched.json"

EVOLVE_NAME = {0: "通常", 1: "改造", 2: "極弐"}


def load_wiki_aux():
    if not WIKI_AUX.is_file():
        return {}, {}
    aux = json.loads(WIKI_AUX.read_text(encoding="utf-8"))
    return (
        aux.get("chara_skill_value_scaling", {}),
        aux.get("chara_tags", {}),
    )


def normalize_range(r):
    return RANGE_NORMALIZE.get(r, r) if r else r


def _split_three_size(s):
    """'87/57/83' → (87, 57, 83) — wiki 三围拆开"""
    if not s or not isinstance(s, str):
        return None, None, None
    parts = s.split("/")
    if len(parts) != 3:
        return None, None, None
    try:
        return int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        return None, None, None


def build_profile(w):
    """profile 字段 — age/CV/3围/marriage 等。三围拆 B/W/H、master three_size 字符串拆开"""
    b, waist, h = _split_three_size(w.get("three_size"))
    return {
        "age": w.get("age"),
        "height": w.get("height"),
        "height_value": w.get("height_value"),
        "weight": w.get("weight"),
        "bust": w.get("bust"),
        "three_size": w.get("three_size"),
        "three_size_b": b,
        "three_size_w": waist,
        "three_size_h": h,
        "cv": w.get("cv"),
        "cv_kana": w.get("cv_kana"),
        "kana": w.get("kana"),
        "intro": w.get("intro"),
        "flavor_text": w.get("flavor_text"),
        "description": w.get("description"),
        "like": w.get("like"),
        "dislike": w.get("dislike"),
        "marriage_message": w.get("marriage_message"),
    }


# build_extras: 已废弃 — 字段直接 inline 到顶层 chara dict
# (per-chara、非 per-state、不应再嵌套一层)


def build_stats(w):
    """master weapons entry 提取 stats + level/mature 元数据 + initial_slot"""
    return {
        "initial_hp": w.get("initial_hp"),
        "max_hp": w.get("max_hp"),
        "initial_attack": w.get("initial_attack"),
        "max_attack": w.get("max_attack"),
        "initial_defense": w.get("initial_defense"),
        "max_defense": w.get("max_defense"),
        "initial_break": w.get("initial_break"),
        "initial_slot": w.get("initial_slot"),
        "max_break": w.get("max_break"),
        "initial_speed": w.get("initial_speed"),
        "max_speed": w.get("max_speed"),
        "max_attack_rank": w.get("max_attack_rank"),
        "max_defense_rank": w.get("max_defense_rank"),
        "max_mature": w.get("max_mature"),
        "initial_max_level": w.get("initial_max_level"),
        "max_max_level": w.get("max_max_level"),
        "max_lp": w.get("max_lp"),
    }


def build_skills(weapon_skills, wiki_scaling, warnings, ctx_id):
    out = []
    for sk in weapon_skills or []:
        param = sk.get("parameter")
        math = sk.get("math_type")
        name = sk.get("name")
        if param and param not in PARAMETER_ALL_NAMES:
            warnings.append(f"chara id={ctx_id}: param {param!r}")
        if math and math not in MATH_TYPE_BY_NAME:
            warnings.append(f"chara id={ctx_id}: math_type {math!r}")
        scaling = wiki_scaling.get(name, 0.0) if name else 0.0
        out.append({
            "id": sk.get("id"),
            "name": name,
            "parameter": param,
            "math_type": math,
            "value": sk.get("value"),
            "value_scaling": scaling,
            "max_value": sk.get("max_value"),
            "range": normalize_range(sk.get("range")),
            "target_element_id": sk.get("target_element_id"),
            "weapon_type_id": sk.get("weapon_type_id"),
            "limit_count": sk.get("limit_count"),
            "effective_rate": sk.get("effective_rate"),
            "just_guard_threshold": sk.get("just_guard_threshold"),
            "skill_effect_duration": sk.get("skill_effect_duration"),
            "is_original_skill": sk.get("is_original_skill"),
            "category_id": sk.get("category_id"),
            "category_for_memory_slot": sk.get("category_for_memory_slot"),
            "description": sk.get("description"),
        })
    return out


def build_bd_skill(weapon_arts, weapon_arts_suffix, wiki_scaling, warnings, ctx_id):
    """weapons.weapon_arts → bd_skill (顶层、跨 state 共享)。
    bd_skill.name 用 weapons.weapon_arts_suffix (master weapon_arts.name 通常是空字符串)。
    """
    if not weapon_arts:
        return None
    effects_out = []
    for e in weapon_arts.get("weapon_arts_effects") or []:
        param = e.get("parameter")
        math = e.get("math_type")
        if param and param not in PARAMETER_ALL_NAMES:
            warnings.append(f"chara id={ctx_id} bd: param {param!r}")
        if math and math not in MATH_TYPE_BY_NAME:
            warnings.append(f"chara id={ctx_id} bd: math_type {math!r}")
        effects_out.append({
            "id": e.get("id"),
            "target": e.get("target"),
            "parameter": param,
            "math_type": math,
            "value": e.get("parameter_value"),
            "value_scaling": 0.0,
            "additional_value": e.get("additional_parameter_value"),
            "range": normalize_range(e.get("range")),
            "duration": e.get("duration"),
            "duration_value": e.get("duration_value"),
            "effect_id": e.get("effect_id"),
        })
    # bd name: 优先 weapon_arts_suffix (真正 BD 技名)、fallback weapon_arts.name
    bd_name = weapon_arts_suffix or weapon_arts.get("name") or ""
    bd_scaling = wiki_scaling.get(bd_name, 0.0) if bd_name else 0.0
    return {
        "id": weapon_arts.get("id"),
        "name": bd_name,
        "description": weapon_arts.get("description"),
        "cost": weapon_arts.get("cost"),
        "range": normalize_range(weapon_arts.get("range")),
        "hit_count": weapon_arts.get("hit_count"),
        "value": weapon_arts.get("value"),
        "value_scaling": bd_scaling,
        "additional_value": weapon_arts.get("additional_value"),
        "use_all": weapon_arts.get("use_all"),
        "clip_id": weapon_arts.get("clip_id"),
        "effects": effects_out,
    }


def load_attack_motions():
    """attack_motions.json → {id: name} map (motion_id ↔ モーション名)"""
    src = master_file("attack_motions.json")
    arr = json.loads(src.read_text(encoding="utf-8"))
    return {x["id"]: x.get("name") for x in arr}


def load_npc_motion_durations():
    """data/_npc_motions.json → {motion_id: [attack1_dur_sec, attack2, attack3]}
    npc_motions.json 是 unpacking dump_npc_motions.py 跑出来的、含 SmoothMoves clip authored duration"""
    p = DATA_DIR / "_npc_motions.json"
    if not p.is_file():
        return {}
    raw = json.loads(p.read_text(encoding="utf-8"))
    out = {}
    for k, v in raw.items():
        clips = v.get("clips", {})
        out[int(k)] = [
            clips.get("attack1", {}).get("duration", 0) or 0,
            clips.get("attack2", {}).get("duration", 0) or 0,
            clips.get("attack3", {}).get("duration", 0) or 0,
        ]
    return out


def build():
    src = master_file("weapons.json")
    raw = json.loads(src.read_text(encoding="utf-8"))
    wiki_scaling, wiki_tags = load_wiki_aux()
    motion_id_to_name = load_attack_motions()
    motion_id_to_durations = load_npc_motion_durations()

    # base_id 黑名单 — placeholder/未公開 chara、UI 不渲染、build 时跳过
    BLACKLIST_BASE_IDS = {9998, 9999}   # 「謎に包まれている」占位

    # group by base_id
    groups = defaultdict(list)
    for w in raw:
        bid = w.get("base_id")
        if bid is None:
            continue
        if bid in BLACKLIST_BASE_IDS:
            continue
        groups[bid].append(w)

    out = []
    warnings = []
    tags_unmatched = []
    for bid, variants in groups.items():
        # sort by evolve_count
        variants.sort(key=lambda v: v.get("evolve_count", 0))
        v0 = variants[0]  # 通常 (evolve_count=0)

        states = {}
        for v in variants:
            ec = v.get("evolve_count", 0)
            state_name = EVOLVE_NAME.get(ec, f"evolve{ec}")
            states[state_name] = {
                "variant_id": v.get("id"),
                "evolve_count": ec,
                "evolve_name": v.get("evolve_name"),
                "stats": build_stats(v),
                "weapon_skills": build_skills(v.get("weapon_skills"), wiki_scaling, warnings, v.get("id")),
                "attack_motion_id": v.get("attack_motion_id"),
                "attack_motion_name": motion_id_to_name.get(v.get("attack_motion_id")),
                "motion_speed": v.get("motion_speed"),
                "motion_speed2": v.get("motion_speed2"),
                "motion_speed3": v.get("motion_speed3"),
                # SmoothMoves clip authored duration (秒) for attack1/2/3
                # 用 (duration / motion_speed_effective) 算实际段时长 — 单位秒
                "motion_durations": motion_id_to_durations.get(v.get("attack_motion_id"), [0, 0, 0]),
                "hit_counts": v.get("hit_counts"),
                "attack_count": v.get("attack_count"),
                "attack_hits": v.get("attack_hits"),
                "reach_id": v.get("reach_id"),
                "size": v.get("size"),
            }

        # bd_skill: 用 v0 (通常) 的 weapon_arts + weapon_arts_suffix (BD 技名)
        bd_skill = build_bd_skill(v0.get("weapon_arts"), v0.get("weapon_arts_suffix"),
                                  wiki_scaling, warnings, v0.get("id"))

        # chara.tags: 从 wiki 拷 (Phase 6.4)、name match
        chara_name = v0.get("base_name") or v0.get("name")
        tags = wiki_tags.get(chara_name, [])
        if not tags and chara_name:
            tags_unmatched.append({"id": bid, "name": chara_name})

        # chara-level meta — per-chara 字段直接放顶层、不再嵌套 extras
        out.append({
            "id": bid,
            "name": chara_name,
            "rarity": v0.get("rarity"),
            "rarity_code": v0.get("rarity_code"),
            "element_id": v0.get("element_id"),
            "weapon_type_id": v0.get("weapon_type_id"),
            "weapon_tag_ids": v0.get("weapon_tag_ids"),  # 武器分类 (非 chara.tags)
            "tags": tags,        # 从 wiki main 拷 (Phase 6.4)、wiki 没的留空
            "sort_order": v0.get("sort_order"),
            "min_damage_rate": v0.get("min_damage_rate"),
            "mp": v0.get("mp"),
            "mp_cost": v0.get("mp_cost"),
            "brave_cost": v0.get("brave_cost"),
            "guard_cost": v0.get("guard_cost"),
            "hit_rate_rank": v0.get("hit_rate_rank"),
            "evade_rate_rank": v0.get("evade_rate_rank"),
            "weapon_arts_id": v0.get("weapon_arts_id"),
            "omoide": [],        # 待 Phase 8 抓包
            "profile": build_profile(v0),    # Phase 6.2 profile 面板
            "states": states,
            "bd_skill": bd_skill,
        })

    # 按 base_id 排序便于 diff 稳定
    out.sort(key=lambda c: c["id"])

    DATA_DIR.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    AUDIT_TAGS_UNMATCHED.write_text(json.dumps(tags_unmatched, ensure_ascii=False, indent=2), encoding="utf-8")

    tags_matched = sum(1 for c in out if c["tags"])
    print(f"wrote {len(out)} characters (from {len(raw)} weapon variants) → {OUT}")
    print(f"  chara.tags matched wiki: {tags_matched} / {len(out)} ({100*tags_matched//len(out)}%)")
    print(f"  chara.tags unmatched (留空): {len(tags_unmatched)} → {AUDIT_TAGS_UNMATCHED}")
    if warnings:
        print(f"WARN: {len(warnings)} issues")
        for w in warnings[:5]:
            print(f"  {w}")


if __name__ == "__main__":
    build()
