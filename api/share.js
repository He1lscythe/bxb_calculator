// api/share.js — Vercel serverless function: 编成短链 (shorten / expand)
//
// hensei 的分享串 bxb1:<deflate-raw+base64url> (~680 字符) 贴 Discord/推特太长。
// 本端点把长串存进 Upstash Redis、以内容哈希 (sha256 → base64url 前 10 位) 做 key,
// 返回短 key 供前端拼成 …/hensei.html#s:<key>;打开短链时 GET 反查回长串。
//
// 与 api/save.js 同 CORS / handler 模式。key 算法必须与 scripts/start.py _derive_key
// + tests/unit/test_shortlink_key.mjs 完全一致。
//
//   POST  body {hash:"bxb1:..."} → {key:"<bare>"}     (写入、ex=2年、内容寻址幂等覆盖)
//   GET   ?k=<bare>              → {hash:"bxb1:..."} / 404

import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

const TTL = 63072000; // 2 年 (秒)
const KEY_PREFIX = 'h:';
const MAX_LEN = 4000; // bxb1 串实测 ~680、留足余量
const KEY_RE = /^[A-Za-z0-9_-]{1,16}$/; // 期望 10 位、留点余量

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 内容寻址 key: sha256(串) → base64url → 前 10 位 (~60bit、碰撞 ~10 亿条才显著)。
// Node digest('base64url') ≡ Python urlsafe_b64encode(...).rstrip('=')[:10] (前 10 位无 padding)。
function deriveKey(s) {
  return crypto.createHash('sha256').update(s).digest('base64url').slice(0, 10);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // env guard (仿 save.js 的 GITHUB_TOKEN guard、放 handler 内、别在 cold-start 崩)
  if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
    return res.status(500).json({ error: 'KV not configured on Vercel' });
  }

  try {
    if (req.method === 'POST') {
      const hash = (req.body && req.body.hash) || '';
      if (typeof hash !== 'string' || !/^bxb[01]:/.test(hash) || hash.length > MAX_LEN) {
        return res.status(400).json({ error: 'invalid hash' });
      }
      const bare = deriveKey(hash);
      await redis.set(KEY_PREFIX + bare, hash, { ex: TTL }); // 同串重存 = 覆盖 + 刷新 TTL
      return res.status(200).json({ key: bare });
    }

    if (req.method === 'GET') {
      const k = String(req.query.k || '');
      if (!KEY_RE.test(k)) return res.status(400).json({ error: 'invalid key' });
      const hash = await redis.get(KEY_PREFIX + k);
      if (!hash) return res.status(404).json({ error: 'not found' });
      return res.status(200).json({ hash });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('share handler error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
