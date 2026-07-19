# master_data changelog: 2026_07_09_16_00_00 → 2026_07_19_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 2 | 0 | 2 |
| weapon_costumes | 3 | 0 | 0 |
| items | 15 | 4 | 0 |
| jobs | 1 | 0 | 0 |
| evolution_recipes | 2 | 0 | 0 |
| weapon_parameter_ranks | ? | ? | ? |
| attack_motions | 2 | 0 | 0 |

## weapons

### 新增 (2)

- [`147903`](weapons.json#L197401) アンノウン【極弐】
  - base_name: アンノウン (costume: 極弐魔装)
  - element=光(4) / type=大鎌(12) / rarity=S(3) / cv=藤田茜
  - max stats: HP=9300 / ATK=10990 / DEF=12680 / SPD=29 / BREAK=1020
  - hit_counts=[5, 3, 10] (3段)  motion_speed=[2.5/2.0/1.0]  mp=176
  - three_size=68/53/71 / initial_slot=3
  - BD: 誰も知らない消失のヒカリ (arts_id=10479)
    - description: 敵全体に超強力な36連ダメージ＆敵を強制ブレイク
    - cost=5 / hit_count=36 / value=2.75 / additional_value=0.0
  - innate skills (3):
    - Attack Multiply ×1.74232 — 光属性の魔剣の攻撃力が絶大にアップ【熟度UPにつれてさらに効果値UP】
    - Enemy_BreakAttack Multiply ×3.0 — ブレイク時に光属性の魔剣の攻撃力が3倍
    - EventDropRate Multiply ×1.5 — イベント【誰も知らないナイショの話】で「名もなき鎖」の取得量がアップ
- [`155603`](weapons.json#L231885) 灼腕ターロス【極弐】
  - base_name: 灼腕ターロス (costume: 極弐魔装)
  - element=火(1) / type=拳闘(10) / rarity=S(3) / cv=篠原侑
  - max stats: HP=5920 / ATK=16900 / DEF=9300 / SPD=31 / BREAK=4230
  - hit_counts=[5, 4, 8] (3段)  motion_speed=[3.0/3.0/1.2]  mp=310
  - three_size=72/55/76 / initial_slot=6
  - BD: シャイニング･スーパーノヴァ (arts_id=10556)
    - description: 敵全体に超強力な20連ダメージ＆5秒だけ攻撃2倍
    - cost=4 / hit_count=20 / value=3.87 / additional_value=0.0
  - innate skills (3):
    - Vitality_Attack Multiply ×2.25 — 残HPが多いほど攻撃力が絶大にアップ
    - Defense Multiply ×1.74232 — 火属性の魔剣の防御力が絶大にアップ【熟度UPにつれてさらに効果値UP】
    - DamageLimitBreak Addition +1000000000.0 — 自身のダメージ上限が10億アップ

### 调整 (2)

- [`147901`](weapons.json#L197068) アンノウン
  - base_name: アンノウン (costume: 魔装)
  - element=光(4) / type=大鎌(12) / rarity=S(3) / cv=藤田茜
  - max stats: HP=5500 / ATK=6500 / DEF=7500 / SPD=27 / BREAK=600
  - hit_counts=[3, 2, 7] (3段)  motion_speed=[2.5/2.0/1.0]  mp=160
  - three_size=67/53/71 / initial_slot=1
  - BD: ルーナ･ノヴァ･エクリプス (arts_id=479)
    - description: 敵全体に超強力な36連ダメージ＆敵を強制ブレイク
    - cost=5 / hit_count=36 / value=2.75 / additional_value=0.0
  - innate skills (2):
    - Attack Multiply ×1.5 — 光属性の魔剣の攻撃力が大幅にアップ
    - EventDropRate Multiply ×1.5 — イベント【誰も知らないナイショの話】で「名もなき鎖」の取得量がアップ
- [`147902`](weapons.json#L197225) アンノウン【極】
  - base_name: アンノウン (costume: 極魔装)
  - element=光(4) / type=大鎌(12) / rarity=S(3) / cv=藤田茜
  - max stats: HP=7150 / ATK=8450 / DEF=9750 / SPD=27 / BREAK=780
  - hit_counts=[4, 2, 10] (3段)  motion_speed=[2.5/2.0/1.0]  mp=160
  - three_size=67/53/71 / initial_slot=2
  - BD: ルーナ･ノヴァ･エクリプス (arts_id=479)
    - description: 敵全体に超強力な36連ダメージ＆敵を強制ブレイク
    - cost=5 / hit_count=36 / value=2.75 / additional_value=0.0
  - innate skills (3):
    - Attack Multiply ×1.75 — 光属性の魔剣の攻撃力が絶大にアップ
    - Enemy_BreakAttack Multiply ×3.0 — ブレイク時に光属性の魔剣の攻撃力が3倍
    - EventDropRate Multiply ×1.5 — イベント【誰も知らないナイショの話】で「名もなき鎖」の取得量がアップ

## weapon_costumes

### 新增 (3)

- [`1230022`](weapon_costumes.json#L9926) 魔装《花嫁》
  - 归属武器: テレプシコーラ (weapon_base_id=1230)
  - effects: Attack Multiply ×1.2
- [`1654001`](weapon_costumes.json#L31372) 魔装《真夏》
  - 归属武器: バールのようなもの=ビースト (weapon_base_id=1654)
  - effects: Attack Multiply ×1.03, GuardBreak Multiply ×1.1
- [`1676001`](weapon_costumes.json#L32125) 魔装《真夏》
  - 归属武器: ハルピュイア=ホロウ.ALICE (weapon_base_id=1676)
  - effects: Attack Multiply ×1.05, MotionSpeed Multiply ×1.05, Speed Multiply ×1.05

## items

### 新增 (15)

- [`15345`](items.json#L33175) オレンジスタージュエル
  - 膨大な魔力から偶然精製された
稀少鉱石。ダイヤに似た別物。
- [`40832`](items.json#L128647) 【期間限定】真式･超強化の鍵β
  - 7月31日16時までショップで特定魔剣の熟度をあげられる鍵。
- [`147901`](items.json#L149569) 夢幻深層アンノウン
  - 古代石版に深く刻み込まれた
アンノウンの深層記憶。
- [`147902`](items.json#L149587) アンノウンジーン
  - 進化の為の情報が詰め込まれた
アンノウンの覚醒術式。
- [`147903`](items.json#L149605) アンノウンハート
  - 強き想いから生まれた
アンノウンの残留思念。
- [`147904`](items.json#L149623) アンノウンコア
  - 魔力結晶に封印された
アンノウンのコア。
- [`147905`](items.json#L149641) 特殊設計書アンノウン
  - 極弐改造について記された
アンノウンの特殊設計書。
- [`155601`](items.json#L150019) 夢幻深層灼腕ターロス
  - 古代石版に深く刻み込まれた
灼腕ターロスの深層記憶。
- [`155602`](items.json#L150037) 灼腕ターロスジーン
  - 進化の為の情報が詰め込まれた
灼腕ターロスの覚醒術式。
- [`155603`](items.json#L150055) 灼腕ターロスハート
  - 強き想いから生まれた
灼腕ターロスの残留思念。
- [`155604`](items.json#L150073) 灼腕ターロスコア
  - 魔力結晶に封印された
灼腕ターロスのコア。
- [`155605`](items.json#L150091) 特殊設計書灼腕ターロス
  - 極弐改造について記された
灼腕ターロスの特殊設計書。
- [`1230022`](items.json#L154243) テレプシコーラの花嫁衣装
  - テレプシコーラの新たな力を
引き出すことができる魔術礼装。
- [`1654001`](items.json#L162871) バールのようなもの=ビーストの水着
  - ﾊﾞｰﾙのようなもの=ﾋﾞｰｽﾄの新たな力を
引き出すことができる魔術礼装。
- [`1676001`](items.json#L163141) ハルピュイア=ホロウ.ALICEの水着
  - ハルピュイア=ホロウ.ALICEの新たな力を
引き出すことができる魔術礼装。

### 删除 (4)

- [`6275`](../2026_07_09_16_00_00/items.json#L7115) 6月魔装交換クーポン
- [`15342`](../2026_07_09_16_00_00/items.json#L33175) ダークスタージュエル
- [`15344`](../2026_07_09_16_00_00/items.json#L33211) スタージュエル
- [`40831`](../2026_07_09_16_00_00/items.json#L128683) 【期間限定】真式･超強化の鍵α

## jobs

### 新增 (1)

- [`1568`](jobs.json#L197251) トラヤシャ【大罪】 rarity=5
  - rarity=5 / max_level=50
  - job_abilities (18):
    - WeaponType 長剣(1): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 大剣(2): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 太刀(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 杖棒(4): pos=1.9 / neg=1.135 (rank=splus 超得意)
    - WeaponType 弓矢(5): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 連弩(6): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 戦斧(7): pos=1.4 / neg=1.06 (rank=a 得意)
    - WeaponType 騎槍(8): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 投擲(9): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 拳闘(10): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 魔典(11): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 大鎌(12): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 火(1): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 水(2): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 風(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 光(4): pos=1.9 / neg=1.135 (rank=splus 超得意)
    - Element 闇(5): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 無(6): pos=0.3 / neg=0.3 (rank=d 超苦手)
  - job_skills (9):
    - WeaponArtsHitCount Addition +7.0 — 大きな罪を背負う者の証。自分のB.D.ヒット数+7
    - BlazeAttack Multiply ×1.66 — 光装備でB.D.攻撃力とモーション速度が66％UP
    - HitCount Addition +0.0 — 杖棒装備で攻撃ヒット数それぞれ+3
    - Speed Multiply ×0.5 — スピード50%DOWNを代償に、残HPが多いほど攻撃力が超UP(最大122%)
    - GuardBreak Multiply ×0.01 — ブレイク力99%DOWNを代償に、攻撃ヒット数それぞれ+2
    - HP Multiply ×0.75 — 力に耐えきれずHP50%DOWN
    - MotionSpeed Multiply ×1.66 — 光装備でモーション速度が66％UP
    - Vitality_Attack Multiply ×2.22 — 残HPが多いほど攻撃力UP(最大122%)
    - HitCount Addition +0.0 — 攻撃ヒット数それぞれ+2

## evolution_recipes

### 新增 (2)

- `147902`
- `155602`

## weapon_parameter_ranks

(table without primary key — full-table differs;use diff tool手动比较 raw JSON)

## attack_motions

### 新增 (2)

- [`825`](attack_motions.json#L3295) 灼腕2
- [`826`](attack_motions.json#L3299) 不明2

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
