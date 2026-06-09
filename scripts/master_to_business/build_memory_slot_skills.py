"""build_memory_slot_skills.py — 从 HouseTop response + omoide 反查 memory_slot 技能字典。

迁自 unpacking/draft/build_skill_id_index.py 内 memory_slot 段 (用户决策 2026-06-09、
脚本搬 bxb_wiki/scripts/master_to_business/)。

数据 chain:
  HouseTop response (Frida hook 抓的) → memory_slot 内 weapon_skills → 反查表
  优先级 source:
    (a) unpacking/draft/out/account/house_tops.json (cross-repo、Frida 累计 batch)
    (b) unpacking/draft/out/maken2_decoded* 内 *_resp.json (cross-repo、单 HouseTop response)
    (c) bxb_wiki/data/omoide/<base_id>.json (629 个、Phase 6.7 已抓)

输出: bxb_wiki/data/_memory_slot_skills.json
  { skill_id_str: { name, parameter, math_type, value, category_for_memory_slot, description } }

用法: python scripts/master_to_business/build_memory_slot_skills.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BXB_ROOT = PROJECT_ROOT.parent
UNPACKING = BXB_ROOT / "unpacking"

OUT = PROJECT_ROOT / "data" / "_memory_slot_skills.json"
OMOIDE_DIR = PROJECT_ROOT / "data" / "omoide"


def walk_slots(obj):
    """Yield each user_weapon_memory_slot from heterogeneous source shapes."""
    if isinstance(obj, list):
        for x in obj:
            yield from walk_slots(x)
        return
    if not isinstance(obj, dict):
        return
    # aggregated shape: {'slots': [...]}
    if 'slots' in obj and isinstance(obj['slots'], list):
        for s in obj['slots']:
            yield s
        return
    # raw HouseTop shape
    if 'user_weapon_memory_slots' in obj:
        for s in obj['user_weapon_memory_slots']:
            yield s


def collect_sources():
    sources = []
    # (a) aggregated house_tops.json
    ht_path = UNPACKING / 'draft' / 'out' / 'account' / 'house_tops.json'
    if ht_path.is_file():
        sources.append((str(ht_path), json.loads(ht_path.read_text(encoding='utf-8'))))

    # (b) 个別 HouseTop in maken2_decoded_jiend / maken2_decoded
    for d in (UNPACKING / 'draft' / 'out' / 'maken2_decoded_jiend',
              UNPACKING / 'draft' / 'out' / 'maken2_decoded'):
        if d.is_dir():
            for jf in d.glob('*_resp.json'):
                try:
                    j = json.loads(jf.read_text(encoding='utf-8'))
                except Exception:
                    continue
                if isinstance(j.get('user_weapon'), dict) and 'user_weapon_memory_slots' in j:
                    sources.append((str(jf), j))

    # (c) bxb_wiki/data/omoide/<base_id>.json
    if OMOIDE_DIR.is_dir():
        for jf in sorted(OMOIDE_DIR.glob('*.json')):
            try:
                j = json.loads(jf.read_text(encoding='utf-8'))
            except Exception:
                continue
            if 'slots' in j and isinstance(j['slots'], list):
                sources.append((f'omoide/{jf.name}', j))

    return sources


def build():
    sources = collect_sources()
    mem = {}
    for sname, src in sources:
        for slot in walk_slots(src):
            ms = slot.get('memory_slot') or {}
            for sk in (ms.get('weapon_skills') or []):
                sid = sk.get('id')
                if sid is None:
                    continue
                if sid not in mem:
                    mem[sid] = {
                        'name': sk.get('name'),
                        'parameter': sk.get('parameter'),
                        'math_type': sk.get('math_type'),
                        'value': sk.get('value'),
                        'category_for_memory_slot': sk.get('category_for_memory_slot'),
                        'description': sk.get('description'),
                    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({str(k): v for k, v in sorted(mem.items())},
                   ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    print(f'-> {OUT}  ({len(mem)} unique skill ids, scanned {len(sources)} HouseTop sources)')
    if mem:
        keys = sorted(mem.keys())
        print(f'   id range: {keys[0]} .. {keys[-1]}')


if __name__ == '__main__':
    build()
