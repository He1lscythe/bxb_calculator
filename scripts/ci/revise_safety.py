"""revise_safety.py — revise 文件字段级安全检查 (防 2026-06-10 用户手填字段丢失事故重演)。

事故: 旧 build_crystals 整体重写 crystal_revise,冲掉 18 个用户手填 purity_step,
commit + 同步进 data-staging 后才发现。云端自动提交无人盯,危险更大。

check(base, new): base = data-staging 现版 (含用户手填字段);new = build 后版本。
  危险信号 = 丢条目 / 丢字段 (用户字段被冲)。这两项任一 >0 → 不安全、中止 revise 提交。
  值变化 (max_value/三因子/入手方法 等 build 管的字段) 是正常的、不算危险。
"""
import json
from pathlib import Path


def _load(p):
    p = Path(p)
    if not p.is_file():
        return {}
    arr = json.loads(p.read_text(encoding="utf-8"))
    return {e["id"]: e for e in arr if "id" in e}


def check(base_path, new_path) -> tuple[bool, dict]:
    """返回 (safe, report)。safe=False 当且仅当有 entry 或 field 丢失。"""
    base = _load(base_path)
    new = _load(new_path)
    lost_entries = sorted(set(base) - set(new))
    added_entries = sorted(set(new) - set(base))
    lost_fields = []
    changed = []
    added_fields = []
    for i in set(base) & set(new):
        for k in base[i]:
            if k not in new[i]:
                lost_fields.append((i, k))
            elif base[i][k] != new[i][k]:
                changed.append((i, k))
        for k in new[i]:
            if k not in base[i]:
                added_fields.append((i, k))
    report = {
        "lost_entries": lost_entries,
        "added_entries": len(added_entries),
        "lost_fields": lost_fields,
        "changed_values": len(changed),
        "added_fields": len(added_fields),
    }
    safe = not lost_entries and not lost_fields
    return safe, report


def format_report(name: str, safe: bool, r: dict) -> str:
    tag = "OK" if safe else "⚠ UNSAFE"
    lines = [
        f"[{tag}] {name}: "
        f"lost_entries={len(r['lost_entries'])} lost_fields={len(r['lost_fields'])} "
        f"| +entries={r['added_entries']} +fields={r['added_fields']} changed={r['changed_values']}"
    ]
    if r["lost_entries"]:
        lines.append(f"    丢失条目: {r['lost_entries'][:10]}")
    if r["lost_fields"]:
        lines.append(f"    丢失字段: {r['lost_fields'][:10]}")
    return "\n".join(lines)
