// Vercel serverless function — receives revise POSTs from GitHub Pages,
// merges id-level into the existing revise.json files on main, and opens a PR.
//
// Body shape (mirrors local /save in scripts/start.py):
//   {
//     session_ids: [int, ...],          // ids touched in this session
//     revise:           [{id, ...}, ...],   // optional bucket(s); patches present in session
//     omoide_revise:    [{id, ...}, ...],
//     soul_revise:      [{id, ...}, ...],
//     crystal_revise:   [{id, ...}, ...],
//     bladegraph_revise:[{id, ...}, ...],
//     omoide_templates: [...],          // full overwrite (no id-merge)
//   }
// Missing id from a bucket but present in session_ids = user cleared its diff → delete entry.

import { Octokit } from '@octokit/rest';

const REPO = { owner: 'He1lscythe', repo: 'bxb_calculator' };
const BASE = 'main';

// 値は [filePath, sessionIdsKey]。masou は chara/soul と id namespace が違うため
// 独立な masou_session_ids を使う（chara id と masou id が衝突して entry を誤って消すのを防ぐ）。
const ID_BUCKETS = {
  revise:            ['data/characters_revise.json', 'session_ids'],
  omoide_revise:     ['data/omoide_revise.json',     'session_ids'],
  soul_revise:       ['data/souls_revise.json',      'session_ids'],
  crystal_revise:    ['data/crystals_revise.json',   'session_ids'],
  bladegraph_revise: ['data/bladegraph_revise.json', 'session_ids'],
  masou_revise:      ['data/masou_revise.json',      'masou_session_ids'],
};
const FULL_BUCKETS = {
  omoide_templates:  'data/omoide_templates.json',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJsonFromMain(octokit, path) {
  try {
    const { data } = await octokit.rest.repos.getContent({ ...REPO, path, ref: BASE });
    const text = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content: JSON.parse(text), sha: data.sha };
  } catch (e) {
    if (e.status === 404) return { content: null, sha: null };
    throw e;
  }
}

function mergeById(existing, patches, sessionIds) {
  const sessionSet = new Set(sessionIds);
  const patchMap = new Map((patches || []).map((p) => [p.id, p]));
  const merged = [];
  for (const c of existing || []) {
    if (!sessionSet.has(c.id)) {
      merged.push(c);
    } else if (patchMap.has(c.id)) {
      merged.push(patchMap.get(c.id));
      patchMap.delete(c.id);
    }
    // else: deleted (skip)
  }
  for (const p of patchMap.values()) merged.push(p);
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

    // Compute the merged content for each touched bucket
    const updates = []; // [{ path, contentText }]

    for (const [key, [filePath, sidKey]] of Object.entries(ID_BUCKETS)) {
      if (!(key in body)) continue;
      const patches = body[key];
      if (!Array.isArray(patches)) {
        return res.status(400).json({ error: `${key} must be an array` });
      }
      const bucketSids = Array.isArray(body[sidKey]) ? body[sidKey] : [];
      // For id-level merge we need session_ids to know which entries to consider
      if (bucketSids.length === 0 && patches.length === 0) continue;
      const { content: existing } = await readJsonFromMain(octokit, filePath);
      const merged = mergeById(existing || [], patches, bucketSids);
      updates.push({
        path: filePath,
        contentText: JSON.stringify(merged, null, 2) + '\n',
      });
    }

    for (const [key, filePath] of Object.entries(FULL_BUCKETS)) {
      if (!(key in body)) continue;
      updates.push({
        path: filePath,
        contentText: JSON.stringify(body[key], null, 2) + '\n',
      });
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'no buckets to update' });
    }

    // Create proposal branch from main
    const { data: ref } = await octokit.rest.git.getRef({ ...REPO, ref: `heads/${BASE}` });
    const baseSha = ref.object.sha;
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const branchName = `proposal/save-${ts}-${rand}`;
    await octokit.rest.git.createRef({
      ...REPO,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });

    // Commit each updated file on the new branch
    for (const u of updates) {
      let sha;
      try {
        const { data } = await octokit.rest.repos.getContent({ ...REPO, path: u.path, ref: branchName });
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

    // 构造 PR 标题/正文：页面名 + id+name 列表，方便 review 时一眼看出改了什么
    const pageInfo = (() => {
      if ('revise' in body || 'omoide_revise' in body || 'masou_revise' in body) return { name: '魔剣', file: 'pages/characters.html' };
      if ('soul_revise' in body)       return { name: '魂',     file: 'pages/soul.html' };
      if ('crystal_revise' in body)    return { name: '結晶',   file: 'pages/crystals.html' };
      if ('bladegraph_revise' in body) return { name: '心象結晶', file: 'pages/bladegraph.html' };
      if ('omoide_templates' in body)  return { name: '魔剣（潜在テンプレート）', file: 'pages/characters.html' };
      return { name: '?', file: '?' };
    })();

    // 从所有 bucket 收集 id → name（同一 id 在多个 bucket 出现也只记一次，例如 index 的 revise + omoide_revise）
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

    // 标题：[页面] 名字1, 名字2, 名字3 (+N more)
    const titleNames = items.slice(0, 3).map((it) => it.name).join(', ');
    const more = items.length > 3 ? ` +${items.length - 3}` : '';
    const titleSuffix = items.length > 0
      ? ` ${titleNames}${more}`
      : ` (${updates.map((u) => u.path.split('/').pop()).join(', ')})`;
    const title = `[${pageInfo.name}]${titleSuffix}`;

    // 正文：完整 id + name 列表 + 文件清单
    const itemsList = items.length
      ? items.map((it) => `- \`id=${it.id}\` ${it.name}`).join('\n')
      : '_(无 id-level 改动)_';
    const filesList = updates.map((u) => `- \`${u.path}\``).join('\n');
    const prBody =
      `**页面**: ${pageInfo.name} (\`${pageInfo.file}\`)\n\n` +
      `**改动 (${items.length} 件)**:\n${itemsList}\n\n` +
      `**更新文件**:\n${filesList}\n\n` +
      `_自动生成 by Vercel \`/api/save\`._`;

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
