# master_data changelog: 2026_08_11_16_00_00 → 2026_08_13_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| materials | 2 | 0 | 0 |
| items | 1 | 0 | 0 |
| jobs | 1 | 0 | 0 |
| scenarios | 13 | 0 | 0 |

## materials

### 新增 (2)

- [`43060023`](materials.json#L16761) 混沌戦神 rarity=4
  - 全てを壊し、世界を進めよ。[長剣のみ]
[残HP多いほどｽﾋﾟｰﾄﾞUP][上限値:超高]
- [`52170063`](materials.json#L20863) TRUE PROMISE rarity=5
  - 嘘も真も、貴方を守るために。[闇長剣]
[ﾀﾞﾒｰｼﾞ減衰なしでﾋｯﾄ数増加][上限値:高]

## items

### 新增 (1)

- [`8827`](items.json#L24547) 血盟のオーブ
  - 血盟の記憶の欠片。手に取ると
大切な存在を守り抜く決意が宿る。

## jobs

### 新增 (1)

- [`1571`](jobs.json#L198127) ヒルドル rarity=4
  - rarity=4 / max_level=40
  - job_abilities (18):
    - WeaponType 長剣(1): pos=1.7 / neg=1.105 (rank=s 超得意)
    - WeaponType 大剣(2): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 太刀(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 杖棒(4): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 弓矢(5): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 連弩(6): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 戦斧(7): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 騎槍(8): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 投擲(9): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 拳闘(10): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 魔典(11): pos=1.7 / neg=1.105 (rank=s 超得意)
    - WeaponType 大鎌(12): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 火(1): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 水(2): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 風(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 光(4): pos=1.7 / neg=1.105 (rank=s 超得意)
    - Element 闇(5): pos=1.7 / neg=1.105 (rank=s 超得意)
    - Element 無(6): pos=0.3 / neg=0.3 (rank=d 超苦手)
  - job_skills (9):
    - Speed Multiply ×1.2 — 世界を守り抜く証。装備セット全ての速度が大アップ
    - Vitality_Attack Multiply ×1.75 — 光か闇属性装備で残HPが多いほど攻撃力UP(最大75%)
    - MotionSpeed Multiply ×1.25 — 光か闇属性装備で同装備セット全体のモーション速度25％UP
    - DamageLimitBreak Addition +700000000.0 — 長剣か魔典装備でﾀﾞﾒｰｼﾞ上限7億UP
    - GuardBreak Multiply ×1.45 — 長剣か魔典装備でブレイク力が45%UP
    - Vitality_Attack Multiply ×1.75 — 光か闇属性装備で残HPが多いほど攻撃力UP(最大75%)
    - MotionSpeed Multiply ×1.25 — 光か闇属性装備で同装備セット全体のモーション速度25％UP
    - DamageLimitBreak Addition +700000000.0 — 長剣か魔典装備でﾀﾞﾒｰｼﾞ上限7億UP
    - GuardBreak Multiply ×1.45 — 長剣か魔典装備でブレイク力が45%UP

## scenarios

### 新增 (13)

- [`326615`](scenarios.json#L10063) 追撃
- [`326616`](scenarios.json#L10073) 成長と焦燥と
- [`326617`](scenarios.json#L10083) ケイオス
- [`326618`](scenarios.json#L10093) 灰色のダインスレイフ
- [`326619`](scenarios.json#L10103) 混沌なる繰り手の鍵
- [`326620`](scenarios.json#L10113) 暴かれる痛み
- [`326621`](scenarios.json#L10123) いつかの魔剣と少女
- [`326622`](scenarios.json#L10133) 反転
- [`326623`](scenarios.json#L10143) 血溜まりに沈む
- [`326624`](scenarios.json#L10153) 取り繕った闇
- [`326625`](scenarios.json#L10163) 誰よりも魔剣らしく
- [`326626`](scenarios.json#L10173) 共に光の中へと
- [`326627`](scenarios.json#L10183) 深淵は未だ深く

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
