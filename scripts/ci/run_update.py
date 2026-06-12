"""run_update.py — CI 端到端更新编排 (纯 HTTP API, 免模拟器/ADB)。

模块:
  A. master → 业务表        : login → get_master_data → archive(split+派生) → build_all → data/*.json
  D. 归档 + changelog        : archive_master_data 写 master_tables/<date>/ (含 changelog + 索引)
  B. revise                  : fetch_wiki + aux → crystal_revise/bg_revise + 字段级安全检查
  C. icons + npc-motion      : (Phase 3) asset-version → CDN → extract → copy_images / npc_motions merge

各模块失败优雅降级:icons/asset/wiki 失败不阻塞 A 的 data 产出。

env:
  BXB_UNIQUE_KEY / BXB_BOOTSTRAP_KEY   API 凭据 (必需)
  BXB_MASTER_TABLES                    master_tables 工作树根 (CI 指 checkout;本地默认 BxB/master_tables)
  BXB_ASSETS_DIR                       (Phase 3) 资源解包临时目录

输出 (供 workflow 判断提交):
  $RUNNER_TEMP/ci_update_summary.json  { master_changed, snapshot_status, revise_safe, revise_changed, ... }

用法:
  python scripts/ci/run_update.py            # 全部已实现模块
  python scripts/ci/run_update.py --phase1   # 只 A+D
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CI_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CI_DIR.parents[1]
sys.path.insert(0, str(CI_DIR))

import maken2_api  # noqa: E402
import master_tables_archive as mta  # noqa: E402
import revise_safety  # noqa: E402
import cdn  # noqa: E402
import sync_icons  # noqa: E402
import sync_npc_motions  # noqa: E402

M2B = PROJECT_ROOT / "scripts" / "master_to_business"
DATA = PROJECT_ROOT / "data"
REVISE_FILES = ("crystal_revise.json", "bg_revise.json")  # build/aux 会改的


def _run(script: str, *args, optional=False):
    cmd = [sys.executable, str(M2B / script), *args]
    print(f"  $ {script} {' '.join(args)}")
    r = subprocess.run(cmd, cwd=str(PROJECT_ROOT))
    if r.returncode != 0:
        if optional:
            print(f"  WARN: {script} 退出码 {r.returncode} (optional、继续)")
            return False
        raise RuntimeError(f"{script} 退出码 {r.returncode}")
    return True


def module_a_d(session) -> dict:
    """A (业务表) + D (master_tables 快照+changelog)。"""
    print("== 模块 A+D: master → 业务表 + 归档 ==")
    master = session.get_master_data()
    mdv = master.get("master_data_version")
    print(f"  master_data_version = {mdv}")

    root = mta.master_tables_root()
    status, folder = mta.archive_master_data(master, root)
    print(f"  归档: {status} → {folder.name}  (root={root})")
    os.environ["BXB_MASTER_TABLES"] = str(root)

    _run("build_memory_slot_skills.py")  # 从 committed omoide 重生 (transient)
    _run("build_all.py", "--force")
    return {"snapshot_status": status, "master_data_version": mdv, "snapshot_folder": str(folder)}


def module_b(revise_base: dict) -> dict:
    """B: fetch_wiki (入手方法) + aux (range/chara_base_id) → revise + 安全检查。

    revise_base = {fname: tempfile_path} 即 build 前 (data-staging 现版) 的快照,用于安全检查。
    """
    print("== 模块 B: revise (入手方法 + range/chara_base_id) ==")
    _run("fetch_wiki_acquisition.py", optional=True)  # altema HTTP、失败不致命
    _run("build_crystal_aux.py", optional=True)
    _run("build_bg_aux.py", optional=True)

    safe = True
    changed = []
    for fname in REVISE_FILES:
        base = revise_base.get(fname)
        cur = DATA / fname
        ok, report = revise_safety.check(base, cur)
        print("  " + revise_safety.format_report(fname, ok, report))
        if not ok:
            safe = False
        # 与 base 比有无变化 (决定要不要提交)
        if base and Path(base).read_bytes() != cur.read_bytes():
            changed.append(fname)
    return {"revise_safe": safe, "revise_changed": changed}


def module_c() -> dict:
    """C: asset-version (无鉴权 CDN) → 归档 + 增量 npc-motion + icons。"""
    print("== 模块 C: asset-version → npc-motion + icons ==")
    manifest = cdn.get_manifest()
    print(f"  asset_version = {manifest.get('version')} | files = {len(manifest.get('files', []))}")
    root = mta.master_tables_root()
    av_status, av_folder, _ = mta.archive_asset_version(manifest, root)
    print(f"  asset_version 归档: {av_status} → {av_folder.name}")
    nm = sync_npc_motions.sync(manifest)
    ic = sync_icons.sync(manifest)
    return {
        "asset_version": manifest.get("version"),
        "asset_version_status": av_status,
        "npc_motions_added": len(nm.get("added", [])),
        "icons_downloaded": ic.get("downloaded", 0),
    }


def snapshot_revise_base() -> dict:
    """build 前把现版 revise (= data-staging 版、CI 已 checkout 进 working tree) 存副本。"""
    tmp = Path(tempfile.mkdtemp(prefix="revise_base_"))
    base = {}
    for fname in REVISE_FILES:
        src = DATA / fname
        if src.is_file():
            dst = tmp / fname
            shutil.copy2(src, dst)
            base[fname] = str(dst)
    return base


def main():
    only_p1 = "--phase1" in sys.argv
    session = maken2_api.login()
    print(f"login ok: user_id={session.login_resp.get('user_id')}\n")

    revise_base = snapshot_revise_base()  # build 前快照 (安全检查基准)
    summary = module_a_d(session)

    if not only_p1:
        summary.update(module_b(revise_base))
        try:
            summary.update(module_c())
        except Exception as e:
            print(f"  模块 C 失败 (降级、不阻塞 data): {type(e).__name__}: {e}")
            summary["module_c_error"] = str(e)

    out = Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir())) / "ci_update_summary.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n== 完成 ==")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    print(f"  summary → {out}")

    # revise 不安全 → 非零退出 (workflow 据此中止 revise 提交,但 data 已提交)
    if summary.get("revise_safe") is False:
        print("\n⚠ revise 安全检查未通过 — 不应提交 revise (有字段/条目丢失)")
        sys.exit(3)


if __name__ == "__main__":
    main()
