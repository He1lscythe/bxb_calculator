import argparse, json, os, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--master-dir', default=os.environ.get('BXB_MASTER_TABLES', ''))
    ap.add_argument('--snapshot-dir', default='')
    ap.add_argument('--old', default='')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    if a.snapshot_dir:
        snap_dir = Path(a.snapshot_dir)
    else:
        md = Path(a.master_dir) / 'master_data'
        snaps = sorted((p for p in md.iterdir() if p.is_dir()), key=lambda p: p.name) if md.is_dir() else []
        if not snaps:
            print(f'::error::{md} 无快照')
            return 1
        snap_dir = snaps[-1]

    wp = snap_dir / 'weapons.json'
    if not wp.exists():
        print(f'::error::缺 {wp}')
        return 1
    weapons = json.loads(wp.read_text(encoding='utf-8'))
    # 一把魔剑有多个进化形态(id=base_id*100+n),按 base_id 去重
    ids = sorted({x['base_id'] for x in weapons if x.get('rarity') == 4})

    old = []
    if a.old and Path(a.old).exists():
        old = json.loads(Path(a.old).read_text(encoding='utf-8')).get('base_ids') or []
    added, gone = sorted(set(ids) - set(old)), sorted(set(old) - set(ids))
    print(f'{snap_dir.name}: rarity4 {len(ids)} 个(旧 {len(old)})  新增={added}  消失={gone}')

    if gone and not added:
        print(f'::warning::rarity4 只减少不新增 {gone} → 不更新,人工确认')
        return 0
    if not added:
        return 0

    names = {x['base_id']: x.get('name') for x in weapons
             if x['base_id'] in set(added) and x.get('evolve_count') == 0}
    print('::notice::新 rarity4:' + ', '.join(f'{b} {names.get(b) or ""}'.strip() for b in added))
    Path(a.out).write_text(json.dumps(
        {'source': f'master_tables/master_data/{snap_dir.name}/weapons.json',
         'snapshot': snap_dir.name, 'rarity': 4, 'count': len(ids), 'base_ids': ids},
        ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
