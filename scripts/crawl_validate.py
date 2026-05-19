"""scripts/crawl_validate.py — 各 crawler 共享的 schema 自检 helper。

合并 base + extra + revise 后检查每条 entry 是否含必需 / 期望字段，
缺则写 data/crawl_warnings_<viewer>.json。
user 已在 revise / extra 手动补的字段不会再 warn。

字段缺失本身**不阻止 crawler 输出 base.json**（wiki 没爬到 = 没法、只能提示）。
"""
import copy
import json
import os


def _deep_merge_into(target, source):
    """field-level merge (in-place 改 target)：
    - source[k] is None → pop target[k]
    - source[k] dict + target[k] dict → recurse
    - else → 覆盖
    与 start.py/_deep_merge / api/save.js deepMerge 同语义。
    """
    if not isinstance(source, dict):
        return
    for k, sv in source.items():
        if sv is None:
            target.pop(k, None)
        elif isinstance(sv, dict) and isinstance(target.get(k), dict):
            _deep_merge_into(target[k], sv)
        else:
            target[k] = sv


def _load_json_safe(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def validate_completeness(base, data_dir, viewer_name,
                          required=None, expected_optional=None,
                          extra_file=None, revise_file=None):
    """合并 base + extra + revise 后检查每条 entry。
    输出 <data_dir>/crawl_warnings_<viewer_name>.json (空 list 也写、保持文件存在)。

    extra_file / revise_file: 不传则用约定 `<viewer_name>s_extra.json` / `<viewer_name>s_revise.json`。
    chara/soul 单数 viewer_name 但文件复数 — 显式传入 file 名更安全。
    """
    required = required or []
    expected_optional = expected_optional or []

    extra = _load_json_safe(os.path.join(data_dir, extra_file or f'{viewer_name}_extra.json'), [])
    revise = _load_json_safe(os.path.join(data_dir, revise_file or f'{viewer_name}_revise.json'), [])

    # build merged view (in-memory only、不落盘 base)
    merged_by_id = {c['id']: copy.deepcopy(c) for c in base if c.get('id') is not None}
    for c in (extra if isinstance(extra, list) else []):
        cid = c.get('id')
        if cid is None:
            continue
        if cid not in merged_by_id:
            merged_by_id[cid] = copy.deepcopy(c)
        else:
            _deep_merge_into(merged_by_id[cid], c)
    for r in (revise if isinstance(revise, list) else []):
        rid = r.get('id')
        if rid in merged_by_id:
            _deep_merge_into(merged_by_id[rid], r)

    warnings = []
    for c in base:
        cid = c.get('id')
        if cid is None:
            continue
        # tombstone entry 不检（_split 出的 ghost、本身就只有 id+name）
        if c.get('tombstone'):
            continue
        m = merged_by_id.get(cid, c)
        miss_req = [k for k in required if k not in m]
        miss_opt = [k for k in expected_optional if k not in m]
        if miss_req or miss_opt:
            warnings.append({
                'id': cid,
                'name': c.get('name', ''),
                'missing_required': miss_req,
                'missing_optional': miss_opt,
                'note': 'wiki + revise + extra 合并后仍缺',
            })

    out_path = os.path.join(data_dir, f'crawl_warnings_{viewer_name}.json')
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(warnings, f, ensure_ascii=False, indent=2)

    if warnings:
        n_req = sum(1 for w in warnings if w['missing_required'])
        n_opt = sum(1 for w in warnings if w['missing_optional'])
        print(f"[WARN] {len(warnings)} {viewer_name} entries 缺字段 (required={n_req}, optional={n_opt}) -> {out_path}")
    else:
        print(f"[OK] {viewer_name}: 所有 entry 字段齐全 -> {out_path} (空 list)")
