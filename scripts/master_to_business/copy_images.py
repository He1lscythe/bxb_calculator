"""copy_images.py — 一次性从 D:\bxb 把图片拷到 bxb-wiki/icons/

源 → 目标:
- chara : D:/bxb/weapon/stand/s/{6位}.png → bxb-wiki/icons/chara/{variant_id}.png    (~1106 file)
- masou : D:/bxb/weapon/stand/s/{7位}.png → bxb-wiki/icons/masou/{wc_id}.png         (~622 file)
- crystal: D:/bxb/materia/icon/{id}_{N}.png → bxb-wiki/icons/crystal/{id}_{N}.png    (~3348 file)
- bg    : D:/bxb/picture/m/{id}.png → bxb-wiki/icons/bg/{pic_id}.png                  (~499 file)
- soul  : D:/bxb/npc/stand/m/{texture_id}.png → bxb-wiki/icons/soul/{texture_id}.png  (~478 file)
- misc  : D:/bxb/_misc/marriage_*.png → bxb-wiki/icons/_misc/                          (3 file)
- app_icons: D:/bxb/_app_icons/icon_weapon_type_42_*.png + icon_element_list_*.png  (~18 file)
             → bxb-wiki/icons/_app_icons/   (chara icon 叠层用)

总 ~6000 file、~150 MB。bxb-wiki/icons/ 在 .gitignore 排除 (跟 omoide_icon/ 同策略)。

设计:
- 不依赖 master_tables (源/目标按 D:\bxb 文件命名直接拷、master 不参与)
- 已存在 → skip (再跑不重复拷)
- 报告 cover 统计

用法:
  python scripts/master_to_business/copy_images.py
  python scripts/master_to_business/copy_images.py --force   # 覆盖已存在
"""
import json
import re
import shutil
import struct
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ICONS_DIR = PROJECT_ROOT / "icons"
DATA_DIR = PROJECT_ROOT / "data"

DBXB = Path("D:/bxb")


