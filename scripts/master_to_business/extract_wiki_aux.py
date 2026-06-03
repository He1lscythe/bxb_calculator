"""extract_wiki_aux.py — 一次性从 main branch wiki data 提取 master 缺的字段。

直接 git show main:data/*.json 读、不依赖当前 work tree (v2 schema)。

产出: data/_wiki_aux.json
  - crystal_max_value: { crystal_name: bairitu }
  - chara_tags: { chara_name: tags[] }
  - chara_skill_value_scaling: { skill_name: bairitu_scaling }
  - masou_value_scaling: { "<masou_name>__<param>": scaling }

用法: python scripts/master_to_business/extract_wiki_aux.py
"""
import json
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
OUT = DATA_DIR / "_wiki_aux.json"


def _git_show(path):
    """读 main:<path> 的 JSON、不依赖 work tree"""
    result = subprocess.run(
        ["git", "show", f"main:{path}"],
        cwd=PROJECT_ROOT, capture_output=True, text=True, encoding="utf-8",
    )
    if result.returncode != 0:
        print(f"WARN: git show main:{path} failed: {result.stderr.strip()}")
        return None
    return json.loads(result.stdout)


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
    """main:data/crystals.json: name → effects[0].bairitu"""
    raw = _git_show("data/crystals.json")
    if raw is None:
        return {}
    out = {}
    multi_dropped = 0
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
            multi_dropped += 1
    print(f"  crystal_max_value: {len(out)} entries (多 effect 忽略 effects[1+]: {multi_dropped})")
    return out


def extract_chara_tags():
    """main:data/characters.json: name → tags[] (chara 特性 14 种 int)"""
    raw = _git_show("data/characters.json")
    if raw is None:
        return {}
    out = {}
    for c in raw:
        name = c.get("name")
        tags = c.get("tags")
        if name and isinstance(tags, list) and len(tags) > 0:
            out[name] = tags
    print(f"  chara_tags: {len(out)} entries (含非空 tags 的 chara)")
    return out


def extract_chara_skill_scaling():
    """main:data/characters.json: skill name → bairitu_scaling (只非零)"""
    raw = _git_show("data/characters.json")
    if raw is None:
        return {}
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
                        break
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
    """main:data/masou.json: 实测全 0、占位"""
    raw = _git_show("data/masou.json")
    if raw is None:
        return {}
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
    print(f"extracting wiki aux from git main:data/*.json (不依赖 work tree)...")
    aux = {
        "crystal_max_value": extract_crystal_max(),
        "chara_tags": extract_chara_tags(),
        "chara_skill_value_scaling": extract_chara_skill_scaling(),
        "masou_value_scaling": extract_masou_scaling(),
    }
    OUT.write_text(json.dumps(aux, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nwrote → {OUT}")
    print(f"  total bytes: {OUT.stat().st_size}")


if __name__ == "__main__":
    main()
