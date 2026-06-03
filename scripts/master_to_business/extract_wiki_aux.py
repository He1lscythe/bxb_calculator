"""extract_wiki_aux.py — 一次性从 wiki crawl data/ 提取 master 缺的字段。

产出: data/_wiki_aux.json
  - crystal_max_value: { crystal_name: bairitu }  (从 wiki effects[0].bairitu)
  - chara_skill_value_scaling: { skill_name: bairitu_scaling }  (只 cover 非零)
  - masou_value_scaling: { "<masou_name>__<param>": scaling }  (wiki masou 全 0、产出 {})

设计:
- v2 build_crystals.py / build_characters.py / build_masou.py 读 _wiki_aux.json 做 name join
- 一次性、跑完 commit、master 更新不重跑

用法: python scripts/master_to_business/extract_wiki_aux.py
"""
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
OUT = DATA_DIR / "_wiki_aux.json"


def _parse_scaling(v):
    """wiki bairitu_scaling 可能是 float / int / 分数字符串 "2/99" / None / 0"""
    if v is None or v == 0 or v == "" or v == "0":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        if "/" in v:
            try:
                a, b = v.split("/", 1)
                return float(a) / float(b)
            except (ValueError, ZeroDivisionError):
                return 0.0
        try:
            return float(v)
        except ValueError:
            return 0.0
    return 0.0


def extract_crystal_max():
    """wiki crystals.json: name → effects[0].bairitu (single)
    多 effect crystal (58/1254、5%) 只取 effects[0]、effects[1+] 忽略
    """
    src = DATA_DIR / "crystals.json"
    if not src.is_file():
        print(f"WARN: {src} missing、crystal_max_value = {{}}")
        return {}
    raw = json.loads(src.read_text(encoding="utf-8"))
    out = {}
    multi_effect_dropped = 0
    for c in raw:
        if c.get("tombstone"):
            continue
        name = c.get("name")
        effs = c.get("effects") or []
        if not name or not effs:
            continue
        b = effs[0].get("bairitu")
        if b is None:
            continue
        out[name] = b
        if len(effs) > 1:
            multi_effect_dropped += 1
    print(f"  crystal_max_value: {len(out)} entries (多 effect 忽略 effects[1+]: {multi_effect_dropped})")
    return out


def extract_chara_skill_scaling():
    """wiki characters.json: skill name → bairitu_scaling (只 cover 非零)
    同名 skill 多 chara collision 时取第一个出现值
    """
    src = DATA_DIR / "characters.json"
    if not src.is_file():
        print(f"WARN: {src} missing、chara_skill_value_scaling = {{}}")
        return {}
    raw = json.loads(src.read_text(encoding="utf-8"))
    out = {}
    collisions = 0
    for c in raw:
        for st in (c.get("states") or {}).values():
            for sk in st.get("skills") or []:
                sk_name = sk.get("name")
                if not sk_name:
                    continue
                for e in sk.get("effects", []):
                    sc = _parse_scaling(e.get("bairitu_scaling"))
                    if sc != 0:
                        if sk_name in out and abs(out[sk_name] - sc) > 1e-9:
                            collisions += 1
                        out.setdefault(sk_name, sc)
                        break  # skill 内 effects 共享 scaling、第一非零即可
        # BD effects
        bd = c.get("bd_skill") or {}
        bd_name = bd.get("name")
        if bd_name:
            for e in bd.get("effects", []):
                sc = _parse_scaling(e.get("bairitu_scaling"))
                if sc != 0:
                    out.setdefault(bd_name, sc)
                    break
    print(f"  chara_skill_value_scaling: {len(out)} entries (collisions: {collisions})")
    return out


def extract_masou_scaling():
    """wiki masou.json: 全 0、调研显示 1153 effects 全无 scaling
    返回空 dict、占位 schema 完整
    """
    src = DATA_DIR / "masou.json"
    if not src.is_file():
        print(f"WARN: {src} missing、masou_value_scaling = {{}}")
        return {}
    raw = json.loads(src.read_text(encoding="utf-8"))
    out = {}
    for ma in raw:
        ma_name = ma.get("name")
        if not ma_name:
            continue
        for e in ma.get("effects", []):
            sc = _parse_scaling(e.get("bairitu_scaling"))
            if sc != 0:
                key = f"{ma_name}__{e.get('parameter', '?')}"
                out.setdefault(key, sc)
    print(f"  masou_value_scaling: {len(out)} entries")
    return out


def main():
    if not DATA_DIR.is_dir():
        print(f"ERROR: data/ not found at {DATA_DIR}")
        sys.exit(1)
    print(f"extracting wiki aux from {DATA_DIR}/...")
    aux = {
        "crystal_max_value": extract_crystal_max(),
        "chara_skill_value_scaling": extract_chara_skill_scaling(),
        "masou_value_scaling": extract_masou_scaling(),
    }
    OUT.write_text(json.dumps(aux, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nwrote → {OUT}")
    print(f"  total bytes: {OUT.stat().st_size}")


if __name__ == "__main__":
    main()
