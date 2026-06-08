// api/save.js — Vercel serverless function (v2 Phase 7 Session 1)
//
// 接收 viewer revise POST、id-level merge 到 data-staging branch 的 *_revise.json、自动开 PR。
//
// v2 vs wiki main 差异:
// - 4 bucket (砍 bg / omoide / omoide_templates 共 3 个)
// - bucket key: chara_revise / soul_revise / crystal_revise / masou_revise
// - 跟 scripts/start.py 同 schema / 同 deepMerge 算法、本地/Vercel 语义一致
//
// Body shape (mirrors local /save in scripts/start.py):
//   {
//     session_ids:       [int, ...],         // chara/soul/crystal 共用
//     masou_session_ids: [int, ...],         // masou 独立 namespace
//     chara_revise:      [{id, ...}, ...],   // optional bucket patches
//     soul_revise:       [{id, ...}, ...],
//     crystal_revise:    [{id, ...}, ...],
//     masou_revise:      [{id, ...}, ...],
//   }
// session_ids 内有但 patch 缺失 = user 清空 diff → 删 entry。

import { Octokit } from '@octokit/rest';

const REPO = { owner: 'He1lscythe', repo: 'bxb_calculator' };
const BASE = 'data-staging';

// 值是 [filePath, sessionIdsKey]。masou 独立 masou_session_ids、避免跟 chara id namespace 冲突。
const ID_BUCKETS = {
  chara_revise:   ['data/chara_revise.json',   'session_ids'],
  soul_revise:    ['data/soul_revise.json',    'session_ids'],
  crystal_revise: ['data/crystal_revise.json', 'session_ids'],
  masou_revise:   ['data/masou_revise.json',   'masou_session_ids'],
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJsonFromBase(octokit, path) {
  try {
    const { data } = await octokit.rest.repos.getContent({ ...REPO, path, ref: BASE });
    const text = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content: JSON.parse(text), sha: data.sha };
  } catch (e) {
    if (e.status === 404) return { content: null, sha: null };
    throw e;
  }
}

// 字段级 deep merge (跟 shared/v2-revise-core.js deepApply + scripts/start.py _deep_merge 等价)
// - source[k] === null → 删 result[k] (tombstone 撤回标记)
// - 空 dict prune (落盘 revise.json 保持干净)
function deepMerge(target, source) {
  if (source === null) return null;
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  const result =
    target !== null && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const k of Object.keys(source)) {
    const merged = deepMerge(result[k], source[k]);
    if (merged === null) delete result[k];
    else result[k] = merged;
  }
  for (const k of Object.keys(result)) {
    const v = result[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
      delete result[k];
    }
  }
  return result;
}

// metadata 字段之外还有 → revise 有意义。chara_id / chara_name 是 masou_revise 可读 metadata。
const _META_KEYS = new Set(['id', 'name', 'chara_id', 'chara_name']);
const _hasRealContent = (entry) => Object.keys(entry).some((k) => !_META_KEYS.has(k));

function mergeById(existing, patches, sessionIds) {
  const sessionSet = new Set(sessionIds);
  const patchMap = new Map(
    (patches || []).filter((p) => sessionSet.has(p.id)).map((p) => [p.id, p]),
  );
  const merged = [];
  for (const c of existing || []) {
    if (!sessionSet.has(c.id)) {
      merged.push(c);
    } else if (patchMap.has(c.id)) {
      const entry = deepMerge(c, patchMap.get(c.id));
      patchMap.delete(c.id);
      if (_hasRealContent(entry)) merged.push(entry);
    }
    // else: 删 (skip)
  }
  for (const p of patchMap.values()) {
    const entry = deepMerge({}, p);
    if (_hasRealContent(entry)) merged.push(entry);
  }
  merged.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return merged;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured on Vercel' });

  try {
    const body = req.body || {};
    const octokit = new Octokit({ auth: token });

    const updates = [];
    for (const [key, [filePath, sidKey]] of Object.entries(ID_BUCKETS)) {
      if (!(key in body)) continue;
      const patches = body[key];
      if (!Array.isArray(patches)) {
        return res.status(400).json({ error: `${key} must be an array` });
      }
      const bucketSids = Array.isArray(body[sidKey]) ? body[sidKey] : [];
      if (bucketSids.length === 0 && patches.length === 0) continue;
      const { content: existing } = await readJsonFromBase(octokit, filePath);
      const merged = mergeById(existing || [], patches, bucketSids);
      updates.push({
        path: filePath,
        contentText: JSON.stringify(merged, null, 2) + '\n',
      });
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'no buckets to update' });
    }

    // proposal branch from data-staging
    const { data: ref } = await octokit.rest.git.getRef({ ...REPO, ref: `heads/${BASE}` });
    const baseSha = ref.object.sha;
    const branchName = `proposal/save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await octokit.rest.git.createRef({
      ...REPO,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });

    for (const u of updates) {
      let sha;
      try {
        const { data } = await octokit.rest.repos.getContent({
          ...REPO,
          path: u.path,
          ref: branchName,
        });
        sha = data.sha;
      } catch (e) {
        if (e.status !== 404) throw e;
      }
      await octokit.rest.repos.createOrUpdateFileContents({
        ...REPO,
        path: u.path,
        branch: branchName,
        message: `proposal: update ${u.path.split('/').pop()}`,
        content: Buffer.from(u.contentText, 'utf-8').toString('base64'),
        sha,
      });
    }

    // PR 标题 / 正文
    const pageInfo = (() => {
      if ('chara_revise' in body || 'masou_revise' in body)
        return { name: '魔剣', file: 'pages/characters.html' };
      if ('soul_revise' in body) return { name: '魂', file: 'pages/souls.html' };
      if ('crystal_revise' in body) return { name: '結晶', file: 'pages/crystals.html' };
      return { name: '?', file: '?' };
    })();

    const items = [];
    const seenIds = new Set();
    for (const key of Object.keys(ID_BUCKETS)) {
      if (!(key in body)) continue;
      for (const p of body[key] || []) {
        if (p.id != null && !seenIds.has(p.id)) {
          seenIds.add(p.id);
          items.push({ id: p.id, name: p.name || '(未命名)' });
        }
      }
    }
    items.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    const titleNames = items.slice(0, 3).map((it) => it.name).join(', ');
    const more = items.length > 3 ? ` +${items.length - 3}` : '';
    const titleSuffix = items.length
      ? ` ${titleNames}${more}`
      : ` (${updates.map((u) => u.path.split('/').pop()).join(', ')})`;
    const title = `[${pageInfo.name}]${titleSuffix}`;

    const itemsList = items.length
      ? items.map((it) => `- \`id=${it.id}\` ${it.name}`).join('\n')
      : '_(无 id-level 改动)_';
    const filesList = updates.map((u) => `- \`${u.path}\``).join('\n');
    const prBody =
      `**页面**: ${pageInfo.name} (\`${pageInfo.file}\`)\n\n` +
      `**改动 (${items.length} 件)**:\n${itemsList}\n\n` +
      `**更新文件**:\n${filesList}\n\n` +
      `_自动生成 by Vercel \`/api/save\` (v2 Phase 7)_`;

    const { data: pr } = await octokit.rest.pulls.create({
      ...REPO,
      head: branchName,
      base: BASE,
      title,
      body: prBody,
    });

    return res.status(200).json({
      ok: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
      branch: branchName,
    });
  } catch (err) {
    console.error('save handler error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
