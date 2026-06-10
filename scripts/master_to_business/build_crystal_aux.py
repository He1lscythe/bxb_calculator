"""build_crystal_aux.py — crystals.json + characters.json → 注入 range / chara_base_id 进 crystal_revise

后处理脚本、跑在 build_crystals.py 之后:
- range: master.description 含 "同装備セット" → revise patch 加 "range": "All" (缺省 Single 不写)
- chara_base_id: master.name 含 "の純真記憶" / "の秘録記憶" → 提取前缀、查 characters.json:
    1. NFKC + ･→・ 后 exact name 匹配 → 取 chara id
    2. 否则查下面 CHARA_LIMIT_ID_OVERRIDE 表 (substring 多候选 + nickname 缩写都人工映射)
    3. 仍命不中 → 不写 chara_base_id (hensei 不 gate、effect 照算)

不覆盖现有 revise 字段 (max_value / M_L_max 等)、只 merge 新字段。
hensei stats-calc 装备时按 chara_base_id 跟 targetChara._master.id 严格相等比对、不对则 effect 不生效。

用法: python scripts/master_to_business/build_crystal_aux.py
"""
import json
import sys
import unicodedata
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
MASTER = DATA_DIR / "crystals.json"
REVISE = DATA_DIR / "crystal_revise.json"
CHARA = DATA_DIR / "characters.json"


# 不能 NFKC 完整匹配 characters.json name 的 crystal prefix → chara_base_id
# (24 单候选 substring + 8 多候选 substring 用户决策 + 9 nickname/缩写)
CHARA_LIMIT_ID_OVERRIDE = {
    # 24 单候选 (substring 唯一命中 chara、自动反查)
    "アコ": 1541,                   # 丑王アコ
    "アマテラス": 1176,             # 神皇天叢雲=アマテラス
    "アマノムラクモ": 1177,         # 神剣アマノムラクモ
    "エレボス": 1559,               # 神淵エレボス
    "オルタ=ロスト": 1553,          # 聖女グラム=オルタ=ロスト
    "カモミール": 1597,             # 清香のカモミール
    "クランラナルド": 1019,         # クランラナルド紅書
    "グラム×サンタ": 1360,          # 偽剣グラム×サンタ
    "サクラメント": 1517,           # 天煌の焔サクラメント
    "サフラン": 1125,               # サフラン色の死
    "ザッハトルテ": 1502,           # 神菓王ザッハトルテ
    "ターフェアイト": 1392,         # 輝剣ターフェアイト
    "ダミー": 1621,                 # ダミーあああああ文字数本当にここまで
    "ティンダロス": 1097,           # ティンダロスの猟犬
    "テスト": 1549,                 # テストあああああ文字数ここまで
    "トリガー": 1427,               # レヴァンテイン=トリガー
    "ドルシネア": 1536,             # 騎典姫ドルシネア
    "ハデス=ロスト": 1564,          # 天冥杖ハデス=ロスト
    "マカブイン×ソウ": 1435,        # 血剣マカブイン×ソウ
    "ミラ=ロスト": 1510,            # バハムート=ミラ=ロスト
    "ユートピア": 1303,             # 災厄の理想郷ユートピア
    "レイバー": 1490,               # レイバーインヴェスティ
    "向日葵": 1453,                 # 災厄を照らす向日葵
    "禁式・数珠丸": 1405,           # 禁式・数珠丸恒次
    # 8 多候选 substring (用户 2026-06-10 决策)
    "オルタ": 1180,                 # 魔劍グラム=オルタ
    "グラム": 1181,                 # 魔剣グラム
    "ハデス": 1493,                 # 天冥杖ハデス
    "フレア": 1362,                 # ヴァルプルギス=フレア
    "マカブイン": 1226,             # 秘剣マカブイン
    "白櫃": 1570,                   # 麒麟円文螺鈿白櫃
    "ヘル": 1001,                   # レヴァンテイン=ヘル
    "ソル": 1402,                   # ダインスレイフ=ソル
    # 9 nickname/缩写 (NFKC + substring 都命不中)
    "IMTロール": 1441,              # イミティション=ロール
    "IMTアリス": 1489,              # イミティション=アリス
    "IMTロール=サンタ=ピュア": 1498, # イミティション=ロール=サンタ=ピュア (bg 也用)
    "IMT=アリス=PL": 1568,          # イミティション=アリス=ピュア=ロスト
    "エクス≠ロスト": 1563,          # 偽聖剣エクスカリバー≠ロスト
    "せし子": 1583,                 # †邪なる堕天せし者†
    "ごくひらロスト": 1509,         # 禁式・獄刀大包平=ロスト
    "しょこら": 1578,               # 仙刀フツノミタマ=小怺
    "すーたん": 1409,               # 水遁風魔手裏剣
    # bg 专用 (crystals 不出现)
    "月影": 1527,                   # 禁式･三日月宗近=月影 (bg 4015 [月影のみ])
}


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s).replace("･", "・")


