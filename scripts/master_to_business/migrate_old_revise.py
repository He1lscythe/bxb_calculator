"""One-shot init: 创建 v2 *_revise.json 空文件 (Phase 7 Session 1)

Phase 7 Session 1 scope:
- crystal_revise.json 由 build_crystals.py 生成 (含 max_value 等 server-fold 字段、master 不再含)
- chara_revise.json / soul_revise.json / masou_revise.json 留空 array、Phase 7 Session 2+ user 编辑后才有数据

注: build_characters.py 已经把 value_scaling 合进 master.weapon_skills[].value_scaling
    (Phase 2.0 _wiki_aux.json chara_skill_value_scaling 直接 bake 进 master)、
    不归 revise 管。masou_value_scaling 同样、_wiki_aux.json 该字段空、留 Session 2/3 改 build_characters/masou.py
    时统一决策 (master 含 vs revise 含)。

跑一次、不重跑、产物提交进 data-staging branch。
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, 'data')


def _write_json(path: str, obj: Any) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write('\n')


def ensure_empty_revise(filename: str) -> None:
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        # 如果是 v1 旧 schema 留下的数据、Phase 7 plan 明确"全弃"、覆盖成空
        # 真正用户编辑的 v2 数据从空开始
        try:
            with open(path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            if isinstance(existing, list) and len(existing) > 0:
                print(f'[ensure_empty_revise] {path} 内有 {len(existing)} 项旧数据、覆盖成空 array')
        except Exception:
            pass
    _write_json(path, [])
    print(f'[ensure_empty_revise] 写入 → {path}')


def main() -> int:
    # crystal_revise.json 由 build_crystals.py 单独生成、这里不动
    ensure_empty_revise('chara_revise.json')
    ensure_empty_revise('soul_revise.json')
    ensure_empty_revise('masou_revise.json')
    print()
    print('完成。crystal_revise.json 由 build_crystals.py 生成、跑:')
    print('  python scripts/master_to_business/build_crystals.py')
    return 0


if __name__ == '__main__':
    sys.exit(main())
