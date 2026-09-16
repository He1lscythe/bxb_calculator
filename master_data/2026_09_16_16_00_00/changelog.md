# master_data changelog: 2026_09_15_16_00_00 → 2026_09_16_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 2 | 0 | 2 |
| items | 10 | 0 | 0 |
| evolution_recipes | 2 | 0 | 0 |
| attack_motions | 2 | 0 | 0 |

## weapons

### 新增 (2)

- [`115103`](weapons.json#L62686) アスカロン【極弐】
  - base_name: アスカロン (costume: 極弐魔装)
  - element=闇(5) / type=大剣(2) / rarity=S(3) / cv=小堀幸
  - max stats: HP=10140 / ATK=10140 / DEF=18200 / SPD=32 / BREAK=2030
  - hit_counts=[3, 2, 12] (3段)  motion_speed=[3.8/3.8/1.2]  mp=244
  - three_size=72/54/70 / initial_slot=4
  - BD: 君臨せし竜滅の斬虐王女 (arts_id=10151)
    - description: 敵全体に超強力な14連ダメージ＆1分間攻撃力13%UP
    - cost=6 / hit_count=14 / value=8.7 / additional_value=0.0
  - innate skills (3):
    - Attack Multiply ×1.75 — 全属性の魔剣の攻撃力が絶大にアップ
    - HitCount Addition +1.0 — 大剣の魔剣の1撃目2撃目3撃目のヒット数を+1する
    - DamageLimitBreak Addition +600000000.0 — 大剣の魔剣のダメージ上限が6億アップ
- [`158303`](weapons.json#L244479) †邪なる堕天せし者†【極弐】
  - base_name: †邪なる堕天せし者† (costume: 極弐魔装)
  - element=闇(5) / type=魔典(11) / rarity=S(3) / cv=嶺内ともみ
  - max stats: HP=18590 / ATK=8790 / DEF=5580 / SPD=36 / BREAK=3550
  - hit_counts=[7, 4, 13] (3段)  motion_speed=[2.0/1.6/1.0]  mp=230
  - three_size=禁忌に触れるな！ / initial_slot=5
  - BD: 混沌なる極魔創世【カオスジェネシス】 (arts_id=10583)
    - description: 敵全体に超強力な73連ダメージ＆1waveﾓｰｼｮﾝ30%UP
    - cost=5 / hit_count=73 / value=1.36 / additional_value=0.0
  - innate skills (3):
    - Break_Attack Multiply ×3.3 — 自身が破損状態になると攻撃力が絶大にアップ
    - DamageLimitBreak Addition +1000000000.0 — 自身のダメージ上限が10億アップ
    - InstantDeath Repel_Percent ×100.0 — 即死特性の攻撃を完全回避する

### 调整 (2)

- [`115101`](weapons.json#L62372) アスカロン
  - base_name: アスカロン (costume: 魔装)
  - element=闇(5) / type=大剣(2) / rarity=S(3) / cv=小堀幸
  - max stats: HP=6000 / ATK=6000 / DEF=10800 / SPD=29 / BREAK=1200
  - hit_counts=[1, 1, 9] (3段)  motion_speed=[4.0/4.0/1.0]  mp=222
  - three_size=72/54/69 / initial_slot=2
  - BD: 斬虐なる屠竜の王女 (arts_id=151)
    - description: 敵全体に超強力な14連ダメージ＆1分間攻撃力13%UP
    - cost=6 / hit_count=14 / value=8.7 / additional_value=0.0
  - innate skills (1):
    - Attack Multiply ×1.25 — 全属性の魔剣の攻撃力がかなりアップ
- [`115102`](weapons.json#L62510) アスカロン【極】
  - base_name: アスカロン (costume: 極魔装)
  - element=闇(5) / type=大剣(2) / rarity=S(3) / cv=小堀幸
  - max stats: HP=7800 / ATK=7800 / DEF=14000 / SPD=29 / BREAK=1560
  - hit_counts=[2, 1, 12] (3段)  motion_speed=[4.0/4.0/1.0]  mp=222
  - three_size=72/54/69 / initial_slot=3
  - BD: 斬虐なる屠竜の王女 (arts_id=151)
    - description: 敵全体に超強力な14連ダメージ＆1分間攻撃力13%UP
    - cost=6 / hit_count=14 / value=8.7 / additional_value=0.0
  - innate skills (3):
    - Attack Multiply ×1.5 — 全属性の魔剣の攻撃力が大幅にアップ
    - HitCount Addition +1.0 — 大剣の魔剣の1撃目2撃目3撃目のヒット数を+1する
    - DamageLimitBreak Addition +600000000.0 — 大剣の魔剣のダメージ上限が6億アップ

## items

### 新增 (10)

- [`115101`](items.json#L135925) 夢幻深層アスカロン
  - 古代石版に深く刻み込まれた
アスカロンの深層記憶。
- [`115102`](items.json#L135943) アスカロンジーン
  - 進化の為の情報が詰め込まれた
アスカロンの覚醒術式。
- [`115103`](items.json#L135961) アスカロンハート
  - 強き想いから生まれた
アスカロンの残留思念。
- [`115104`](items.json#L135979) アスカロンコア
  - 魔力結晶に封印された
アスカロンのコア。
- [`115105`](items.json#L135997) 特殊設計書アスカロン
  - 極弐改造について記された
アスカロンの特殊設計書。
- [`158301`](items.json#L150847) 夢幻深層†邪なる堕天せし者†
  - 古代石版に深く刻み込まれた
†邪なる堕天せし者†の深層記憶。
- [`158302`](items.json#L150865) †邪なる堕天せし者†ジーン
  - 進化の為の情報が詰め込まれた
†邪なる堕天せし者†の覚醒術式。
- [`158303`](items.json#L150883) †邪なる堕天せし者†ハート
  - 強き想いから生まれた
†邪なる堕天せし者†の残留思念。
- [`158304`](items.json#L150901) †邪なる堕天せし者†コア
  - 魔力結晶に封印された
†邪なる堕天せし者†のコア。
- [`158305`](items.json#L150919) 特殊設計書†邪なる堕天せし者†
  - 極弐改造について記された
†邪なる堕天せし者†の特殊設計書。

## evolution_recipes

### 新增 (2)

- `115102`
- `158302`

## attack_motions

### 新增 (2)

- [`831`](attack_motions.json#L3319) 削竜
- [`832`](attack_motions.json#L3323) 堕天2

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
