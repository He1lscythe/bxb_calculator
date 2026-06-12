"""Diff two master_tables/<yyyy_mm_dd>/ folders → produce markdown changelog.

Usage:
    python draft/diff_master_tables.py <old_date> <new_date>
    # e.g. python draft/diff_master_tables.py 2026_05_23 2026_06_03
    # → prints changelog to stdout

Or import:
    from draft.diff_master_tables import diff_folders
    md = diff_folders(Path('master_tables/2026_05_23'), Path('master_tables/2026_06_03'))
"""
import sys, json, argparse
from pathlib import Path
from collections import defaultdict

# Tables produced by draft/split_tables.py from local-master.dat
# (the 5 "derived" tables — memory_slot_skills/weapon_innate_skills/weapon_arts/
#  weapon_arts_effects/npc_motions — come from server responses, not master.dat;
#  if present in only one folder we skip them rather than treat as removed)
DERIVED_TABLES = {
    'memory_slot_skills', 'weapon_innate_skills',
    'weapon_arts', 'weapon_arts_effects', 'npc_motions',
}

# Output ordering: high-value tables surface first
TABLE_PRIORITY = [
    'weapons', 'weapon_costumes', 'materials', 'items',
    'jobs', 'pictures', 'scenarios',
    'evolution_recipes', 'reinforce_costs',
    'weapon_parameter_ranks', 'material_parameter_ranks',
    'attack_motions',
    'rarities', 'elements', 'weapon_types', 'area_tags',
    'play_voices', 'weapon_voices',
    'emblem_levels', 'material_top_characters',
    # everything else falls after
]

EXCLUDE_FILES = {'_meta.json', '_index.json', 'changelog.md'}


def _load(path: Path):
    return json.load(open(path, encoding='utf-8'))


def _list_tables(folder: Path) -> dict[str, Path]:
    """Return {table_name: path} for all *.json that look like real tables."""
    out = {}
    for p in folder.glob('*.json'):
        if p.name in EXCLUDE_FILES: continue
        if p.name.startswith('_local-master'): continue
        out[p.stem] = p
    return out


def _detect_pk(entries: list, hint: str | None) -> str | None:
    """Pick the field name to use as primary key for entry dedup.
    `hint` is the first sample_key from _index.json (best guess).
    """
    if not entries or not isinstance(entries[0], dict):
        return None
    keys = entries[0].keys()
    # Prefer hint if it identifies entries uniquely
    if hint and hint in keys:
        ids = [e.get(hint) for e in entries]
        if len(set(ids)) == len(ids) and all(i is not None for i in ids):
            return hint
    # Fallback: try common pk fields
    for candidate in ('id', 'emblem_id', 'before_weapon_id', 'character_id'):
        if candidate in keys:
            ids = [e.get(candidate) for e in entries]
            if len(set(ids)) == len(ids) and all(i is not None for i in ids):
                return candidate
    return None


def _load_index(folder: Path) -> dict:
    p = folder / '_index.json'
    if p.exists():
        try:
            return _load(p).get('tables', {})
        except Exception:
            pass
    return {}


def _diff_table(old_entries, new_entries, pk: str) -> tuple[list, list, list]:
    """Return (added, removed, modified) where:
       - added/removed are full entry dicts
       - modified is [(pk_val, old_entry, new_entry, [field_names_that_differ])]
    """
    old_by = {e[pk]: e for e in old_entries if pk in e}
    new_by = {e[pk]: e for e in new_entries if pk in e}
    added_ids = new_by.keys() - old_by.keys()
    removed_ids = old_by.keys() - new_by.keys()
    common = old_by.keys() & new_by.keys()
    added = [new_by[k] for k in added_ids]
    removed = [old_by[k] for k in removed_ids]
    modified = []
    for k in common:
        # CI port 调整: 归一"空字段增减"。游戏 API (/master_data) 省略空/默认字段,
        # 本地 ADB 解出的 local-master 则保留 (effects=[] / expired_effects=[] / job_arts=[] 等)。
        # 仅空↔缺失的差异不算真实变化 (否则 ADB→API 首次切换会把全表误报"调整")。
        no = {f: v for f, v in old_by[k].items() if not _is_empty(v)}
        nn = {f: v for f, v in new_by[k].items() if not _is_empty(v)}
        if no != nn:
            diff_fields = sorted({
                f for f in (set(no) | set(nn))
                if no.get(f) != nn.get(f)
            })
            if not diff_fields:
                continue  # 仅空字段增减、非实质变化
            modified.append((k, old_by[k], new_by[k], diff_fields))
    return added, removed, modified


def _is_empty(v) -> bool:
    """空/默认值(用于 changelog diff 归一,见 _diff_table)。"""
    return v is None or v == [] or v == {} or v == ""


def _entry_label(entry: dict, pk: str, table: str = '',
                 context: dict | None = None, side: str = 'new') -> str:
    """Produce a short string label for an entry: `id` + name + optional table-specific tag.
    When `context` is provided, the id is rendered as a markdown link to the entry's
    line inside `<table>.json`. For `materials` we additionally append `rarity=N`.
    """
    pid = entry.get(pk)
    name = entry.get('name')
    parts = [_id_link(pid, table, context, side)]
    if name: parts.append(name)
    if table in ('materials', 'jobs'):
        rarity = entry.get('rarity')
        if rarity is not None:
            parts.append(f'rarity={rarity}')
    return ' '.join(parts)


