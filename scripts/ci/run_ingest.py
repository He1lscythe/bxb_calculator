"""run_ingest.py — R2 上的游戏原始数据 → wiki 业务表 (CI 端编排、不碰游戏 API)。

workflow 先做好:
  R2 pipeline/mt/            → 覆盖到 _mt (data/master-tables checkout),BXB_MASTER_TABLES 指向它
  R2 pipeline/wiki/_npc_motions.json → BXB_NPC_MOTIONS_IN
  R2 pipeline/wiki/assets/   → BXB_ASSETS_DIR (新图标源、`<assets>` 布局)

模块:
  npc-motion: R2 版里 wiki 缺的 key 补进 data/_npc_motions.json (build 前、新动作当轮进 build_characters)
  A. master → 业务表        : build_memory_slot_skills + build_all → data/*.json
  B. revise                  : fetch_wiki (入手方法/max_value) + aux → crystal/bg/masou_revise + 字段级安全检查
  icons                      : BXB_ASSETS_DIR 有图 → copy_images → icons/

输出: $RUNNER_TEMP/ci_update_summary.json { npc_motions_added, revise_safe, revise_changed, icons_copied }
revise 不安全 → 退出码 3 (data 仍提交、revise 不提交)。
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

import revise_safety  # noqa: E402

M2B = PROJECT_ROOT / "scripts" / "master_to_business"
DATA = PROJECT_ROOT / "data"
NPC_MOTIONS = DATA / "_npc_motions.json"
REVISE_FILES = ("crystal_revise.json", "bg_revise.json", "masou_revise.json")  # build/aux 会改的


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


def merge_npc_motions() -> dict:
    print("== npc-motion: 合并 R2 版新增 key ==")
    src = os.environ.get("BXB_NPC_MOTIONS_IN")
    if not src or not Path(src).is_file():
        print("  无 R2 版、跳过")
        return {"npc_motions_added": 0}
    cur = json.loads(NPC_MOTIONS.read_text(encoding="utf-8")) if NPC_MOTIONS.is_file() else {}
    new = json.loads(Path(src).read_text(encoding="utf-8"))
    added = sorted((k for k in new if k not in cur), key=int)
    if added:
        cur.update({k: new[k] for k in added})
        ordered = {str(k): cur[str(k)] for k in sorted(int(x) for x in cur)}
        NPC_MOTIONS.write_text(json.dumps(ordered, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  +{len(added)} 新动作 {added[:20]}")
    return {"npc_motions_added": len(added)}


def module_a():
    print("== 模块 A: master → 业务表 ==")
    _run("build_memory_slot_skills.py")  # 从 committed omoide 重生 (transient)
    _run("build_all.py", "--force")


def module_b(revise_base: dict) -> dict:
    print("== 模块 B: revise (入手方法 + max_value + range/weapon_base_id) ==")
    _run("fetch_wiki_acquisition.py", optional=True)  # altema HTTP、失败不致命
    _run("build_crystal_aux.py", optional=True)
    _run("build_bg_aux.py", optional=True)
    # masou effects[].range (味方全体 → All)。注意 revise_safety 只查顶层字段,
    # 看不见 effects 内部 —— 该脚本自己以已有 revise.effects 为基 + 校验 parameter 序列。
    _run("build_masou_aux.py", optional=True)

    safe = True
    changed = []
    for fname in REVISE_FILES:
        base = revise_base.get(fname)
        cur = DATA / fname
        ok, report = revise_safety.check(base, cur)
        print("  " + revise_safety.format_report(fname, ok, report))
        if not ok:
            safe = False
        if base and Path(base).read_bytes() != cur.read_bytes():
            changed.append(fname)
    return {"revise_safe": safe, "revise_changed": changed}


def module_icons() -> dict:
    print("== icons: 新图标源 → copy_images ==")
    assets = os.environ.get("BXB_ASSETS_DIR")
    n = sum(1 for _ in Path(assets).rglob("*.png")) if assets and Path(assets).is_dir() else 0
    if not n:
        print("  无新图标源、跳过")
        return {"icons_copied": False}
    print(f"  图标源 {n} 张")
    return {"icons_copied": _run("copy_images.py", optional=True)}


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
    revise_base = snapshot_revise_base()  # build 前快照 (安全检查基准)
    summary = merge_npc_motions()
    module_a()
    summary.update(module_b(revise_base))
    summary.update(module_icons())

    out = Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir())) / "ci_update_summary.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n== 完成 ==")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    print(f"  summary → {out}")

    if summary.get("revise_safe") is False:
        print("\n⚠ revise 安全检查未通过 — 不应提交 revise (有字段/条目丢失)")
        sys.exit(3)


if __name__ == "__main__":
    main()
