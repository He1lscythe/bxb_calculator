# -*- coding: utf-8 -*-
"""notify.py — update-database 的 Telegram 通知(经 Telegraph 文章)。

mode=master_data : 最新 master_data/<date>/changelog.md → Telegraph 文章 → 发链接到频道
mode=asset_version: asset delta 图(B3,另见 notify_assets)

env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BXB_MASTER_TABLES(_mt worktree)
未配 TG secret 时静默跳过、不报错。Telegraph 用匿名账号 createPage(无需 token secret)。
"""
import json
import os
import re
import sys
from pathlib import Path

import requests

TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID")
_MT = os.environ.get("BXB_MASTER_TABLES")
MT = Path(_MT) if _MT else None


def tg(method, **payload):
    r = requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/{method}", json=payload, timeout=30)
    return r.json()


def telegraph_page(title, nodes):
    """匿名建号 + 建页,返回公开 URL。"""
    acc = requests.post("https://api.telegra.ph/createAccount",
                        data={"short_name": "bxb", "author_name": "BxB Bot"}, timeout=20).json()
    token = acc["result"]["access_token"]
    r = requests.post("https://api.telegra.ph/createPage", data={
        "access_token": token,
        "title": title[:256],
        "author_name": "BxB Bot",
        "content": json.dumps(nodes, ensure_ascii=False),
        "return_content": "false",
    }, timeout=30).json()
    if not r.get("ok"):
        raise RuntimeError(f"telegraph createPage 失败: {r.get('error')}")
    return r["result"]["url"]


_INLINE_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`")


def _inline(s):
    """行内 markdown → Telegraph children 数组:[`id`](rel) → code(相对链接丢) /
    [text](http) → a / **x** → b / `x` → code;其余纯文本。"""
    out, pos = [], 0
    for m in _INLINE_RE.finditer(s):
        if m.start() > pos:
            out.append(s[pos:m.start()])
        if m.group(1) is not None:  # [text](url)
            text, url = m.group(1).strip("`"), m.group(2)
            if url.startswith("http"):
                out.append({"tag": "a", "attrs": {"href": url}, "children": [text]})
            else:
                out.append({"tag": "code", "children": [text]})  # 相对链接无效、保留 id 为 code
        elif m.group(3) is not None:  # **bold**
            out.append({"tag": "b", "children": [m.group(3)]})
        elif m.group(4) is not None:  # `code`
            out.append({"tag": "code", "children": [m.group(4)]})
        pos = m.end()
    if pos < len(s):
        out.append(s[pos:])
    return out or [s]


def _table_to_ul(tbl):
    """markdown 表格行 → ul(Telegraph 不支持 table)。每行 → 'col0: 表头1 值1 / 表头2 值2 …'。"""
    rows = [[c.strip() for c in ln.strip().strip("|").split("|")] for ln in tbl]
    rows = [r for r in rows if r]
    if len(rows) < 2:
        return []
    header = rows[0]
    items = []
    for r in rows[1:]:
        if all(set(c) <= set("-: ") for c in r):  # 跳过 |---|---| 分隔行
            continue
        rest = " / ".join(f"{header[k]} {r[k]}" for k in range(1, len(r)) if k < len(header))
        items.append({"tag": "li", "children": [f"{r[0]}: {rest}" if rest else r[0]]})
    return [{"tag": "ul", "children": items}] if items else []


def _block_to_ul(block):
    """连续列表行 → ul。Telegraph 不渲染嵌套 ul(会展平不换行),所以:
    每个顶层 '- ' = 一个 li;更深层级 (  - /    - ) 用 <br> 换行 + 全角空格缩进塞进同一 li;
    非 '-' 续行同样 <br> 接到当前 li。缩进 0/2/4 空格 = 层级 0/1/2。
    """
    ul = {"tag": "ul", "children": []}
    cur = None  # 当前顶层 li
    for raw in block:
        m = re.match(r"^( *)-\s+(.*)$", raw)
        if m:
            level = len(m.group(1)) // 2
            inline = _inline(m.group(2))
            if level == 0 or cur is None:
                cur = {"tag": "li", "children": list(inline)}
                ul["children"].append(cur)
            else:
                marker = "　" * level + ("• " if level == 1 else "– ")
                cur["children"].append({"tag": "br"})
                cur["children"].append(marker)
                cur["children"].extend(inline)
        else:
            cont = raw.strip()
            if cur is not None and cont:
                cur["children"].append({"tag": "br"})
                cur["children"].append("　　")
                cur["children"].extend(_inline(cont))
    return ul


def changelog_to_nodes(md):
    """changelog.md → (title, Telegraph 节点)。完整转换:
    #/## → h3、### → h4、表格 → ul、嵌套列表 → 嵌套 ul/li、--- → hr、其余 → p。
    """
    lines = md.splitlines()
    title = "master_data changelog"
    body = []
    for ln in lines:
        if ln.startswith("# ") and not ln.startswith("## "):
            title = ln[2:].strip()
        else:
            body.append(ln)

    nodes = []
    i, n = 0, len(body)
    while i < n:
        raw = body[i]
        st = raw.strip()
        if not st:
            i += 1
        elif st.startswith("#"):
            # markdown 标题:## → h3、###/####/… → h4(Telegraph 只支持 h3/h4)
            level = len(st) - len(st.lstrip("#"))
            nodes.append({"tag": "h3" if level <= 2 else "h4",
                          "children": _inline(st.lstrip("#").strip())})
            i += 1
        elif st == "---":
            nodes.append({"tag": "hr"})
            i += 1
        elif st.startswith("|"):
            tbl = []
            while i < n and body[i].strip().startswith("|"):
                tbl.append(body[i])
                i += 1
            nodes.extend(_table_to_ul(tbl))
        elif re.match(r"^\s*-\s+", raw):
            block = []
            while i < n:
                ls = body[i].strip()
                if not ls or ls.startswith(("## ", "### ", "|")) or ls == "---":
                    break
                block.append(body[i])
                i += 1
            nodes.append(_block_to_ul(block))
        else:
            nodes.append({"tag": "p", "children": _inline(st)})
            i += 1
    return title, nodes