def _format_value(v) -> str:
    """Compact repr for value display in change list."""
    if isinstance(v, (list, dict)):
        s = json.dumps(v, ensure_ascii=False)
        if len(s) > 80: s = s[:77] + '...'
        return f'`{s}`'
    return f'`{v}`' if not isinstance(v, str) else f'`{v}`'


def _aggregate_modified(modified: list, pk: str) -> dict[str, dict]:
    """{field_name: {(old_val_repr, new_val_repr): [pk_vals]}}"""
    by_field: dict[str, dict] = defaultdict(lambda: defaultdict(list))
    for pid, oe, ne, diff_fields in modified:
        for f in diff_fields:
            ov = oe.get(f)
            nv = ne.get(f)
            # Normalize unhashable (list/dict) → JSON string
            ok = json.dumps(ov, ensure_ascii=False, sort_keys=True) if isinstance(ov, (list, dict)) else ov
            nk = json.dumps(nv, ensure_ascii=False, sort_keys=True) if isinstance(nv, (list, dict)) else nv
            by_field[f][(ok, nk)].append(pid)
    return by_field


def _truncate(s: str, n: int = 80) -> str:
    s = str(s)
    return s if len(s) <= n else s[:n - 3] + '...'


def _line_diff_compact(ov, nv):
    """If both ov, nv are multi-line strings sharing common head/tail lines,
    return (ov_chunk, nv_chunk, note) showing only the differing line(s).
    Otherwise return (ov, nv, '')."""
    if not (isinstance(ov, str) and isinstance(nv, str)): return ov, nv, ''
    if '\n' not in ov and '\n' not in nv: return ov, nv, ''
    ol = ov.split('\n'); nl = nv.split('\n')
    pre = 0
    while pre < min(len(ol), len(nl)) and ol[pre] == nl[pre]: pre += 1
    suf = 0
    while (suf < min(len(ol), len(nl)) - pre and ol[-(suf+1)] == nl[-(suf+1)]): suf += 1
    if pre + suf == 0:
        return ov, nv, ''
    ov_lines = ol[pre:len(ol)-suf] or ['(empty)']
    nv_lines = nl[pre:len(nl)-suf] or ['(empty)']
    ov_chunk = ' / '.join(ov_lines)
    nv_chunk = ' / '.join(nv_lines)
    total_old = len(ol); total_new = len(nl)
    note = f' (公共 {pre} 行前缀 + {suf} 行后缀 共 {total_old}/{total_new} 行)'
    return ov_chunk, nv_chunk, note


def _load_weapons_base_name_index(folder: Path) -> dict[int, str]:
    """Build {base_id: base_name} from weapons.json. Returns {} on missing/parse error."""
    p = folder / 'weapons.json'
    if not p.exists():
        return {}
    try:
        out = {}
        for w in _load(p):
            bid = w.get('base_id')
            bn = w.get('base_name')
            if bid is not None and bn and bid not in out:
                out[bid] = bn
        return out
    except Exception:
        return {}


def _build_id_line_index(folder: Path, table: str) -> dict:
    """Scan `<table>.json` text for top-level entry id → 1-indexed line number.
    Supports two formats (both from split_tables.py / build_skill_id_index.py,
    indent=2):
      (1) list-of-dict tables — top-level `"id":` at column 4 (`    "id":`)
      (2) dict-keyed tables (derived: weapon_innate_skills / memory_slot_skills /
          weapon_arts / weapon_arts_effects) — entries open at column 2 as
          `  "<id>": {`
    """
    p = folder / f'{table}.json'
    if not p.exists(): return {}
    out = {}
    import re
    LIST_PREFIX = '    "id":'
    DICT_RE = re.compile(r'^  "(-?\d+)": \{')
    try:
        with open(p, encoding='utf-8') as f:
            for line_no, line in enumerate(f, 1):
                if line.startswith(LIST_PREFIX):
                    rest = line[len(LIST_PREFIX):].strip().rstrip(',').strip()
                    try:
                        out[int(rest)] = line_no
                    except ValueError:
                        pass
                else:
                    m = DICT_RE.match(line)
                    if m:
                        try:
                            out[int(m.group(1))] = line_no
                        except ValueError:
                            pass
    except Exception:
        pass
    return out


def _load_enum_name_map(folder: Path, table: str) -> dict:
    """Build {id: name} from a simple enum table (elements/weapon_types/rarities/...)."""
    p = folder / f'{table}.json'
    if not p.exists(): return {}
    try:
        return {e['id']: e.get('name', str(e['id'])) for e in _load(p) if 'id' in e}
    except Exception:
        return {}


