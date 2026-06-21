// tests/unit/test_shortlink_key.mjs — 编成短链 key 算法固定向量
//
// key = sha256(shareString) → base64url → 前 10 位。
// api/share.js (deriveKey) + scripts/start.py (_derive_key) 必须用同一公式 (本地/线上同 key)。
// 不 import api/share.js:它模块加载时即 `new Redis(...)` 拉 env,import 会脆弱/报错。
// 故此处 inline 同一公式做 spec 测试 (固定向量与 Python 实测一致、防算法漂移)。
import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

const deriveKey = (s) => crypto.createHash('sha256').update(s).digest('base64url').slice(0, 10);

test('shortlink key: 固定向量 (Node digest base64url ≡ Python urlsafe_b64encode rstrip)', () => {
  // 实测: python -c "import hashlib,base64;print(base64.urlsafe_b64encode(
  //   hashlib.sha256(b'bxb1:AABBCCDDEEFF_test-string-123').digest()).decode().rstrip('=')[:10])" → h4_yIVWquy
  assert.strictEqual(deriveKey('bxb1:AABBCCDDEEFF_test-string-123'), 'h4_yIVWquy');
});

test('shortlink key: 确定性 + 10 位 base64url', () => {
  assert.strictEqual(deriveKey('bxb1:hello'), deriveKey('bxb1:hello'));
  const k = deriveKey('bxb1:hello');
  assert.strictEqual(k.length, 10);
  assert.match(k, /^[A-Za-z0-9_-]{10}$/);
});

test('shortlink key: 不同输入 → 不同 key', () => {
  assert.notStrictEqual(deriveKey('bxb1:aaa'), deriveKey('bxb1:bbb'));
});
