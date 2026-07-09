// tests/unit/test_guild_score.mjs — guild-score.js ギルバト 40s ダメージ/スコア模拟单测
//
// 模型: loop 周期 = 3段攻速帧 + 転速(cooldown+set) + 2fr(BT)、高频重叠 (loop 每 P 重开、
// hit 列后台并行堆叠)、段 i 偏移 = 前面各段攻速帧累计、perHit = 6 档波动率均值 min(dl, aMax×r)、
// startSeconds (開始秒) = 剩余输出时间 = 窗口长度 (默认满窗口)、timestamp < 窗口末尾才计入 (恰好落界不计)。
// 对拍策略: 逐 hit 枚举的 brute-force 独立复算 total、跟闭式 nLand 公式比对。

import { test } from 'node:test';
import assert from 'node:assert';
import {
  simulateGuildScore,
  computeGuildScore,
  GUILD_BATTLE_SECONDS,
  GUILD_HIT_INTERVAL,
  GUILD_BARRIER_BONUS,
  DAMAGE_RANDOM_RATES,
} from '../../shared/guild-score.js';

// 独立复算: 逐 loop × 逐段 × 逐 hit 枚举 timestamp、不走闭式公式
const bruteForce = (input) => {
  const {
    aMax = 0, dl = 0, hits = [0, 0, 0], durF = [0, 0, 0], cdF = 0, setF = 0,
    battleSeconds = GUILD_BATTLE_SECONDS, startSeconds = battleSeconds, hitInterval = GUILD_HIT_INTERVAL,
  } = input;
  const nHits = hits.map((n) => Math.max(0, Math.floor(+n || 0)));
  let frames = durF.map((f) => Math.max(0, Math.floor(+f || 0)));
  if (frames.every((f) => !f)) frames = nHits.map((n) => (n > 0 ? 2 : 0));
  const loopSeconds = (frames[0] + frames[1] + frames[2] + cdF + setF + 2) / 60;
  const offset = [0, frames[0] / 60, (frames[0] + frames[1]) / 60];
  const perHit = DAMAGE_RANDOM_RATES.reduce((s, r) => s + Math.min(dl, aMax * r), 0) / DAMAGE_RANDOM_RATES.length;
  const winSec = Math.min(Math.max(0, startSeconds), battleSeconds);
  let totalHits = 0;
  let loops = 0;
  if (loopSeconds > 0) {
    for (let k = 0; k * loopSeconds < winSec; k++) {
      loops++;
      for (let i = 0; i < 3; i++) {
        for (let h = 0; h < nHits[i]; h++) {
          const t = k * loopSeconds + offset[i] + h * hitInterval;
          if (t < winSec - 1e-9) totalHits++;
        }
      }
    }
  }
  return { totalDamage: Math.floor(perHit * totalHits), totalHits, loops, perHit };
};

// ============================================================
// 手算对拍 (plan 基准 case)
// ============================================================
test('手算对拍: aMax=100000 dl=2e9 hits=[12,11,18] durF=[4,4,10] cdF=2 setF=1', () => {
  const input = { aMax: 100000, dl: 2e9, hits: [12, 11, 18], durF: [4, 4, 10], cdF: 2, setF: 1 };
  const r = simulateGuildScore(input);
  // loopFrames = (4+4+10) + 2 + 1 + 2 = 23 → loopSeconds = 23/60 ≈ 0.3833
  // loops = ceil(40 / (23/60)) = 105 (k=0..104、104×23/60 ≈ 39.87 < 40)
  assert.strictEqual(r.loops, 105);
  // perHit = 100000 × mean(1.00,0.99,0.98,0.97,0.96,0.95) = 97500 (dl 不触顶)
  assert.strictEqual(r.perHit, 97500);
  // total 独立复算比对 + totalDamage = floor(perHit × total)
  const bf = bruteForce(input);
  assert.strictEqual(r.totalHits, bf.totalHits);
  assert.strictEqual(r.totalDamage, Math.floor(97500 * r.totalHits));
  assert.strictEqual(r.totalDamage, bf.totalDamage);
});

