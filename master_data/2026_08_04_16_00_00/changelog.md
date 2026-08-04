# master_data changelog: 2026_08_01_00_00_00 → 2026_08_04_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 2 | 0 | 0 |
| materials | 2 | 0 | 0 |
| items | 5 | 0 | 0 |
| pictures | 1 | 0 | 0 |
| evolution_recipes | 1 | 0 | 0 |
| attack_motions | 1 | 0 | 0 |

## weapons

### 新增 (2)

- [`169601`](weapons.json#L275169) 妖精剣ティターニア=ネオ=TRUE
  - base_name: 妖精剣ティターニア=ネオ=TRUE (costume: 魔装)
  - element=水(2) / type=連弩(6) / rarity=SS(4) / cv=豊田萌絵
  - max stats: HP=14780 / ATK=36320 / DEF=5620 / SPD=30 / BREAK=5640
  - hit_counts=[1, 3, 2] (3段)  motion_speed=[2.0/1.4/1.0]  mp=1300
  - three_size=88/51/70 / initial_slot=3
  - BD: 妖精幻想トゥルーフェアリーテイル (arts_id=696)
    - description: 敵全体に消費ゲージ数に応じた20連ダメージ＆1waveの間攻撃全体化
    - cost=2 / hit_count=20 / value=1.2 / additional_value=15.0
  - innate skills (5):
    - Attack Multiply ×2.97959 — 真解放により自身の攻撃力が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - Speed Multiply ×2.97959 — 真解放により自身のスピードが3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - DamageLimitBreak Addition +9900000000.0 — 自身のダメージ上限が99億アップ
    - Vitality_Attack Multiply ×3.0 — 残HPが多いほど自身の攻撃力がアップ(最大3倍)
    - Vitality_Speed Multiply ×3.0 — 残HPが多いほど自身のスピードがアップ(最大3倍)
- [`169602`](weapons.json#L275383) 妖精剣ティターニア=ネオ=TRUE【極】
  - base_name: 妖精剣ティターニア=ネオ=TRUE (costume: 極魔装)
  - element=水(2) / type=連弩(6) / rarity=SS(4) / cv=豊田萌絵
  - max stats: HP=19210 / ATK=47210 / DEF=7300 / SPD=30 / BREAK=7320
  - hit_counts=[2, 3, 5] (3段)  motion_speed=[2.0/1.4/1.0]  mp=1300
  - three_size=88/51/70 / initial_slot=4
  - BD: 妖精幻想トゥルーフェアリーテイル (arts_id=696)
    - description: 敵全体に消費ゲージ数に応じた20連ダメージ＆1waveの間攻撃全体化
    - cost=2 / hit_count=20 / value=1.2 / additional_value=15.0
  - innate skills (5):
    - Attack Multiply ×2.97959 — 真解放により自身の攻撃力が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - Speed Multiply ×2.97959 — 真解放により自身のスピードが3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - DamageLimitBreak Addition +9900000000.0 — 自身のダメージ上限が99億アップ
    - Vitality_Attack Multiply ×3.0 — 残HPが多いほど自身の攻撃力がアップ(最大3倍)
    - Vitality_Speed Multiply ×3.0 — 残HPが多いほど自身のスピードがアップ(最大3倍)

## materials

### 新增 (2)

- [`52140099`](materials.json#L20513) ニードフェアリー rarity=5
  - だらだらライフは絶対必要♪[上限値:普]
[同装備ｾｯﾄ水が残HP多いほど攻撃力UP]
- [`54150106`](materials.json#L23803) ハッピーシャワー！ rarity=5
  - 思いっきり楽しい夏にしようねっ！
[ﾀﾞﾒｰｼﾞ上限がUP][上限値:高]

## items

### 新增 (5)

- [`15348`](items.json#L33319) スタージュエル
  - 膨大な魔力から偶然精製された
稀少鉱石。ダイヤに似た別物。
- [`15349`](items.json#L33337) グリーンスタージュエル
  - 膨大な魔力から偶然精製された
稀少鉱石。ダイヤに似た別物。
- [`40835`](items.json#L128809) 【期間限定】真式･超強化の鍵α
  - 9月4日16時までショップで特定魔剣の熟度をあげられる鍵。
- [`2500045`](items.json#L164983) 夏への感謝【2026】
  - この素晴らしい夏に大感謝の証
- [`3010159`](items.json#L165307) ﾃｨﾀｰﾆｱ=ﾈｵ=TRUE熟度15製造チケット
  - 妖精剣ティターニア=ネオ=TRUEを熟度15で確実に製造できる術符。

## pictures

### 新增 (1)

- [`4083`](pictures.json#L11312) ビバ･サマーフェスタ！
  - skill: 残HPが多いほどモーション速度が30%UP[大剣のみ]

## evolution_recipes

### 新增 (1)

- `169601`

## attack_motions

### 新增 (1)

- [`827`](attack_motions.json#L3303) 変妖

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