def _load_innate_skills_desc(d: Path) -> dict:
    """weapon_innate_skills.json → {skill_id: description} 用于 weapons.weapon_skills 子项 changelog 显示。"""
    p = d / 'weapon_innate_skills.json'
    if not p.exists(): return {}
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        if isinstance(data, dict):
            out = {}
            for k, v in data.items():
                try: out[int(k)] = (v or {}).get('description', '')
                except ValueError: pass
            return out
    except Exception: pass
    return {}


def _build_context(old_dir: Path, new_dir: Path) -> dict:
    """Bundle lookup maps for cross-table joins in render functions."""
    def pick(name):
        return _load_enum_name_map(new_dir, name) or _load_enum_name_map(old_dir, name)
    # Pre-scan id→line maps for both folders, all tables present
    all_tables = set()
    for d in (old_dir, new_dir):
        for p in d.glob('*.json'):
            if p.name in EXCLUDE_FILES: continue
            if p.name.startswith('_local-master'): continue
            all_tables.add(p.stem)
    id_lines_new = {t: _build_id_line_index(new_dir, t) for t in all_tables}
    id_lines_old = {t: _build_id_line_index(old_dir, t) for t in all_tables}
    # innate_skills_desc: weapon_skills 子项 id → description (new 优先、old fallback)
    desc_new = _load_innate_skills_desc(new_dir)
    desc_old = _load_innate_skills_desc(old_dir)
    innate_skills_desc = {**desc_old, **desc_new}
    return {
        'weapons_base_name': _load_weapons_base_name_index(new_dir) or _load_weapons_base_name_index(old_dir),
        'elements':     pick('elements'),
        'weapon_types': pick('weapon_types'),
        'rarities':     pick('rarities'),
        'id_lines_new': id_lines_new,
        'id_lines_old': id_lines_old,
        'innate_skills_desc': innate_skills_desc,
        'old_dir_name': old_dir.name,
        'new_dir_name': new_dir.name,
    }


def _fmt_pid_list(pids, table: str = '', context: dict | None = None,
                  side: str = 'new', cap: int = 8) -> str:
    """Format a list of pids as `[<link>, <link>, ...]`, capped + sorted.
    Links use _id_link (markdown link to json line) when context is provided."""
    pids = sorted(pids)
    def fmt(p): return _id_link(p, table, context, side)
    if len(pids) <= cap:
        return f'[{", ".join(fmt(p) for p in pids)}]'
    return f'[{", ".join(fmt(p) for p in pids[:cap])}, ...] (共 {len(pids)})'


def _id_link(pid, table: str, context: dict | None, side: str = 'new') -> str:
    """Format an id as a markdown link to the entry's line in the corresponding json,
    or fall back to plain `<id>` code when no context / no line found.
    `side` ∈ {'new', 'old'} — pick which folder's json to point at (changelog.md
    lives in the new folder, so 'new' resolves to `<table>.json` and 'old' to
    `../<old_dir_name>/<table>.json`)."""
    if context is None or not table:
        return f'`{pid}`'
    lines_map = (context.get(f'id_lines_{side}') or {}).get(table, {})
    ln = lines_map.get(pid)
    if ln is None:
        return f'`{pid}`'
    if side == 'new':
        rel = f'{table}.json'
    else:
        rel = f'../{context.get("old_dir_name","")}/{table}.json'
    return f'[`{pid}`]({rel}#L{ln})'


def _enum(ctx: dict, kind: str, id_: int | None, fallback_prefix: str = '?') -> str:
    """Resolve enum id → 'name(id)'; returns f'?({id})' if not found."""
    if id_ is None: return ''
    name = ctx.get(kind, {}).get(id_)
    if name: return f'{name}({id_})'
    return f'{fallback_prefix}({id_})'


