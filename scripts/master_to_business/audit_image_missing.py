"""audit_image_missing.py — 生成 image 缺失列表供 user review。

每种资源 (chara variant / masou / soul / crystal / bg) 检查 icons/ 是否有 file、
缺的写到 data/_audit_image_missing.json (按类型分组、含 id + name 信息)。

注: chara/masou icon 跟 weapons.id (6 位) / weapon_costumes.id (7 位) 一一对应、
都在 weapon/stand/s/ 下、用户 D:\bxb 资源不全时 cover < 100%。

用法: python scripts/master_to_business/audit_image_missing.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import master_file  # noqa: E402
from image_paths import (  # noqa: E402
    chara_icon_path, masou_icon_path, crystal_icon_path, bg_icon_path, soul_icon_path,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUT = PROJECT_ROOT / "data" / "_audit_image_missing.json"


def main():
    weapons = json.loads(master_file("weapons.json").read_text(encoding="utf-8"))
    wcs = json.loads(master_file("weapon_costumes.json").read_text(encoding="utf-8"))
    jobs = json.loads(master_file("jobs.json").read_text(encoding="utf-8"))
    materials = json.loads(master_file("materials.json").read_text(encoding="utf-8"))
    pictures = json.loads(master_file("pictures.json").read_text(encoding="utf-8"))

    audit = {
        "chara": [
            {"variant_id": w["id"], "base_id": w.get("base_id"), "name": w.get("name"),
             "rarity": w.get("rarity"), "evolve_name": w.get("evolve_name")}
            for w in weapons if not chara_icon_path(w["id"])
        ],
        "masou": [
            {"id": w["id"], "name": w.get("name"), "weapon_base_id": w.get("weapon_base_id")}
            for w in wcs if not masou_icon_path(w["id"])
        ],
        "soul": [
            {"id": j["id"], "name": j.get("name"), "texture_id": j.get("texture_id"),
             "rarity": j.get("rarity")}
            for j in jobs if j.get("texture_id") and not soul_icon_path(j["texture_id"])
        ],
        "crystal": [
            {"id": m["id"], "name": m.get("name"), "rarity": m.get("rarity")}
            for m in materials if not crystal_icon_path(m["id"])
        ],
        "bg": [
            {"id": p["id"], "name": p.get("name"), "rarity": p.get("rarity")}
            for p in pictures if not bg_icon_path(p["id"])
        ],
    }

    OUT.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote → {OUT}")
    print(f"chara missing: {len(audit['chara'])} / {len(weapons)}")
    print(f"masou missing: {len(audit['masou'])} / {len(wcs)}")
    print(f"soul missing : {len(audit['soul'])} / {len(jobs)}")
    print(f"crystal missing: {len(audit['crystal'])} / {len(materials)}")
    print(f"bg missing   : {len(audit['bg'])} / {len(pictures)}")


if __name__ == "__main__":
    main()
