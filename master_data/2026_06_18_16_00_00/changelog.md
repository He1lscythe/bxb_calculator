# master_data changelog: 2026_06_17_16_00_00 → 2026_06_18_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 0 | 0 | 1 |

## weapons

### 调整 (1)

- [`137603`](weapons.json#L154157) アクアライン【極弐】
  - base_name: アクアライン (costume: 極弐魔装)
  - element=水(2) / type=弓矢(5) / rarity=A(1) / cv=田中あいみ
  - max stats: HP=4570 / ATK=1560 / DEF=4060 / SPD=31 / BREAK=2980
  - hit_counts=[5, 6, 7] (3段)  motion_speed=[4.0/4.0/1.1]  mp=99
  - three_size=94/60/83 / **initial_slot=1 → 3**
  - BD: エンド･オブ･オケアノス (arts_id=10376)
    - description: 敵全体に13連ダメージ＆ブレイク力10%UP
    - cost=5 / hit_count=13 / value=4.23 / additional_value=0.0
  - innate skills (1):
    - MotionSpeed Multiply ×1.3 — 水属性の魔剣の攻撃モーションが加速

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