def _render_added_section(table: str, added: list, pk: str,
                          context: dict | None = None) -> list[str]:
    if not added:
        return []
    lines = [f'### 新增 ({len(added)})', '']
    context = context or {}
    weapons_base_name = context.get('weapons_base_name') or {}
    for e in sorted(added, key=lambda x: x.get(pk) or 0):
        lines.append(f'- {_entry_label(e, pk, table, context, side="new")}')
        # Show distinctive fields for some tables
        if table == 'weapon_costumes':
            wbase = e.get('weapon_base_id')
            if wbase:
                bname = weapons_base_name.get(wbase, '?')
                lines.append(f'  - 归属武器: {bname} (weapon_base_id={wbase})')
            effects = e.get('weapon_costume_effects', [])
            if effects:
                eff_str = ', '.join(
                    f"{x.get('parameter','?')} {x.get('math_type','?')} ×{x.get('value','?')}"
                    for x in effects
                )
                lines.append(f'  - effects: {eff_str}')
        elif table == 'weapons':
            bn = e.get('base_name'); cn = e.get('costume_name')
            if bn:
                cstr = f' (costume: {cn})' if cn else ''
                lines.append(f'  - base_name: {bn}{cstr}')
            # element / type / rarity → enum names
            tags = []
            tag_specs = [
                ('element_id',     'element',     'elements'),
                ('weapon_type_id', 'type',        'weapon_types'),
                ('rarity',         'rarity',      'rarities'),
            ]
            for fld, lbl, ekind in tag_specs:
                v = e.get(fld)
                if v not in (None, '', 0):
                    tags.append(f'{lbl}={_enum(context, ekind, v)}')
            cv = e.get('cv')
            if cv: tags.append(f'cv={cv}')
            if tags: lines.append(f'  - {" / ".join(tags)}')
            stat_parts = []
            for k, lbl in (('max_hp','HP'), ('max_attack','ATK'),
                           ('max_defense','DEF'), ('max_speed','SPD'),
                           ('max_break','BREAK')):
                v = e.get(k)
                if v is not None: stat_parts.append(f'{lbl}={v}')
            if stat_parts: lines.append(f'  - max stats: {" / ".join(stat_parts)}')
            misc = []
            hc = e.get('hit_counts'); ac = e.get('attack_count')
            if hc is not None or ac is not None:
                misc.append(f'hit_counts={hc} ({ac}段)' if ac else f'hit_counts={hc}')
            ms = [e.get(k) for k in ('motion_speed','motion_speed2','motion_speed3')]
            ms = [str(x) for x in ms if x is not None]
            if ms: misc.append(f'motion_speed=[{"/".join(ms)}]')
            mp = e.get('mp')
            if mp: misc.append(f'mp={mp}')
            if misc: lines.append(f'  - {"  ".join(misc)}')
            extras = []
            ts = e.get('three_size'); slot = e.get('initial_slot')
            if ts: extras.append(f'three_size={ts}')
            if slot is not None: extras.append(f'initial_slot={slot}')
            if extras: lines.append(f'  - {" / ".join(extras)}')
            # BD (weapon_arts) — full schema from inline dict
            wa = e.get('weapon_arts') or {}
            wa_suffix = e.get('weapon_arts_suffix'); wa_id = e.get('weapon_arts_id')
            if wa_suffix or wa_id:
                lines.append(f'  - BD: {wa_suffix or "?"} (arts_id={wa_id})')
                if wa.get('description'):
                    lines.append(f'    - description: {_truncate(wa["description"], 120)}')
                bd_meta = []
                if wa.get('cost') is not None: bd_meta.append(f'cost={wa["cost"]}')
                if wa.get('hit_count') is not None: bd_meta.append(f'hit_count={wa["hit_count"]}')
                if wa.get('value') is not None: bd_meta.append(f'value={wa["value"]}')
                if wa.get('additional_value') is not None: bd_meta.append(f'additional_value={wa["additional_value"]}')
                if bd_meta: lines.append(f'    - {" / ".join(bd_meta)}')
            ws = e.get('weapon_skills') or []
            if ws:
                lines.append(f'  - innate skills ({len(ws)}):')
                for sk in ws:
                    p = sk.get('parameter'); m = sk.get('math_type'); v = sk.get('value')
                    desc = sk.get('description') or ''
                    op = '+' if m == 'Addition' else '×'
                    lines.append(f'    - {p} {m} {op}{v} — {_truncate(desc, 80)}')
        elif table == 'jobs':
            rarity = e.get('rarity'); max_lv = e.get('max_level')
            tags = []
            if rarity: tags.append(f'rarity={rarity}')   # jobs use own scale, not weapons rarities table
            if max_lv: tags.append(f'max_level={max_lv}')
            if tags: lines.append(f'  - {" / ".join(tags)}')
            jabilities = e.get('job_abilities') or []
            if jabilities:
                lines.append(f'  - job_abilities ({len(jabilities)}):')
                for ab in jabilities:
                    dtype = ab.get('data_type')          # 'Element' or 'WeaponType'
                    did = ab.get('data_id')
                    rank = ab.get('ability_rank') or {}
                    rname = rank.get('name', '?')
                    rstr = rank.get('rank_string', '?')
                    pv = rank.get('positive_value'); nv = rank.get('negative_value')
                    if dtype == 'Element':
                        name = _enum(context, 'elements', did)
                    elif dtype == 'WeaponType':
                        name = _enum(context, 'weapon_types', did)
                    else:
                        name = f'?({did})'
                    lines.append(f'    - {dtype} {name}: pos={pv} / neg={nv} (rank={rstr} {rname})')
            jskills = e.get('job_skills') or []
            if jskills:
                lines.append(f'  - job_skills ({len(jskills)}):')
                for sk in jskills:
                    p = sk.get('parameter'); m = sk.get('math_type'); v = sk.get('value')
                    sdesc = sk.get('description') or ''
                    op = '+' if m == 'Addition' else '×'
                    lines.append(f'    - {p} {m} {op}{v} — {_truncate(sdesc, 80)}')
        elif table == 'materials':
            # rarity is in the header line already (see _entry_label)
            desc = e.get('description')
            if desc:
                lines.append(f'  - {_truncate(desc, 120)}')
        elif table == 'items':
            desc = e.get('description')
            if desc:
                lines.append(f'  - {_truncate(desc, 120)}')
        elif table == 'pictures':
            skill_descs = e.get('skill_descriptions') or []
            for sd in skill_descs:
                if sd:
                    lines.append(f'  - skill: {_truncate(sd, 120)}')
    lines.append('')
    return lines


