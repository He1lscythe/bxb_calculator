# master_data changelog: 2026_06_10_16_59_22 → 2026_06_11_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 0 | 0 | 333 |
| materials | 3 | 0 | 0 |
| items | 3 | 0 | 0 |
| jobs | 1 | 0 | 0 |
| scenarios | 13 | 0 | 0 |

## weapons

### 调整 (333,按字段聚合)

#### `weapon_skills` (333 个)
**子项新增** (333 次):
- id=`3000021` 【イベント限定】衝突転移耐性Lv5 — 在 333 个 id 里新增: [[`100201`](weapons.json#L355), [`100202`](weapons.json#L531), [`100203`](weapons.json#L726), [`102101`](weapons.json#L8051), [`102102`](weapons.json#L8195), [`102103`](weapons.json#L8339), [`102301`](weapons.json#L8884), [`102302`](weapons.json#L9028), ...] (共 333)
  - description: マスターとおでこをごっつんした経験により入れ替わり現象への耐性がつき、【Machina Heart Beating】で「作戦貢献度」の取得数が上がる

#### `has_event_weapon_skills` (329 个)
- `False` → `True`: ids = [[`100201`](weapons.json#L355), [`100202`](weapons.json#L531), [`100203`](weapons.json#L726), [`102101`](weapons.json#L8051), [`102102`](weapons.json#L8195), [`102103`](weapons.json#L8339), [`102301`](weapons.json#L8884), [`102302`](weapons.json#L9028), ...] (共 329)

## materials

### 新增 (3)

- [`41010061`](materials.json#L11987) Machina Heart rarity=4
  - 真面目な神とひび割れた心。
[水のみ][最大HPがUP][上限値:高]
- [`53070062`](materials.json#L22263) Loving Dawn rarity=5
  - 初めて感じた、好きの鼓動。[水投擲]
[残HP多いほどﾓｰｼｮﾝ速度UP][上限値:超高]
- [`131010026`](materials.json#L28787) 目と目がアウっ！ rarity=3
  - 瞬間、ぶつかったと気づいた。
[作戦貢献度の獲得量UP][上限値:高]

## items

### 新增 (3)

- [`8824`](items.json#L27035) アーベントロートの愛鍵
  - アーベントロートがこっそり置いた鍵。
愛の館で彼女と過ごすことができる。
- [`91260`](items.json#L144577) 作戦貢献度
  - 「Machina Heart Beating｣ 作戦に貢献した証。
- [`2500041`](items.json#L182349) 心音の共鳴者
  - 愛を知った神と心を通わせた者の証

## jobs

### 新增 (1)

- [`1565`](jobs.json#L196418) アコライト rarity=4
  - rarity=4 / max_level=40
  - job_abilities (18):
    - WeaponType 長剣(1): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 大剣(2): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 太刀(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 杖棒(4): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 弓矢(5): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 連弩(6): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 戦斧(7): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 騎槍(8): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 投擲(9): pos=1.7 / neg=1.105 (rank=s 超得意)
    - WeaponType 拳闘(10): pos=1.7 / neg=1.105 (rank=s 超得意)
    - WeaponType 魔典(11): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 大鎌(12): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 火(1): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 水(2): pos=1.7 / neg=1.105 (rank=s 超得意)
    - Element 風(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 光(4): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 闇(5): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 無(6): pos=1.7 / neg=1.105 (rank=s 超得意)
  - job_skills (9):
    - Speed Multiply ×1.2 — 世界を守り抜く証。装備セット全ての速度が大アップ
    - Attack Multiply ×1.5 — 水か無装備で同装備セット全体の攻撃力50%UP
    - SapphireDrop Multiply ×1.45 — 水か無装備でサファイア獲得量45%UP
    - MotionSpeed Multiply ×1.4 — 投擲か拳闘装備でモーション速度40%UP
    - Raise Multiply ×0.7 — 投擲か拳闘装備で1度だけHP70%で復活
    - Attack Multiply ×1.5 — 無装備で同装備セット全体の攻撃力50%UP
    - SapphireDrop Multiply ×1.45 — 無装備でサファイア獲得量45%UP
    - MotionSpeed Multiply ×1.4 — 拳闘装備でモーション速度40%UP
    - Raise Multiply ×0.7 — 拳闘装備で1度だけHP70%で復活

## scenarios

### 新增 (13)

- [`326001`](scenarios.json#L9693) 気になるあの神
- [`326002`](scenarios.json#L9703) チェンジ
- [`326003`](scenarios.json#L9713) 入れ替わった二人
- [`326004`](scenarios.json#L9723) 特訓スタート
- [`326005`](scenarios.json#L9733) 知りたいあの神
- [`326006`](scenarios.json#L9743) ニンギョウとカミサマ
- [`326007`](scenarios.json#L9753) ヒビ割れたココロ
- [`326008`](scenarios.json#L9763) ニンギョウのネガイ
- [`326009`](scenarios.json#L9773) カミサマのネガイ
- [`326010`](scenarios.json#L9783) アーベントロート
- [`326011`](scenarios.json#L9793) その心に名前をつけて
- [`326012`](scenarios.json#L9803) Machina Heart Beating
- [`326013`](scenarios.json#L9813) おまけしなりお

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
