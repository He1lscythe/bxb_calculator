"""build_all.py — 跑 Phase 2.1-2.6 全套 build script。

执行顺序:
  1. build_senzai.py
  2. build_masou.py
  3. build_bladegraphs.py
  4. build_souls.py
  5. build_crystals.py (+ unmatched audit)
  6. build_characters.py

incremental skip (2026-06-09):
  build_all 默认 incremental — 比对 _build_stamp.json 签名 (master_dir + derived mtime)、
  上游 unchanged 时跳过、节省时间避免假 modified。

用法:
  python scripts/master_to_business/build_all.py              # incremental: 上游 unchanged → 跳
  python scripts/master_to_business/build_all.py --force      # 强制全 build (调试 / 手改 master 时用)
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_bladegraphs  # noqa: E402
import build_characters  # noqa: E402
import build_crystals  # noqa: E402
import build_masou  # noqa: E402
import build_senzai  # noqa: E402
import build_souls  # noqa: E402
from paths import MASTER_DIR  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
STAMP = DATA_DIR / "_build_stamp.json"

# 上游依赖签名: master_dir 名 + derived 文件 mtime
# 任一变 → 重 build
_DERIVED_DEPS = ("_memory_slot_skills.json", "_npc_motions.json", "_wiki_aux.json")


def _current_signature():
    sig = {"master_dir": MASTER_DIR.name}
    for fname in _DERIVED_DEPS:
        p = DATA_DIR / fname
        sig[fname] = int(p.stat().st_mtime) if p.is_file() else None
    return sig


def _needs_build():
    if not STAMP.is_file():
        return True, "no stamp"
    try:
        old = json.loads(STAMP.read_text(encoding="utf-8"))
    except Exception:
        return True, "corrupt stamp"
    new = _current_signature()
    if old != new:
        diffs = [k for k in new if old.get(k) != new[k]]
        return True, f"changed: {diffs}"
    return False, "all unchanged"


def _write_stamp():
    STAMP.write_text(
        json.dumps(_current_signature(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


STEPS = [
    ("senzai (memory_slot_skills)", build_senzai.build),
    ("masou (weapon_costumes)", build_masou.build),
    ("bladegraphs (pictures)", build_bladegraphs.build),
    ("souls (jobs)", build_souls.build),
    ("crystals (materials + wiki max)", build_crystals.build),
    ("characters (weapons base_id 聚合)", build_characters.build),
]


def main():
    force = "--force" in sys.argv
    need, reason = _needs_build()
    if not force and not need:
        print(f"build_all: 上游 unchanged ({MASTER_DIR.name}) — 跳过 build")
        print(f"  signature: {reason}")
        print(f"  (用 --force 强制重 build)")
        return

    t_start = time.time()
    print("=" * 60)
    print(f"PHASE 2.1-2.6: build all business JSON  [reason: {'--force' if force else reason}]")
    print("=" * 60)
    for label, fn in STEPS:
        print(f"\n--- {label} ---")
        t = time.time()
        try:
            fn()
        except Exception as e:
            print(f"ERROR: {label} failed: {e}")
            raise
        print(f"  ({time.time() - t:.1f}s)")
    _write_stamp()
    print(f"\n{'=' * 60}")
    print(f"DONE total {time.time() - t_start:.1f}s  (stamp 已更新)")
    print("=" * 60)


if __name__ == "__main__":
    main()
