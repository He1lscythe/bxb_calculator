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

const ID_BUCKETS = {
  revise:            'data/characters_revise.json',
  omoide_revise:     'data/omoide_revise.json',
  soul_revise:       'data/souls_revise.json',
  crystal_revise:    'data/crystals_revise.json',
  bladegraph_revise: 'data/bladegraph_revise.json',
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
    const sessionIds = Array.isArray(body.session_ids) ? body.session_ids : [];

    const octokit = new Octokit({ auth: token });

    // Compute the merged content for each touched bucket
    const updates = []; // [{ path, contentText }]

    for (const [key, filePath] of Object.entries(ID_BUCKETS)) {
      if (!(key in body)) continue;
      const patches = body[key];
      if (!Array.isArray(patches)) {
        return res.status(400).json({ error: `${key} must be an array` });
      }
      // For id-level merge we need session_ids to know which entries to consider
      if (sessionIds.length === 0 && patches.length === 0) continue;
      const { content: existing } = await readJsonFromMain(octokit, filePath);
      const merged = mergeById(existing || [], patches, sessionIds);
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

    // Open PR
    const fileNames = updates.map((u) => u.path.split('/').pop()).join(', ');
    const idsList = sessionIds.length ? sessionIds.join(', ') : '(no id-level changes)';
    const { data: pr } = await octokit.rest.pulls.create({
      ...REPO,
      head: branchName,
      base: BASE,
      title: `Proposal: ${fileNames}${sessionIds.length ? ` (${sessionIds.length} ids)` : ''}`,
      body:
        `通过 GitHub Pages 提交的修改。\n\n` +
        `**影响的 id**: ${idsList}\n\n` +
        `**更新文件**:\n${updates.map((u) => `- \`${u.path}\``).join('\n')}\n\n` +
        `_自动生成 by Vercel \`/api/save\`._`,
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
