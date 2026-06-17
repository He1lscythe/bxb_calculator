# master_data changelog: 2026_06_16_16_00_00 → 2026_06_17_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 2 | 0 | 0 |
| items | 5 | 0 | 0 |
| evolution_recipes | 2 | 0 | 0 |
| attack_motions | 2 | 0 | 0 |

## weapons

### 新增 (2)

- [`113003`](weapons.json#L52768) アクエリア【極弐】
  - base_name: アクエリア (costume: 極弐魔装)
  - element=水(2) / type=連弩(6) / rarity=S(3) / cv=山村響
  - max stats: HP=12090 / ATK=5240 / DEF=7540 / SPD=20 / BREAK=2710
  - hit_counts=[8, 8, 10] (3段)  motion_speed=[3.8/3.8/1.2]  mp=154
  - three_size=89/55/77 / initial_slot=6
  - BD: サダルスウド･ワイプアウト (arts_id=10130)
    - description: 敵全体に超強力な22連ダメージ＆自分HP回復
    - cost=3 / hit_count=22 / value=2.53636 / additional_value=0.0
  - innate skills (4):
    - Attack Multiply ×1.74232 — 水属性の魔剣の攻撃力が絶大にアップ【熟度UPにつれてさらに効果値UP】
    - Raise Multiply ×1.0 — 戦闘不能になっても1度だけ完全復活できる
    - GuardDefense Multiply ×0.95 — 水属性の魔剣のガード時の防御力がアップ
    - DamageLimitBreak Addition +1000000000.0 — 自身のダメージ上限が10億アップ
- [`137603`](weapons.json#L154157) アクアライン【極弐】
  - base_name: アクアライン (costume: 極弐魔装)
  - element=水(2) / type=弓矢(5) / rarity=A(1) / cv=田中あいみ
  - max stats: HP=4570 / ATK=1560 / DEF=4060 / SPD=31 / BREAK=2980
  - hit_counts=[5, 6, 7] (3段)  motion_speed=[4.0/4.0/1.1]  mp=99
  - three_size=94/60/83 / initial_slot=1
  - BD: エンド･オブ･オケアノス (arts_id=10376)
    - description: 敵全体に13連ダメージ＆ブレイク力10%UP
    - cost=5 / hit_count=13 / value=4.23 / additional_value=0.0
  - innate skills (1):
    - MotionSpeed Multiply ×1.3 — 水属性の魔剣の攻撃モーションが加速

## items

### 新增 (5)

- [`113001`](items.json#L134575) 夢幻深層アクエリア
  - 古代石版に深く刻み込まれた
アクエリアの深層記憶。
- [`113002`](items.json#L134593) アクエリアジーン
  - 進化の為の情報が詰め込まれた
アクエリアの覚醒術式。
- [`113003`](items.json#L134611) アクエリアハート
  - 強き想いから生まれた
アクエリアの残留思念。
- [`113004`](items.json#L134629) アクエリアコア
  - 魔力結晶に封印された
アクエリアのコア。
- [`113005`](items.json#L134647) 特殊設計書アクエリア
  - 極弐改造について記された
アクエリアの特殊設計書。

## evolution_recipes

### 新增 (2)

- `113002`
- `137602`

## attack_motions

### 新增 (2)

- [`790`](attack_motions.json#L3155) 水瓶
- [`823`](attack_motions.json#L3287) 水射2

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
