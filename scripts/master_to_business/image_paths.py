"""image_paths.py — master id → 本地 icon path 解析。

资源位置: crawl/icons/ (从 D:\bxb 拷过来、见 copy_images.py)。
crawl/icons/ 在 .gitignore 排除、~150MB 不入 git。

命名规则:
- chara : icons/chara/{weapons.id 6位}.png           99.8%
- masou : icons/masou/{weapon_costumes.id 7位}.png   99%
- crystal: icons/crystal/{materials.id}_{1或2}.png   99.5% (multi-suffix 时优先 _1)
- bg    : icons/bg/{pictures.id}.png                 98.6%
- soul  : icons/soul/{jobs.texture_id}.png           99% (用 texture_id、不是 jobs.id)

fallback: file 不存在 → 返回 None、前端 viewer text-only 渲染。

用法:
    from image_paths import chara_icon_path
    p = chara_icon_path(100101)
    if p: <img src=p>           # p 是相对项目 root 的路径如 'icons/chara/100101.png'
    else: <span>{name}</span>
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ICONS_DIR = PROJECT_ROOT / "icons"

CHARA_DIR = ICONS_DIR / "chara"
MASOU_DIR = ICONS_DIR / "masou"
CRYSTAL_DIR = ICONS_DIR / "crystal"
BG_DIR = ICONS_DIR / "bg"
SOUL_DIR = ICONS_DIR / "soul"


def _rel_or_none(p: Path):
    """返回相对 PROJECT_ROOT 的路径 string (含 / 分隔、前端友好)、不存在返回 None"""
    if not p.is_file():
        return None
    return p.relative_to(PROJECT_ROOT).as_posix()


def chara_icon_path(variant_id: int):
    """chara variant (weapons.id 6 位) → icons/chara/{variant_id}.png"""
    return _rel_or_none(CHARA_DIR / f"{variant_id}.png")


def masou_icon_path(costume_id: int):
    """masou (weapon_costumes.id 7 位) → icons/masou/{costume_id}.png"""
    return _rel_or_none(MASOU_DIR / f"{costume_id}.png")


def crystal_icon_path(material_id: int):
    """crystal (materials.id) → icons/crystal/{id}_{1或2}.png
    多 suffix 时优先 _1、不存在再 _2"""
    for sfx in (1, 2, 3, 4):
        p = CRYSTAL_DIR / f"{material_id}_{sfx}.png"
        if p.is_file():
            return p.relative_to(PROJECT_ROOT).as_posix()
    return None


def bg_icon_path(picture_id: int):
    """bladegraph (pictures.id) → icons/bg/{picture_id}.png"""
    return _rel_or_none(BG_DIR / f"{picture_id}.png")


def soul_icon_path(texture_id: int):
    """soul → icons/soul/{jobs.texture_id}.png
    注: 用 jobs.texture_id (不是 jobs.id)"""
    return _rel_or_none(SOUL_DIR / f"{texture_id}.png")


# 自检 + 统计 cover 率
if __name__ == "__main__":
    import json
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from paths import MASTER_DIR

    weapons = json.loads((MASTER_DIR / "weapons.json").read_text(encoding="utf-8"))
    materials = json.loads((MASTER_DIR / "materials.json").read_text(encoding="utf-8"))
    pictures = json.loads((MASTER_DIR / "pictures.json").read_text(encoding="utf-8"))
    jobs = json.loads((MASTER_DIR / "jobs.json").read_text(encoding="utf-8"))
    wcs = json.loads((MASTER_DIR / "weapon_costumes.json").read_text(encoding="utf-8"))

    print(f"=== image_paths cover 统计 ===")
    print(f"icons/ root: {ICONS_DIR.is_dir()}")

    n = sum(1 for w in weapons if chara_icon_path(w["id"]))
    print(f"chara : {n} / {len(weapons)} ({100*n/len(weapons):.1f}%)")

    n = sum(1 for w in wcs if masou_icon_path(w["id"]))
    print(f"masou : {n} / {len(wcs)} ({100*n/len(wcs):.1f}%)")

    n = sum(1 for m in materials if crystal_icon_path(m["id"]))
    print(f"crystal: {n} / {len(materials)} ({100*n/len(materials):.1f}%)")

    n = sum(1 for p in pictures if bg_icon_path(p["id"]))
    print(f"bg    : {n} / {len(pictures)} ({100*n/len(pictures):.1f}%)")

    n = sum(1 for j in jobs if j.get("texture_id") and soul_icon_path(j["texture_id"]))
    print(f"soul  : {n} / {len(jobs)} ({100*n/len(jobs):.1f}%)")
