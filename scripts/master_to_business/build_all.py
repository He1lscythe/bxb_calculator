"""build_all.py — 跑 Phase 2.0 + 2.1-2.6 全套 build script。

执行顺序:
  0. (一次性、可省略) extract_wiki_aux.py 产 _wiki_aux.json
  1. build_senzai.py
  2. build_masou.py
  3. build_bladegraphs.py
  4. build_souls.py
  5. build_crystals.py (+ unmatched audit)
  6. build_characters.py

用法:
  python scripts/master_to_business/build_all.py              # 跑全套 build (不重跑 extract_wiki_aux)
  python scripts/master_to_business/build_all.py --with-wiki  # 含 extract_wiki_aux (一般不需要)
"""
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


STEPS = [
    ("senzai (memory_slot_skills)", build_senzai.build),
    ("masou (weapon_costumes)", build_masou.build),
    ("bladegraphs (pictures)", build_bladegraphs.build),
    ("souls (jobs)", build_souls.build),
    ("crystals (materials + wiki max)", build_crystals.build),
    ("characters (weapons base_id 聚合)", build_characters.build),
]


def main():
    if "--with-wiki" in sys.argv:
        import extract_wiki_aux  # noqa
        print("=" * 60)
        print("PHASE 2.0: extract_wiki_aux (一次性、慎跑)")
        print("=" * 60)
        extract_wiki_aux.main()
        print()

    t_start = time.time()
    print("=" * 60)
    print("PHASE 2.1-2.6: build all business JSON")
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
    print(f"\n{'=' * 60}")
    print(f"DONE total {time.time() - t_start:.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