def _render_removed_section(removed: list, pk: str, table: str = '',
                            context: dict | None = None) -> list[str]:
    if not removed:
        return []
    lines = [f'### 删除 ({len(removed)})', '']
    for e in sorted(removed, key=lambda x: x.get(pk) or 0):
        lines.append(f'- {_entry_label(e, pk, table, context, side="old")}')
    lines.append('')
    return lines


def _is_list_of_dicts(v) -> bool:
    return isinstance(v, list) and v and all(isinstance(x, dict) for x in v)


def _detect_subpk(items: list[dict]) -> str | None:
    """Pick a sub-PK for items in a list[dict] field. Prefer 'id'."""
    if not items: return None
    keys = items[0].keys()
    for k in ('id', 'parameter', 'name'):
        if k in keys:
            vals = [it.get(k) for it in items]
            if len(set(vals)) == len(vals) and all(v is not None for v in vals):
                return k
    return None


def _render_nested_array_diff(field: str, modified: list, pk: str,
                               table: str = '', context: dict | None = None) -> list[str]:
    """For a list[dict] field, aggregate sub-array changes across all owner entries.
    Group key = (sub_pk_val, change-signature) so identical sub-changes collapse:
       e.g., 315 weapons removing the same skill_id → ONE line listing all owner ids.
    Owner ids in the output get linked to `<table>.json#L<line>` when context is provided.
    """
    # Find sub-PK from any non-empty array
    subpk = None
    for _, oe, ne, _ in modified:
        for arr in (oe.get(field) or [], ne.get(field) or []):
            if _is_list_of_dicts(arr):
                cand = _detect_subpk(arr)
                if cand: subpk = cand; break
        if subpk: break

    # Aggregation buckets
    sub_added   = defaultdict(list)    # sub_pk_val -> [(owner_pid, sub_entry)]
    sub_removed = defaultdict(list)    # sub_pk_val -> [(owner_pid, sub_entry)]
    sub_modified = defaultdict(list)   # (sub_pk_val, sig_json) -> [(owner_pid, oi, ni)]
    fallback_lines = []                # for entries that need per-owner rendering

    for entry_pid, oe, ne, _ in modified:
        old_arr = oe.get(field) or []
        new_arr = ne.get(field) or []
        if not (_is_list_of_dicts(old_arr) or _is_list_of_dicts(new_arr)):
            fallback_lines.append(f'- {pk}={entry_pid}: (array shape not list[dict])')
            continue
        if subpk is None:
            # No usable sub-PK — fall back to index-based per-owner rendering
            fallback_lines.append(f'- {pk}={entry_pid}: (子数组无 sub-PK,按 index 对比)')
            n = max(len(old_arr), len(new_arr))
            for i in range(n):
                oi = old_arr[i] if i < len(old_arr) else None
                ni = new_arr[i] if i < len(new_arr) else None
                if oi == ni: continue
                if oi is None:
                    fallback_lines.append(f'  - sub[{i}] 新增: {_truncate(json.dumps(ni, ensure_ascii=False), 120)}')
                elif ni is None:
                    fallback_lines.append(f'  - sub[{i}] 删除: {_truncate(json.dumps(oi, ensure_ascii=False), 120)}')
                else:
                    diff_sub = sorted(f2 for f2 in (set(oi) | set(ni)) if oi.get(f2) != ni.get(f2))
                    fallback_lines.append(f'  - sub[{i}] 改:')
                    for f2 in diff_sub:
                        fallback_lines.append(f'    - `{f2}`: `{_truncate(repr(oi.get(f2)), 60)}` → `{_truncate(repr(ni.get(f2)), 60)}`')
            continue
        old_by = {it[subpk]: it for it in old_arr if subpk in it}
        new_by = {it[subpk]: it for it in new_arr if subpk in it}
        for k in new_by.keys() - old_by.keys():
            sub_added[k].append((entry_pid, new_by[k]))
        for k in old_by.keys() - new_by.keys():
            sub_removed[k].append((entry_pid, old_by[k]))
        for k in old_by.keys() & new_by.keys():
            oi, ni = old_by[k], new_by[k]
            if oi == ni: continue
            diff_pairs = []
            for f2 in sorted(set(oi) | set(ni)):
                ov, nv = oi.get(f2), ni.get(f2)
                if ov == nv: continue
                ov_k = json.dumps(ov, ensure_ascii=False, sort_keys=True) if isinstance(ov, (list, dict)) else ov
                nv_k = json.dumps(nv, ensure_ascii=False, sort_keys=True) if isinstance(nv, (list, dict)) else nv
                diff_pairs.append((f2, ov_k, nv_k))
            sig = json.dumps(diff_pairs, ensure_ascii=False, default=str)
            sub_modified[(k, sig)].append((entry_pid, oi, ni))

    if not (sub_added or sub_removed or sub_modified or fallback_lines):
        return []

    def _fmt_pids(pids):
        return _fmt_pid_list(pids, table, context, side='new')

    # weapon_skills 子项 description 反查 (skill_id → description、来自 weapon_innate_skills)
    # 只有 table='weapons' + field='weapon_skills' 时启用
    desc_map = (context or {}).get('innate_skills_desc', {}) if (table == 'weapons' and field == 'weapon_skills') else {}
    def _desc_suffix(sk_val):
        d = desc_map.get(sk_val) if isinstance(sk_val, int) else None
        return f'\n  - description: {_truncate(d, 200)}' if d else ''

    lines = []
    if sub_added:
        n_total = sum(len(v) for v in sub_added.values())
        lines.append(f'**子项新增** ({n_total} 次):')
        for sk_val, owners in sorted(sub_added.items(), key=lambda kv: (-len(kv[1]), kv[0])):
            label = (owners[0][1].get('name') or '').strip()
            pids = [p for p, _ in owners]
            label_part = f' {label}' if label else ''
            lines.append(f'- {subpk}=`{sk_val}`{label_part} — 在 {len(pids)} 个 {pk} 里新增: {_fmt_pids(pids)}{_desc_suffix(sk_val)}')
    if sub_removed:
        n_total = sum(len(v) for v in sub_removed.values())
        lines.append(f'**子项删除** ({n_total} 次):')
        for sk_val, owners in sorted(sub_removed.items(), key=lambda kv: (-len(kv[1]), kv[0])):
            label = (owners[0][1].get('name') or '').strip()
            pids = [p for p, _ in owners]
            label_part = f' {label}' if label else ''
            lines.append(f'- {subpk}=`{sk_val}`{label_part} — 从 {len(pids)} 个 {pk} 删除: {_fmt_pids(pids)}{_desc_suffix(sk_val)}')
    if sub_modified:
        n_total = sum(len(v) for v in sub_modified.values())
        lines.append(f'**子项调整** ({n_total} 次):')
        for (sk_val, sig), owners in sorted(sub_modified.items(), key=lambda kv: (-len(kv[1]), kv[0][0])):
            sample_old, sample_new = owners[0][1], owners[0][2]
            label = (sample_new.get('name') or sample_old.get('name') or '').strip()
            pids = [p for p, _, _ in owners]
            label_part = f' {label}' if label else ''
            lines.append(f'- {subpk}=`{sk_val}`{label_part}:')
            desc_old = sample_old.get('description'); desc_new = sample_new.get('description')
            if desc_old or desc_new:
                if desc_old == desc_new:
                    if desc_new:
                        lines.append(f'  - description: {_truncate(desc_new, 120)}')
                else:
                    od, nd, dnote = _line_diff_compact(desc_old or '', desc_new or '')
                    lines.append(f'  - description: {_truncate(od, 120)} → {_truncate(nd, 120)}{dnote}')
            for f2, ov_k, nv_k in json.loads(sig):
                if f2 == 'description': continue
                ov_s = _truncate(str(ov_k), 80); nv_s = _truncate(str(nv_k), 80)
                lines.append(f'  - `{f2}`: `{ov_s}` → `{nv_s}`')
            lines.append(f'  - 影响 {len(pids)} 个 {pk}: {_fmt_pids(pids)}')
    if fallback_lines:
        lines.extend(fallback_lines)
    return lines


