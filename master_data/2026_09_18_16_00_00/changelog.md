# master_data changelog: 2026_09_18_00_00_00 → 2026_09_18_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| items | 1 | 4 | 0 |
| jobs | 1 | 0 | 0 |

## items

### 新增 (1)

- [`1043022`](items.json#L151555) ラムバロヒの花嫁衣装
  - ラムバロヒの新たな力を
引き出すことができる魔術礼装。

### 删除 (4)

- [`15353`](../2026_09_18_00_00_00/items.json#L33373) オレンジスタージュエル
- [`15355`](../2026_09_18_00_00_00/items.json#L33409) グリーンスタージュエル
- [`40841`](../2026_09_18_00_00_00/items.json#L128881) 【期間限定】真式･超強化の鍵β
- [`40843`](../2026_09_18_00_00_00/items.json#L128917) 【期間限定】真式･超強化の鍵σ

## jobs

### 新增 (1)

- [`1569`](jobs.json#L197693) キコクシジョ【大罪】 rarity=5
  - rarity=5 / max_level=50
  - job_abilities (18):
    - WeaponType 長剣(1): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 大剣(2): pos=1.4 / neg=1.06 (rank=a 得意)
    - WeaponType 太刀(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 杖棒(4): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 弓矢(5): pos=1.9 / neg=1.135 (rank=splus 超得意)
    - WeaponType 連弩(6): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 戦斧(7): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 騎槍(8): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 投擲(9): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 拳闘(10): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 魔典(11): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - WeaponType 大鎌(12): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 火(1): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 水(2): pos=1.9 / neg=1.135 (rank=splus 超得意)
    - Element 風(3): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 光(4): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 闇(5): pos=0.3 / neg=0.3 (rank=d 超苦手)
    - Element 無(6): pos=0.3 / neg=0.3 (rank=d 超苦手)
  - job_skills (10):
    - WeaponArtsHitCount Addition +7.0 — 大きな罪を背負う者の証。自分のB.D.ヒット数+7
    - Attack Multiply ×1.66 — 水属性装備で攻撃力が66%UP
    - HitCount Addition +0.0 — 弓矢装備で攻撃ヒット数それぞれ+3
    - WeaponArtsCost Addition +1.0 — B.D.コスト+1を代償に、残HPが少ないほどB.D.攻撃力UP(最大111%)とB.D.ヒット数+6
    - Speed Multiply ×0.5 — スピード50%DOWNを代償に、勇気分解無効と即死無効
    - HP Multiply ×0.75 — 力に耐えきれずHP25％DOWN
    - RemHP_BlazeAttack Multiply ×1.11 — 残HPが少ないほどB.D.攻撃力UP(最大111%)
    - WeaponArtsHitCount Addition +6.0 — B.D.ヒット数+6
    - BlazeAbsorb Repel_Percent ×100.0 — 勇気分解無効
    - InstantDeath Repel_Percent ×100.0 — 即死無効

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
