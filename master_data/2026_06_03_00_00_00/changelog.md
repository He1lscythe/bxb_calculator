# master_data changelog: 2026_05_23_16_00_00 → 2026_06_03_00_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 0 | 0 | 2 |
| weapon_costumes | 4 | 0 | 0 |
| materials | 1 | 0 | 0 |
| items | 6 | 2 | 288 |
| jobs | 0 | 0 | 1 |
| pictures | 2 | 0 | 0 |
| scenarios | 1 | 0 | 0 |

## weapons

### 调整 (2,按字段聚合)

#### `sort_order` (2 个)
- `16921` → `16941`: ids = [[`169401`](weapons.json#L278971), [`169402`](weapons.json#L279166)]

## weapon_costumes

### 新增 (4)

- [`1049022`](weapon_costumes.json#L1966) 魔装《花嫁》
  - 归属武器: タスラム (weapon_base_id=1049)
  - effects: MotionSpeed Multiply ×1.25
- [`1279008`](weapon_costumes.json#L12302) 魔装《奉仕》
  - 归属武器: エアガイツ (weapon_base_id=1279)
  - effects: MotionSpeed Multiply ×1.04, Attack Multiply ×1.03
- [`1520008`](weapon_costumes.json#L25169) 魔装《奉仕》
  - 归属武器: 天槍カシウス (weapon_base_id=1520)
  - effects: MotionSpeed Multiply ×1.05
- [`1683025`](weapon_costumes.json#L31943) 魔装《Another》
  - 归属武器: ラストリゾート.ALICE (weapon_base_id=1683)

## materials

### 新增 (1)

- [`52050074`](materials.json#L19687) ハピラキラビット rarity=5
  - こんなにラッキーで困っちゃうわ♪[水連弩]
[残HP少ないほど攻撃力UP][上限値:超高]

## items

### 新增 (6)

- [`6275`](items.json#L7803) 6月魔装交換クーポン
  - 7月15日16時までショップで特定魔剣の魔装と交換できるクーポン。
- [`15338`](items.json#L36557) グリーンスタージュエル
  - 膨大な魔力から偶然精製された
稀少鉱石。ダイヤに似た別物。
- [`15339`](items.json#L36577) スタージュエル
  - 膨大な魔力から偶然精製された
稀少鉱石。ダイヤに似た別物。
- [`91257`](items.json#L144437) マッドな宴塔
  - 「メリーバッド･ハッピーエンド 短縮版｣ 作戦に貢献した証。
- [`1520008`](items.json#L177483) 天槍カシウスのメイド服
  - 天槍カシウスの新たな力を
引き出すことができる魔術礼装。
- [`1683025`](items.json#L180503) ラストリゾート.ALICEの帽子
  - ラストリゾート.ALICEの新たな力を
引き出すことができる魔術礼装。

### 删除 (2)

- [`15336`](../2026_05_23_16_00_00/items.json#L36517) 【裏式】スタージュエル
- [`40823`](../2026_05_23_16_00_00/items.json#L142597) 【期間限定】裏式･超強化の鍵

### 调整 (288,按字段聚合)

#### `max_quantity` (288 个)
- `2048` → `2400`: ids = [[`8603`](items.json#L23635), [`8605`](items.json#L23655), [`8652`](items.json#L24415), [`8656`](items.json#L24475), [`8658`](items.json#L24495), [`8660`](items.json#L24515), [`8720`](items.json#L25415), [`8721`](items.json#L25435), ...] (共 288)

## jobs

### 调整 (1,按字段聚合)

#### `job_skills` (1 个)
**子项调整** (1 次):
- id=`148807` (隠し)絶･勝負師適正【罪】:
  - description: 火装備でガード時防御力が50%DOWN
  - `value`: `0.5` → `1.5`
  - 影响 1 个 id: [[`1488`](jobs.json#L161057)]

## pictures

### 新增 (2)

- [`2045`](pictures.json#L6963) 素晴らしき叡智なる結婚
  - skill: 残HPが多いほどモーション速度が30%UP[魔典のみ]
- [`4080`](pictures.json#L11084) ロスカットにはおそすぎる
  - skill: [アマイモン=マネのみ]サファイア量が30%UP
  - skill: [アマイモン=マネのみ]モーション速度が30%UP

## scenarios

### 新增 (1)

- [`325611`](scenarios.json#L9683) 存在しすぎるキオク

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
