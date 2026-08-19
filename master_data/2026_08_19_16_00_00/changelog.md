# master_data changelog: 2026_08_18_16_00_00 → 2026_08_19_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 2 | 0 | 0 |
| items | 10 | 0 | 0 |
| evolution_recipes | 2 | 0 | 0 |
| attack_motions | 2 | 0 | 0 |

## weapons

### 新增 (2)

- [`140103`](weapons.json#L161016) バステト×サマー【極弐】
  - base_name: バステト×サマー (costume: 極弐魔装)
  - element=火(1) / type=大剣(2) / rarity=S(3) / cv=高橋李依
  - max stats: HP=17580 / ATK=14540 / DEF=6010 / SPD=43 / BREAK=1660
  - hit_counts=[4, 4, 8] (3段)  motion_speed=[3.0/3.0/1.2]  mp=265
  - three_size=92/55/81 / initial_slot=4
  - BD: 魔海眼ナツオワラセナイデス (arts_id=10401)
    - description: 敵全体に超強力な49連ダメージ＆20秒ﾓｰｼｮﾝ30%高速化
    - cost=4 / hit_count=49 / value=1.58 / additional_value=0.0
  - innate skills (4):
    - Vitality_Attack Multiply ×2.25 — 残HPが多いほど攻撃力が絶大にアップ
    - Mez Repel_Percent ×100.0 — 麻痺の発生を完全回避する
    - Attack Multiply ×1.75 — 火属性の魔剣の攻撃力が絶大にアップ
    - DamageLimitBreak Addition +700000000.0 — 自身のダメージ上限が7億アップ
- [`147803`](weapons.json#L192703) クギバット【極弐】
  - base_name: クギバット (costume: 極弐魔装)
  - element=風(3) / type=杖棒(4) / rarity=S(3) / cv=長縄まりあ
  - max stats: HP=5240 / ATK=5070 / DEF=7950 / SPD=38 / BREAK=3050
  - hit_counts=[8, 10, 15] (3段)  motion_speed=[2.8/2.0/1.2]  mp=198
  - three_size=68/56/68 / initial_slot=4
  - BD: 超滅最恐麗虎隕覇倶闘 (arts_id=10478)
    - description: 敵全体に超強力な30連ダメージ＆数秒間攻撃力1.2倍
    - cost=6 / hit_count=30 / value=3.72 / additional_value=0.0
  - innate skills (3):
    - Attack Multiply ×1.74232 — 風属性の魔剣の攻撃力が絶大にアップ【熟度UPにつれてさらに効果値UP】
    - Enemy_BreakAttack Multiply ×2.0 — ブレイク時に自身の攻撃力が2倍にアップ
    - DamageLimitBreak Addition +1000000000.0 — 自身のダメージ上限が10億アップ

## items

### 新增 (10)

- [`140101`](items.json#L147913) 夢幻深層バステト×サマー
  - 古代石版に深く刻み込まれた
バステト×サマーの深層記憶。
- [`140102`](items.json#L147931) バステト×サマージーン
  - 進化の為の情報が詰め込まれた
バステト×サマーの覚醒術式。
- [`140103`](items.json#L147949) バステト×サマーハート
  - 強き想いから生まれた
バステト×サマーの残留思念。
- [`140104`](items.json#L147967) バステト×サマーコア
  - 魔力結晶に封印された
バステト×サマーのコア。
- [`140105`](items.json#L147985) 特殊設計書バステト×サマー
  - 極弐改造について記された
バステト×サマーの特殊設計書。
- [`147801`](items.json#L149875) 夢幻深層クギバット
  - 古代石版に深く刻み込まれた
クギバットの深層記憶。
- [`147802`](items.json#L149893) クギバットジーン
  - 進化の為の情報が詰め込まれた
クギバットの覚醒術式。
- [`147803`](items.json#L149911) クギバットハート
  - 強き想いから生まれた
クギバットの残留思念。
- [`147804`](items.json#L149929) クギバットコア
  - 魔力結晶に封印された
クギバットのコア。
- [`147805`](items.json#L149947) 特殊設計書クギバット
  - 極弐改造について記された
クギバットの特殊設計書。

## evolution_recipes

### 新增 (2)

- `140102`
- `147802`

## attack_motions

### 新增 (2)

- [`829`](attack_motions.json#L3311) 釘打
- [`830`](attack_motions.json#L3315) 猫様2

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
