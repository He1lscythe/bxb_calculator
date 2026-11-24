// 伝承ボーナス矩阵 (data/transmit_bonus.json、build_transmit_bonus.py 生成)
// rows[i] = base+i 对 base..base+i (下三角、对称),一格一个 62 进制字符 → 解码成 Uint8Array
// 格值:0 = 无 bonus,1 = 未測,2+ = enum[v-2] (2 = 同型因子)
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const TB_NONE = 0;
export const TB_UNTESTED = 1;
export const TB_SAME = 2;

const _pairKey = (a, b) => (a < b ? a * 100000 + b : b * 100000 + a);

export const decodeTransmit = (data) => {
  if (!data || !Array.isArray(data.rows)) return null;
  const lut = new Uint8Array(128).fill(TB_UNTESTED);
  for (let i = 0; i < DIGITS.length; i++) lut[DIGITS.charCodeAt(i)] = i;
  const n = data.rows.length;
  const tri = new Uint8Array((n * (n + 1)) / 2).fill(TB_UNTESTED);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const r = data.rows[i];
    for (let j = 0; j <= i; j++, k++) if (j < r.length) tri[k] = lut[r.charCodeAt(j)];
  }
  return {
    base: data.base,
    n,
    tri,
    enum: data.enum || [],
    sources: new Set(data.sources || []),
    inferred: new Set((data.inferred || []).map(([a, b]) => _pairKey(a, b))),
  };
};

// 矩阵范围外 (之后新出的魔剣) = 未測
export const transmitCell = (tm, a, b) => {
  let i = a - tm.base;
  let j = b - tm.base;
  if (i < j) [i, j] = [j, i];
  if (j < 0 || i >= tm.n) return TB_UNTESTED;
  return tm.tri[(i * (i + 1)) / 2 + j];
};

export const transmitBonusName = (tm, v) => (v >= TB_SAME ? (tm.enum[v - TB_SAME] ?? null) : null);

export const transmitCut = (v) => (v === TB_SAME ? 2 : v > TB_SAME ? 1 : 0);

export const isTransmitInferred = (tm, a, b) => tm.inferred.has(_pairKey(a, b));

// 伝承先 dst 的各状态伝承元数 (只数能当伝承元的)
export const countTransmit = (tm, dst, srcIds) => {
  const out = { bonus: 0, unknown: 0, none: 0 };
  for (const s of srcIds) {
    if (s === dst || !tm.sources.has(s)) continue;
    const v = transmitCell(tm, s, dst);
    out[v === TB_UNTESTED ? 'unknown' : v === TB_NONE ? 'none' : 'bonus']++;
  }
  return out;
};
