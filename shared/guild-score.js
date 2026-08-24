// shared/guild-score.js — ギルバト 40s ダメージ/スコア模拟 (纯函数、无 DOM)
//
// 模型 (unpacking 03_ead.md §3.9.2 + 08_motion_speed.md §8.6 十帧模型、用户敲定的高频重叠语义):
//   - loop 周期 P = 3段攻速帧 + 1fr(BT) + 転速(cooldown+set) + 1fr(BT)、每隔 P 就重开新 loop、
//     不等上一 loop 的 hit 列打完 — 各 loop 的 hit 在后台并行堆叠。
//   - 段 i 的第一击在 loop 起点 + 前面各段攻速帧累计偏移处落地、之后每 hitInterval 一击。
//   - 每 hit 期望伤害 = 6 档波动率 {1.00..0.95} 均匀取 min(damageLimit, aMax × r) 的均值。
//   - startSeconds (開始秒): 还剩多少秒时开始输出 = 输出窗口长度 (40=满窗口、开幕 buff 咏唱等损耗填更小)。
//   - 截断: timestamp < 窗口末尾的 hit 才计入。
// v1 固定: battleSeconds=40、hitInterval=0.15 (普通、非 Blaze 0.05)、无加时 buff。

export const GUILD_BATTLE_SECONDS = 40;
export const GUILD_HIT_INTERVAL = 0.15;
export const DAMAGE_RANDOM_RATES = [1.0, 0.99, 0.98, 0.97, 0.96, 0.95];
// ギルドスコア换算常量: 結界ボーナス固定 2.6、難易度ボーナス N/H/L = 1/5/10
export const GUILD_BARRIER_BONUS = 2.6;
const GUILD_DIFF_BONUS = { Normal: 1, Hard: 5, Lunatic: 10 };

const FPS = 60;

// input: { aMax, dl, hits: [N1,N2,N3], durF: [f1,f2,f3], cdF, setF,
//          startSeconds?, battleSeconds?, hitInterval? }
// 全部可从 computeStats 返回取: stats['攻撃力'] / damageLimit / hits /
//   motionSpeed.durationsFrames / speed.cooldownFrames / speed.setFrames
// 返 { totalDamage, totalHits, loops, perHit }
export function simulateGuildScore(input) {
  const {
    aMax = 0,
    dl = 0,
    hits = [0, 0, 0],
    durF = [0, 0, 0],
    cdF = 0,
    setF = 0,
    battleSeconds = GUILD_BATTLE_SECONDS,
    startSeconds = battleSeconds,
    hitInterval = GUILD_HIT_INTERVAL,
  } = input || {};

  const nHits = [0, 1, 2].map((i) => Math.max(0, Math.floor(+hits[i] || 0)));

  // 攻速帧: _npc_motions 缺 motion_id 时 durationsFrames 全 0 → 有 hit 的段按最小 2fr 兜底
  // (3 段攻击回落到最小合计 6fr、避免 loop 退化成过密)
  let frames = [0, 1, 2].map((i) => Math.max(0, Math.floor(+durF[i] || 0)));
  if (frames.every((f) => !f)) frames = nHits.map((n) => (n > 0 ? 2 : 0));

  // §8.6 十帧模型: 3段攻速 + 1fr(Combo→Begin BT) + 転速 cooldown+set + 1fr(起手 BT)
  const loopFrames = frames[0] + frames[1] + frames[2] + (Math.floor(+cdF) || 0) + (Math.floor(+setF) || 0) + 2;
  const loopSeconds = loopFrames / FPS;

  // 段 i 起跑偏移 = 前面各段攻速帧累计
  const offset = [0, frames[0] / FPS, (frames[0] + frames[1]) / FPS];

  // 每 hit 期望伤害 = 6 档波动率均值 (每档各自吃 dl 封顶)
  const perHit =
    DAMAGE_RANDOM_RATES.reduce((sum, r) => sum + Math.min(dl, aMax * r), 0) /
    DAMAGE_RANDOM_RATES.length;

  // 開始秒 = 剩余输出时间 = 窗口长度 (clamp 0〜battleSeconds)
  const winSec = Math.min(Math.max(0, +startSeconds || 0), battleSeconds);

  let totalHits = 0;
  let loops = 0;
  if (loopSeconds > 0) {
    for (let k = 0; k * loopSeconds < winSec; k++) {
      loops++;
      const t0 = k * loopSeconds;
      for (let i = 0; i < 3; i++) {
        if (!nHits[i]) continue;
        const start = t0 + offset[i];
        // 段 i 的 hit 在 start + h×hitInterval (h=0..N_i-1)、只数 timestamp < 窗口末尾的 (恰好落界不计)
        const nLand = Math.max(0, Math.min(nHits[i], Math.floor((winSec - start) / hitInterval - 1e-9) + 1));
        totalHits += nLand;
      }
    }
  }

  const totalDamage = Math.floor(perHit * totalHits);
  return { totalDamage, totalHits, loops, perHit };
}

// ギルドスコア换算:
//   score_base = floor(totalDamage / 1e7)
//   score = score_base × 難易度ボーナス × 結界ボーナス(2.6)
// ×26/10 整数运算避 float 噪声 (结果最多 1 位小数)
export function computeGuildScore(totalDamage, difficulty) {
  const scoreBase = Math.floor((+totalDamage || 0) / 1e7);
  const diffBonus = GUILD_DIFF_BONUS[difficulty] ?? 1;
  const score = Math.round(scoreBase * diffBonus * GUILD_BARRIER_BONUS * 10) / 10;
  return { scoreBase, diffBonus, barrierBonus: GUILD_BARRIER_BONUS, score };
}