// ============================================================
// 最小 10fr loop (§8.6 十帧模型下限)
// ============================================================
test('最小 10fr: durF=[2,2,2] cdF=1 setF=1 → loopSeconds=1/6、40s 240 loop', () => {
  const input = { aMax: 1000, dl: 2e9, hits: [1, 1, 1], durF: [2, 2, 2], cdF: 1, setF: 1 };
  const r = simulateGuildScore(input);
  // loopFrames = 6 + 1 + 1 + 2 = 10 → loopSeconds = 1/6 → k < 240 → 240 loops
  assert.strictEqual(r.loops, 240);
  // 每 loop 3 段各 1 hit、段起点最晚 239/6 + 4/60 = 39.9 < 40 → 全落地
  assert.strictEqual(r.totalHits, 720);
  assert.strictEqual(r.totalDamage, bruteForce(input).totalDamage);
});

// ============================================================
// ダメ上限封顶
// ============================================================
test('dl < aMax×0.95 → 6 档全触顶、perHit = dl', () => {
  const r = simulateGuildScore({ aMax: 100, dl: 50, hits: [1, 0, 0], durF: [10, 0, 0], cdF: 1, setF: 1 });
  assert.strictEqual(r.perHit, 50);
});

test('dl 部分触顶: aMax=100 dl=97 → perHit = (97×4+96+95)/6 = 96.5', () => {
  const r = simulateGuildScore({ aMax: 100, dl: 97, hits: [1, 0, 0], durF: [10, 0, 0], cdF: 1, setF: 1 });
  assert.strictEqual(r.perHit, 96.5);
});

// ============================================================
// 40s 截断 (末尾 loop 跨界 + offset) / t=40 边界
// ============================================================
test('t=40 恰好落界的 hit 不计 (timestamp < 40 严格)', () => {
  // loopFrames = 10+48+0+2 = 60 → loopSeconds=1 → k=0..39
  // k=39 段1 hit 在 39.0 + h×0.25 (h=0..4)、h=4 恰好 t=40 → 只落 4 hit
  const input = { aMax: 100, dl: 2e9, hits: [5, 0, 0], durF: [10, 0, 0], cdF: 48, setF: 0, hitInterval: 0.25 };
  const r = simulateGuildScore(input);
  assert.strictEqual(r.loops, 40);
  assert.strictEqual(r.totalHits, 39 * 5 + 4);
  assert.strictEqual(r.totalDamage, bruteForce(input).totalDamage);
});

test('末尾 loop 跨 40s 边界: offset 影响截断、hit 列被剪短', () => {
  // loopFrames = (60+60+60)+117+1+2 = 300 → loopSeconds=5 → k=0..7 (8 loops)
  // k=7: t0=35、段3 offset=(60+60)/60=2 → start=37、hit 在 37+h×0.15、
  //   h < (40-37)/0.15 = 20 → 段3 (N=30) 只落 20
  const input = { aMax: 100, dl: 2e9, hits: [0, 0, 30], durF: [60, 60, 60], cdF: 117, setF: 1 };
  const r = simulateGuildScore(input);
  assert.strictEqual(r.loops, 8);
  assert.strictEqual(r.totalHits, 7 * 30 + 20);
  assert.strictEqual(r.totalDamage, bruteForce(input).totalDamage);
});

// ============================================================
// startSeconds (開始秒) = 剩余输出时间 = 窗口长度
// ============================================================
test('startSeconds=10 → 10s 输出窗口 (等价 battleSeconds=10 满跑)', () => {
  const base = { aMax: 100, dl: 2e9, hits: [3, 4, 5], durF: [4, 4, 10], cdF: 2, setF: 1 };
  const remain10 = simulateGuildScore({ ...base, startSeconds: 10 });
  const full10 = simulateGuildScore({ ...base, battleSeconds: 10 });
  assert.strictEqual(remain10.totalHits, full10.totalHits);
  assert.strictEqual(remain10.loops, full10.loops);
  assert.strictEqual(remain10.totalDamage, bruteForce({ ...base, startSeconds: 10 }).totalDamage);
  // 窗口越短 hit 越少
  assert.ok(remain10.totalHits < simulateGuildScore(base).totalHits);
});

