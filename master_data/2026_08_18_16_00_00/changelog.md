# master_data changelog: 2026_08_15_16_00_00 → 2026_08_18_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 2 | 0 | 0 |
| materials | 1 | 0 | 0 |
| items | 2 | 0 | 0 |
| evolution_recipes | 1 | 0 | 0 |
| attack_motions | 1 | 0 | 0 |

## weapons

### 新增 (2)

- [`169701`](weapons.json#L275597) 血盟剣ダインスレイフ=TRUE
  - base_name: 血盟剣ダインスレイフ=TRUE (costume: 魔装)
  - element=闇(5) / type=長剣(1) / rarity=SS(4) / cv=山村響
  - max stats: HP=11470 / ATK=13140 / DEF=11470 / SPD=24 / BREAK=150
  - hit_counts=[3, 9, 10] (3段)  motion_speed=[1.8/1.6/1.2]  mp=1300
  - three_size=88/54/79 / initial_slot=3
  - BD: 血盟鮮刃ブラッディ†トゥルース (arts_id=697)
    - description: 敵全体に消費ゲージ数に応じた49連ダメージ＆wave中、味方のﾓｰｼｮﾝ速度が2倍
    - cost=5 / hit_count=49 / value=0.65 / additional_value=5.5
  - innate skills (5):
    - Attack Multiply ×2.97959 — 真解放により自身の攻撃力が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - MotionSpeed Multiply ×2.97959 — 真解放により自身のモーション速度が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - DamageLimitBreak Addition +3000000000.0 — 自身のダメージ上限が30億アップ
    - Enemy_BreakDamageLimitBreak Addition +8000000000.0 — ブレイク時に自身のダメージ上限が80億アップ
    - Vitality_Attack Multiply ×3.0 — 残HPが多いほど自身の攻撃力がアップ(最大3倍)
- [`169702`](weapons.json#L275811) 血盟剣ダインスレイフ=TRUE【極】
  - base_name: 血盟剣ダインスレイフ=TRUE (costume: 極魔装)
  - element=闇(5) / type=長剣(1) / rarity=SS(4) / cv=山村響
  - max stats: HP=14900 / ATK=17080 / DEF=14900 / SPD=24 / BREAK=190
  - hit_counts=[4, 9, 13] (3段)  motion_speed=[1.8/1.6/1.2]  mp=1300
  - three_size=88/54/79 / initial_slot=4
  - BD: 血盟鮮刃ブラッディ†トゥルース (arts_id=697)
    - description: 敵全体に消費ゲージ数に応じた49連ダメージ＆wave中、味方のﾓｰｼｮﾝ速度が2倍
    - cost=5 / hit_count=49 / value=0.65 / additional_value=5.5
  - innate skills (5):
    - Attack Multiply ×2.97959 — 真解放により自身の攻撃力が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - MotionSpeed Multiply ×2.97959 — 真解放により自身のモーション速度が3倍【熟度UPにつれてさらに効果値がUP(最大5倍)】
    - DamageLimitBreak Addition +3000000000.0 — 自身のダメージ上限が30億アップ
    - Enemy_BreakDamageLimitBreak Addition +8000000000.0 — ブレイク時に自身のダメージ上限が80億アップ
    - Vitality_Attack Multiply ×3.0 — 残HPが多いほど自身の攻撃力がアップ(最大3倍)

## materials

### 新增 (1)

- [`54150107`](materials.json#L23845) ホンモノですもの rarity=5
  - うふふ、もう二度と離れませんわ♪
[長剣][ﾀﾞﾒｰｼﾞ上限がUP][上限値:超高]

## items

### 新增 (2)

- [`15351`](items.json#L33355) 【裏式】スタージュエル
  - 膨大な魔力から偶然精製された
稀少鉱石。ダイヤに似た別物。
- [`3010160`](items.json#L165415) ﾀﾞｲﾝｽﾚｲﾌ=TRUE熟度15製造チケット
  - 血盟剣ダインスレイフ=TRUEを熟度15で確実に製造できる術符。

## evolution_recipes

### 新增 (1)

- `169701`

## attack_motions

### 新增 (1)

- [`828`](attack_motions.json#L3307) 血盟

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
