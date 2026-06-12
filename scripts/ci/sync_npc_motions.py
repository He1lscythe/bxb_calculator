"""sync_npc_motions.py — 增量补 _npc_motions.json (新 motion 出现时从 CDN 下 .dat 解时长)。

比对 manifest 的 npc-motion-{id} vs 现有 _npc_motions.json keys,只下缺的 (通常 0 个、
motion 极少新增)。失败/无 UnityPy 时优雅降级 (保留基线、log 缺失)、不阻塞数据更新。
"""
import json
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # scripts/ci/ → bxb_wiki
NPC_MOTIONS = PROJECT_ROOT / "data" / "_npc_motions.json"


def sync(manifest: dict) -> dict:
    """返回 {added:[ids], missing_failed:[ids], skipped:bool}。就地更新 _npc_motions.json。"""
    cur = {}
    if NPC_MOTIONS.is_file():
        cur = json.loads(NPC_MOTIONS.read_text(encoding="utf-8"))

    idx = {f["name"]: f for f in manifest.get("files", [])}
    motion_ids = []
    for name in idx:
        if name.startswith("npc-motion-"):
            tail = name[len("npc-motion-"):]
            if tail.isdigit() and int(tail) != 0:  # motion 0 = sprite atlas、非动作
                motion_ids.append(int(tail))

    missing = [mid for mid in sorted(motion_ids) if str(mid) not in cur]
    if not missing:
        return {"added": [], "missing_failed": [], "skipped": False}

    try:
        import cdn
        import extract_assets
    except ImportError as e:
        print(f"  sync_npc_motions 降级 (缺依赖 {e})、保留基线、缺失: {missing[:20]}")
        return {"added": [], "missing_failed": missing, "skipped": True}

    tmp = Path(tempfile.mkdtemp(prefix="npcmotion_"))
    added, failed = [], []
    for mid in missing:
        name = f"npc-motion-{mid}"
        ent = idx[name]
        dat = tmp / f"{name}.dat"
        if not cdn.download_dat(name, ent["version"], dat, ent.get("md5")):
            failed.append(mid); continue
        try:
            clips = extract_assets.parse_npc_motion(dat)
        except Exception:
            clips = None
        if clips:
            cur[str(mid)] = {"clips": clips}
            added.append(mid)
        else:
            failed.append(mid)

    if added:
        # 按 int key 排序写回 (跟 dump_npc_motions 输出风格一致)
        ordered = {str(k): cur[str(k)] for k in sorted(int(x) for x in cur)}
        NPC_MOTIONS.write_text(json.dumps(ordered, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  npc_motions: +{len(added)} 新动作 {added[:20]}{' (失败 '+str(failed[:10])+')' if failed else ''}")
    return {"added": added, "missing_failed": failed, "skipped": False}
