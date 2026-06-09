# master_data changelog: 2026_06_03_14_51_38 → 2026_06_04_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 0 | 0 | 319 |
| materials | 0 | 0 | 12 |
| items | 3 | 0 | 0 |
| jobs | 1 | 0 | 0 |
| weapon_innate_skills | 0 | 1 | 0 |

## weapons

### 调整 (319,按字段聚合)

#### `weapon_skills` (319 个)
**子项删除** (319 次):
- id=`3000020` 【イベント限定】オモチャほりっくLv5 — 从 319 个 id 删除: [[`100601`](weapons.json#L2125), [`100602`](weapons.json#L2263), [`100603`](weapons.json#L2401), [`100701`](weapons.json#L2539), [`100702`](weapons.json#L2664), [`100703`](weapons.json#L2789), [`100801`](weapons.json#L2927), [`100802`](weapons.json#L3052), ...] (共 319)

#### `has_event_weapon_skills` (315 个)
- `True` → `False`: ids = [[`100601`](weapons.json#L2125), [`100602`](weapons.json#L2263), [`100603`](weapons.json#L2401), [`100701`](weapons.json#L2539), [`100702`](weapons.json#L2664), [`100703`](weapons.json#L2789), [`100801`](weapons.json#L2927), [`100802`](weapons.json#L3052), ...] (共 315)

## materials

### 调整 (12)

- [`42010269`](materials.json#L13205) メルティレコード'22 rarity=4
  - `description`: `[神竜機関ﾊﾞﾊﾑｰﾄ=ﾛｽﾄのみ]` → `[ｲﾐﾃｨｼｮﾝ=ｱﾘｽ=ﾋﾟｭｱ=ﾛｽﾄのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`42010326`](materials.json#L13345) メルティレコード'23 rarity=4
  - `description`: `[鳳凰円文螺鈿黒櫃:Blazeのみ]` → `[聖邪剣ｸﾗﾚﾝﾄ:Blazeのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`42010327`](materials.json#L13359) メルティレコード'23 rarity=4
  - `description`: `[聖邪剣ｸﾗﾚﾝﾄ:Blazeのみ]` → `[鳳凰円文螺鈿黒櫃:Blazeのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`42010366`](materials.json#L13513) メルティレコード'24 rarity=4
  - `description`: `[ｴｸｽ=ﾚﾌﾟﾘｶのみ]` → `[ぺるりあのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`42010367`](materials.json#L13527) メルティレコード'24 rarity=4
  - `description`: `[珍獣姫ﾓﾃｨﾋﾂﾃﾞｨﾝﾇのみ]` → `[魔剣ｸﾞﾗﾑ:Blazeのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`42010395`](materials.json#L13555) メルティレコード'25 rarity=4
  - `description`: `[純神ｱｲｷﾞｽ×ﾋﾟｭｱのみ]` → `[原罪王ｲﾐﾃｨｼｮﾝ=ﾛｰﾙのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`42010426`](materials.json#L13639) メルティレコード'26 rarity=4
  - `description`: `[ｱﾄﾞﾚﾅﾘﾝのみ]` → `[ｲﾐﾃｨｼｮﾝ=ｻﾀﾆｱのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`42010427`](materials.json#L13653) メルティレコード'26 rarity=4
  - `conditional_parameter`: `True` → `False`
  - `description`: `[ｲﾐﾃｨｼｮﾝ=ﾛｰﾙ=ｻﾝﾀ=ﾋﾟｭｱのみ]` → `[:name:のみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`43020219`](materials.json#L16383) ディアリィレコード'24 rarity=4
  - `description`: `[ﾘﾃﾞｨのみ]` → `[渡橋あみらのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`43020220`](materials.json#L16397) ディアリィレコード'24 rarity=4
  - `conditional_parameter`: `False` → `True`
  - `description`: `[:name:のみ]` → `[ｴｸｽ=ﾚﾌﾟﾘｶのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`43020284`](materials.json#L16537) ディアリィレコード'26 rarity=4
  - `description`: `[終焉剣ｱﾎﾟｶﾘﾌﾟｽのみ]` → `[ｲﾐﾃｨｼｮﾝ=ｻﾀﾆｱのみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)
- [`43020285`](materials.json#L16551) ディアリィレコード'26 rarity=4
  - `conditional_parameter`: `True` → `False`
  - `description`: `[ｲﾐﾃｨｼｮﾝ=ｻﾀﾆｱのみ]` → `[:name:のみ]` (公共 1 行前缀 + 0 行后缀 共 2/2 行)

## items

### 新增 (3)

- [`8822`](items.json#L26995) 魔力補給装束（花嫁仕様）
  - 純白の幸せが詰まった装束。
使ったあとはクリーニングに出そう!!
- [`8823`](items.json#L27015) ブライダルブーケ
  - あの思い出の一日を思い出す記念品。
存在しなくても、思い出せる。
- [`8825`](items.json#L27035) 再現体交戦情報《太陽王》
  - 太陽王再現体との戦闘データ。
世界図書館に転送しよう。

## jobs

### 新增 (1)

- [`1564`](jobs.json#L196027) ナコウドサン
  - rarity=4 / max_level=40
  - job_abilities (18):
    - WeaponType 長剣(1): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 大剣(2): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 太刀(3): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 杖棒(4): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 弓矢(5): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 連弩(6): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 戦斧(7): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 騎槍(8): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 投擲(9): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 拳闘(10): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 魔典(11): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - WeaponType 大鎌(12): pos=1.5 / neg=1.075 (rank=aplus 超得意)
    - Element 火(1): pos=1.0 / neg=1.0 (rank=b ふつう)
    - Element 水(2): pos=1.0 / neg=1.0 (rank=b ふつう)
    - Element 風(3): pos=1.0 / neg=1.0 (rank=b ふつう)
    - Element 光(4): pos=1.0 / neg=1.0 (rank=b ふつう)
    - Element 闇(5): pos=1.0 / neg=1.0 (rank=b ふつう)
    - Element 無(6): pos=1.0 / neg=1.0 (rank=b ふつう)
  - job_skills (7):
    - Speed Multiply ×1.2 — 世界を守り抜く証。装備セット全ての速度が大アップ
    - BlazeAttack Multiply ×2.0 — 同装備セット全体のB.D.攻撃力が100%UP
    - SapphireDrop Multiply ×1.3 — 同装備セット全体のサファイア獲得量が30%UP
    - DamageLimitBreak Addition +300000000.0 — 同装備セット全体のﾀﾞﾒｰｼﾞ上限3億UP
    - BlazeGaugeMaxLevel Addition +20.0 — 自身のモーション速度30%DOWNを代償に、B.D.ｹﾞｰｼﾞの最大値&上昇効率UP
    - BlazeGaugePointRate Multiply ×0.6 — B.D.ゲージを貯めるのに必要なサファイアが40%低下
    - MotionSpeed Multiply ×0.7 — モーション速度が30%DOWN

## weapon_innate_skills

### 删除 (1)

- [`3000020`](../2026_06_03_14_51_38/weapon_innate_skills.json#L21274) 【イベント限定】オモチャほりっくLv5

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
