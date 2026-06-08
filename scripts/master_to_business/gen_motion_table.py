"""gen_motion_table.py — characters.json → docs/motion_table.md

按 state 平展统计 attack_motion_name 出现数。出現数 ≤ 4 时列魔剑名 (去重)。

用法: python scripts/master_to_business/gen_motion_table.py
"""
import json
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SRC = PROJECT_ROOT / "data" / "characters.json"
OUT = PROJECT_ROOT / "docs" / "motion_table.md"


def main():
    charas = json.loads(SRC.read_text(encoding="utf-8"))
    motion_to_charas = defaultdict(list)
    for c in charas:
        cname = c.get("name") or f"id{c.get('id')}"
        for s in c.get("states", {}).values():
            mname = s.get("attack_motion_name")
            if mname:
                motion_to_charas[mname].append(cname)

    rows = sorted(motion_to_charas.items(), key=lambda kv: (-len(kv[1]), kv[0]))

    lines = [
        "# モーション 一覧",
        "",
        "| モーション | 出現数 | 魔剣名（出現数≤4のみ）|",
        "|-----------|--------|----------------------|",
    ]
    for mname, names in rows:
        n = len(names)
        shown = ""
        if n <= 4:
            uniq = []
            seen = set()
            for x in names:
                if x not in seen:
                    seen.add(x)
                    uniq.append(x)
            shown = "、".join(uniq)
        lines.append(f"| {mname} | {n} | {shown} |")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} motion → {OUT}")


if __name__ == "__main__":
    main()
