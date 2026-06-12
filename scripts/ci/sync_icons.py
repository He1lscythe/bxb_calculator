"""sync_icons.py — 增量补 icons/ (新实体的图从 CDN 下 .dat 解出 → copy_images)。

manifest 驱动: 扫 manifest 里图标类资源 (weapon-stand-s / weapon-damage-s / materia-icon /
picture-m / picture-ll / npc-stand-m),推出 copy_images 会产的 icon 路径,只对**缺失**的下载 +
extract 到临时 D:/bxb 布局目录 → 调 copy_images (BXB_ASSETS_DIR=临时) 落到 icons/。
失败/无依赖优雅降级、不阻塞数据更新。重绘 (同 id 换图) 不覆盖、属罕见、本地强刷。
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # scripts/ci/ → bxb_wiki
ICONS = PROJECT_ROOT / "icons"
M2B = PROJECT_ROOT / "scripts" / "master_to_business"


def _asset_to_icon(name: str):
    """asset name → (category 子目录, icon 文件名 stem) 或 None。对应 copy_images 的源→目标。"""
    m = re.match(r"^weapon-stand-s-(\d+)$", name)
    if m:
        i = m.group(1)
        return ("chara", i) if len(i) == 6 else ("masou", i) if len(i) == 7 else None
    m = re.match(r"^weapon-damage-s-(\d{7})$", name)
    if m:
        return ("masou_damage", m.group(1))
    m = re.match(r"^materia-icon-(\d+)$", name)
    if m:
        return ("crystal", m.group(1))
    m = re.match(r"^picture-m-(\d+)$", name)
    if m:
        return ("bg", m.group(1))
    m = re.match(r"^npc-stand-m-(\d+)$", name)
    if m:
        return ("soul", m.group(1))
    return None


def sync(manifest: dict) -> dict:
    """返回 {downloaded, extracted, copied, failed, skipped}。"""
    idx = {f["name"]: f for f in manifest.get("files", [])}

    # 1. 找缺失的 icon → 需要的 asset
    needed = {}  # asset_name -> entry
    for name, ent in idx.items():
        hit = _asset_to_icon(name)
        if not hit:
            continue
        cat, stem = hit
        if not (ICONS / cat / f"{stem}.png").is_file():
            needed[name] = ent
            # bg 还要 picture-ll 兜底
            if cat == "bg":
                ll = f"picture-ll-{stem}"
                if ll in idx:
                    needed[ll] = idx[ll]

    if not needed:
        return {"downloaded": 0, "extracted": 0, "copied": 0, "failed": 0, "skipped": False}

    try:
        import cdn
        import extract_assets
    except ImportError as e:
        print(f"  sync_icons 降级 (缺依赖 {e})、缺 {len(needed)} 个 icon 源未下")
        return {"downloaded": 0, "extracted": 0, "copied": 0, "failed": len(needed), "skipped": True}

    tmp = Path(tempfile.mkdtemp(prefix="bxb_assets_"))
    dl = ex = failed = 0
    for name, ent in needed.items():
        dat = tmp / "_dat" / f"{name}.dat"
        if not cdn.download_dat(name, ent["version"], dat, ent.get("md5")):
            failed += 1; continue
        dl += 1
        try:
            written = extract_assets.extract_png(dat, name, tmp)
            ex += len(written)
        except Exception:
            failed += 1
        # 不 unlink: UnityPy 在 Windows 占着 .dat (WinError 32);temp 整目录最后丢弃

    # 2. copy_images (BXB_ASSETS_DIR=tmp) → icons/。需 master (paths.py 经 BXB_MASTER_TABLES)
    env = dict(os.environ, BXB_ASSETS_DIR=str(tmp))
    r = subprocess.run([sys.executable, str(M2B / "copy_images.py")],
                       cwd=str(PROJECT_ROOT), env=env)
    copied_ok = r.returncode == 0
    print(f"  icons: 需 {len(needed)} 源 → 下载 {dl} extract {ex} 张 → copy_images {'OK' if copied_ok else 'FAIL'} (失败 {failed})")
    return {"downloaded": dl, "extracted": ex, "copied": copied_ok, "failed": failed, "skipped": False}
