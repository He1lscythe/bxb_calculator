#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 https://altema.jp/bxb/skilllist 构建 skilllist_table.json
key  = skill_name + skill_effect
value = [altema_bunrui_id, ...]

用法: python build_skilllist_table.py
"""

import requests
import json
import re
import os
import html as htmlmod
from bs4 import BeautifulSoup

SKILLLIST_URL = "https://altema.jp/bxb/skilllist"
OUTPUT_FILE   = "skilllist_table.json"
DIR           = os.path.dirname(os.path.abspath(__file__))

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    "Referer":         "https://altema.jp/bxb/",
}


def fetch_skilllist():
    print(f"Fetching {SKILLLIST_URL} ...")
    resp = requests.get(SKILLLIST_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def _td_effect_text(td):
    """Extract effect text from the second <td>: only text before <br> or <hr>."""
    parts = []
    for node in td.children:
        if hasattr(node, 'name') and node.name in ('br', 'hr'):
            break
        if hasattr(node, 'get_text'):
            parts.append(node.get_text())
        else:
            parts.append(str(node))
    return ''.join(parts).strip()


def parse_skilllist(html):
    """Parse skilllist HTML into {name+effect: [bunrui_ids]}.

    Row format: <tr data-value='{"name":"...","bunrui":[1,2,...],...}'>
      <td>skill name</td>
      <td>effect text<br>... character icons ...</td>
    """
    soup  = BeautifulSoup(html, "html.parser")
    table = {}
    hit   = miss = 0

    rows = soup.find_all("tr", attrs={"data-value": True})
    if not rows:
        print("Warning: no data-value rows found")
        return table, hit, miss

    print(f"Found {len(rows)} rows with data-value attribute")
    for row in rows:
        raw = htmlmod.unescape(row.get("data-value", "{}"))
        try:
            d = json.loads(raw)
        except json.JSONDecodeError:
            miss += 1
            continue

        bunrui_ids = d.get("bunrui", [])
        if not isinstance(bunrui_ids, list):
            bunrui_ids = [bunrui_ids] if bunrui_ids else []

        tds = row.find_all("td")
        name   = tds[0].get_text(strip=True) if tds else d.get("name", "")
        effect = _td_effect_text(tds[1]) if len(tds) >= 2 else ""

        if name or effect:
            key = name + effect
            if key in table:
                for b in bunrui_ids:
                    if b not in table[key]:
                        table[key].append(b)
            else:
                table[key] = list(bunrui_ids)
            hit += 1
        else:
            miss += 1

    return table, hit, miss


def main():
    html_path = os.path.join(DIR, "skilllist.html")
    if os.path.exists(html_path):
        print(f"Using cached skilllist.html")
        with open(html_path, encoding="utf-8") as f:
            html = f.read()
    else:
        html = fetch_skilllist()
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"Saved raw HTML to skilllist.html")

    table, hit, miss = parse_skilllist(html)
    print(f"Parsed: {hit} entries, {miss} skipped")
    print(f"Table size: {len(table)} unique keys")

    out_path = os.path.join(DIR, OUTPUT_FILE)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(table, f, ensure_ascii=False, indent=2)
    print(f"Saved to {OUTPUT_FILE}")

    # Show sample
    sample = list(table.items())[:3]
    for k, v in sample:
        line = f"  {k[:60]} -> {v}"
        print(line.encode('utf-8', errors='replace').decode('utf-8', errors='replace'))


if __name__ == "__main__":
    main()
