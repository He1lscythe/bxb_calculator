// tests/unit/test_transmit_matrix.mjs — 伝承ボーナス矩阵解码 / 查询 (shared/transmit-matrix.js)

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  decodeTransmit,
  transmitCell,
  transmitBonusName,
  transmitCut,
  isTransmitInferred,
  countTransmit,
  TB_NONE,
  TB_UNTESTED,
  TB_SAME,
} from '../../shared/transmit-matrix.js';

// base 10:10..13;11 是空号 (全 0)
const SAMPLE = {
  base: 10,
  enum: ['同型因子', '鍵師'],
  sources: [10, 12, 13],
  inferred: [[13, 10]],
  rows: ['0', '00', '200', '3010'],
};

test('decodeTransmit: 非矩阵格式 → null', () => {
  assert.strictEqual(decodeTransmit(null), null);
  assert.strictEqual(decodeTransmit({ 1001: {} }), null);
});

test('transmitCell: 对称查询 + 下三角取值', () => {
  const tm = decodeTransmit(SAMPLE);
  assert.strictEqual(transmitCell(tm, 12, 10), TB_SAME);
  assert.strictEqual(transmitCell(tm, 10, 12), TB_SAME);
  assert.strictEqual(transmitCell(tm, 13, 10), 3);
  assert.strictEqual(transmitCell(tm, 13, 11), TB_NONE);
  assert.strictEqual(transmitCell(tm, 13, 12), TB_UNTESTED);
});

test('transmitCell: 矩阵范围外 (新魔剣) = 未測', () => {
  const tm = decodeTransmit(SAMPLE);
  assert.strictEqual(transmitCell(tm, 14, 10), TB_UNTESTED);
  assert.strictEqual(transmitCell(tm, 9, 10), TB_UNTESTED);
});

test('bonus 名 / 消耗减量 / 推定', () => {
  const tm = decodeTransmit(SAMPLE);
  assert.strictEqual(transmitBonusName(tm, TB_SAME), '同型因子');
  assert.strictEqual(transmitBonusName(tm, 3), '鍵師');
  assert.strictEqual(transmitBonusName(tm, TB_UNTESTED), null);
  assert.deepStrictEqual(
    [transmitCut(TB_NONE), transmitCut(TB_UNTESTED), transmitCut(2), transmitCut(3)],
    [0, 0, 2, 1],
  );
  assert.strictEqual(isTransmitInferred(tm, 10, 13), true);
  assert.strictEqual(isTransmitInferred(tm, 13, 10), true);
  assert.strictEqual(isTransmitInferred(tm, 12, 10), false);
});

test('countTransmit: 只数能当伝承元的、排除自身', () => {
  const tm = decodeTransmit(SAMPLE);
  // 伝承先 10:12 同型 / 13 鍵師;11 不是伝承元
  assert.deepStrictEqual(countTransmit(tm, 10, [10, 11, 12, 13]), {
    bonus: 2,
    unknown: 0,
    none: 0,
  });
  // 伝承先 12:10 同型 / 13 未測
  assert.deepStrictEqual(countTransmit(tm, 12, [10, 11, 12, 13]), {
    bonus: 1,
    unknown: 1,
    none: 0,
  });
});

test('data/transmit_bonus.json: 行长 = 下三角、enum[0] = 同型因子', () => {
  const data = JSON.parse(
    readFileSync(new URL('../../data/transmit_bonus.json', import.meta.url), 'utf8'),
  );
  data.rows.forEach((r, i) => assert.strictEqual(r.length, i + 1, `row ${i}`));
  assert.strictEqual(data.enum[0], '同型因子');
  const tm = decodeTransmit(data);
  // レヴァンテイン ↔ レヴァンテイン=ヘル 实测同型
  assert.strictEqual(transmitCell(tm, 1002, 1001), TB_SAME);
  for (const [a, b] of data.inferred)
    assert.ok(transmitCell(tm, a, b) >= TB_SAME, `inferred ${a}-${b}`);
});