def _png_size(p: Path):
    """读 PNG IHDR chunk 拿 (width, height)、不依赖 PIL。失败返回 None"""
    try:
        with p.open("rb") as f:
            f.seek(16)  # 跳 PNG sig (8B) + IHDR length+type (4+4B)
            w, h = struct.unpack(">II", f.read(8))
            return (w, h)
    except Exception:
        return None


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

    # 2b. masou_damage: weapon/damage/s 7 位 (BD/伤害 立绘、跟 masou stand 配对)
    src = DBXB / "weapon/damage/s"
    dest = ICONS_DIR / "masou_damage"
    print(f"\n=== masou_damage ({dest}) ===")
    c, fi, sk = _copy_dir(src, dest, lambda n: bool(re.match(r'^\d{7}\.png$', n)), force=force)
    print(f"  copied {c}, filtered (非 7位) {fi}, skipped existing {sk}")

    # 3. crystal: materia/icon — 命名归一化
    #    源: {id}_{N}.png (N=1..4)、cascade _1 → _2 → _3 → _4 拷过来 rename 成 {id}.png (无后缀)
    #    HTML 端 src 简化为 ../icons/crystal/{id}.png、不用 onerror fallback
    src = DBXB / "materia/icon"
    dest = ICONS_DIR / "crystal"
    print(f"\n=== crystal ({dest}) — cascade _1 → _2 → _3 → _4、dest 无后缀 ===")
    dest.mkdir(parents=True, exist_ok=True)
    # 先扫源目录、按 id 分组各 suffix 路径
    from collections import defaultdict
    sources = defaultdict(dict)   # id → {suffix_int: Path}
    if src.is_dir():
        for f in src.iterdir():
            m = re.match(r'^(\d+)_(\d+)\.png$', f.name)
            if m: sources[int(m.group(1))][int(m.group(2))] = f
    # 清旧 {id}_{N}.png (老命名残留、新逻辑只放 {id}.png)
    cleaned = 0
    for f in dest.iterdir():
        if re.match(r'^\d+_\d+\.png$', f.name):
            f.unlink(); cleaned += 1
    copied = skipped = no_src = 0
    suffix_used = defaultdict(int)
    for cid, sufs in sources.items():
        # cascade pick: _1 → _2 → _3 → _4
        chosen = None
        for n in (1, 2, 3, 4):
            if n in sufs: chosen = (n, sufs[n]); break
        if not chosen:
            no_src += 1; continue
        n, src_path = chosen
        target = dest / f"{cid}.png"
        if target.is_file() and not force and target.stat().st_size == src_path.stat().st_size:
            skipped += 1; continue
        shutil.copy2(src_path, target)
        copied += 1
        suffix_used[n] += 1
    print(f"  cleaned {cleaned} old {{id}}_{{N}}.png | copied {copied} | skipped {skipped} | no_src {no_src}")
    print(f"  cascade picked: " + ", ".join(f"_{n}={suffix_used[n]}" for n in sorted(suffix_used)))

    # 4. bg: cascade picture/m/{id}.png → picture/m/{id}_1.png → picture/ll/{id}.png
    #    部分 bg 在 m/ 只有 _1/_2 拼图变体 (1043/1129/5012)、9079 只有 ll/
    dest = ICONS_DIR / "bg"
    print(f"\n=== bg ({dest}) — cascade m → m_1 → ll ===")
    pic_m = DBXB / "picture/m"
    pic_ll = DBXB / "picture/ll"
    dest.mkdir(parents=True, exist_ok=True)
    src_ids = set()
    if pic_m.is_dir():
        for f in pic_m.iterdir():
            m = re.match(r'^(\d+)(_\d+)?\.png$', f.name)
            if m: src_ids.add(int(m.group(1)))
    if pic_ll.is_dir():
        for f in pic_ll.iterdir():
            m = re.match(r'^(\d+)\.png$', f.name)
            if m: src_ids.add(int(m.group(1)))
    copied_m = copied_m1 = copied_ll = skipped = 0
    for tid in src_ids:
        target = dest / f"{tid}.png"
        cand = [(pic_m / f"{tid}.png", 'm'), (pic_m / f"{tid}_1.png", 'm_1'), (pic_ll / f"{tid}.png", 'll')]
        chosen = next(((p, k) for p, k in cand if p.is_file()), None)
        if not chosen:
            continue
        src_path, kind = chosen
        if target.is_file() and not force and target.stat().st_size == src_path.stat().st_size:
            skipped += 1
            continue
        shutil.copy2(src_path, target)
        if kind == 'm': copied_m += 1
        elif kind == 'm_1': copied_m1 += 1
        elif kind == 'll': copied_ll += 1
    print(f"  copied: {copied_m} from m/, {copied_m1} from m/{{id}}_1, {copied_ll} from ll/, skipped {skipped}")

    # 5. soul: npc/stand/m (banner 大图)、按 texture_id 命名拷过去
    src = DBXB / "npc/stand/m"
    dest = ICONS_DIR / "soul"
    print(f"\n=== soul ({dest}) ===")
    c, fi, sk = _copy_dir(src, dest, lambda n: bool(re.match(r'^\d+\.png$', n)), force=force)
    print(f"  copied {c}, filtered {fi}, skipped existing {sk}")

    # 5b. soul fallback: npc/stand/m 缺的 (低 ★ 初始 job id=1/2/6/8/9/10/12)
    # 扫 D:/bxb/npc/{id+1000}_{1..7}.png、找分辨率 148×196 的 banner、命名为 {id:04d}.png
    src_npc = DBXB / "npc"
    souls_file = DATA_DIR / "souls.json"
    fb_copied = 0
    fb_missing = []
    if souls_file.is_file() and src_npc.is_dir():
        souls = json.loads(souls_file.read_text(encoding="utf-8"))
        for s in souls:
            sid = s.get("id")
            if sid is None or sid >= 10000:
                continue
            target = dest / f"{sid:04d}.png"
            if target.is_file() and not force:
                continue
            found = None
            for n in range(1, 8):
                cand = src_npc / f"{sid + 1000}_{n}.png"
                if cand.is_file() and _png_size(cand) == (148, 196):
                    found = cand
                    break
            if found:
                shutil.copy2(found, target)
                fb_copied += 1
            else:
                fb_missing.append(sid)
    print(f"  fallback (npc/{{id+1000}}_<slot>.png 148x196): copied {fb_copied}, missing={fb_missing}")

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
