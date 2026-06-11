# Cloudflare 配置教程（R2 图床 + Pages 站点）

整体合作顺序（⚙ = 你在 Cloudflare/GitHub 网页上操作，🤖 = Claude 在本地执行）：

1. ⚙ 第 1–5 节：注册账号 → 开 R2 → 建桶 → 开公开访问 → 建 API Token
2. 🤖 拿到 **R2 公开地址**后：跑迁移脚本、初始化状态、建 git 仓库并推送 `topics` 分支
3. ⚙ 第 6 节：用 rclone 把 4.8GB 媒体初次上传到 R2（命令照抄即可；也可把密钥交给 Claude 代跑）
4. ⚙ 第 7 节：建 Pages 项目绑定 GitHub 仓库（需要 `topics` 分支已存在，即第 2 步之后）
5. ⚙ 第 8 节：在 GitHub 录入 Secrets / Variables
6. 🤖 把 workflow 推到 main，手动触发一次验证全链路

---

## 1. 注册 Cloudflare 账号

1. 打开 https://dash.cloudflare.com/sign-up
2. 邮箱 + 密码注册，去邮箱点验证链接
3. 登录后进入 Dashboard（不需要添加任何域名/网站，跳过引导即可）

## 2. 开通 R2

1. 左侧菜单 **R2 Object Storage** → **Get Started / Purchase R2**
2. 需要绑定一张支付卡（信用卡或 PayPal）。**免费额度：10GB 存储、每月 100 万次写 + 1000 万次读、出站流量完全免费**——本项目约 4.8GB，正常使用不会产生费用
3. 完成后进入 R2 概览页

## 3. 创建存储桶

1. R2 页面 → **Create bucket**
2. Bucket name 填 `bxb-topics-archive`（如改名，后面所有命令同步替换）
3. Location 选 **Asia-Pacific (APAC)**（离游戏玩家近）
4. 其余默认 → **Create bucket**

## 4. 开启公开访问（拿到 R2 公开地址）

1. 进入刚建的桶 → **Settings** 选项卡
2. 找到 **Public Development URL**（旧版界面叫 Public access / R2.dev subdomain）→ 右侧 **Enable**（输入 allow 确认）
3. 页面会显示形如 `https://pub-xxxxxxxxxxxxxxxx.r2.dev` 的地址

📋 **记下它，这就是 `R2_PUBLIC_BASE_URL`，把它发给 Claude（可公开，不是机密）**

## 5. 创建 API Token（给 rclone 和 GitHub Actions 用）

1. 回到 R2 概览页 → 右上 **Manage R2 API Tokens** → **Create API Token**
2. Token name 随意（如 `bxb-actions`）
3. Permissions 选 **Object Read & Write**；Specify bucket 只勾选 `bxb-topics-archive`
4. TTL 选 Forever → **Create API Token**
5. 创建成功页面**只显示一次**，记下三个值：
   - **Access Key ID** → 即 `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → 即 `R2_SECRET_ACCESS_KEY`（机密，别发到聊天里）
   - 页面下方的 S3 端点 `https://<32位账户ID>.r2.cloudflarestorage.com` → 即 `R2_ENDPOINT`

## 6. rclone 初次上传（4.8GB，一次性）

1. 下载 rclone：https://rclone.org/downloads/ → Windows 64bit zip，解压到如 `C:\rclone\`
2. 新建文件 `C:\rclone\rclone.conf`，内容（替换三个值）：

```ini
[R2]
type = s3
provider = Cloudflare
access_key_id = <你的 Access Key ID>
secret_access_key = <你的 Secret Access Key>
endpoint = https://<账户ID>.r2.cloudflarestorage.com
```

3. 在 PowerShell 里执行（两条，约 4.8GB，视网速 1~3 小时；中断了重跑会自动续传）：

```powershell
.\rclone.exe --config .\rclone.conf copy "F:\OneDrive - Northeastern University\Game\BxB\Topic\html\bxb-assets" R2:bxb-topics-archive/bxb-assets --transfers 8 --checkers 16 -P
.\rclone.exe --config .\rclone.conf copy "F:\OneDrive - Northeastern University\Game\BxB\Topic\html\bxb" R2:bxb-topics-archive/bxb --transfers 8 --checkers 16 -P
```

4. 校验（应显示约 21,176 个文件 / ~4.8GB）：

