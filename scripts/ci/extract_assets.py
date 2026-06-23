"""extract_assets.py — .dat → PNG / npc-motion 时长。port 自 unpacking parse_unity_dat_v3 + dump_npc_motions。

- extract_png: Texture2D/Sprite → PNG,与 parse_unity_dat_v4 同款处理:
    · luma/chroma 配对 → YCoCg 合成单张 RGBA(<base>_luminance + <base>_chrominance)
    · 忽略 Sprite(其 .image 本 UnityPy 版本抛错)→ 导其 backing/独立 Texture2D(同一图、无冗余)
    · 退化贴图(≤4×4 占位 / 全透明 / 纯单色)→ 跳过(npc-motion dummy 等)→ 无图则返回 []
  单输出 → <out>/<cat>/<id>.png;多输出 → <out>/<cat>/<id>/<对象名>.png。布局与 D:/bxb 一致 → 给 copy_images 当源。
- parse_npc_motion: npc-motion-*.dat → {clip_name: {fps, frames, duration}} (攻速时长)。
依赖 UnityPy + Pillow + numpy。
"""
import re
from collections import OrderedDict
from pathlib import Path

import UnityPy
import numpy as np
from PIL import Image

_PNG_TYPES = ("Texture2D", "Sprite")


def dat_to_base_path(name: str, out_dir: Path) -> Path:
    """asset name → <out>/<dir...>/<filename> (无扩展)。末尾连续数字段=文件名、其余=目录。
    e.g. weapon-stand-s-100101 → out/weapon/stand/s/100101;  materia-icon-120101 → out/materia/icon/120101"""
    parts = [p for p in re.split(r"[-_]", name) if p] or [name]
    tail = []
    while parts and parts[-1].isdigit():
        tail.insert(0, parts.pop())
    filename = "_".join(tail) if tail else (parts.pop() if parts else name)
    dir_parts = parts if parts else ["_misc"]
    return out_dir.joinpath(*dir_parts, filename)


def _img_of(data):
    try:
        return data.image
    except Exception:
        return None


def _is_degenerate(img) -> bool:
    """非展示图(占位/空白)→ True:2×2 dummy / 全透明 / 纯单色。"""
    if img is None:
        return True
    w, h = img.size
    if w <= 4 and h <= 4:
        return True
    ex = img.getextrema()
    if ex and isinstance(ex[0], tuple):
        if len(ex) >= 4 and ex[-1][1] == 0:          # 全透明
            return True
        if all(mn == mx for mn, mx in ex):           # 纯单色
            return True
    elif ex and ex[0] == ex[1]:
        return True
    return False


def _combine_ycocg(luma_img, chro_img):
    """luminance(A8 全分辨率,Y 在 alpha)+ chrominance(RGB 降采样)→ RGBA。"""
    W, H = luma_img.size
    Y = np.asarray(luma_img.convert("RGBA").getchannel("A"), np.float32)
    C = np.asarray(chro_img.convert("RGB").resize((W, H), Image.BILINEAR), np.float32)
    Cg = C[..., 0] - 128.0
    Co = C[..., 2] - 128.0
    t = Y - Cg
    rgb = np.clip(np.stack([t + Co, Y + Cg, t - Co], -1), 0, 255).astype("uint8")
    out = Image.fromarray(rgb, "RGB").convert("RGBA")
    out.putalpha(Image.fromarray(C[..., 1].astype("uint8"), "L"))
    return out


def extract_png(dat_path: Path, name: str, out_dir: Path) -> list:
    """解 .dat 导出图片(luma/chroma 合成 + 跳退化)。返回写出的 Path 列表(无图 → [])。

    只用 Texture2D:本 UnityPy 版本 Sprite.image 抛 AssertionError,而 Sprite 的 backing
    Texture2D 是同一张图、稳定可解 → 忽略 Sprite、导其 backing/独立 Texture2D(一图、无冗余)。
    """
    env = UnityPy.load(str(dat_path))
    base_stem = dat_to_base_path(name, out_dir)
    tex_data = {}
    for o in env.objects:
        if o.type.name != "Texture2D":
            continue
        try:
            d = o.read()
        except Exception:
            continue
        tex_data[getattr(d, "m_Name", "") or ""] = d

    items, used = [], set()
    # 1. luma/chroma 配对 → YCoCg 合成
    pair = {}
    for nm in tex_data:
        if nm.endswith("_luminance"):
            pair.setdefault(nm[:-len("_luminance")], {})["L"] = nm
        elif nm.endswith("_chrominance"):
            pair.setdefault(nm[:-len("_chrominance")], {})["C"] = nm
    for b, lc in pair.items():
        if "L" in lc and "C" in lc:
            items.append((b or "image", "combined", (tex_data[lc["L"]], tex_data[lc["C"]])))
            used.add(lc["L"]); used.add(lc["C"])
    # 2. 独立 Texture2D(非配对 / 非退化)
    for nm, d in tex_data.items():
        if nm in used or _is_degenerate(_img_of(d)):
            continue
        items.append((nm or "tex", "image", d))

    if not items:
        return []

    single = len(items) == 1
    written, seen = [], set()
    for nm, kind, payload in items:
        if single:
            stem = base_stem
        else:
            safe = re.sub(r"[^\w.\-]", "_", nm) or "asset"
            s, k = safe, 2
            while s in seen:
                s, k = f"{safe}_{k}", k + 1
            seen.add(s)
            stem = base_stem / s
        try:
            if kind == "combined":
                lum, chro = payload
                img = _combine_ycocg(lum.image, chro.image)
            else:
                img = payload.image
                if _is_degenerate(img):
                    continue
            out = stem.with_suffix(".png")
            out.parent.mkdir(parents=True, exist_ok=True)
            img.save(out, "PNG", compress_level=1)
            written.append(out)
        except Exception:
            continue
    return written


def _fps_by_clip(env):
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            tree = o.read_typetree()
        except Exception:
            continue
        clips = tree.get("mAnimationClips")
        if clips and isinstance(clips, list) and isinstance(clips[0], dict) and "fps" in clips[0]:
            return {c.get("animationName"): c.get("fps", 0) for c in clips if "animationName" in c}
    return {}


def _max_curve_time(tree) -> float:
    mx = 0.0
    for cf in ("m_RotationCurves", "m_PositionCurves", "m_ScaleCurves", "m_EulerCurves", "m_FloatCurves"):
        for ch in tree.get(cf, []):
            for kf in ch.get("curve", {}).get("m_Curve", []):
                t = kf.get("time", 0.0)
                if t > mx:
                    mx = t
    for ev in tree.get("m_Events", []):
        t = ev.get("time", 0.0)
        if t > mx:
            mx = t
    return mx


def parse_npc_motion(dat_path: Path):
    """npc-motion-*.dat → {clip: {fps, frames, duration}} 或 None。port dump_npc_motions.parse_file。"""
    env = UnityPy.load(str(dat_path))
    fps_map = _fps_by_clip(env)
    out = OrderedDict()
    for o in env.objects:
        if o.type.name != "AnimationClip":
            continue
        try:
            tree = o.read_typetree()
        except Exception:
            continue
        name = tree.get("m_Name")
        if not name:
            continue
        fps = fps_map.get(name)
        if not fps:
            continue
        mx = _max_curve_time(tree)
        if mx <= 0:
            out[name] = {"fps": fps, "frames": 0.0, "duration": 0.0}
        else:
            out[name] = {"fps": fps, "frames": round(mx, 4), "duration": round(mx / fps, 4)}
    return out or None
