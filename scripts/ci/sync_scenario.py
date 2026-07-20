"""sync_scenario.py — 监测 utage3_scenario_version、新版下载+解密 scenario.mu3 归档 + 抽 TSV。

版本号来源: login / my-data 响应的 `utage3_scenario_version` 字段 (run_update 从 session.login_resp 取)。
CDN (无鉴权 plain HTTP): GET {ASSET_BASE}/scenario_lz4/android/scenario-{version}.mu3 → 加密体。

流程 (仅在版本变化时):
  下载 .mu3 → Rijndael-256-CBC 解密 (256-bit block/ZeroPadding、pycryptoplus) → UnityFS AssetBundle
  ① 存二进制累积:  scenario/unity3d/scenario-{version}.unity3d  (git 自动 delta、每版几十 KB)
  ② 抽可读 TSV:    scenario/{book}.tsv                          (每本一个、覆盖式、按 book 放)

TSV = Utage 原生命令表 (UnityPy read_typetree 读 AdvChapterData.importGridList)。一本 book = 一个
Excel 工作簿含多个 sheet(grid);TSV 里每个 grid 用 `# <sheet名>` 分段,行按 cell tab 连接、裁尾部空
cell、cell 内 \\ \t \r \n 转义 (无损可还原)。12 列: Command/Arg1-6/WaitType/Text/PageCtrl/Voice/WindowType
(7 本尾列换 VoiceVersion);Command 空=台词/立绘行 (Arg1=角色/立绘名、Arg2=表情、Text=台词)。

解密纯 Python (pycryptoplus): 256-bit block、pycryptodome / .NET Core 都不支持;全量约 2.5min、只在有新版跑。
本地 Windows 有更快的 .NET 版 draft/decrypt_scenario_mu3.py (等价输出)。
"""
import os
import re
from pathlib import Path

import requests
# UnityPy / CryptoPlus 惰性 import(在用到的函数内)—— 它们(尤其 CryptoPlus 依赖 pkg_resources)
# import 失败不应连累 run_update 顶层 import scenario 而拖垮整个更新;sync() 里各步 try/except 兜住。

ASSET_BASE = "https://bxb-asset.grimoire.codes"
SCENARIO_BASE = ASSET_BASE + "/scenario_lz4/android"
TIMEOUT = 120
MIN_SIZE = 1024  # 真实 scenario bundle 远大于此;过小视为错误页/空响应

AES_KEY = b"12345678901231234567890123123456"  # 32B
AES_IV = b"grimoiregrimoiregrimoiregrimoire"    # 32B (256-bit block → IV 32B)
BLOCK = 32


def scenario_dir(root) -> Path:
    return Path(root) / "scenario"


def _decrypt(blob: bytes) -> bytes:
    from CryptoPlus.Cipher import python_Rijndael  # 惰性:见顶部说明
    c = python_Rijndael.new(AES_KEY, python_Rijndael.MODE_CBC, AES_IV, blocksize=BLOCK)
    return c.decrypt(blob)


def _esc(c: str) -> str:
    return c.replace("\\", "\\\\").replace("\t", "\\t").replace("\r", "\\r").replace("\n", "\\n")


def _render_rows(rows) -> str:
    """rows → tab-separated 文本;每行裁尾部空 cell、cell 转义;裁尾部空行。"""
    lines = []
    for r in rows or []:
        cells = r.get("strings") or []
        last = -1
        for i, c in enumerate(cells):
            if c != "":
                last = i
        lines.append("\t".join(_esc(c) for c in cells[: last + 1]))
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def _render_book_tsv(grids) -> str:
    """一本 book 的多个 grid(sheet)→ 单 TSV,每 grid 以 `# <sheet名>` 分段。"""
    out = []
    for g in grids or []:
        name = (g.get("name") or "").split(":")[-1] or (g.get("name") or "?")
        body = _render_rows(g.get("rows"))
        if not body.strip():
            continue
        out.append(f"# {name}")
        out.append(body)
        out.append("")
    return ("\n".join(out).rstrip("\n") + "\n") if out else ""


def _safe_book_filename(name: str) -> str:
    base = name[:-5] if name.endswith(".book") else name
    base = re.sub(r"[^\w.\-]", "_", base) or "book"
    return base + ".tsv"


def _extract_tsv(bundle_path, out_dir) -> int:
    """从解密后的 UnityFS 抽每本 book 的 TSV 到 out_dir。返回写出的 book 数。"""
    import UnityPy  # 惰性:见顶部说明
    out_dir = Path(out_dir)
    env = UnityPy.load(str(bundle_path))
    n = 0
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            tt = o.read_typetree()
        except Exception:  # noqa: BLE001
            continue
        name = tt.get("m_Name") or ""
        grids = tt.get("importGridList") or []
        if not name or not grids:
            continue
        body = _render_book_tsv(grids)
        if not body.strip():
            continue
        (out_dir / _safe_book_filename(name)).write_text(body, encoding="utf-8")
        n += 1
    return n


def sync(version, root) -> dict:
    """version = utage3_scenario_version;root = master_tables 工作树根 (data/master-tables checkout)。
    返回 {status: 'archived'|'unchanged'|'error', version, path?, size?, tsv?, error?}。失败不抛 (调用方降级)。"""
    try:
        version = int(version)
    except (TypeError, ValueError):
        return {"status": "error", "version": version, "error": "版本号非法"}
    d = scenario_dir(root)
    u3d = d / "unity3d"
    dest = u3d / f"scenario-{version}.unity3d"
    if dest.exists():
        return {"status": "unchanged", "version": version, "path": str(dest)}
    url = f"{SCENARIO_BASE}/scenario-{version}.mu3"
    try:
        r = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        return {"status": "error", "version": version, "error": f"{type(e).__name__}: {e}"}
    if r.status_code != 200:
        return {"status": "error", "version": version, "error": f"HTTP {r.status_code}"}
    enc = r.content
    if len(enc) < MIN_SIZE:
        return {"status": "error", "version": version, "error": f"响应过小 {len(enc)}B"}
    if len(enc) % BLOCK != 0:
        return {"status": "error", "version": version, "error": f"密文长 {len(enc)} 非 {BLOCK} 倍数"}
    try:
        pt = _decrypt(enc)
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "version": version, "error": f"解密失败 {type(e).__name__}: {e}"}
    if pt[:7] != b"UnityFS":
        return {"status": "error", "version": version, "error": f"解密后非 UnityFS (头 {pt[:7]!r})"}
    u3d.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(pt)
    try:
        tsv = _extract_tsv(dest, d)
    except Exception as e:  # noqa: BLE001
        return {"status": "archived", "version": version, "path": str(dest), "size": len(pt),
                "tsv": 0, "error": f"TSV 抽取失败 {type(e).__name__}: {e}"}
    return {"status": "archived", "version": version, "path": str(dest), "size": len(pt), "tsv": tsv}


if __name__ == "__main__":
    import sys

    v = int(sys.argv[1]) if len(sys.argv) > 1 else None
    root = os.environ.get("BXB_MASTER_TABLES", ".")
    if v is None:
        print("用法: python sync_scenario.py <version>  (BXB_MASTER_TABLES=归档根)")
        sys.exit(1)
    print(sync(v, root))
