# bxb-dispatch — 可靠触发 GitHub Actions 的 Cloudflare Worker

GitHub 原生 `schedule`(cron)是尽力而为的,高峰期会延迟甚至**直接丢弃**定时运行,没有任何开关能改。
本 Worker 用 Cloudflare 的 **Cron Trigger**(可靠、秒级)去调 GitHub 的 `workflow_dispatch` API
(API 触发即时、不丢),从而可靠地定时跑两个 workflow:

| Worker cron (UTC) | JST | 触发 |
|---|---|---|
| `1 * * * *` | 每小时 :01 | `bxb-topics.yml`(mode=auto 轮询);UTC **7/15** 点 worker 额外触发 `update-database.yml`(JST 16:01 / 00:01)|
| `8 7 * * *` | 16:08 | `bxb-topics.yml`(mode=window 每日兜底重爬) |
| `29 1,8,15,20 * * *` | 00:29/05:29/10:29/17:29 | `daily.yml`(账号日常;1 条 cron 覆盖 4 时刻、worker 按 UTC 小时 15/20/1/8 映射 time_point 1/2/3/4)|

> ⚠ Cloudflare 每 Worker 上限 **5 条 cron**,这里压到 **3 条**:`1 7,15` 并进每小时 `1 * * * *`(一条 cron 触发两个 workflow)、daily 4 时刻合成 1 条。留余量给以后。
> `daily.yml` 必须在**默认分支 main**(workflow_dispatch 只认默认分支;它 `checkout: ref: routines` 拉账号日常代码)。
> 测试:`/trigger?key=<KEY>&wf=daily-2`(手动按 time_point)。

GitHub 两个 workflow 的原生 `schedule:` **保留作兜底**(job 幂等,重复触发只会 no-op / rebase)。
跑稳几天后若想去掉原生 cron 也可以,留着无害。

> 注:topics 的"加密轮询"(检测到变更后 5h 内每 15 分钟)未搬到 Worker,仍靠 GitHub 原生 cron 尽力跑;
> 它只是"更快抓到二次编辑"的优化,丢了也会被下一次每小时 auto 轮询补上。

## 一次性部署(Cloudflare dashboard,无需本地 wrangler)

### 1. 建 GitHub fine-grained PAT
GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token:
- Resource owner: `He1lscythe`
- Repository access: **Only select repositories** → `bxb_calculator`
- Repository permissions → **Actions: Read and write**(Metadata 会自动带上 Read)
- Expiration: 自定(到期需换新)
- 生成后**复制 token**(只显示一次)

### 2. 建 Worker
Cloudflare dashboard → **Workers & Pages** → Create → Worker → 命名 `bxb-dispatch` →
进 **Edit code**,把 [`src/index.js`](src/index.js) 全文粘进去 → **Deploy**。

### 3. 配 Secret
Worker → **Settings → Variables and Secrets** → Add(类型选 **Secret/加密**):
- `GH_TOKEN` = 第 1 步的 PAT
- `TRIGGER_KEY` = 任意随机串(测试端点鉴权用,自己定一个长一点的)

### 4. 配 Cron Triggers
Worker → **Settings → Triggers → Cron Triggers** → 逐条添加:
```
1 * * * *
8 7 * * *
29 1,8,15,20 * * *
```

### 5. 验证(不用等到点)
浏览器/curl 访问(把 `<sub>` 换成你的 workers.dev 子域、`<KEY>` 换成 TRIGGER_KEY):
```
https://bxb-dispatch.<sub>.workers.dev/trigger?key=<KEY>&wf=update-database
```
返回 `dispatched update-database -> 204` 即成功 → 立刻去 GitHub Actions 看到一条 run 启动。
其它测试值:`wf=topics-auto`、`wf=topics-window`。

## 用 wrangler CLI(可选,替代 dashboard)
```bash
cd cloudflare/dispatch-worker
wrangler secret put GH_TOKEN       # 粘 PAT
wrangler secret put TRIGGER_KEY    # 粘随机串
wrangler deploy                    # cron triggers 已在 wrangler.toml 里
```

## 排查
- dispatch 返回 **204** = 成功(GitHub workflow_dispatch 无响应体)。
- **401/403** = PAT 失效或权限不足(需 Actions: Read and write)。
- **404** = workflow 文件名或 owner/repo 写错,或 PAT 没勾到该仓库。
- `wrangler tail` 或 dashboard 的实时日志能看到每次 dispatch 的 `-> 状态码`。
- PAT 到期会变 401 → 换新 token 重设 `GH_TOKEN` secret。
