"""build_souls.py — jobs.json → data/souls.json

master schema:
- job_abilities[] data_type ∈ {Element, WeaponType}、各 6/12 entry 含 positive/negative_value
  → 拆分成 element_affinity / weapon_affinity (按 data_id 索引)
- job_skills[] 透传完整字段 (含 element_condition / weapon_type_condition / weapon_base_id 等)

用法: python scripts/master_to_business/build_souls.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import master_file  # noqa: E402
from enums import PARAMETER_ALL_NAMES, MATH_TYPE_BY_NAME, RANGE_NORMALIZE  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
OUT = DATA_DIR / "souls.json"


def normalize_range(r):
    return RANGE_NORMALIZE.get(r, r) if r else r


def split_abilities(job_abilities):
    """data_type=Element → element_affinity[<element_id>] = {pos, neg, rank_string}
    data_type=WeaponType → weapon_affinity[<weapon_type_id>] = 同
    """
    element_aff = {}
    weapon_aff = {}
    for a in job_abilities or []:
        dt = a.get("data_type")
        did = a.get("data_id")
        rank = a.get("ability_rank") or {}
        record = {
            "positive_value": rank.get("positive_value"),
            "negative_value": rank.get("negative_value"),
            "rank": rank.get("rank"),
            "rank_string": rank.get("rank_string"),
            "rank_id": a.get("ability_rank_id"),
        }
        if dt == "Element":
            element_aff[str(did)] = record
        elif dt == "WeaponType":
            weapon_aff[str(did)] = record
    return element_aff, weapon_aff


def build():
    src = master_file("jobs.json")
    raw = json.loads(src.read_text(encoding="utf-8"))

    out = []
    warnings = []
    skipped_unknown = 0
    for entry in raw:
        # 跳过占位 entry: description="データ不明" (icon 也不存在、UI 显示无意义)
        if entry.get("description") == "データ不明":
            skipped_unknown += 1
            continue
        element_aff, weapon_aff = split_abilities(entry.get("job_abilities"))

        skills_out = []
        for sk in entry.get("job_skills") or []:
            param = sk.get("parameter")
            math = sk.get("math_type")
            if param and param not in PARAMETER_ALL_NAMES:
                warnings.append(f"soul id={entry.get('id')}: param {param!r}")
            if math and math not in MATH_TYPE_BY_NAME:
                warnings.append(f"soul id={entry.get('id')}: math_type {math!r}")
            skills_out.append({
                "id": sk.get("id"),
                "name": sk.get("name"),
                "parameter": param,
                "math_type": math,
                "value": sk.get("value"),
                "value_scaling": 0.0,           # soul 无熟度
                "max_value": sk.get("max_value"),
                "values": sk.get("values"),
                "range": normalize_range(sk.get("range")),
                "element_condition": sk.get("element_condition"),
                "weapon_type_condition": sk.get("weapon_type_condition"),
                "enemy_element_id": sk.get("enemy_element_id"),
                "weapon_base_id": sk.get("weapon_base_id"),
                "greater_than_bust_condition": sk.get("greater_than_bust_condition"),
                "less_than_bust_condition": sk.get("less_than_bust_condition"),
                "limit_count": sk.get("limit_count"),
                "effective_rate": sk.get("effective_rate"),
                "skill_effect_duration": sk.get("skill_effect_duration"),
                "just_guard_threshold": sk.get("just_guard_threshold"),
                "displayable": sk.get("displayable"),
                "description": sk.get("description"),
            })

        # job_arts (BD-like? 暂时透传)
        ja = entry.get("job_arts")

        out.append({
            "id": entry.get("id"),
            "name": entry.get("name"),
            "kana": entry.get("kana"),
            "rarity": entry.get("rarity"),
            "code": entry.get("code"),
            "max_level": entry.get("max_level"),
            "only_partner": entry.get("only_partner"),
            "texture_id": entry.get("texture_id"),    # icons/soul/{texture_id}.png
            "sort_order": entry.get("sort_order"),
            "job_arts_id": entry.get("job_arts_id"),
            "job_arts": ja,
            "element_affinity": element_aff,
            "weapon_affinity": weapon_aff,
            "skills": skills_out,
            "description": entry.get("description"),
        })

    DATA_DIR.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(out)} soul entries → {OUT} (skipped {skipped_unknown} データ不明 placeholder)")
    if warnings:
        print(f"WARN: {len(warnings)} issues")
        for w in warnings[:5]:
            print(f"  {w}")


if __name__ == "__main__":
    build()
