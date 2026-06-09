"""build_crystals.py — materials.json → data/crystals.json (master 纯净) + crystal_revise.json (max_value 初始)

Phase 7 Session 1 改造:
- master crystals.json **不再含** max_value (server-fold 字段、不可观测、归 revise 管)
- _wiki_aux.json crystal_max_value (1220 项) + 硬编码 override (純真記憶/秘録記憶/メルティレコード/NoEffect)
  迁到 data/crystal_revise.json 作初始 state、sparse patch shape: {id, name, max_value}
- Session 2 会在 crystal_revise.json 上加 M_L_max / M_W_max / M_P_max / min_weight / max_weight / min_purity / max_purity (unpacking §18.2 三因子公式)

audit:
- _wiki_unmatched_crystals.json — wiki / 硬规则都没覆盖的 crystal (max_value=null)
- _audit_crystals_null_math.json — math_type 反查失败 (parameter 不在 PARAMETER_MATH_TYPE)

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
OUT_REVISE = DATA_DIR / "crystal_revise.json"
UNMATCHED = DATA_DIR / "_wiki_unmatched_crystals.json"
AUDIT_NULL_MATH = DATA_DIR / "_audit_crystals_null_math.json"
WIKI_AUX = DATA_DIR / "_wiki_aux.json"


def load_wiki_max_value():
    if not WIKI_AUX.is_file():
        return {}
    return json.loads(WIKI_AUX.read_text(encoding="utf-8")).get("crystal_max_value", {})


def _resolve_max_value(name, param, initial_value, wiki_max):
    """wiki_aux 反查 max_value。无匹配 → None。
    NoEffect parameter 的 max_value 跟 initial_value 一致 (sentinel、不显示 range)。
    純真記憶 / 秘録記憶 / メルティレコード 硬规则已删、改在 _resolve_factors 里写 revise"""
    if param == 'NoEffect':
        return initial_value
    return wiki_max.get(name)


def _resolve_factors(name):
    """特殊 series 的 3 因子 override (user 决策、2026-06-08)。
    返回 dict 或 None。值可为 number 或分式字符串 'a/b' (前端 parseBairituVal 处理)"""
    if not name:
        return None
    if '秘録記憶' in name:
        return {'M_L_max': 10, 'M_W_max': 10, 'M_P_max': 10}
    if '純真記憶' in name:
        return {'M_L_max': '500/113'}
    if 'メルティレコード' in name or 'ディアリィレコード' in name:
        return {'M_L_max': 2}
    if 'アビス' in name:
        if name.endswith('･超'):
            return {'M_P_max': 5}
        if name.endswith('･攻') or name.endswith('･動'):
            return {'M_P_max': 4}
    return None


def build():
    src = master_file("materials.json")
    raw = json.loads(src.read_text(encoding="utf-8"))
    wiki_max = load_wiki_max_value()

    out = []
    revise = []
    unmatched = []
    warnings = []
    for entry in raw:
        param = entry.get("parameter")
        math = PARAMETER_MATH_TYPE.get(param) if param else None
        name = entry.get("name")
        cid = entry.get("id")
        initial_value = entry.get("initial_value")
        if param and param not in PARAMETER_ALL_NAMES:
            warnings.append(f"crystal id={cid}: param {param!r}")
        if math and math not in MATH_TYPE_BY_NAME:
            warnings.append(f"crystal id={cid}: math_type {math!r}")

        description = entry.get("description")
        # メルティレコード / ディアリィレコード 系列 description 删 `\n[...のみ]` 限定文段 (从首个 \n 截断)
        if description and name and ('メルティレコード' in name or 'ディアリィレコード' in name):
            description = description.split('\n', 1)[0]

        record = {
            "id": cid,
            "name": name,
            "rarity": entry.get("rarity"),
            "parameter": param,
            "parameter_type": entry.get("parameter_type"),
            "initial_value": initial_value,
            "initial_value_rank": entry.get("initial_value_rank"),
            "max_level": entry.get("max_level"),
            "conditional_parameter": entry.get("conditional_parameter"),
            "element_id": entry.get("element_id"),
            "weapon_type_id": entry.get("weapon_type_id"),
            "description": description,
        }
        if param != 'NoEffect':
            record["math_type"] = math
        out.append(record)

        # revise 初始: 特殊 series (factors 命中) 走三因子、不写 max_value；其余从 wiki_aux 反查 max_value
        factors = _resolve_factors(name)
        if factors:
            entry_rev = {"id": cid, "name": name}
            entry_rev.update(factors)
            revise.append(entry_rev)
        else:
            max_value = _resolve_max_value(name, param, initial_value, wiki_max)
            if max_value is not None:
                revise.append({"id": cid, "name": name, "max_value": max_value})
            else:
                unmatched.append({
                    "id": cid,
                    "name": name,
                    "parameter": param,
                    "initial_value": initial_value,
                    "rarity": entry.get("rarity"),
                })

    DATA_DIR.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_REVISE.write_text(json.dumps(revise, ensure_ascii=False, indent=2), encoding="utf-8")
    UNMATCHED.write_text(json.dumps(unmatched, ensure_ascii=False, indent=2), encoding="utf-8")

    null_math_audit = [{'id': r['id'], 'name': r['name'], 'parameter': r['parameter']}
                       for r in out if r.get('math_type') is None and r['parameter'] != 'NoEffect']
    AUDIT_NULL_MATH.write_text(json.dumps(null_math_audit, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"wrote {len(out)} crystal entries → {OUT} (master、无 max_value 字段)")
    print(f"wrote {len(revise)} crystal revise entries → {OUT_REVISE}")
    print(f"  matched max_value: {len(revise)} / {len(out)}")
    print(f"  unmatched (max_value=null): {len(unmatched)} → {UNMATCHED}")
    print(f"  audit null math_type (排除 NoEffect): {len(null_math_audit)} → {AUDIT_NULL_MATH}")
    if warnings:
        print(f"WARN: {len(warnings)} issues")
        for w in warnings[:5]:
            print(f"  {w}")


if __name__ == "__main__":
    build()