def _render_subarray_entry_diff(field: str, old_arr: list, new_arr: list,
                                 indent: str = '  ') -> list[str]:
    """单 entry 内 list[dict] 字段的 sub-diff: 按 sub-PK 对齐、列出新增/删除/调整子项。
    子项 label = `id` + name; 调整子项列出每个变化字段 (description 走 _truncate 不 diff-chunk)。"""
    subpk = None
    for arr in (new_arr, old_arr):
        if _is_list_of_dicts(arr):
            subpk = _detect_subpk(arr)
            if subpk: break
    lines = [f'{indent}- `{field}`:']
    if subpk is None:
        # 无 sub-PK、退回整值显示
        lines.append(f'{indent}  - {_format_value(old_arr)} → {_format_value(new_arr)}')
        return lines
    old_by = {it[subpk]: it for it in (old_arr or []) if subpk in it}
    new_by = {it[subpk]: it for it in (new_arr or []) if subpk in it}
    def _sub_label(it):
        nm = (it.get('name') or '').strip()
        return f'{subpk}=`{it.get(subpk)}`' + (f' {nm}' if nm else '')
    for k in sorted(new_by.keys() - old_by.keys()):
        it = new_by[k]
        lines.append(f'{indent}  - 新增 {_sub_label(it)}')
        if it.get('description'):
            lines.append(f'{indent}    - description: {_truncate(it["description"], 200)}')
    for k in sorted(old_by.keys() - new_by.keys()):
        it = old_by[k]
        lines.append(f'{indent}  - 删除 {_sub_label(it)}')
        if it.get('description'):
            lines.append(f'{indent}    - description: {_truncate(it["description"], 200)}')
    for k in sorted(old_by.keys() & new_by.keys()):
        oi, ni = old_by[k], new_by[k]
        if oi == ni: continue
        lines.append(f'{indent}  - 调整 {_sub_label(ni)}')
        for f2 in sorted(set(oi) | set(ni)):
            ov, nv = oi.get(f2), ni.get(f2)
            if ov == nv: continue
            lines.append(f'{indent}    - `{f2}`: {_format_value(ov)} → {_format_value(nv)}')
    return lines