test('startSeconds 缺省/clamp: 缺省=40 满窗口、40=满窗口、>40 clamp 40、≤0 → 0 hit', () => {
  const base = { aMax: 100, dl: 2e9, hits: [3, 0, 0], durF: [4, 0, 0], cdF: 2, setF: 1 };
  const full = simulateGuildScore(base);
  assert.strictEqual(simulateGuildScore({ ...base, startSeconds: 40 }).totalHits, full.totalHits);
  assert.strictEqual(simulateGuildScore({ ...base, startSeconds: 999 }).totalHits, full.totalHits);
  assert.strictEqual(simulateGuildScore({ ...base, startSeconds: 0 }).totalHits, 0);
  assert.strictEqual(simulateGuildScore({ ...base, startSeconds: -5 }).totalHits, 0);
});

// ============================================================
// durF 全 0 兜底 / N_i=0 跳过
// ============================================================
test('durF 全 0 → 有 hit 的段按 2fr 兜底、无 hit 段 0fr', () => {
  // frames=[2,0,2] → loopFrames = 4+1+1+2 = 8 → loopSeconds=2/15 → k < 300 → 300 loops
  const input = { aMax: 100, dl: 2e9, hits: [12, 0, 18], durF: [0, 0, 0], cdF: 1, setF: 1 };
  const r = simulateGuildScore(input);
  assert.strictEqual(r.loops, 300);
  assert.strictEqual(r.totalHits, bruteForce(input).totalHits);
  assert.strictEqual(r.totalDamage, bruteForce(input).totalDamage);
});

test('N_i=0 的段不贡献 hit (durF 正常时)', () => {
  const withMid = simulateGuildScore({ aMax: 100, dl: 2e9, hits: [3, 5, 0], durF: [4, 4, 4], cdF: 2, setF: 1 });
  const noMid = simulateGuildScore({ aMax: 100, dl: 2e9, hits: [3, 0, 0], durF: [4, 4, 4], cdF: 2, setF: 1 });
  // 段2 清零后 total 减少的正好是段2 的贡献、loop 周期不变
  assert.strictEqual(withMid.loops, noMid.loops);
  assert.ok(withMid.totalHits > noMid.totalHits);
  const bf = bruteForce({ aMax: 100, dl: 2e9, hits: [3, 5, 0], durF: [4, 4, 4], cdF: 2, setF: 1 });
  assert.strictEqual(withMid.totalHits, bf.totalHits);
});

test('全空输入 → totalDamage=0 不炸', () => {
  const r = simulateGuildScore({ aMax: 0, dl: 0, hits: [0, 0, 0], durF: [0, 0, 0], cdF: 0, setF: 0 });
  assert.strictEqual(r.totalDamage, 0);
  assert.strictEqual(r.totalHits, 0);
});

// ============================================================
// computeGuildScore: ダメージ → ギルドスコア换算
// ============================================================
test('computeGuildScore: score_base = floor(damage/1e7)、難易度 N/H/L = 1/5/10、結界 2.6', () => {
  // 123,456,789 / 1e7 → floor = 12
  const n = computeGuildScore(123456789, 'Normal');
  assert.deepStrictEqual(n, { scoreBase: 12, diffBonus: 1, barrierBonus: 2.6, score: 31.2 });
  const h = computeGuildScore(123456789, 'Hard');
  assert.strictEqual(h.diffBonus, 5);
  assert.strictEqual(h.score, 156); // 12 × 5 × 2.6
  const l = computeGuildScore(123456789, 'Lunatic');
  assert.strictEqual(l.diffBonus, 10);
  assert.strictEqual(l.score, 312); // 12 × 10 × 2.6
});

test('computeGuildScore: float 噪声 (13×2.6=33.8 精确)、未知難易度→×1、0 ダメ→0', () => {
  const r = computeGuildScore(139999999, 'Normal');
  assert.strictEqual(r.scoreBase, 13);
  assert.strictEqual(r.score, 33.8); // 13 × 2.6 (无 33.800000000000004)
  assert.strictEqual(computeGuildScore(5e8, undefined).diffBonus, 1);
  assert.deepStrictEqual(computeGuildScore(0, 'Lunatic').score, 0);
  assert.strictEqual(computeGuildScore(9999999, 'Lunatic').scoreBase, 0); // 1e7 未満
  assert.strictEqual(GUILD_BARRIER_BONUS, 2.6);
});
