"""build_masou_aux.py — masou.json → 注入 effects[].range 进 masou_revise

后处理脚本、跑在 build_masou.py 之后。跟 build_crystal_aux.py 同一套模式:
从 master 的文本字段推出结构化的 range 字段、写进 *_revise.json,发现漏判就改规则重跑。

背景: masou (weapon_costumes) 的 effect **没有 range 字段** —— masou.json 1200 条 effect
全都只有 {parameter, math_type, value, value_scaling, effect_text}。而 stats-calc.js
_effectApplies 只拦 range==='Single'、undefined 一路放行,所以不兜底就是全队生效。
魔装是穿在单把魔剣上的外观装备、effect_text 绝大多数是「攻撃力5%UP」这种不带范围词的裸描述
(1200 条里 1183 条如此) = 自身。所以:
  - stats-calc.js 侧把 masou 缺省兜底成 'Single' (自身)
  - 本脚本把真正全队的那些注入 range='All'

判定规则: effect_text NFKC 归一化后含「味方全体」→ range='All'。
  实测命中 11 条、集中在 3 件魔王装 (1494704 / 1502704 / 1570704)。
  「自身の…」那 6 条不写 (缺省已是 Single、保持 revise 最小)。
  「全属性」「パーティ」「チーム」在 masou 文本里 0 命中,不入规则。

⚠ masou effects 无 id (parameter 也不保证唯一) → revise-core deepApply 对它是**整组替换**
  (revise-core.js:147)。所以本脚本写回时必须输出完整 effects 数组,且**以已有 revise 的
  effects 为基**(若存在) —— 那里面有人工编辑过的 value_scaling,不能被 master 覆盖。
  按 index 对应前会先校验 parameter 序列跟 master 一致,不一致则跳过该件并告警。

用法: python scripts/master_to_business/build_masou_aux.py
"""
import json
import sys
import unicodedata
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
MASTER = DATA_DIR / "masou.json"
REVISE = DATA_DIR / "masou_revise.json"

# effect_text 含这些词 → 该 effect 是全队 (range='All')
ALL_RANGE_KEYWORDS = ("味方全体",)


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "")


def is_team_wide(effect) -> bool:
    text = _norm(effect.get("effect_text"))
    return any(kw in text for kw in ALL_RANGE_KEYWORDS)


def main():
    if not MASTER.is_file():
        print(f"ERR: {MASTER} not found", file=sys.stderr)
        sys.exit(1)
    master = json.loads(MASTER.read_text(encoding="utf-8"))
    revise = json.loads(REVISE.read_text(encoding="utf-8")) if REVISE.is_file() else []
    revise_by_id = {e["id"]: e for e in revise if "id" in e}

    n_all = 0        # 新注入 / 保持的 range='All' effect 条数
    n_cleared = 0    # 清掉的过期 range 条数
    n_touched = 0    # 实际改动的 masou 件数
    misaligned = []  # revise.effects 跟 master 对不上的、跳过

    for m in master:
        mid = m.get("id")
        master_effects = m.get("effects") or []
        patch = revise_by_id.get(mid)

        want_all = [i for i, e in enumerate(master_effects) if is_team_wide(e)]
        has_patch_effects = bool(patch and isinstance(patch.get("effects"), list))

        # 既不需要 All、也没有既存 patch.effects 可清理 → 不建 placeholder
        if not want_all and not has_patch_effects:
            continue

        if has_patch_effects:
            base = patch["effects"]
            # 无 id 数组只能按 index 对应 → 先校验 parameter 序列一致
            if [e.get("parameter") for e in base] != [e.get("parameter") for e in master_effects]:
                misaligned.append((mid, m.get("name")))
                continue
            new_effects = [dict(e) for e in base]
        else:
            new_effects = [dict(e) for e in master_effects]

        changed = False
        for i, e in enumerate(new_effects):
            if i in want_all:
                if e.get("range") != "All":
                    e["range"] = "All"
                    changed = True
                n_all += 1
            elif "range" in e:
                del e["range"]
                n_cleared += 1
                changed = True

        if not changed:
            continue
        n_touched += 1
        if patch is None:
            patch = {"id": mid, "name": m.get("name") or ""}
            revise_by_id[mid] = patch
        patch["effects"] = new_effects

    # 收尾跟 build_crystal_aux 一致: 按 master 顺序重排、保留 orphan、prune 空 placeholder
    seen_ids = {m["id"] for m in master}
    new_revise = [revise_by_id[m["id"]] for m in master if m["id"] in revise_by_id]
    orphans = [e for e in revise if e.get("id") not in seen_ids]
    new_revise.extend(orphans)
    new_revise = [p for p in new_revise if any(k not in ("id", "name") for k in p)]

    # newline="\n" 显式指定: 仓库里 revise 都是 LF、Windows 上不加这个会写出 CRLF、
    # 让本地 git diff 出现无意义的全文件行尾噪音 (CI 跑在 ubuntu 上无此问题)
    REVISE.write_text(
        json.dumps(new_revise, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print("OK: masou_revise updated.")
    print(f"    range='All' effects: {n_all}")
    print(f"    stale range cleared: {n_cleared}")
    print(f"    masou entries touched: {n_touched}")
    if misaligned:
        print(f"    ⚠ effects 跟 master 对不上、跳过 ({len(misaligned)} 件):")
        for mid, name in misaligned:
            print(f"      id={mid} name={name!r}")
    print(f"    total revise entries: {len(new_revise)} (orphans kept: {len(orphans)})")


if __name__ == "__main__":
    main()
