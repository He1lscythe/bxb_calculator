// Master test runner — 跑所有 tests/test_*.{cjs,mjs}，汇总通过率
// 用法: node tests/run_all.cjs
//
// Node ≥ 14 原生支持 .mjs（ESM）和 .cjs（CommonJS）混合 — spawn 子进程跑、不需要 flag。

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS = fs
  .readdirSync(__dirname)
  .filter((f) => f.startsWith('test_') && (f.endsWith('.cjs') || f.endsWith('.mjs')))
  .sort();

let totalPass = 0,
  totalFail = 0;
const summaries = [];

for (const t of TESTS) {
  const r = spawnSync('node', [path.join(__dirname, t)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m =
    out.match(/(\d+)\s+pass(?:ed)?[,\s]+\s*(\d+)?/i) || out.match(/Passed:\s+(\d+)\s+\/\s+(\d+)/);
  let pass = 0,
    fail = 0;
  if (m) {
    if (m[0].toLowerCase().includes('passed:')) {
      pass = +m[1];
      fail = +m[2] - pass;
    } else {
      pass = +m[1];
      fail = +(m[2] || 0);
    }
  }
  totalPass += pass;
  totalFail += fail;
  const status = r.status === 0 && fail === 0 ? '✓' : '✗';
  summaries.push(`${status} ${t.padEnd(30)} ${pass} pass${fail ? `, ${fail} fail` : ''}`);
}

console.log('=== Test Summary ===');
for (const s of summaries) console.log(s);
console.log(`\nTotal: ${totalPass} pass, ${totalFail} fail`);
process.exit(totalFail > 0 ? 1 : 0);
