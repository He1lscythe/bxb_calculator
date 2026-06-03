"""build_bladegraphs.py — pictures.json → data/bladegraphs.json (心象結晶)

master pictures schema 简单: id / name / rarity / element_ids / weapon_type_ids / picture_skills[]
跳过显示字段 (deck/author/sort_order)、保留数据层。

picture_skills 透传 parameter / math_type / value / element_id / weapon_type_id /
start_time / end_time / range / description。

用法: python scripts/master_to_business/build_bladegraphs.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import master_file  # noqa: E402
from enums import PARAMETER_ALL_NAMES, MATH_TYPE_BY_NAME, RANGE_NORMALIZE  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
OUT = DATA_DIR / "bladegraphs.json"


def normalize_range(r):
    if not r:
        return r
    return RANGE_NORMALIZE.get(r, r)


def build():
    src = master_file("pictures.json")
    raw = json.loads(src.read_text(encoding="utf-8"))

    out = []
    warnings = []
    for entry in raw:
        skills_out = []
        for sk in entry.get("picture_skills") or []:
            param = sk.get("parameter")
            math = sk.get("math_type")
            if param and param not in PARAMETER_ALL_NAMES:
                warnings.append(f"bg id={entry.get('id')}: param {param!r}")
            if math and math not in MATH_TYPE_BY_NAME:
                warnings.append(f"bg id={entry.get('id')}: math_type {math!r}")
            skills_out.append({
                "id": sk.get("id"),
                "parameter": param,
                "math_type": math,
                "value": sk.get("value"),
                "value_scaling": 0.0,
                "range": normalize_range(sk.get("range")),
                "element_id": sk.get("element_id"),
                "weapon_type_id": sk.get("weapon_type_id"),
                "start_time": sk.get("start_time"),
                "end_time": sk.get("end_time"),
                "displayable": sk.get("displayable"),
                "description": sk.get("description"),
            })
        out.append({
            "id": entry.get("id"),
            "name": entry.get("name"),
            "rarity": entry.get("rarity"),
            "element_ids": entry.get("element_ids") or [],
            "weapon_type_ids": entry.get("weapon_type_ids") or [],
            "skill_effective_time": entry.get("skill_effective_time"),
            "long_skill_effective_time": entry.get("long_skill_effective_time"),
            "is_not_ll": entry.get("is_not_ll"),
            "skills": skills_out,
            "description": entry.get("description"),
            "author_name": entry.get("author_name"),
        })

    DATA_DIR.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(out)} bladegraph entries → {OUT}")
    if warnings:
        print(f"WARN: {len(warnings)} issues")
        for w in warnings[:5]:
            print(f"  {w}")


if __name__ == "__main__":
    build()
