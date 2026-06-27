// bxb-dispatch — Cloudflare Worker
//
// 用 Cloudflare 的 Cron Trigger(可靠、即时、不会像 GitHub schedule 那样排队丢弃)
// 去调 GitHub 的 workflow_dispatch API，可靠地定时触发:
//   update-database.yml  (JST 16:15 / 00:15)
//   bxb-topics.yml       (每小时 auto 轮询 + 每日 window 兜底重爬)
//   daily.yml            (账号日常维护、4 个时间点;文件在 main、checkout routines)
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

// daily.yml(账号日常维护):合成 1 条 cron(Cloudflare 每 Worker 上限 5 条),
// minute 29、UTC 小时 1/8/15/20 一次覆盖 4 个时刻;按触发时的 UTC 小时映射 time_point。
// daily.yml 文件在 main(默认分支、才能被 dispatch)、内部 checkout routines 拉代码。
const DAILY_CRON = "29 1,8,15,20 * * *";
const DAILY_HOUR_TP = { 15: "1", 20: "2", 1: "3", 8: "4" };  // UTC hour → time_point (JST 00:29/05:29/10:29/17:29)

// 按触发的 cron 表达式决定调哪个 workflow
async function runForCron(cron, env) {
  if (cron === "8 7 * * *") {
    await dispatch(env, "bxb-topics.yml", { mode: "window" });
  } else if (cron === DAILY_CRON) {
    const tp = DAILY_HOUR_TP[new Date().getUTCHours()];
    if (tp) await dispatch(env, "daily.yml", { time_point: tp, shards: "10" });
  } else {
    // "1 * * * *" 每小时:topics auto 轮询;UTC 7/15 点额外触发 update-database (JST 16:01 / 00:01)。
    // (一条 cron 触发两个 workflow、省 cron 槽。)
    await dispatch(env, "bxb-topics.yml", { mode: "auto" });
    const h = new Date().getUTCHours();
    if (h === 7 || h === 15) await dispatch(env, "update-database.yml");
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runForCron(event.cron, env));
  },

  // 手动测试端点: GET /trigger?key=<TRIGGER_KEY>&wf=update-database|topics-auto|topics-window|daily-1..4
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
    } else if (wf.startsWith("daily-")) {  // daily-1..4
      status = await dispatch(env, "daily.yml", { time_point: wf.slice(6) || "2", shards: "10" });
    } else {
      status = await dispatch(env, "bxb-topics.yml", { mode: "auto" });
    }
    return new Response(`dispatched ${wf} -> ${status}\n`, { status: 200 });
  },
};
