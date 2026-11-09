import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import PROJECT_ROOT, ASSETS_DIR  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

SRC_DIR = ASSETS_DIR / "outputs" / "memory_slot" / "summary"
DEST_DIR = PROJECT_ROOT / "data" / "omoide"


def _lf(p):
    return p.read_bytes().replace(b"\r\n", b"\n")


def sync(base_ids=None):
    if not SRC_DIR.is_dir():
        sys.exit(f"ERROR: source {SRC_DIR} 不存在")
    if base_ids:
        files = [SRC_DIR / f"{b}.json" for b in base_ids]
        lost = [f.stem for f in files if not f.is_file()]
        if lost:
            sys.exit(f"ERROR: summary 里没有 {lost}")
    else:
        files = sorted(SRC_DIR.glob("*.json"))
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    added, updated = [], []
    for f in files:
        data = _lf(f)
        json.loads(data)
        dest = DEST_DIR / f.name
        if dest.is_file():
            if _lf(dest) == data:
                continue
            updated.append(f.stem)
        else:
            added.append(f.stem)
        dest.write_bytes(data)
    print(f"omoide: 新增 {len(added)} {added[:20]} / 更新 {len(updated)} {updated[:20]} / 检查 {len(files)}")
    if not base_ids:
        extra = sorted({p.stem for p in DEST_DIR.glob("*.json")} - {f.stem for f in files})
        if extra:
            print(f"  仅 wiki 有(保留): {extra}")
    return added, updated


def main():
    ap = argparse.ArgumentParser(description="unpacking memory_slot summary → data/omoide/{base_id}.json(只增/覆盖、不删)")
    ap.add_argument("base_ids", nargs="*", type=int, help="只同步这些;不传 = 全部")
    sync(ap.parse_args().base_ids)


if __name__ == "__main__":
    main()
