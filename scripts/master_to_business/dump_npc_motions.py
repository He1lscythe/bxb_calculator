"""Dump every npc-motion-<id>.dat into a lookup-friendly JSON.

迁自 unpacking/draft/dump_npc_motions.py (用户决策 2026-06-09)、独立于 orchestrator、
按需手动跑 (Stage 1 orchestrator 报 weapons.json changed 时触发)。

Unified parser — works for both asset formats present:
  - "SmoothMoves" files (313): have BoneAnimationData with full bone keyframes
  - "Unity Legacy" files (502): only have Unity AnimationClip with curves

In BOTH cases:
  - BoneAnimation MonoBehaviour holds `mAnimationClips[i].fps` per clip name
  - Unity AnimationClip object holds curve keyframes whose `time` field is in
    FRAMES (not seconds, confirmed by cross-checking against bone max_frame)
  - duration_seconds = max_curve_time / fps_from_BoneAnimation

Output format:
  {
    "1": {
      "clips": {
        "attack1": {"fps": 15.0, "frames": 20.0, "duration": 1.3333},
        ...
      }
    },
    ...
  }

Usage:
  python scripts/master_to_business/dump_npc_motions.py
"""
import json
import re
import sys
import time
from collections import OrderedDict
from pathlib import Path

import UnityPy

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path(r'D:\bxb\_dat_cache\assets')
OUT = PROJECT_ROOT / "data" / "_npc_motions.json"


def fps_by_clip_name(env):
    """Look in BoneAnimation MonoBehaviour for mAnimationClips → {clip_name: fps}."""
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        try:
            tree = o.read_typetree()
        except Exception:
            continue
        clips = tree.get('mAnimationClips')
        if not clips or not isinstance(clips, list) or not clips:
            continue
        if not isinstance(clips[0], dict) or 'fps' not in clips[0]:
            continue
        return {c.get('animationName'): c.get('fps', 0) for c in clips
                if 'animationName' in c}
    return {}


def max_curve_time(tree):
    """Walk all curve types + events to find max time value in any keyframe."""
    max_t = 0.0
    for curve_field in ('m_RotationCurves', 'm_PositionCurves', 'm_ScaleCurves',
                        'm_EulerCurves', 'm_FloatCurves'):
        for ch in tree.get(curve_field, []):
            kfs = ch.get('curve', {}).get('m_Curve', [])
            for kf in kfs:
                t = kf.get('time', 0.0)
                if t > max_t: max_t = t
    for ev in tree.get('m_Events', []):
        t = ev.get('time', 0.0)
        if t > max_t: max_t = t
    return max_t


def parse_file(f):
    env = UnityPy.load(str(f))
    fps_map = fps_by_clip_name(env)
    clips_out = OrderedDict()
    for o in env.objects:
        if o.type.name != 'AnimationClip':
            continue
        try:
            tree = o.read_typetree()
        except Exception:
            continue
        name = tree.get('m_Name')
        if not name: continue
        max_t = max_curve_time(tree)
        fps = fps_map.get(name)
        # Skip clips with no fps info (rare; mostly Cubism number-named clips)
        if not fps:
            continue
        if max_t <= 0:
            # Some clips legitimately have 0-frame static poses (e.g., 'basic')
            clips_out[name] = {'fps': fps, 'frames': 0.0, 'duration': 0.0}
            continue
        dur = max_t / fps
        clips_out[name] = {
            'fps': fps,
            'frames': round(max_t, 4),
            'duration': round(dur, 4),
        }
    return clips_out if clips_out else None


def main():
    files = sorted(ASSETS.glob('npc-motion-*.dat'),
                   key=lambda p: int(re.match(r'npc-motion-(\d+)\.dat', p.name).group(1)))
    print(f'Found {len(files)} npc-motion files. Parsing...')

    result = OrderedDict()
    errors = []
    t0 = time.time()

    for i, f in enumerate(files):
        m = re.match(r'npc-motion-(\d+)\.dat', f.name)
        motion_id = int(m.group(1))
        # npc-motion-0.dat 不是真 motion、是 npc 共享 sprite atlas
        # (figure + npc_effect 纹理 + SmoothMoves atlas 元数据、无 AnimationClip/BoneAnimation)
        if motion_id == 0:
            continue
        try:
            clips = parse_file(f)
            if not clips:
                errors.append((motion_id, 'no animation data'))
                continue
            result[str(motion_id)] = {'clips': clips}
        except Exception as e:
            errors.append((motion_id, str(e)))

        if (i + 1) % 100 == 0:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            eta = (len(files) - i - 1) / rate
            print(f'  [{i+1:>4}/{len(files)}] {elapsed:5.1f}s, {rate:.1f}/s, ETA {eta:.0f}s')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)

    elapsed = time.time() - t0
    print()
    print(f'Done in {elapsed:.1f}s.')
    print(f'  Parsed: {len(result)} motions')
    print(f'  Errors: {len(errors)}')
    if errors:
        for mid, err in errors[:5]:
            print(f'    motion {mid}: {err}')
    print(f'\nOutput: {OUT}  ({OUT.stat().st_size/1024:.0f} KB)')


if __name__ == '__main__':
    main()
