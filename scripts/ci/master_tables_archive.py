"""master_tables_archive.py — 从 master/asset-version dict 产出 master_tables 快照 + changelog。

Port 自 unpacking/draft/{split_tables, build_skill_id_index, update_master_tables}.py,
去掉 subprocess/绝对路径,改成纯函数 + env 可配根目录,供 CI(无 unpacking repo)用。
changelog 引擎复用同目录 diff_master_tables.py(从 unpacking 整体复制、canonical 源在那边)。

快照内容(跟本地 Stage-1 一致): split 各表 + 派生 weapon_innate_skills/weapon_arts/
weapon_arts_effects + _meta + _index + _local-master_source + changelog.md。
**不含** npc_motions/memory_slot_skills(它们在 bxb_wiki/data/、由各自脚本维护)。

用法见 run_update.py。
"""
import datetime
import json
import os
from collections import defaultdict
from pathlib import Path

from diff_master_tables import diff_folders  # 同目录


def master_tables_root() -> Path:
    """data/master-tables 工作树根 (含 master_data/ + asset_version/)。"""
    env = os.environ.get("BXB_MASTER_TABLES")
    if env:
        return Path(env)
    # 本地默认: BxB/master_tables
    return Path(__file__).resolve().parents[3] / "master_tables"


def jst_datetime_str(unix_ts: int) -> str:
    dt = datetime.datetime.utcfromtimestamp(unix_ts) + datetime.timedelta(hours=9)
    return dt.strftime("%Y_%m_%d_%H_%M_%S")


# ─────────── split + 派生 (port split_tables.py + build_skill_id_index.py) ───────────

