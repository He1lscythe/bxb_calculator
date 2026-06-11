# -*- coding: utf-8 -*-
"""Topics.html 生成器：增量更新 heading、注入版本历史下拉框。"""
import re

from bs4 import Comment

from common import (
    BLANK_FILE,
    CHANGES_JSON,
    HTML_DIR,
    TOPICS_FILE,
    load_json,
    load_state,
    parse_file,
    write_page,
)


def sort_key(heading):
    t = heading.find("div", class_="time").get_text(strip=True)
    return int(re.sub(r"[/ :]", "", t))


def derive_heading(num, canonical):
    """从 canonical 页面提取 news_heading，改造成 Topics 列表用的形态。"""
    soup = parse_file(HTML_DIR / canonical)
    heading = soup.find("div", class_="news_heading")
    if heading is None:
        return None
    heading = heading.extract()
    heading["id"] = str(num)
    img = heading.find("img")
    if img and img.get("src") and not img["src"].startswith("html/"):
        img["src"] = "html/" + img["src"]
    a = heading.find("a", class_="title_text")
    if a:
        a["href"] = f"html/{canonical}"
    return heading


def strip_version_selects(tsoup):
    """列表页不显示版本下拉框（版本切换在详情页内完成），清掉历史注入。"""
    for old in tsoup.find_all("select", class_="version_select"):
        old.decompose()


def main():
    state = load_state()
    changes = load_json(CHANGES_JSON, {"changes": []})["changes"]

    src = TOPICS_FILE if TOPICS_FILE.exists() else BLANK_FILE
    tsoup = parse_file(src)
    container = tsoup.find(class_="news_container")

    headings = {h.get("id"): h for h in container.find_all("div", class_="news_heading")}
    for c in changes:
        new_heading = derive_heading(c["id"], c["canonical"])
        if new_heading is None:
            continue
        headings[str(c["id"])] = new_heading

    ordered = sorted(headings.values(), key=sort_key, reverse=True)
    container.clear()
    container.append(Comment("新闻列表开始（全部包含在news_container内，实际页面中应包含所有 news_heading 项）"))
    for h in ordered:
        container.append(h)
    container.append(Comment("此处应包含完整的新闻列表"))
    container.append(Comment("新闻列表结束"))

    latest_id = state["latest_id"] or container.get("latest-id") or 0
    container["latest-id"] = int(latest_id)
    # お知らせ 页签（href 已本地化，不再用 /topics 定位）
    label = tsoup.find("a", string=re.compile(r"お知らせ"))
    if label:
        label.string = f"お知らせ (latest-id: {latest_id})"

    strip_version_selects(tsoup)
    write_page(TOPICS_FILE, tsoup)
    print(f"Topics.html 已更新：{len(ordered)} 条，latest-id {latest_id}")


if __name__ == "__main__":
    main()
