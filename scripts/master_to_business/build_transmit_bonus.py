# 伝承ボーナス → data/transmit_bonus.json ({伝承先 base_id: {bonus 名: [伝承元 base_id]}})
# 本地跑、不进 CI:python scripts/master_to_business/build_transmit_bonus.py
import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import PROJECT_ROOT, BXB_ROOT, ASSETS_DIR  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

DATA = PROJECT_ROOT / "data"
OUT = DATA / "transmit_bonus.json"
AWAKEN_DB = Path(os.environ.get("BXB_AWAKEN_DB") or (BXB_ROOT / "bxb_cli" / "data" / "awaken_db.json"))
SHOTS = ASSETS_DIR / "data" / "awaken_screenshots" / "shots.jsonl"
# 能当伝承元 = 抽卡出的
GACHA_KEYS = {"ガチャ", "期間限定製造", "期間限定ガチャ"}
SAME = "同型因子"


def load_shots(p):
    if not p.is_file():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip():
            s = json.loads(line)
            if s.get("bonus_name") and s.get("from_base_id") and s.get("to_base_id"):
                out.append((s["from_base_id"], s["to_base_id"], s["bonus_name"]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--awaken-db", type=Path, default=AWAKEN_DB)
    ap.add_argument("--shots", type=Path, default=SHOTS)
    args = ap.parse_args()

    db = json.loads(args.awaken_db.read_text(encoding="utf-8"))
    tested = {(int(f), t) for f, ts in db["tested"].items() for t in ts}
    measured = [(b["from_base_id"], b["to_base_id"], b["bonus_name"]) for b in db["bonus_pairs"]]
    shots = load_shots(args.shots)

    chara = {c["id"]: c for c in json.loads((DATA / "characters.json").read_text(encoding="utf-8"))}
    rev_p = DATA / "chara_revise.json"
    rev = {r["id"]: r for r in json.loads(rev_p.read_text(encoding="utf-8"))} if rev_p.is_file() else {}
    sources = {f for f, _ in tested} | {f for f, _, _ in shots}

    def can_source(b):
        acq = (rev.get(b) or {}).get("acquisition") or {}
        return b in sources or bool(GACHA_KEYS & set(acq))

    pairs = {}
    for f, t, n in measured + shots:
        pairs.setdefault((f, t), n)
    direct = len(pairs)
    # bonus 双向一致 → 反推;反方向实测过 (无 bonus) 的不推
    for (f, t), n in list(pairs.items()):
        if (t, f) not in pairs and (t, f) not in tested and can_source(t):
            pairs[(t, f)] = n
    sym = len(pairs) - direct

    # 系列 bonus 有传递性 → 同系列成员两两补齐;同型因子不递推
    groups = defaultdict(set)
    for (f, t), n in pairs.items():
        if n != SAME:
            groups[n].update((f, t))
    known = set(pairs) | tested
    cand = defaultdict(set)
    for n, ms in groups.items():
        for f in ms:
            if not can_source(f):
                continue
            for t in ms:
                if f != t and (f, t) not in known and (t, f) not in known:
                    cand[(f, t)].add(n)
    # 同属多个系列 → 都是 −1、取一个展示
    for k, ns in cand.items():
        pairs[k] = min(ns)
    closure = len(cand)

    by = defaultdict(lambda: defaultdict(list))
    for (f, t), n in pairs.items():
        if f in chara and t in chara:
            by[t][n].append(f)
    rank = lambda b: (-(chara[b].get("rarity") or 0), b)  # noqa: E731
    out = {str(t): {n: sorted(fs, key=rank) for n, fs in sorted(g.items())} for t, g in sorted(by.items())}
    OUT.write_bytes((json.dumps(out, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))
    print(f"实测 {len(measured)} / 截图 {len(shots)} → 直接 {direct} 对 + 反推 {sym} 对 + 系列补齐 {closure} 对;"
          f"伝承先 {len(out)} 把 / bonus {len({n for _, _, n in measured + shots})} 种 → {OUT}")


if __name__ == "__main__":
    main()