def split_master(master: dict, out_dir: Path):
    """master dict → out_dir/<table>.json + _meta.json + _index.json。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {}
    written = []  # (name, count)
    for key, value in master.items():
        if isinstance(value, list):
            (out_dir / f"{key}.json").write_text(
                json.dumps(value, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
            )
            written.append((key, len(value)))
        else:
            meta[key] = value
    (out_dir / "_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    index = {
        "master_data_version": meta.get("master_data_version"),
        "tables": {
            name: {
                "rows": count,
                "file": f"{name}.json",
                "size_bytes": (out_dir / f"{name}.json").stat().st_size,
                "sample_keys": list(master[name][0].keys())[:10]
                if master[name] and isinstance(master[name][0], dict)
                else None,
            }
            for name, count in written
        },
        "meta_keys": list(meta.keys()),
    }
    (out_dir / "_index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )


def _cap_weapon_ids(d: dict, users: dict):
    for sid, info in d.items():
        wids = sorted(users[sid])
        info["weapon_count"] = len(wids)
        info["weapon_ids"] = wids[:30]


def build_skill_id_index(out_dir: Path):
    """从 out_dir/weapons.json 派生 weapon_innate_skills/weapon_arts/weapon_arts_effects.json。"""
    weapons = json.loads((out_dir / "weapons.json").read_text(encoding="utf-8"))

    innate, innate_users = {}, defaultdict(set)
    arts, arts_users = {}, defaultdict(set)
    aeff, aeff_users = {}, defaultdict(set)

    for entry in weapons:
        wid = entry.get("id")
        for ws in (entry.get("weapon_skills") or []):
            sid = ws.get("id")
            innate_users[sid].add(wid)
            if sid not in innate:
                innate[sid] = {
                    "name": ws.get("name"), "parameter": ws.get("parameter"),
                    "math_type": ws.get("math_type"), "value": ws.get("value"),
                    "target_element_id": ws.get("target_element_id"), "range": ws.get("range"),
                    "weapon_type_id": ws.get("weapon_type_id"),
                    "is_original_skill": ws.get("is_original_skill"),
                    "category_id": ws.get("category_id"),
                    "category_for_memory_slot": ws.get("category_for_memory_slot"),
                    "description": ws.get("description"), "weapon_ids": [],
                }
        a = entry.get("weapon_arts")
        if isinstance(a, dict):
            a_id = a.get("id")
            if a_id is not None:
                arts_users[a_id].add(wid)
                if a_id not in arts:
                    arts[a_id] = {
                        "name": a.get("name"), "description": a.get("description"),
                        "cost": a.get("cost"), "range": a.get("range"),
                        "hit_count": a.get("hit_count"), "value": a.get("value"),
                        "additional_value": a.get("additional_value"),
                        "use_all": a.get("use_all"), "clip_id": a.get("clip_id"), "weapon_ids": [],
                    }
            for ef in (a.get("weapon_arts_effects") or []):
                e_id = ef.get("id")
                if e_id is None:
                    continue
                aeff_users[e_id].add(wid)
                if e_id not in aeff:
                    aeff[e_id] = {
                        "target": ef.get("target"), "parameter": ef.get("parameter"),
                        "parameter_value": ef.get("parameter_value"),
                        "additional_parameter_value": ef.get("additional_parameter_value"),
                        "range": ef.get("range"), "math_type": ef.get("math_type"),
                        "duration": ef.get("duration"), "duration_value": ef.get("duration_value"),
                        "effect_id": ef.get("effect_id"), "weapon_ids": [],
                    }

    _cap_weapon_ids(innate, innate_users)
    _cap_weapon_ids(arts, arts_users)
    _cap_weapon_ids(aeff, aeff_users)

    for fname, d in (("weapon_innate_skills", innate), ("weapon_arts", arts),
                     ("weapon_arts_effects", aeff)):
        (out_dir / f"{fname}.json").write_text(
            json.dumps({str(k): v for k, v in sorted(d.items())}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


# ─────────── 版本检测 + 索引 (port update_master_tables.py) ───────────

def _md_dir(root: Path) -> Path:
    return root / "master_data"


def _av_dir(root: Path) -> Path:
    return root / "asset_version"


def latest_md_folder(root: Path):
    d = _md_dir(root)
    if not d.exists():
        return None
    cands = sorted(p for p in d.iterdir() if p.is_dir() and p.name.replace("_", "").isdigit())
    return cands[-1] if cands else None


def latest_av_folder(root: Path):
    d = _av_dir(root)
    if not d.exists():
        return None
    cands = sorted((p for p in d.iterdir() if p.is_dir() and p.name.isdigit()),
                   key=lambda p: int(p.name))
    return cands[-1] if cands else None


def sources_identical(new_master: dict, archived_source_path: Path) -> bool:
    """内容是否一致(排除 master_data_version timestamp)。"""
    if not archived_source_path.exists():
        return False
    try:
        old = json.loads(archived_source_path.read_text(encoding="utf-8"))
        return {k: v for k, v in new_master.items() if k != "master_data_version"} == \
               {k: v for k, v in old.items() if k != "master_data_version"}
    except Exception:
        return False


def _summary_md(text: str) -> str:
    in_t = False; sums = [0, 0, 0]; tc = 0
    for line in text.splitlines():
        if line.startswith("## 总览"):
            in_t = True; continue
        if in_t:
            if line.startswith("## "):
                break
            if line.startswith("| ") and not line.startswith("|---") and not line.startswith("| 表"):
                parts = [p.strip() for p in line.strip("|").split("|")]
                if len(parts) >= 4:
                    try:
                        sums[0] += int(parts[1]); sums[1] += int(parts[2]); sums[2] += int(parts[3]); tc += 1
                    except ValueError:
                        pass
    if tc == 0:
        return "_(no diff)_"
    return f"+{sums[0]} / -{sums[1]} / ~{sums[2]} (跨 {tc} 表)"


def _summary_av(text: str) -> str:
    in_t = False
    for line in text.splitlines():
        if line.startswith("## 总览"):
            in_t = True; continue
        if in_t:
            if line.startswith("| ") and not line.startswith("|---") and not line.startswith("| 新增"):
                parts = [p.strip() for p in line.strip("|").split("|")]
                if len(parts) >= 3:
                    try:
                        return f"+{int(parts[0])} / -{int(parts[1])} / ~{int(parts[2])}"
                    except ValueError:
                        pass
                break
    return "_(no diff)_"


def rebuild_md_index(root: Path):
    md = _md_dir(root)
    md.mkdir(parents=True, exist_ok=True)
    folders = sorted((p for p in md.iterdir() if p.is_dir() and p.name.replace("_", "").isdigit()),
                     reverse=True)
    lines = [
        "# master_data 版本索引", "",
        "每条目对应一次 master 内容变化(JST 日期)。**内容未变 → 不创建新目录**。", "",
        "| 版本日期 (JST) | 变更摘要 | 详细 |", "|---|---|---|",
    ]
    for f in folders:
        cl = f / "changelog.md"
        if cl.exists():
            lines.append(f"| **{f.name}** | {_summary_md(cl.read_text(encoding='utf-8'))} | "
                         f"[changelog](./{f.name}/changelog.md) |")
        else:
            lines.append(f"| {f.name} | _(initial release)_ | — |")
    lines.append("")
    (md / "CHANGELOG.md").write_text("\n".join(lines), encoding="utf-8")


def diff_asset_version_md(old_av, new_av):
    if not new_av:
        return None
    old_files = {f["name"]: f for f in (old_av.get("files", []) if old_av else [])}
    new_files = {f["name"]: f for f in new_av.get("files", [])}
    added = sorted(set(new_files) - set(old_files))
    removed = sorted(set(old_files) - set(new_files))
    modified = sorted(n for n in (set(old_files) & set(new_files))
                      if old_files[n].get("md5") != new_files[n].get("md5"))
    if not (added or removed or modified):
        return None
    old_v = old_av.get("version", "(none)") if old_av else "(none)"
    lines = [
        f"# asset_version changelog: {old_v} → {new_av.get('version')}", "",
        "## 总览", "", "| 新增 | 删除 | 调整 |", "|---:|---:|---:|",
        f"| {len(added)} | {len(removed)} | {len(modified)} |", "",
    ]
    CAP = 100
    for title, names, src in (("新增", added, new_files), ("删除", removed, old_files),
                              ("调整", modified, new_files)):
        if not names:
            continue
        lines += [f"## {title} ({len(names)})", ""]
        for n in names[:CAP]:
            lines.append(f"- `{n}` ({src[n].get('size', 0):,} B) md5={str(src[n].get('md5', ''))[:8]}…")
        if len(names) > CAP:
            lines.append(f"- _(... {len(names) - CAP} more)_")
        lines.append("")
    return "\n".join(lines)


def rebuild_av_index(root: Path):
    av = _av_dir(root)
    av.mkdir(parents=True, exist_ok=True)
    folders = sorted((p for p in av.iterdir() if p.is_dir() and p.name.isdigit()),
                     key=lambda p: int(p.name), reverse=True)
    lines = [
        "# asset_version 索引", "",
        "每条目对应一次 asset-version `version` 变化。", "",
        "| 版本 | 处理时间 (JST) | 变更摘要 | 详细 |", "|---|---|---|---|",
    ]
    for f in folders:
        cl = f / "changelog.md"
        ts = "_(unknown)_"
        mp = f / "_meta.json"
        if mp.exists():
            try:
                ts = json.loads(mp.read_text(encoding="utf-8")).get("processed_at_jst", ts)
            except Exception:
                pass
        if cl.exists():
            lines.append(f"| **{f.name}** | {ts} | {_summary_av(cl.read_text(encoding='utf-8'))} | "
                         f"[changelog](./{f.name}/changelog.md) |")
        else:
            lines.append(f"| {f.name} | {ts} | _(initial)_ | — |")
    lines.append("")
    (av / "CHANGELOG.md").write_text("\n".join(lines), encoding="utf-8")


# ─────────── 主流程 ───────────

def archive_master_data(master: dict, root: Path = None):
    """master dict → root/master_data/<JST_date>/ 快照 + changelog + 索引。

    返回 (status, folder): status ∈ {'unchanged', 'archived'}。
    folder 即 build 用的 master_dir(paths.py 经 BXB_MASTER_TABLES 指向 root)。
    """
    root = root or master_tables_root()
    prev = latest_md_folder(root)
    if prev and sources_identical(master, prev / "_local-master_source.json"):
        return "unchanged", prev

    date = jst_datetime_str(master["master_data_version"])
    folder = _md_dir(root) / date
    folder.mkdir(parents=True, exist_ok=True)

    split_master(master, folder)
    build_skill_id_index(folder)
    (folder / "_local-master_source.json").write_text(
        json.dumps(master, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    if prev and prev != folder:
        md = diff_folders(prev, folder)
        if md:
            (folder / "changelog.md").write_text(md, encoding="utf-8")
    rebuild_md_index(root)
    return "archived", folder


def archive_asset_version(av: dict, root: Path = None):
    """asset-version dict → root/asset_version/<ver>/ 快照 + changelog + 索引。

    返回 (status, folder, delta_entries): status ∈ {'unchanged', 'archived'}。
    delta_entries = 新增 + md5 变的 file dict 列表(供下载图片/motion 用)。
    """
    root = root or master_tables_root()
    prev = latest_av_folder(root)
    new_ver = av["version"]
    if prev and int(prev.name) == new_ver:
        return "unchanged", prev, []

    prev_av = None
    if prev:
        p = prev / "_asset-version_source.json"
        if p.exists():
            prev_av = json.loads(p.read_text(encoding="utf-8"))

    folder = _av_dir(root) / str(new_ver)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "_asset-version_source.json").write_text(
        json.dumps(av, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    now = datetime.datetime.utcnow()
    (folder / "_meta.json").write_text(json.dumps({
        "asset_version": new_ver,
        "processed_at_jst": (now + datetime.timedelta(hours=9)).strftime("%Y_%m_%d_%H_%M_%S"),
        "processed_at_unix": int(now.timestamp()),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    md = diff_asset_version_md(prev_av, av)
    if md:
        (folder / "changelog.md").write_text(md, encoding="utf-8")
    rebuild_av_index(root)

    old_files = {f["name"]: f for f in (prev_av.get("files", []) if prev_av else [])}
    new_files = {f["name"]: f for f in av.get("files", [])}
    delta = [new_files[n] for n in new_files
             if n not in old_files or old_files[n].get("md5") != new_files[n].get("md5")]
    return "archived", folder, delta