def _render_modified_entry_first(modified: list, pk: str, table: str,
                                  context: dict | None = None) -> list[str]:
    """Per-entry rendering: each modified entry → header `[id] [name] [rarity?]`,
    then bullet list of changed fields. No field-level aggregation across entries.
    list[dict] fields (job_skills 等) drill into per-sub-entry diff (id+name+变化字段)."""
    lines = [f'### 调整 ({len(modified)},按 {pk} 聚合)', '']
    for pid, oe, ne, diff_fields in sorted(modified, key=lambda t: t[0]):
        # Header from new (current) state; fallback to old for removed fields
        header_entry = {**oe, **ne}
        lines.append(f'- {_entry_label(header_entry, pk, table, context, side="new")}')
        for f in diff_fields:
            ov, nv = oe.get(f), ne.get(f)
            if _is_list_of_dicts(ov) or _is_list_of_dicts(nv):
                lines.extend(_render_subarray_entry_diff(f, ov or [], nv or []))
                continue
            # Multi-line string → show only differing chunk
            ov_disp, nv_disp = ov, nv
            note = ''
            if isinstance(ov, str) and isinstance(nv, str) and ('\n' in ov or '\n' in nv):
                ov_disp, nv_disp, note = _line_diff_compact(ov, nv)
            ov_s = _format_value(ov_disp); nv_s = _format_value(nv_disp)
            lines.append(f'  - `{f}`: {ov_s} → {nv_s}{note}')
    lines.append('')
    return lines


def _render_modified_section(modified: list, pk: str, table: str = '',
                              context: dict | None = None) -> list[str]:
    if not modified:
        return []
    # `materials` / `jobs` 走 entry-first 渲染 (per-entry: `[id] [name] [rarity]` header
    # + nested change list)、而非字段聚合。
    # materials: 每个 material 的 description 改动各自独立、字段聚合只会产出一墙单 id 行。
    # jobs (2026-06-10 用户决策): 按 job id 聚合、header 带 id+name+rarity、
    #   job_skills 子项 drill-in 显示 id+name+description 等变化字段。
    if table in ('materials', 'jobs'):
        return _render_modified_entry_first(modified, pk, table, context)
    lines = [f'### 调整 ({len(modified)},按字段聚合)', '']

    # Split modifications into list[dict]-field vs scalar-field (per-field decision)
    # For a given field, if ALL modified entries' value (old or new) is list[dict],
    # we treat it as nested and drill in. Otherwise fall back to aggregate-by-value.
    nested_fields = set()
    by_field_entries: dict[str, list] = defaultdict(list)
    for pid, oe, ne, diff_fields in modified:
        for f in diff_fields:
            by_field_entries[f].append((pid, oe, ne, diff_fields))
            ov = oe.get(f); nv = ne.get(f)
            if _is_list_of_dicts(ov) or _is_list_of_dicts(nv):
                nested_fields.add(f)

    # Render: nested-list fields first (more useful detail), then scalar by-value aggregation
    agg = _aggregate_modified(modified, pk)

    # Sort fields by entries-touched count desc
    ordered_fields = sorted(
        agg.keys(),
        key=lambda f: -sum(len(v) for v in agg[f].values())
    )

    for field in ordered_fields:
        change_groups = agg[field]
        total = sum(len(v) for v in change_groups.values())
        lines.append(f'#### `{field}` ({total} 个)')
        if field in nested_fields:
            nested_lines = _render_nested_array_diff(field, by_field_entries[field], pk, table, context)
            if nested_lines:
                lines.extend(nested_lines)
            else:
                lines.append(f'- (list[dict] 字段差异,但 sub-diff 为空 — 检查 JSON)')
            lines.append('')
            continue
        for (ov, nv), ids in sorted(change_groups.items(), key=lambda kv: -len(kv[1])):
            ov_disp = json.loads(ov) if isinstance(ov, str) and ov.startswith(('[', '{')) else ov
            nv_disp = json.loads(nv) if isinstance(nv, str) and nv.startswith(('[', '{')) else nv
            ov_disp, nv_disp, note = _line_diff_compact(ov_disp, nv_disp)
            ov_s = _format_value(ov_disp); nv_s = _format_value(nv_disp)
            ids_str = _fmt_pid_list(ids, table, context, side='new')
            lines.append(f'- {ov_s} → {nv_s}: ids = {ids_str}{note}')
        lines.append('')
    return lines


def _detect_subpk_or_id(entries: list) -> str | None:
    """Same as _detect_pk but for derived tables (dict-keyed json maps).
    Derived tables (weapon_innate_skills etc.) are stored as
    {str(id): info, ...} not as a list. Caller handles that branch separately."""
    return None