```powershell
.C:\rclone\rclone.exe --config .\rclone.conf size R2:bxb-topics-archive
```

5. 上传完成后告诉 Claude，由它生成 `state/r2_manifest.txt` 并提交

> 不想自己跑的话，也可以把第 5 节的三个值交给 Claude 代跑这一步（注意密钥发到聊天里有泄露风险，事后可在 Manage R2 API Tokens 里随时吊销重建）。

## 7. 创建 Pages 项目（需 `topics` 分支已推送）

1. Dashboard 左侧 **Workers & Pages** → **Create** → **Pages** 选项卡 → **Connect to Git**
2. 授权 GitHub：弹窗里选你的账号 → **Only select repositories** → 只勾 `bxb_calculator` → Install & Authorize
3. 选中 `bxb_calculator` 仓库 → **Begin setup**
4. 关键配置：
   - Project name：随意（如 `bxb-topics`），决定网址 `https://<名字>.pages.dev`
   - **Production branch：`topics`** ←最重要的一项
   - Framework preset：**None**
   - Build command：留空
   - Build output directory：`/`
5. **Save and Deploy**，等部署完成
6. 访问 `https://<项目名>.pages.dev/Topics.html` 确认列表页能打开

📋 **记下 `https://<项目名>.pages.dev`，这是 `PAGES_BASE_URL`**

> 之后每次 GitHub Actions 向 topics 分支 push，Pages 都会自动重新部署，无需任何操作。
> 可选：项目 Settings → Builds & deployments → 关闭 Preview deployments（避免 main 分支的提交也触发预览构建）。

## 8. GitHub 录入 Secrets / Variables

仓库页面 → **Settings → Secrets and variables → Actions**：

**Secrets**（New repository secret，3 个）：

| 名称 | 值 |
|---|---|
| `R2_ACCESS_KEY_ID` | 第 5 节的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | 第 5 节的 Secret Access Key |
| `R2_ENDPOINT` | `https://<账户ID>.r2.cloudflarestorage.com` |

**Variables**（Variables 选项卡 → New repository variable，3 个）：

| 名称 | 值 |
|---|---|
| `R2_BUCKET` | `bxb-topics-archive` |
| `R2_PUBLIC_BASE_URL` | `https://pub-xxxx.r2.dev`（第 4 节） |
| `PAGES_BASE_URL` | `https://<项目名>.pages.dev`（第 7 节） |

最后：仓库右上 **Watch → All activity**（或 Custom 只勾 Issues），并确认 GitHub 个人设置 Settings → Notifications 里 Issues 通知勾了 Email——这样每条新公告/修改都会发邮件给你。

## 9. 验证清单

- [ ] 打开 `https://<项目名>.pages.dev/Topics.html`，列表、分页、搜索正常
- [ ] 点进一条带图公告 → F12 Network：图片从 `bxb-asset.grimoire.codes` 加载（官方优先）
- [ ] F12 Console 执行 `document.images[5].src = document.images[5].src.replace('.jpg','_xxx.jpg')` 之类制造 404 → 图片自动变为从 `pub-xxxx.r2.dev` 加载（回退生效）
- [ ] 打开一条带语音的公告（如武器介绍页），音频能播放
- [ ] F12 Network 任意请求的 Response Headers 里有 `X-Robots-Tag: noindex`
- [ ] Actions 页手动 Run workflow 一次，全绿
- [ ] 下一条真实新公告出现后，收到 Issue 邮件

## 附录

**r2.dev 限速**：r2.dev 子域是开发用途，有未公开的速率限制。本方案里 R2 只承担"官方删图后的回退"，流量极小，足够用。若将来官方大面积删图导致回退成为主力，再升级为自定义域（需要你拥有一个域名并托管在 Cloudflare，R2 桶 Settings → Custom Domains 绑定即可，零代码改动——把 GitHub Variable `R2_PUBLIC_BASE_URL` 换成新域名后手动跑一次 workflow window 模式刷新即可逐步替换）。

**官方热链防护**：如果发现从 pages.dev 打开页面时官方图全部不显示（被 Referer 校验挡住），告诉 Claude，给所有页面注入 `<meta name="referrer" content="no-referrer">` 重新部署即可。

**费用**：R2 免费层内零费用；Pages 免费层每月 500 次构建（实际每天 1~3 次部署，用不完）；GitHub Actions 公开仓库免费不限量。
