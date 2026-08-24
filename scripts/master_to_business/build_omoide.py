"""build_omoide.py — unpacking/outputs/memory_slot/summary/{base_id}.json
→ bxb_wiki/data/omoide/{base_id}.json

来源是 Frida 抓包 + Python 整理结果、不是 master_tables 直给。
~629 chara 覆盖 (用户未拥有的 ~25 chara 没数据、UI fallback empty)。

原样拷贝、保留全部字段 (memory_slot_items / affection_sharing_user_weapon_ids 等
也保留、未来 UI 可能用到)。

用法: python scripts/master_to_business/build_omoide.py
"""
import os
import shutil
import stat
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import PROJECT_ROOT, UNPACKING_DIR  # noqa: E402

# unpacking/ 与本 repo 同级、由 paths.UNPACKING_DIR 统一解析 (env BXB_UNPACKING 可覆盖)。
# 不再各自硬编码开发机绝对路径 —— 换机器 / 换盘符就失效。
SRC_DIR = UNPACKING_DIR / "outputs" / "memory_slot" / "summary"
DEST_DIR = PROJECT_ROOT / "data" / "omoide"


def main():
    if not SRC_DIR.is_dir():
        print(f"ERROR: source {SRC_DIR} 不存在")
        sys.exit(1)

    if DEST_DIR.exists():
        def _rm_readonly(func, path, _):
            os.chmod(path, stat.S_IWRITE)
            func(path)
        shutil.rmtree(DEST_DIR, onerror=_rm_readonly)
    DEST_DIR.mkdir(parents=True)

    files = sorted(SRC_DIR.glob("*.json"))
    written = 0
    for f in files:
        shutil.copy2(f, DEST_DIR / f.name)
        written += 1

    print(f"copied {written} omoide files → {DEST_DIR}")
    print(f"  total size: {sum((DEST_DIR/x.name).stat().st_size for x in files)//1024} KB")


if __name__ == "__main__":
    main()
