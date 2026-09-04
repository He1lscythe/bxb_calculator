"""master_tables / unpacking 路径配置 — 相对 repo 解析、auto-detect 最新日期文件夹。

被 scripts/master_to_business/ 下所有 build script 引用。
每次跑 build 自动取最新 snapshot、不需要手动指定日期。

## 目录布局

`unpacking/` 与 `master_tables/` 都跟本 repo (`bxb_wiki/`) **同级**;`master_tables/`
是 crawl 仓库 `data/master-tables` branch 的 git worktree:

    <BXB_ROOT>/
    ├── bxb_wiki/        ← 本 repo (PROJECT_ROOT)
    ├── unpacking/       ← Frida 抓包 / 解包产物 (跨 repo)
    └── master_tables/   ← git worktree of data/master-tables

历史上这里写死过开发机绝对路径,换机器就整批 build script 挂掉。现在一律相对
`PROJECT_ROOT` 推。

## 解包资源目录 `<assets>`

图标/motion 的源资源(`<assets>/weapon/`、`<assets>/_dat_cache/assets/` 等)在仓库外、
路径机器相关,由 `assets_dir()` 解析、tracked 代码里一律写 `<assets>` 占位。

## env 覆盖

- `BXB_MASTER_TABLES` — master_tables **工作树根**(脚本自己拼 `/master_data`)。
  CI 指向 checkout 目录(见 .github/workflows/update-database.yml);本地不设即用上面的布局。
- `BXB_UNPACKING` — unpacking 根,同理。
- `BXB_ASSETS_DIR` — `<assets>` 根。CI 由 sync_icons 指向解包临时目录;
  本地不设则读 `_local_paths.json`(untracked)的 `assets_dir`。

`MASTER_DIR` / `MASTER_TABLES_DIR` 是**惰性**属性 (PEP 562 `__getattr__`):只在真被访问时
才解析、找不到才抛 FileNotFoundError。这样只需要 `unpacking/` 的脚本(如 build_omoide)
能安全 import 本模块,不会被 master_tables 缺失连带打死。
"""
import json
import os
import re
from functools import lru_cache
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]      # .../bxb_wiki
BXB_ROOT = PROJECT_ROOT.parent                          # bxb_wiki 的上一级

# unpacking/ — 跨 repo 抓包/解包产物 (build_omoide / build_memory_slot_skills 等用)
UNPACKING_DIR = Path(os.environ.get("BXB_UNPACKING") or (BXB_ROOT / "unpacking"))

# master_tables 工作树根 → 内含 master_data/<YYYY_MM_DD>/
_MT_ROOT = Path(os.environ.get("BXB_MASTER_TABLES") or (BXB_ROOT / "master_tables"))

# 日期文件夹命名 YYYY_MM_DD 或 YYYY_MM_DD_HH_MM_SS (新版含时间戳)
_DATE_FOLDER_RE = re.compile(r"^\d{4}_\d{2}_\d{2}(_\d{2}_\d{2}_\d{2})?$")

# 本机路径配置 (untracked、见 docs/local_env.md)
_LOCAL_PATHS = PROJECT_ROOT / "_local_paths.json"


@lru_cache(maxsize=1)
def assets_dir() -> Path:
    """返回 `<assets>` 解包资源根 Path。

    env BXB_ASSETS_DIR > `_local_paths.json` 的 `assets_dir`。

    Raises:
        FileNotFoundError: 两者都没配
    """
    env = os.environ.get("BXB_ASSETS_DIR")
    if env:
        return Path(env)
    if _LOCAL_PATHS.is_file():
        v = json.loads(_LOCAL_PATHS.read_text(encoding="utf-8")).get("assets_dir")
        if v:
            return Path(v)
    raise FileNotFoundError(
        "<assets> 资源目录未配置。设 env BXB_ASSETS_DIR、"
        f'或在 {_LOCAL_PATHS.name} 写 {{"assets_dir": "<解包资源根>"}}'
    )


def master_tables_dir() -> Path:
    """返回 master_data 目录 Path。

    Raises:
        FileNotFoundError: 目录不存在
    """
    p = _MT_ROOT / "master_data"
    if not p.is_dir():
        raise FileNotFoundError(
            f"master_tables not found: {p}\n"
            "设 env BXB_MASTER_TABLES 指向 master_tables 工作树根可覆盖。"
        )
    return p


@lru_cache(maxsize=1)
def latest_master_dir() -> Path:
    """返回最新日期的 master_tables 快照文件夹 Path。

    Raises:
        FileNotFoundError: master_data 目录不存在 / 内无日期文件夹
    """
    root = master_tables_dir()
    dates = sorted(
        (d.name for d in root.iterdir()
         if d.is_dir() and _DATE_FOLDER_RE.match(d.name)),
        reverse=True,
    )
    if not dates:
        raise FileNotFoundError(f"no YYYY_MM_DD folder in {root}")
    return root / dates[0]


def master_file(name: str) -> Path:
    """返回最新 master_tables 下某个 JSON 文件的 Path。

    例:
        weapons_path = master_file("weapons.json")
    """
    d = latest_master_dir()
    p = d / name
    if not p.is_file():
        raise FileNotFoundError(f"{name} not in {d}")
    return p


def __getattr__(name):
    """PEP 562 惰性模块属性 — `from paths import MASTER_DIR` 仍可用、但只在此刻解析。"""
    if name == "MASTER_DIR":
        return latest_master_dir()
    if name == "MASTER_TABLES_DIR":
        return master_tables_dir()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


if __name__ == "__main__":
    print(f"PROJECT_ROOT   = {PROJECT_ROOT}")
    print(f"BXB_ROOT       = {BXB_ROOT}")
    print(f"UNPACKING_DIR  = {UNPACKING_DIR}  (exists={UNPACKING_DIR.is_dir()})")
    try:
        ad = assets_dir()
        print(f"ASSETS_DIR     = {ad}  (exists={ad.is_dir()})")
    except FileNotFoundError as e:
        print(f"ASSETS_DIR     = <未配置>\n{e}")
    try:
        md = latest_master_dir()
        print(f"MASTER_DIR     = {md}")
        print(f"contents: {sorted(p.name for p in md.iterdir())[:10]} ...")
    except FileNotFoundError as e:
        print(f"MASTER_DIR     = <未找到>\n{e}")