def latest_md_folder():
    base = MT / "master_data"
    fs = sorted(p for p in base.iterdir() if p.is_dir() and re.match(r"\d{4}_\d{2}_\d{2}", p.name))
    return fs[-1] if fs else None


def notify_master_data():
    folder = latest_md_folder()
    cl = (folder / "changelog.md") if folder else None
    if not cl or not cl.is_file():
        print("无 changelog、跳过")
        return
    title, nodes = changelog_to_nodes(cl.read_text(encoding="utf-8"))
    url = telegraph_page(title, nodes)
    msg = f"📊 master_data 更新 {folder.name}\n{url}\n#master_data"
    j = tg("sendMessage", chat_id=TG_CHAT, text=msg, disable_web_page_preview=False)
    print("master_data 通知:", "ok" if j.get("ok") else j.get("description"), "|", url)


def _r2_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def asset_delta(new_v, prev_v):
    base = MT / "asset_version"
    new = json.loads((base / str(new_v) / "_asset-version_source.json").read_text(encoding="utf-8"))
    old = {"files": []}
    if prev_v is not None:
        old = json.loads((base / str(prev_v) / "_asset-version_source.json").read_text(encoding="utf-8"))
    of = {f["name"]: f for f in old.get("files", [])}
    nf = {f["name"]: f for f in new["files"]}
    delta = sorted((set(nf) - set(of)) | {n for n in set(of) & set(nf) if of[n].get("md5") != nf[n].get("md5")})
    return delta, nf


def notify_asset_version():
    """最新两个 asset_version 快照算 delta → 下 .dat → 解 PNG → 传 R2 → Telegraph 图册 → 发链接。"""
    base = MT / "asset_version"
    vs = sorted(int(p.name) for p in base.iterdir() if p.is_dir() and p.name.isdigit())
    if not vs:
        print("无 asset_version 快照、跳过")
        return
    new_v, prev_v = vs[-1], (vs[-2] if len(vs) >= 2 else None)
    delta, nf = asset_delta(new_v, prev_v)
    if not delta:
        print("asset_version 无 delta、跳过")
        return

    r2_pub = os.environ.get("R2_PUBLIC_BASE_URL", "").rstrip("/")
    r2_bucket = os.environ.get("R2_BUCKET")
    if not (r2_pub and r2_bucket and os.environ.get("R2_ACCESS_KEY_ID")):
        print(f"未配 R2、跳过 asset 图册(delta {len(delta)} 项)")
        return

    import tempfile
    sys.path.insert(0, str(Path(__file__).resolve().parent))  # cdn / extract_assets 同目录
    import cdn
    import extract_assets

    s3 = _r2_client()
    tmp = Path(tempfile.mkdtemp(prefix="assetprev_"))
    imgs = []  # (asset_name, public_url)
    for name in delta:
        ent = nf[name]
        dat = tmp / "_dat" / f"{name}.dat"
        if not cdn.download_dat(name, ent["version"], dat, ent.get("md5")):
            continue
        try:
            written = extract_assets.extract_png(dat, name, tmp)
        except Exception:
            written = []
        for p in written:
            p = Path(p)
            key = f"asset_preview/{new_v}/{name}__{p.name}"
            try:
                s3.upload_file(str(p), r2_bucket, key, ExtraArgs={"ContentType": "image/png"})
                imgs.append((name, f"{r2_pub}/{key}"))
            except Exception as e:
                print(f"  R2 上传失败 {key}: {e}")
    if not imgs:
        print(f"asset delta {len(delta)} 项无可展示图、跳过")
        return

    nodes = [{"tag": "h4", "children": [f"asset {prev_v}→{new_v}:{len(imgs)} 张图 / delta {len(delta)} 项"]}]
    for nm, url in imgs:
        nodes.append({"tag": "figure", "children": [
            {"tag": "img", "attrs": {"src": url}},
            {"tag": "figcaption", "children": [nm]},
        ]})
    page = telegraph_page(f"asset_version {new_v} 新增/调整", nodes)
    j = tg("sendMessage", chat_id=TG_CHAT, text=f"🖼 asset_version {new_v}（{len(imgs)} 图 / delta {len(delta)}）\n{page}\n#asset_version")
    print("asset_version 通知:", "ok" if j.get("ok") else j.get("description"), "|", page)


def main():
    if not TG_TOKEN or not TG_CHAT:
        print("未配置 TELEGRAM secret、跳过通知")
        return
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "master_data":
        notify_master_data()
    elif mode == "asset_version":
        notify_asset_version()
    else:
        print(f"未知 mode: {mode!r}")


if __name__ == "__main__":
    main()
