"""build_crystals.py — materials.json + _wiki_aux.json → data/crystals.json

master schema: id / name / parameter / math_type / initial_value / max_level / element_id / weapon_type_id
master 不直给 max_value (server fold 出来)、从 _wiki_aux.json crystal_max_value 按 name 精准匹配补。

audit: 匹配失败 entry 写到 data/_wiki_unmatched_crystals.json (list of {id, name, parameter})。

用法: python scripts/master_to_business/build_crystals.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import master_file  # noqa: E402
from enums import PARAMETER_ALL_NAMES, MATH_TYPE_BY_NAME, PARAMETER_MATH_TYPE  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
OUT = DATA_DIR / "crystals.json"
UNMATCHED = DATA_DIR / "_wiki_unmatched_crystals.json"
AUDIT_NULL_MATH = DATA_DIR / "_audit_crystals_null_math.json"
AUDIT_NULL_MAX = DATA_DIR / "_audit_crystals_null_max.json"
WIKI_AUX = DATA_DIR / "_wiki_aux.json"


def load_wiki_max_value():
    if not WIKI_AUX.is_file():
        return {}
    return json.loads(WIKI_AUX.read_text(encoding="utf-8")).get("crystal_max_value", {})


def build():
    src = master_file("materials.json")
    raw = json.loads(src.read_text(encoding="utf-8"))
    wiki_max = load_wiki_max_value()

    out = []
    unmatched = []
    warnings = []
    for entry in raw:
        param = entry.get("parameter")
        # master materials.json 无 math_type 字段、按 parameter 查 PARAMETER_MATH_TYPE 表补
        math = PARAMETER_MATH_TYPE.get(param) if param else None
        name = entry.get("name")
        if param and param not in PARAMETER_ALL_NAMES:
            warnings.append(f"crystal id={entry.get('id')}: param {param!r}")
        if math and math not in MATH_TYPE_BY_NAME:
            warnings.append(f"crystal id={entry.get('id')}: math_type {math!r}")

        # hard rules (用户指定):
        # - 純真記憶 max=5
        # - 秘録記憶 max=1.3e9 (1,300,000,000)
        # - メルティレコード max=2.6
        # - parameter=NoEffect → max=initial_value (sentinel)
        if name and '純真記憶' in name:
            max_value = 5.0
        elif name and '秘録記憶' in name:
            max_value = 1300000000.0
        elif name and 'メルティレコード' in name:
            max_value = 2.6
        elif param == 'NoEffect':
            max_value = entry.get('initial_value')
        else:
            max_value = wiki_max.get(name)
        if max_value is None:
            unmatched.append({
                "id": entry.get("id"),
                "name": name,
                "parameter": param,
                "initial_value": entry.get("initial_value"),
            })

        record = {
            "id": entry.get("id"),
            "name": name,
            "rarity": entry.get("rarity"),
            "parameter": param,
            "parameter_type": entry.get("parameter_type"),
            "initial_value": entry.get("initial_value"),
            "initial_value_rank": entry.get("initial_value_rank"),
            "max_value": max_value,
            "max_level": entry.get("max_level"),
            "conditional_parameter": entry.get("conditional_parameter"),
            "element_id": entry.get("element_id"),
            "weapon_type_id": entry.get("weapon_type_id"),
            "description": entry.get("description"),
        }
        # parameter=NoEffect 不输出 math_type 字段 (sentinel、无意义)
        if param != 'NoEffect':
            record["math_type"] = math
        out.append(record)

    DATA_DIR.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    UNMATCHED.write_text(json.dumps(unmatched, ensure_ascii=False, indent=2), encoding="utf-8")

    # audit: null math_type (跳过 NoEffect) + null max_value
    null_math_audit = [{'id': r['id'], 'name': r['name'], 'parameter': r['parameter']}
                       for r in out if r.get('math_type') is None and r['parameter'] != 'NoEffect']
    null_max_audit = [{'id': r['id'], 'name': r['name'], 'parameter': r['parameter'],
                       'initial_value': r['initial_value'], 'rarity': r['rarity']}
                      for r in out if r['max_value'] is None]
    AUDIT_NULL_MATH.write_text(json.dumps(null_math_audit, ensure_ascii=False, indent=2), encoding="utf-8")
    AUDIT_NULL_MAX.write_text(json.dumps(null_max_audit, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"wrote {len(out)} crystal entries → {OUT}")
    print(f"  matched wiki max_value: {len(out) - len(unmatched)} / {len(out)}")
    print(f"  unmatched (max_value=null): {len(unmatched)} → {UNMATCHED}")
    print(f"  audit null math_type (排除 NoEffect): {len(null_math_audit)} → {AUDIT_NULL_MATH}")
    print(f"  audit null max_value: {len(null_max_audit)} → {AUDIT_NULL_MAX}")
    if warnings:
        print(f"WARN: {len(warnings)} issues")
        for w in warnings[:5]:
            print(f"  {w}")


if __name__ == "__main__":
    build()
