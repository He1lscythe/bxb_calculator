"""copy_images.py — 一次性从 D:\bxb 把图片拷到 crawl/icons/

源 → 目标:
- chara : D:/bxb/weapon/stand/s/{6位}.png → crawl/icons/chara/{variant_id}.png    (~1106 file)
- masou : D:/bxb/weapon/stand/s/{7位}.png → crawl/icons/masou/{wc_id}.png         (~622 file)
- crystal: D:/bxb/materia/icon/{id}_{N}.png → crawl/icons/crystal/{id}_{N}.png    (~3348 file)
- bg    : D:/bxb/picture/m/{id}.png → crawl/icons/bg/{pic_id}.png                  (~499 file)
- soul  : D:/bxb/npc/stand/m/{texture_id}.png → crawl/icons/soul/{texture_id}.png  (~478 file)
- misc  : D:/bxb/_misc/marriage_*.png → crawl/icons/_misc/                          (3 file)
- app_icons: D:/bxb/_app_icons/icon_weapon_type_42_*.png + icon_element_list_*.png  (~18 file)
             → crawl/icons/_app_icons/   (chara icon 叠层用)

总 ~6000 file、~150 MB。crawl/icons/ 在 .gitignore 排除 (跟 omoide_icon/ 同策略)。

设计:
- 不依赖 master_tables (源/目标按 D:\bxb 文件命名直接拷、master 不参与)
- 已存在 → skip (再跑不重复拷)
- 报告 cover 统计

用法:
  python scripts/master_to_business/copy_images.py
  python scripts/master_to_business/copy_images.py --force   # 覆盖已存在
"""
import re
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ICONS_DIR = PROJECT_ROOT / "icons"

DBXB = Path("D:/bxb")


def _copy_dir(src_dir: Path, dest_dir: Path, name_filter, force=False):
    """src_dir 下所有 file 名 match name_filter (return bool) 的拷到 dest_dir。
    返回 (copied, skipped, skipped_existing)
    """
    if not src_dir.is_dir():
        print(f"  WARN: source {src_dir} 不存在、跳过")
        return 0, 0, 0
    dest_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    filtered = 0
    skipped_exist = 0
    for f in src_dir.iterdir():
        if not f.is_file():
            continue
        if not name_filter(f.name):
            filtered += 1
            continue
        target = dest_dir / f.name
        if target.is_file() and not force:
            skipped_exist += 1
            continue
        shutil.copy2(f, target)
        copied += 1
    return copied, filtered, skipped_exist


def main():
    force = "--force" in sys.argv
    if not DBXB.is_dir():
        print(f"ERROR: source {DBXB} 不存在")
        sys.exit(1)
    print(f"copy_images: D:\\bxb → {ICONS_DIR}")
    print(f"force overwrite: {force}\n")

    # 1. chara: weapon/stand/s 6 位
    src = DBXB / "weapon/stand/s"
    dest = ICONS_DIR / "chara"
    print(f"=== chara ({dest}) ===")
    c, fi, sk = _copy_dir(src, dest, lambda n: bool(re.match(r'^\d{6}\.png$', n)), force=force)
    print(f"  copied {c}, filtered (非 6位) {fi}, skipped existing {sk}")

    # 1b. chara variant fallback: master 列了 variant、源 weapon/stand/s 没此 file
    #     用同 base_id (variant_id // 100) 其他 variant 的 png 当 fallback、复制到 missing 名字
    #     例: variant 100603 (改造) missing → 拷 100601 (通常) → 命名 100603.png
    import json as _json
    from paths import master_file
    weapons = _json.loads(master_file("weapons.json").read_text(encoding="utf-8"))
    fb_copied = 0
    fb_no_source = 0
    fb_skipped = 0
    for w in weapons:
        vid = w.get("id")
        bid = w.get("base_id")
        if vid is None or bid is None:
            continue
        target = dest / f"{vid}.png"
        if target.is_file() and not force:
            continue
        # 尝试同 base 其他 variant
        candidates = [bid * 100 + n for n in (1, 2, 3) if bid * 100 + n != vid]
        # 优先源目录、再 fallback dest 已拷的
        found = None
        for cv in candidates:
            csrc = src / f"{cv}.png"
            if csrc.is_file():
                found = csrc
                break
            cdst = dest / f"{cv}.png"
            if cdst.is_file():
                found = cdst
                break
        if found:
            shutil.copy2(found, target)
            fb_copied += 1
        else:
            fb_no_source += 1
    print(f"  variant fallback: copied {fb_copied} (同 base_id 复用)、no fallback {fb_no_source}")

    # 2. masou: weapon/stand/s 7 位
    dest = ICONS_DIR / "masou"
    print(f"\n=== masou ({dest}) ===")
    c, fi, sk = _copy_dir(src, dest, lambda n: bool(re.match(r'^\d{7}\.png$', n)), force=force)
    print(f"  copied {c}, filtered (非 7位) {fi}, skipped existing {sk}")

    # 3. crystal: materia/icon
    src = DBXB / "materia/icon"
    dest = ICONS_DIR / "crystal"
    print(f"\n=== crystal ({dest}) ===")
    c, fi, sk = _copy_dir(src, dest, lambda n: bool(re.match(r'^\d+_\d+\.png$', n)), force=force)
    print(f"  copied {c}, filtered {fi}, skipped existing {sk}")

    # 4. bg: picture/m
    src = DBXB / "picture/m"
    dest = ICONS_DIR / "bg"
    print(f"\n=== bg ({dest}) ===")
    c, fi, sk = _copy_dir(src, dest, lambda n: bool(re.match(r'^\d+\.png$', n)), force=force)
    print(f"  copied {c}, filtered {fi}, skipped existing {sk}")

    # 5. soul: npc/stand/m (banner 大图)、按 texture_id 命名拷过去
    src = DBXB / "npc/stand/m"
    dest = ICONS_DIR / "soul"
    print(f"\n=== soul ({dest}) ===")
    c, fi, sk = _copy_dir(src, dest, lambda n: bool(re.match(r'^\d+\.png$', n)), force=force)
    print(f"  copied {c}, filtered {fi}, skipped existing {sk}")

    # 6. _misc: marriage_*.png (chara icon 結婚框叠层)
    src = DBXB / "_misc"
    dest = ICONS_DIR / "_misc"
    print(f"\n=== _misc/marriage ({dest}) ===")
    c, fi, sk = _copy_dir(src, dest, lambda n: bool(re.match(r'^marriage_\d+\.png$', n)), force=force)
    print(f"  copied {c}, filtered {fi}, skipped existing {sk}")

    # 7. _app_icons: weapon_type_42_* + element_list_* (chara icon 左上 type + 右上 element 叠层)
    src = DBXB / "_app_icons"
    dest = ICONS_DIR / "_app_icons"
    print(f"\n=== _app_icons (weapon_type_42 + element_list) ({dest}) ===")
    c, fi, sk = _copy_dir(
        src, dest,
        lambda n: bool(re.match(r'^icon_weapon_type_42_\d+\.png$', n))
        or bool(re.match(r'^icon_element_list_\d+\.png$', n)),
        force=force,
    )
    print(f"  copied {c}, filtered {fi}, skipped existing {sk}")

    print(f"\n=== DONE ===")
    print(f"target dir: {ICONS_DIR}")
    print("提醒: icons/ 在 .gitignore 里、不入 git")


if __name__ == "__main__":
    main()
