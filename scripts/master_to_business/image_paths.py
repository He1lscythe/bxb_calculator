"""image_paths.py — master id → 本地 image path 解析。

资源来源: D:\bxb (之前跑过 unpacking/parse_unity_dat_v3.py 的输出、不一定最新)。

各类型命名规则 (调研结果):
- chara : D:/bxb/weapon/atlas/{weapons.id 6位}.png         99.8% cover
- crystal: D:/bxb/materia/icon/{materials.id}_{1或2}.png   99.5% cover (multi-suffix 时优先 _1 fallback _2)
- bg    : D:/bxb/picture/m/{pictures.id}.png              98.6% cover
- soul  : 无 per-id banner (job/ 只 16 个默认 detail_*.png) → 全 text-only fallback
- masou : 命名不规则 (costume/frame 是 0-60 序号、跟 wc.id 不匹配) → 全 text-only fallback

fallback: file 不存在 → 返回 None、前端 viewer 不渲染 icon。

用法:
    from image_paths import chara_icon_path
    p = chara_icon_path(100101)
    if p: <img src=p>
    else: <span class=text-only>{name}</span>
"""
from pathlib import Path

DBXB_ROOT = Path("D:/bxb")

CHARA_DIR = DBXB_ROOT / "weapon" / "atlas"
CRYSTAL_DIR = DBXB_ROOT / "materia" / "icon"
BG_DIR = DBXB_ROOT / "picture" / "m"


def _exists_or_none(p: Path):
    return str(p) if p.is_file() else None


def chara_icon_path(variant_id: int) -> str | None:
    """chara variant (weapons.id 6 位) → atlas .png"""
    return _exists_or_none(CHARA_DIR / f"{variant_id}.png")


def crystal_icon_path(material_id: int) -> str | None:
    """crystal (materials.id) → icon .png
    多 suffix (1/2) 时优先 _1、不存在再试 _2、再不存在 None
    """
    for sfx in (1, 2, 3, 4):
        p = CRYSTAL_DIR / f"{material_id}_{sfx}.png"
        if p.is_file():
            return str(p)
    return None


def bg_icon_path(picture_id: int) -> str | None:
    """bladegraph (pictures.id) → picture/m .png"""
    return _exists_or_none(BG_DIR / f"{picture_id}.png")


def soul_banner_path(_jobs_id: int) -> None:
    """soul 资源缺失、永远返回 None (UI 应 text-only fallback)"""
    return None


def masou_icon_path(_costume_id: int) -> None:
    """masou 资源命名不规则、暂时永远返回 None"""
    return None


# 自检 + 统计 cover 率
if __name__ == "__main__":
    import json
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from paths import MASTER_DIR

    weapons = json.loads((MASTER_DIR / "weapons.json").read_text(encoding="utf-8"))
    materials = json.loads((MASTER_DIR / "materials.json").read_text(encoding="utf-8"))
    pictures = json.loads((MASTER_DIR / "pictures.json").read_text(encoding="utf-8"))

    print(f"=== image_paths cover 统计 ===")
    print(f"D:\\bxb root: {DBXB_ROOT.is_dir()}")

    chara_hit = sum(1 for w in weapons if chara_icon_path(w["id"]))
    print(f"chara: {chara_hit} / {len(weapons)} ({100*chara_hit/len(weapons):.1f}%)")

    crystal_hit = sum(1 for m in materials if crystal_icon_path(m["id"]))
    print(f"crystal: {crystal_hit} / {len(materials)} ({100*crystal_hit/len(materials):.1f}%)")

    bg_hit = sum(1 for p in pictures if bg_icon_path(p["id"]))
    print(f"bg: {bg_hit} / {len(pictures)} ({100*bg_hit/len(pictures):.1f}%)")

    print(f"soul: 0% (intentional text-only)")
    print(f"masou: 0% (intentional text-only)")
