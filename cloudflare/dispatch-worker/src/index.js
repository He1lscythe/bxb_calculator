// bxb-dispatch — Cloudflare Worker
//
// 用 Cloudflare 的 Cron Trigger(可靠、即时、不会像 GitHub schedule 那样排队丢弃)
// 去调 GitHub 的 workflow_dispatch API，可靠地定时触发两个 workflow:
//   update-database.yml  (JST 16:15 / 00:15)
//   bxb-topics.yml       (每小时 auto 轮询 + 每日 window 兜底重爬)
//
// GitHub 原生 cron 仍保留作兜底(job 幂等，重复触发只会 no-op / rebase)。
//
// 需要的 Secret(在 Cloudflare → Worker → Settings → Variables 里设为加密变量):
//   GH_TOKEN     GitHub fine-grained PAT，仅 bxb_calculator 仓库、权限 Actions: Read and write
//   TRIGGER_KEY  任意随机串，用于 /trigger 手动测试端点鉴权

const OWNER = "He1lscythe";
const REPO = "bxb_calculator";
const REF = "main"; // workflow 文件所在分支(默认分支)。各 workflow 内部自行 checkout 数据分支。

async function dispatch(env, workflowFile, inputs) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflowFile}/dispatches`;
  const body = { ref: REF };
  if (inputs) body.inputs = inputs;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "bxb-dispatch-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // 成功为 204 No Content；非 204 打日志便于 wrangler tail / dashboard 排查
  console.log(`dispatch ${workflowFile} ${JSON.stringify(inputs || {})} -> ${res.status} ${text.slice(0, 300)}`);
  return res.status;
}

// 按触发的 cron 表达式决定调哪个 workflow
async function runForCron(cron, env) {
  if (cron === "1 7,15 * * *") {  // JST 16:01 / 00:01
    await dispatch(env, "update-database.yml");
  } else if (cron === "8 7 * * *") {
    await dispatch(env, "bxb-topics.yml", { mode: "window" });
  } else {
    // "1 * * * *" 及其它:按 topics 每小时 auto 轮询
    await dispatch(env, "bxb-topics.yml", { mode: "auto" });
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runForCron(event.cron, env));
  },

  // 手动测试端点: GET /trigger?key=<TRIGGER_KEY>&wf=update-database|topics-auto|topics-window
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname !== "/trigger") {
      return new Response("bxb-dispatch ok", { status: 200 });
    }
    if (!env.TRIGGER_KEY || u.searchParams.get("key") !== env.TRIGGER_KEY) {
      return new Response("forbidden", { status: 403 });
    }
    const wf = u.searchParams.get("wf") || "topics-auto";
    let status;
    if (wf === "update-database") {
      status = await dispatch(env, "update-database.yml");
    } else if (wf === "topics-window") {
      status = await dispatch(env, "bxb-topics.yml", { mode: "window" });
    } else {
      status = await dispatch(env, "bxb-topics.yml", { mode: "auto" });
    }
    return new Response(`dispatched ${wf} -> ${status}\n`, { status: 200 });
  },
};
