# master_data changelog: 2026_06_19_16_00_00 → 2026_06_23_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 2 | 0 | 0 |
| materials | 3 | 0 | 0 |
| items | 2 | 0 | 0 |
| evolution_recipes | 1 | 0 | 0 |
| attack_motions | 1 | 0 | 0 |

## weapons

### 新增 (2)

- [`169501`](weapons.json#L280207) 暁の鍵師アーベントロート
  - base_name: 暁の鍵師アーベントロート (costume: 魔装)
  - element=水(2) / type=投擲(9) / rarity=SS(4) / cv=夏吉ゆうこ
  - max stats: HP=17180 / ATK=23710 / DEF=14090 / SPD=20 / BREAK=590
  - hit_counts=[1, 2, 4] (3段)  motion_speed=[1.8/1.8/1.2]  mp=1280
  - three_size=86/55/86 / initial_slot=3
  - BD: 第XIII権限:創世に魂の暁よ在れ (arts_id=695)
    - description: 敵全体に消費ゲージ数に応じた6連ダメージ＆wave中、味方の攻撃力とﾓｰｼｮﾝ速度が4倍、ｽﾋﾟｰﾄﾞとﾌﾞﾚｲｸ力が50倍
    - cost=6 / hit_count=6 / value=1.12 / additional_value=2.5
  - innate skills (6):
    - DamageLimitBreak Addition +1300000000.0 — 味方全体のダメージ上限が13億アップ【熟度UPにつれてさらに効果値がUP】
    - BlazeGaugeMaxLevel Addition +13.0 — B.D.ゲージの最大値が13アップ
    - Heal Addition +500.0 — 味方全体が、非行動時にHPが徐々に大回復
    - Vitality_Attack Multiply ×2.97959 — 水属性の味方全体が、残HPが多いほど攻撃力がアップ(最大3倍)【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - SapphireDrop Multiply ×2.0 — 水属性の魔剣の獲得するサファイアの量がかなり増加
    - EventDropRate Multiply ×2.0 — マスターとおでこをごっつんした経験により入れ替わり現象への耐性がつき、【Machina Heart Beating】で「作戦貢献度」の取得数が上がる
- [`169502`](weapons.json#L280476) 暁の鍵師アーベントロート【極】
  - base_name: 暁の鍵師アーベントロート (costume: 極魔装)
  - element=水(2) / type=投擲(9) / rarity=SS(4) / cv=夏吉ゆうこ
  - max stats: HP=22330 / ATK=30820 / DEF=18310 / SPD=20 / BREAK=760
  - hit_counts=[2, 2, 7] (3段)  motion_speed=[1.8/1.8/1.2]  mp=1280
  - three_size=86/55/86 / initial_slot=4
  - BD: 第XIII権限:創世に魂の暁よ在れ (arts_id=695)
    - description: 敵全体に消費ゲージ数に応じた6連ダメージ＆wave中、味方の攻撃力とﾓｰｼｮﾝ速度が4倍、ｽﾋﾟｰﾄﾞとﾌﾞﾚｲｸ力が50倍
    - cost=6 / hit_count=6 / value=1.12 / additional_value=2.5
  - innate skills (6):
    - DamageLimitBreak Addition +1300000000.0 — 味方全体のダメージ上限が13億アップ【熟度UPにつれてさらに効果値がUP】
    - BlazeGaugeMaxLevel Addition +13.0 — B.D.ゲージの最大値が13アップ
    - Heal Addition +500.0 — 味方全体が、非行動時にHPが徐々に大回復
    - Vitality_Attack Multiply ×2.97959 — 水属性の味方全体が、残HPが多いほど攻撃力がアップ(最大3倍)【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - SapphireDrop Multiply ×3.0 — 水属性の魔剣の獲得するサファイアの量が大幅に増加
    - EventDropRate Multiply ×2.0 — マスターとおでこをごっつんした経験により入れ替わり現象への耐性がつき、【Machina Heart Beating】で「作戦貢献度」の取得数が上がる

## materials

### 新增 (3)

- [`26010065`](materials.json#L9145) 氷魔神の喝采Lv2 rarity=2
  - 結晶化した魔剣の記憶。[上限値:超絶高]
[水のみ][装備魔剣のｻﾌｧｲｱ量がUP]
- [`36010066`](materials.json#L11959) 氷魔神の喝采Lv3 rarity=3
  - 結晶化した魔剣の記憶。[上限値:超絶高]
[水のみ][装備魔剣のｻﾌｧｲｱ量がUP]
- [`54120014`](materials.json#L22753) 愛のお導き rarity=5
  - すべてを愛に捧げれば、ヨシ♪[投擲のみ]
[ﾊﾞﾄﾙ開始時B.D.ｹﾞｰｼﾞ上昇][上限値:超高]

## items

### 新增 (2)

- [`15342`](items.json#L33121) ダークスタージュエル
  - 膨大な魔力から偶然精製された
稀少鉱石。ダイヤに似た別物。
- [`3010157`](items.json#L164659) ｱｰﾍﾞﾝﾄﾛｰﾄ熟度15製造チケット
  - 暁の鍵師ｱｰﾍﾞﾝﾄﾛｰﾄを熟度15で確実に製造できる術符。

## evolution_recipes

### 新增 (1)

- `169501`

## attack_motions

### 新增 (1)

- [`824`](attack_motions.json#L3291) 暁鍵

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
