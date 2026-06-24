"""build_bg_aux.py — bladegraphs.json + characters.json → 注入 weapon_base_id 进 bg_revise

跑在 build_bladegraphs.py 之后:
- weapon_base_id: 任一 picture_skill 的 description 含 [Xのみ] 且 element_id==0 && weapon_type_id==0
  → 提取 X、查 characters.json (NFKC exact + 共用 OVERRIDE 表) → 写 weapon_base_id (= chara≡魔剣 base id, int)
  (字段名跟 soul/crystal 统一为 weapon_base_id;stats-calc 按**装备者**判)

bg master 原生有 range (All/Single/None)、不需要写 revise。

用法: python scripts/master_to_business/build_bg_aux.py
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# 共用 OVERRIDE dict + 反查 helper
from build_crystal_aux import (  # noqa: E402
    CHARA_LIMIT_ID_OVERRIDE,
    build_chara_name_to_id,
    resolve_weapon_base_id,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
MASTER = DATA_DIR / "bladegraphs.json"
REVISE = DATA_DIR / "bg_revise.json"
CHARA = DATA_DIR / "characters.json"

_LIM_PAT = re.compile(r"\[([^\[\]]+)のみ\]")


def _extract_bg_chara_pfx(bg: dict):
    """任一 skill 含 [Xのみ] 且 element_id/weapon_type_id 均 0 → 返回 X"""
    for sk in bg.get("skills") or []:
        if sk.get("element_id") or sk.get("weapon_type_id"):
            continue
        desc = sk.get("description") or ""
        for m in _LIM_PAT.findall(desc):
            return m
    return None


def main():
    if not MASTER.is_file():
        print(f"ERR: {MASTER} not found", file=sys.stderr)
        sys.exit(1)
    if not CHARA.is_file():
        print(f"ERR: {CHARA} not found", file=sys.stderr)
        sys.exit(1)
    master = json.loads(MASTER.read_text(encoding="utf-8"))
    chara_list = json.loads(CHARA.read_text(encoding="utf-8"))
    name_to_id = build_chara_name_to_id(chara_list)
    revise = json.loads(REVISE.read_text(encoding="utf-8")) if REVISE.is_file() else []
    revise_by_id = {e["id"]: e for e in revise if "id" in e}

    n_chara = 0
    n_chara_skip = 0
    unresolved_samples = []

    for b in master:
        bid = b.get("id")
        pfx = _extract_bg_chara_pfx(b)

        patch = revise_by_id.get(bid)

        # 兼旧 schema: 清掉之前可能写的 chara_limit (string)、统一 weapon_base_id
        if patch and "chara_limit" in patch:
            del patch["chara_limit"]

        if pfx is None:
            if patch and "weapon_base_id" in patch:
                del patch["weapon_base_id"]
            continue

        cid = resolve_weapon_base_id(pfx, name_to_id)
        if cid is None:
            n_chara_skip += 1
            if patch and "weapon_base_id" in patch:
                del patch["weapon_base_id"]
            if len(unresolved_samples) < 10:
                unresolved_samples.append((bid, b.get("name",""), pfx))
            continue

        if patch is None:
            patch = {"id": bid, "name": b.get("name", "")}
            revise_by_id[bid] = patch
        if patch.get("weapon_base_id") != cid:
            patch["weapon_base_id"] = cid
            n_chara += 1

    seen_ids = {b["id"] for b in master}
    new_revise = [revise_by_id[b["id"]] for b in master if b["id"] in revise_by_id]
    orphans = [e for e in revise if e.get("id") not in seen_ids]
    new_revise.extend(orphans)
    # 过滤无实质内容的 placeholder (只有 id+name、没字段)
    new_revise = [p for p in new_revise if any(k not in ("id", "name") for k in p)]

    REVISE.write_text(
        json.dumps(new_revise, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"OK: bg_revise updated.")
    print(f"    weapon_base_id patches: {n_chara}")
    print(f"    weapon_base_id unresolved (skip gate): {n_chara_skip}")
    if unresolved_samples:
        print(f"    unresolved samples:")
        for s in unresolved_samples:
            print(f"      id={s[0]} name={s[1]!r} → [{s[2]}のみ]")
    print(f"    total revise entries: {len(new_revise)} (orphans kept: {len(orphans)})")


if __name__ == "__main__":
    main()
