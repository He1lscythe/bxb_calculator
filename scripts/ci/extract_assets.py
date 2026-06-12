"""extract_assets.py — .dat → PNG / npc-motion 时长。port 自 unpacking parse_unity_dat_v3 + dump_npc_motions。

- extract_png: Texture2D/Sprite → PNG,按 dat_to_base_path 落到 <out>/<cat>/<id>.png (多资产 _1/_2)。
  布局与 D:/bxb 一致 → 给 copy_images (BXB_ASSETS_DIR=<out>) 当源。
- parse_npc_motion: npc-motion-*.dat → {clip_name: {fps, frames, duration}} (攻速时长)。
依赖 UnityPy + Pillow。
"""
import re
from collections import OrderedDict
from pathlib import Path

import UnityPy

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


def extract_png(dat_path: Path, name: str, out_dir: Path) -> list:
    """解 .dat 导出所有 Texture2D/Sprite → PNG。返回写出的 Path 列表。"""
    env = UnityPy.load(str(dat_path))
    base_stem = dat_to_base_path(name, out_dir)
    cands = [o for o in env.objects if o.type.name in _PNG_TYPES]
    written = []
    if not cands:
        return written
    for idx, obj in enumerate(cands, 1):
        stem = base_stem if len(cands) == 1 else base_stem.parent / f"{base_stem.name}_{idx}"
        try:
            img = obj.read().image
            if img is None:
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
