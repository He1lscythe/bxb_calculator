# master_data changelog: 2026_08_19_16_00_00 → 2026_08_21_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| items | 0 | 1 | 0 |
| jobs | 1 | 0 | 0 |

## items

### 删除 (1)

- [`15349`](../2026_08_19_16_00_00/items.json#L33319) グリーンスタージュエル

## jobs

### 新增 (1)

- [`1572`](jobs.json#L198561) エンペラー rarity=4
  - rarity=4 / max_level=40
  - job_abilities (18):
    - WeaponType 長剣(1): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 大剣(2): pos=1.7 / neg=1.105 (rank=s 超得意)
    - WeaponType 太刀(3): pos=1.7 / neg=1.105 (rank=s 超得意)
    - WeaponType 杖棒(4): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 弓矢(5): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 連弩(6): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 戦斧(7): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 騎槍(8): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 投擲(9): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 拳闘(10): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 魔典(11): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 大鎌(12): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 火(1): pos=1.6 / neg=1.09 (rank=aplus 超得意)
    - Element 水(2): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 風(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 光(4): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 闇(5): pos=1.6 / neg=1.09 (rank=aplus 超得意)
    - Element 無(6): pos=1.6 / neg=1.09 (rank=aplus 超得意)
  - job_skills (10):
    - Speed Multiply ×1.2 — 世界を守り抜く証。装備セット全ての速度が大アップ
    - Attack Multiply ×1.25 — 火か闇か無装備で同装備セット全体の攻撃力25%UP
    - Speed Multiply ×1.4 — 大剣か太刀装備で同装備セット全体のスピード40%UP
    - PlayerHit Multiply ×1.2 — 同装備セット全体の命中率UP
    - RemHP_Attack Multiply ×1.75 — 同装備セット全体の防御力とブレイク力DOWNを代償に、味方全体が残HP少ないほど攻撃力UP(最大75%)
    - Attack Multiply ×1.25 — 闇装備で同装備セット全体の攻撃力25%UP
    - Attack Multiply ×1.25 — 無装備で同装備セット全体の攻撃力25%UP
    - Speed Multiply ×1.4 — 太刀装備で同装備セット全体のスピード40%UP
    - Defense Multiply ×0.66 — 同装備セット全体の防御力DOWN
    - GuardBreak Multiply ×0.1 — 同装備セット全体のブレイク力DOWN

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
