#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sample: parse 潜在解放 section from a single character page."""

import requests
from bs4 import BeautifulSoup, Tag
import json
import re
import html as htmlmod

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
}

# ── Classification — text-based (syosai keywords) ────────────────────────────

_NUM_UP  = re.compile(r'が(\d+(?:,\d+)*)上昇')
_PCT_UP  = re.compile(r'が(\d+(?:\.\d+)?)%上昇')
_NUM_INC = re.compile(r'が(\d+)増加')


def extract_bairitu(syosai):
    """Return (bairitu, bairitu_scaling)."""
    m = _PCT_UP.search(syosai)
    if m:
        return round(1 + float(m.group(1)) / 100, 6), 0

    m = _NUM_INC.search(syosai)
    if m:
        return int(m.group(1)), 0

    m = _NUM_UP.search(syosai)
    if m:
        return int(m.group(1).replace(',', '')), 0

    return 0, 0


def classify_slot(icon_id, syosai):
    """Return (bunrui, scope, condition, bairitu, bairitu_scaling)."""
    condition = 0

    # Element-conditioned party buff → scope=2
    if '属性の魔剣' in syosai:
        bairitu, bairitu_scaling = extract_bairitu(syosai)
        return [1], 2, condition, bairitu, bairitu_scaling

    scope = 0
    # Order matters: check more-specific strings first
    if 'B.D.攻撃力' in syosai:
        bunrui = [3]
    elif '攻撃モーション速度' in syosai:
        bunrui = [5]
    elif '攻撃力' in syosai:
        bunrui = [1]
    elif '防御力' in syosai:
        bunrui = [12]
    elif 'スピード' in syosai:
        bunrui = [4]
    elif 'HP' in syosai:
        bunrui = [10]
    elif 'ブレイク力' in syosai:
        bunrui = [2]
    elif 'ダメージ上限' in syosai:
        bunrui = [17]
    elif '記憶結晶装備数' in syosai:
        bunrui = [19]
    else:
        bunrui = [16]

    bairitu, bairitu_scaling = extract_bairitu(syosai)
    return bunrui, scope, condition, bairitu, bairitu_scaling


# ── Parser ───────────────────────────────────────────────────────────────────

def parse_latent(soup):
    """Return list of {threshold, slots[]} dicts."""
    # Find the 潜在解放 heading
    h2 = soup.find(lambda t: t.name == 'h2' and '潜在解放' in t.get_text())
    if not h2:
        return []

    # Walk siblings to find the table
    table = None
    for sib in h2.next_siblings:
        if not isinstance(sib, Tag):
            continue
        if sib.name == 'table':
            table = sib
            break
        if sib.name == 'h2':
            break
    if not table:
        return []

    rows = table.find_all('tr')
    # First row is header
    threshold_map   = {}   # threshold(int) → [slot, ...]
    threshold_order = []
    current_threshold = None

    for row in rows[1:]:
        cells = row.find_all('td')
        if not cells:
            continue

        # Detect threshold cell: plain number (strip commas for "1,000")
        first_text = cells[0].get_text(strip=True).replace(',', '')
        if re.match(r'^\d+$', first_text):
            current_threshold = int(first_text)
            if current_threshold not in threshold_map:
                threshold_map[current_threshold] = []
                threshold_order.append(current_threshold)
            slot_cells = cells[1:]
        else:
            # Continuation row for current threshold (rowspan case)
            slot_cells = cells

        if current_threshold is None:
            continue

        for cell in slot_cells:
            # Skip empty slots ("-") — use data-syosai presence, not text
            raw = cell.get('data-syosai', '')
            if not raw:
                continue
            try:
                data = json.loads(htmlmod.unescape(raw))
            except (json.JSONDecodeError, ValueError):
                continue

            koka   = data.get('koka', '')
            syosai = data.get('syosai', '')

            # Extract icon id from img data-lazy-src
            img = cell.find('img')
            icon_id = None
            if img:
                src = img.get('data-lazy-src', img.get('src', ''))
                m = re.search(r'/icon/(\d+)\.jpg', src)
                if m:
                    icon_id = int(m.group(1))

            if icon_id is None:
                continue

            bunrui, scope, condition, bairitu, bairitu_scaling = classify_slot(icon_id, syosai)

            slot = {
                'icon':             icon_id,
                'koka':             koka,
                'syosai':           syosai,
                'bunrui':           bunrui,
                'scope':            scope,
                'condition':        condition,
                'bairitu':          bairitu,
                'bairitu_scaling':  bairitu_scaling,
            }
            threshold_map[current_threshold].append(slot)

    return [
        {'threshold': t, 'slots': threshold_map[t]}
        for t in threshold_order
        if threshold_map[t]
    ]


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    url = 'https://altema.jp/bxb/chara/1647'
    print(f'Fetching {url} ...')
    resp = requests.get(url, headers=HEADERS, timeout=30)
    soup = BeautifulSoup(resp.text, 'html.parser')

    latent = parse_latent(soup)
    out_path = 'latent_sample.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(latent, f, ensure_ascii=False, indent=2)
    print(f'Written to {out_path}')
    # Also print slot count per threshold
    for row in latent:
        print(f"  threshold={row['threshold']}: {len(row['slots'])} slots")
