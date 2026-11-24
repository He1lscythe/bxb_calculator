# 伝承ボーナス → data/transmit_bonus.json (对称矩阵只存下三角;rows[i] = base+i 对 base..base+i,一格一个 62 进制字符)
# 格值:0 = 无 bonus / 空号 / 自身,1 = 未測,2+ = enum[v-2] (enum[0] = 同型因子、新名字只追加)
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
DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
NONE, UNTESTED = 0, 1


def load_shots(p):
    if not p.is_file():
        return [], set()
    out, none = [], set()
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip():
            s = json.loads(line)
            f, t = s.get("from_base_id"), s.get("to_base_id")
            if not (f and t):
                continue
            if s.get("bonus_name"):
                out.append((f, t, s["bonus_name"]))
            else:
                none.add((f, t))
    return out, none


def key(a, b):
    return (a, b) if a < b else (b, a)


def prev_enum(p):
    try:
        old = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return old.get("enum") or [] if isinstance(old, dict) and "rows" in old else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--awaken-db", type=Path, default=AWAKEN_DB)
    ap.add_argument("--shots", type=Path, default=SHOTS)
    args = ap.parse_args()

    db = json.loads(args.awaken_db.read_text(encoding="utf-8"))
    shots, shot_none = load_shots(args.shots)
    tested = {(int(f), t) for f, ts in db["tested"].items() for t in ts} | shot_none
    measured = [(b["from_base_id"], b["to_base_id"], b["bonus_name"]) for b in db["bonus_pairs"]]

    chara = {c["id"]: c for c in json.loads((DATA / "characters.json").read_text(encoding="utf-8"))}
    rev_p = DATA / "chara_revise.json"
    rev = {r["id"]: r for r in json.loads(rev_p.read_text(encoding="utf-8"))} if rev_p.is_file() else {}
    sources = {f for f, _ in tested} | {f for f, _, _ in shots}

    def can_source(b):
        acq = (rev.get(b) or {}).get("acquisition") or {}
        return b in sources or bool(GACHA_KEYS & set(acq))

    # bonus 双向一致 → 实测 / 截图任一方向测过 = 这一对已确认
    conf = {key(f, t) for f, t in tested} | {key(f, t) for f, t, _ in shots}
    bonus, clash = {}, 0
    for f, t, n in measured + shots:
        k = key(f, t)
        if bonus.setdefault(k, n) != n:
            clash += 1
    direct = len(bonus)

    # 系列 bonus 有传递性 → 同系列成员两两补齐 (= 推定);同型因子不递推、同属多个系列取一个名字
    groups = defaultdict(set)
    for k, n in bonus.items():
        if n != SAME:
            groups[n].update(k)
    cand = defaultdict(set)
    for n, ms in groups.items():
        for a in ms:
            for b in ms:
                k = (a, b)
                if a < b and k not in bonus and k not in conf and (can_source(a) or can_source(b)):
                    cand[k].add(n)
    for k, ns in cand.items():
        bonus[k] = min(ns)
    inferred = sorted(cand)

    first = {}
    for (a, _), n in bonus.items():
        first[n] = min(first.get(n, a), a)
    enum = prev_enum(OUT) or [SAME]
    assert enum[0] == SAME, enum
    enum += [n for n in sorted(first, key=lambda n: (first[n], n)) if n not in enum]
    if len(enum) + 2 > len(DIGITS):
        sys.exit(f"bonus 名 {len(enum)} 种、超过 {len(DIGITS) - 2}")
    val = {k: enum.index(n) + 2 for k, n in bonus.items()}

    ids = set(chara)
    base, top = min(ids), max(ids)
    rows, cnt = [], defaultdict(int)
    for i in range(top - base + 1):
        a = base + i
        r = []
        for j in range(i + 1):
            b = base + j
            if a == b or a not in ids or b not in ids:
                v = NONE
            else:
                k = (b, a)
                v = val.get(k, NONE if k in conf else UNTESTED)
                cnt[min(v, 2)] += 1
            r.append(DIGITS[v])
        rows.append("".join(r))

    srcs = sorted(b for b in ids if can_source(b))
    enc = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    lines = ["{", f' "base": {base},', f' "enum": {enc(enum)},', f' "sources": {enc(srcs)},',
             f' "inferred": {enc([list(k) for k in inferred])},', ' "rows": [']
    lines += [f'  "{r}"' + ("," if i < len(rows) - 1 else "") for i, r in enumerate(rows)]
    lines += [" ]", "}"]
    OUT.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))
    print(f"实测 {len(measured)} / 截图 {len(shots)} (无 bonus {len(shot_none)}) → 已确认 {len(conf)} 对;"
          f"bonus {direct} 对 + 推定 {len(inferred)} 对 (名字冲突 {clash});"
          f"格 なし {cnt[0]} / 未測 {cnt[1]} / bonus {cnt[2]};伝承元 {len(srcs)} 把、bonus {len(enum)} 种 → {OUT}")


if __name__ == "__main__":
    main()