def diff_folders(old_dir: Path, new_dir: Path) -> str:
    """Compute changelog markdown for old_dir → new_dir.
    Returns '' if no diff at all (across all tables)."""
    old_tables = _list_tables(old_dir)
    new_tables = _list_tables(new_dir)
    old_index = _load_index(old_dir)
    new_index = _load_index(new_dir)

    # Bundle cross-table lookup context (weapons base_name + enums)
    context = _build_context(old_dir, new_dir)

    # 跳过 derived 表的 diff (weapon_innate_skills 等都是从 weapons.json 派生、
    # 它们的"变化"在 weapons.weapon_skills 已展示、changelog 里再列只是冗余噪声)
    common_names = sorted((set(old_tables) & set(new_tables)) - DERIVED_TABLES)
    # Sort by priority
    def _sort_key(t):
        try: return TABLE_PRIORITY.index(t)
        except ValueError: return len(TABLE_PRIORITY) + 1
    common_names.sort(key=_sort_key)

    # Per-table diff
    per_table = {}   # name -> (pk, added, removed, modified)
    summary_rows = []
    for t in common_names:
        old_entries = _load(old_tables[t])
        new_entries = _load(new_tables[t])

        # Derived tables (weapon_innate_skills etc.) are dict-shaped {str_id: info}.
        # Normalize to list-of-dicts by injecting the key as 'id' field.
        if isinstance(old_entries, dict) and isinstance(new_entries, dict):
            old_list = [{'id': int(k) if k.lstrip('-').isdigit() else k, **v}
                        for k, v in old_entries.items()]
            new_list = [{'id': int(k) if k.lstrip('-').isdigit() else k, **v}
                        for k, v in new_entries.items()]
            old_entries, new_entries = old_list, new_list

        if not isinstance(old_entries, list) or not isinstance(new_entries, list):
            continue
        # PK detection
        idx_hint = (new_index.get(t) or old_index.get(t) or {}).get('sample_keys') or []
        pk_hint = idx_hint[0] if idx_hint else None
        pk = _detect_pk(new_entries or old_entries, pk_hint)
        if pk is None:
            # No PK — fall back to raw set diff
            ok = json.dumps(old_entries, ensure_ascii=False, sort_keys=True)
            nk = json.dumps(new_entries, ensure_ascii=False, sort_keys=True)
            if ok != nk:
                summary_rows.append((t, '?', '?', '?'))
                per_table[t] = (None, [], [], [('whole-table', old_entries, new_entries, ['<full>'])])
            continue
        added, removed, modified = _diff_table(old_entries, new_entries, pk)
        if added or removed or modified:
            summary_rows.append((t, len(added), len(removed), len(modified)))
            per_table[t] = (pk, added, removed, modified)

    # Asymmetric derived skip notice (only when one folder missing derived files)
    skipped_derived = sorted(
        (DERIVED_TABLES - set(old_tables)) | (DERIVED_TABLES - set(new_tables))
    )
    # Only worth mentioning if the missing files were derived (not in common)
    skipped_derived = [d for d in skipped_derived if d not in (set(old_tables) & set(new_tables))]

    if not summary_rows:
        return ''

    # Render markdown
    out = []
    out.append(f'# master_data changelog: {old_dir.name} → {new_dir.name}')
    out.append('')
    out.append('## 总览')
    out.append('')
    out.append('| 表 | 新增 | 删除 | 调整 |')
    out.append('|---|---:|---:|---:|')
    for t, a, r, m in summary_rows:
        out.append(f'| {t} | {a} | {r} | {m} |')
    out.append('')

    # Detail per table
    for t, _, _, _ in summary_rows:
        pk, added, removed, modified = per_table[t]
        out.append(f'## {t}')
        out.append('')
        if pk is None:
            out.append('(table without primary key — full-table differs;use diff tool手动比较 raw JSON)')
            out.append('')
            continue
        out.extend(_render_added_section(t, added, pk, context))
        out.extend(_render_removed_section(removed, pk, t, context))
        out.extend(_render_modified_section(modified, pk, t, context))

    # Derived note
    if skipped_derived:
        out.append('---')
        out.append('')
        out.append('★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):')
        for d in skipped_derived:
            out.append(f'- `{d}.json`')
        out.append('')

    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser(description='Diff two master_tables/<date>/ folders → changelog markdown')
    ap.add_argument('old_date', help='Older folder name (e.g. 2026_05_23)')
    ap.add_argument('new_date', help='Newer folder name (e.g. 2026_06_03)')
    ap.add_argument('--root', default='master_tables', help='Root dir (default: master_tables)')
    ap.add_argument('--out', help='Output markdown path (default: stdout)')
    args = ap.parse_args()

    root = Path(args.root)
    old_dir = root / args.old_date
    new_dir = root / args.new_date
    if not old_dir.is_dir():
        print(f'ERR: {old_dir} not found', file=sys.stderr); sys.exit(2)
    if not new_dir.is_dir():
        print(f'ERR: {new_dir} not found', file=sys.stderr); sys.exit(2)
    md = diff_folders(old_dir, new_dir)
    if not md:
        print(f'(no diff between {args.old_date} and {args.new_date})', file=sys.stderr)
        sys.exit(0)
    if args.out:
        Path(args.out).write_text(md, encoding='utf-8')
        print(f'wrote {args.out} ({len(md)} chars)', file=sys.stderr)
    else:
        sys.stdout.reconfigure(encoding='utf-8')
        print(md)


if __name__ == '__main__':
    main()