def build_chara_name_to_id(chara_list):
    """characters.json → {NFKC normalized name: master id} 表"""
    out = {}
    for c in chara_list:
        nm = c.get("name") or ""
        cid = (c.get("_master") or {}).get("id") or c.get("id")
        if nm and cid is not None:
            out[_norm(nm)] = cid
    return out


def resolve_chara_base_id(pfx: str, name_to_id: dict):
    """prefix → chara_base_id (int) 或 None。
    1. NFKC exact 比对 characters.json
    2. CHARA_LIMIT_ID_OVERRIDE 查表 (人工映射的 substring + nickname)
    3. 仍命不中 → None
    """
    nfx = _norm(pfx)
    iid = name_to_id.get(nfx)
    if iid is not None:
        return iid
    return CHARA_LIMIT_ID_OVERRIDE.get(nfx)


def _extract_chara_pfx(name: str):
    """name 'X の純真記憶・Y' → 'X' (含 練刀･ 前缀的不剥)"""
    for kw in ("の純真記憶", "の秘録記憶"):
        if kw in name:
            return name.split(kw)[0]
    return None


def main():
    if not MASTER.is_file():
        print(f"ERR: {MASTER} not found", file=sys.stderr)
        sys.exit(1)
    if not CHARA.is_file():
        print(f"ERR: {CHARA} not found", file=sys.stderr)
        sys.exit(1)
    master = json.loads(MASTER.read_text(encoding="utf-8"))
    chara_list = json.loads(CHARA.read_text(encoding="utf-8"))
    name_to_id = build_chara_name_to_id(chara_list)
    revise = json.loads(REVISE.read_text(encoding="utf-8")) if REVISE.is_file() else []
    revise_by_id = {e["id"]: e for e in revise if "id" in e}

    n_range = 0
    n_chara = 0
    n_chara_skip = 0
    unresolved_samples = []

    for m in master:
        mid = m.get("id")
        desc = m.get("description") or ""
        name = m.get("name") or ""

        patch = revise_by_id.get(mid)
        if patch is None:
            patch = {"id": mid, "name": name}
            revise_by_id[mid] = patch

        # 兼旧 schema: 清掉之前可能写的 chara_limit (string 字段)、统一走 chara_base_id (int)
        if "chara_limit" in patch:
            del patch["chara_limit"]

        # range
        if "同装備セット" in desc:
            if patch.get("range") != "All":
                patch["range"] = "All"
                n_range += 1
        elif patch.get("range") == "All":
            del patch["range"]

        # chara_base_id
        pfx = _extract_chara_pfx(name)
        if pfx:
            cid = resolve_chara_base_id(pfx, name_to_id)
            if cid is not None:
                if patch.get("chara_base_id") != cid:
                    patch["chara_base_id"] = cid
                    n_chara += 1
            else:
                # resolve 失败 — 不 gate、记录供人工补 OVERRIDE
                n_chara_skip += 1
                if "chara_base_id" in patch:
                    del patch["chara_base_id"]
                if len(unresolved_samples) < 10:
                    unresolved_samples.append((mid, name, _norm(pfx)))
        elif "chara_base_id" in patch:
            # 不是 純真/秘録 entry、清掉残留
            del patch["chara_base_id"]

    seen_ids = {m["id"] for m in master}
    new_revise = [revise_by_id[m["id"]] for m in master if m["id"] in revise_by_id]
    orphans = [e for e in revise if e.get("id") not in seen_ids]
    new_revise.extend(orphans)

    REVISE.write_text(
        json.dumps(new_revise, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"OK: crystal_revise updated.")
    print(f"    range patches: {n_range}")
    print(f"    chara_base_id patches: {n_chara}")
    print(f"    chara_base_id unresolved (skip gate): {n_chara_skip}")
    if unresolved_samples:
        print(f"    unresolved samples (前 10 — 补 OVERRIDE dict 可让 gate 生效):")
        for s in unresolved_samples:
            print(f"      id={s[0]} name={s[1]!r}  NFKC prefix={s[2]!r}")
    print(f"    total revise entries: {len(new_revise)} (orphans kept: {len(orphans)})")


if __name__ == "__main__":
    main()
