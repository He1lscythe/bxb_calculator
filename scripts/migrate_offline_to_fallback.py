# -*- coding: utf-8 -*-
"""一次性迁移：把存量页的本地相对媒体路径改为「官方 URL 优先 + R2 回退」。

- img：src=官方，onerror 切 R2（已迁移过的会按当前 R2_PUBLIC_BASE_URL 重写，幂等）
- audio：删 src 属性（否则浏览器忽略 source 子节点），重建官方+R2 双 source
- video：同 audio 结构，但本地从未存档 mp4 → key 记入 state/missing_videos.txt 待回补
- head 注入 <meta name="robots" content="noindex">
- assets/ images/ css/ js/ 相对路径不动（随仓库走 Pages）

用法：set R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev 后运行；--limit N 可试跑前 N 个。
"""
import argparse
import glob
import os
import re

from common import HTML_DIR, MISSING_VIDEOS, R2_PUBLIC, parse_file, write_page
from crawler import inject_noindex, rewrite_av, rewrite_img


def migrate_file(path, missing_videos):
    soup = parse_file(path)
    r2_needed = set()

    before = str(soup.prettify())
    for img in soup.find_all("img"):
        rewrite_img(soup, img, r2_needed)
    for tag in soup.find_all(["audio", "video"]):
        rewrite_av(soup, tag, r2_needed, missing_keys=missing_videos)
    inject_noindex(soup)

    if str(soup.prettify()) != before:
        write_page(path, soup)
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 个文件（试跑用）")
    args = ap.parse_args()

    if not R2_PUBLIC:
        raise SystemExit("请先设置环境变量 R2_PUBLIC_BASE_URL（如 https://pub-xxxx.r2.dev）")

    files = sorted(glob.glob(str(HTML_DIR / "[0-9]*.html")))
    files = [f for f in files
             if re.match(r"\d+_\d{8}(_v\d{14})?\.html$", os.path.basename(f))]
    if args.limit:
        files = files[: args.limit]

    missing_videos = set()
    changed = 0
    for i, f in enumerate(files, 1):
        if migrate_file(f, missing_videos):
            changed += 1
        if i % 200 == 0:
            print(f"  进度 {i}/{len(files)}（已改写 {changed}）")

    if missing_videos:
        MISSING_VIDEOS.parent.mkdir(parents=True, exist_ok=True)
        with open(MISSING_VIDEOS, "w", encoding="utf-8") as f:
            for key, url in sorted(missing_videos):
                f.write(f"{key}\t{url}\n")

    print(f"迁移完成：{changed}/{len(files)} 个文件被改写，"
          f"{len(missing_videos)} 个视频待回补（见 state/missing_videos.txt）")


if __name__ == "__main__":
    main()
