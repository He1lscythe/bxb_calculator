"""master_tables 路径配置 — auto-detect 最新日期文件夹。

被 scripts/master_to_business/ 下所有 build script 引用。
每次跑 build 自动取最新 snapshot、不需要手动指定日期。
"""
import os
import re
from pathlib import Path


# master_tables 在 unpacking 项目下、跟 crawl 项目平行
# 绝对路径写死（user-specific、当前唯一开发者机器）
UNPACKING_ROOT = Path("F:/OneDrive - Northeastern University/Game/BxB/unpacking")
MASTER_TABLES_DIR = UNPACKING_ROOT / "master_tables"

# 日期文件夹命名 YYYY_MM_DD
_DATE_FOLDER_RE = re.compile(r"^\d{4}_\d{2}_\d{2}$")


def latest_master_dir() -> Path:
    """返回最新日期的 master_tables 文件夹 Path。

    Raises:
        FileNotFoundError: master_tables 目录不存在 / 内无日期文件夹
    """
    if not MASTER_TABLES_DIR.is_dir():
        raise FileNotFoundError(f"master_tables not found: {MASTER_TABLES_DIR}")
    dates = sorted(
        (d.name for d in MASTER_TABLES_DIR.iterdir()
         if d.is_dir() and _DATE_FOLDER_RE.match(d.name)),
        reverse=True,
    )
    if not dates:
        raise FileNotFoundError(f"no YYYY_MM_DD folder in {MASTER_TABLES_DIR}")
    return MASTER_TABLES_DIR / dates[0]


# 模块加载时算一次、被 import 即用
MASTER_DIR = latest_master_dir()


def master_file(name: str) -> Path:
    """返回最新 master_tables 下某个 JSON 文件的 Path。

    例:
        weapons_path = master_file("weapons.json")
    """
    p = MASTER_DIR / name
    if not p.is_file():
        raise FileNotFoundError(f"{name} not in {MASTER_DIR}")
    return p


if __name__ == "__main__":
    print(f"MASTER_DIR = {MASTER_DIR}")
    print(f"contents: {sorted(p.name for p in MASTER_DIR.iterdir())[:10]} ...")
