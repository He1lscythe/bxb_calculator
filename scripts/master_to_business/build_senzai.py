"""build_senzai.py — memory_slot_skills.json → data/senzai_table.json

直接透传 master 字段、不做 wiki classify (bunrui/scope/condition 那套)。
output schema 见 docs/schema.md §3.6。

用法: python scripts/master_to_business/build_senzai.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from enums import PARAMETER_ALL_NAMES, MATH_TYPE_BY_NAME  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
OUT = DATA_DIR / "senzai_table.json"


def build():
    src = DATA_DIR / "_memory_slot_skills.json"
    if not src.is_file():
        raise FileNotFoundError(
            f"{src} not found — 跑 build_memory_slot_skills.py 先生成"
        )
    raw = json.loads(src.read_text(encoding="utf-8"))
    assert isinstance(raw, dict), f"expected dict from {src}"

    out = {}
    warnings = []
    for key, entry in raw.items():
        if not isinstance(entry, dict):
            warnings.append(f"skip key={key}: not dict")
            continue
        param = entry.get("parameter")
        math = entry.get("math_type")

        if param and param not in PARAMETER_ALL_NAMES:
            warnings.append(f"key={key}: parameter {param!r} not in #JS PARAMETER enum")
        if math and math not in MATH_TYPE_BY_NAME:
            warnings.append(f"key={key}: math_type {math!r} not in MATH_TYPE enum")

        out[key] = {
            "name": entry.get("name"),
            "parameter": param,
            "math_type": math,
            "value": entry.get("value"),
            "category_for_memory_slot": entry.get("category_for_memory_slot"),
            "description": entry.get("description"),
        }

    DATA_DIR.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(out)} senzai entries → {OUT}")
    if warnings:
        print(f"WARN: {len(warnings)} issues:")
        for w in warnings[:10]:
            print(f"  {w}")
        if len(warnings) > 10:
            print(f"  ... and {len(warnings) - 10} more")
    return out, warnings


if __name__ == "__main__":
    build()
