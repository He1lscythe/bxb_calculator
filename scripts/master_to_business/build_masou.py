"""build_masou.py — weapon_costumes.json → data/masou.json

master schema: id / name / weapon_base_id / weapon_costume_effects[] / weapon_costume_items[]
跳过显示用字段 (deck/marriage/live2d/pivot 等)、仅保留数据层。

effects 加 value_scaling 字段 (默认 0、masou 通常无熟度成长)、
预留接口、_wiki_aux.json masou_value_scaling 当前空 dict。

用法: python scripts/master_to_business/build_masou.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import master_file  # noqa: E402
from enums import PARAMETER_BY_NAME, MATH_TYPE_BY_NAME  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
OUT = DATA_DIR / "masou.json"
WIKI_AUX = DATA_DIR / "_wiki_aux.json"


def load_wiki_aux():
    if not WIKI_AUX.is_file():
        return {}
    aux = json.loads(WIKI_AUX.read_text(encoding="utf-8"))
    return aux.get("masou_value_scaling", {})


def build():
    src = master_file("weapon_costumes.json")
    raw = json.loads(src.read_text(encoding="utf-8"))
    masou_scaling = load_wiki_aux()

    out = []
    warnings = []
    for entry in raw:
        name = entry.get("name")
        effects_out = []
        for e in entry.get("weapon_costume_effects") or []:
            param = e.get("parameter")
            math = e.get("math_type")
            if param and param not in PARAMETER_BY_NAME:
                warnings.append(f"masou id={entry.get('id')}: param {param!r} not in #JS")
            if math and math not in MATH_TYPE_BY_NAME:
                warnings.append(f"masou id={entry.get('id')}: math_type {math!r}")
            # wiki scaling 查表 (key = name__param)
            scaling = masou_scaling.get(f"{name}__{param}", 0.0)
            effects_out.append({
                "parameter": param,
                "math_type": math,
                "value": e.get("value"),
                "value_scaling": scaling,
                "effect_text": e.get("effect_text"),
            })

        out.append({
            "id": entry.get("id"),
            "name": name,
            "weapon_base_id": entry.get("weapon_base_id"),
            "weapon_costume_group_id": entry.get("weapon_costume_group_id"),
            "need_evolve_count": entry.get("need_evolve_count"),
            "displayable": entry.get("displayable"),
            "live2d": entry.get("live2d"),
            "effects": effects_out,
            "items": entry.get("weapon_costume_items") or [],
        })

    DATA_DIR.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(out)} masou entries → {OUT}")
    if warnings:
        print(f"WARN: {len(warnings)} issues")
        for w in warnings[:5]:
            print(f"  {w}")


if __name__ == "__main__":
    build()
