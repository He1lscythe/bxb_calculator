# master_data changelog: 2026_06_10_16_00_00 → 2026_06_10_16_59_22

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| jobs | 0 | 0 | 1 |

## jobs

### 调整 (1,按 id 聚合)

- [`1564`](jobs.json#L196027) ナコウドサン rarity=4
  - `job_skills`:
    - 调整 id=`156404` 生の舞台を見ているようなモノだ
      - `description`: `自身のモーション速度30%DOWNを代償に、B.D.ｹﾞｰｼﾞの最大値&上昇効率UP` → `自身のモーション速度30%DOWNを代償に、B.D.ｹﾞｰｼﾞの最大値UP&同装備セット全体のB.D.コスト-1`
    - 调整 id=`156405` (隠し)生の舞台を見ているようなモノだ
      - `description`: `B.D.ゲージを貯めるのに必要なサファイアが40%低下` → `同装備セット全体のB.D.コスト-1`
      - `math_type`: `Multiply` → `Addition`
      - `parameter`: `BlazeGaugePointRate` → `WeaponArtsCost`
      - `value`: `0.6` → `-1.0`

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
