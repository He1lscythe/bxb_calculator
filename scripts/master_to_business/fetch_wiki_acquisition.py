"""fetch_wiki_acquisition.py — 从 altema wiki 抓「入手方法」字段、patch 进 data/crystals.json + data/bladegraphs.json

每次数据更新 workflow:
1. python scripts/master_to_business/build_all.py            # master → data/*.json
2. python scripts/master_to_business/fetch_wiki_acquisition.py  # 本脚本、wiki → patch 入手方法
3. python scripts/master_to_business/copy_images.py          # (按需) D:/bxb → icons/

字段命名 (沿用 viewer 既有 read 端):
- crystal: '入手方法' 日文 key (cr-list.js L367 用此 key 读)
- bg:      'acquisition' 英文 key (bg-list.js L357 用 c.acquisition 读)

按 name 反查 wiki entry、wiki 没匹配 → 不写该字段、不覆盖。
重跑 idempotent: data/crystals.json + data/bladegraphs.json 内对应字段被覆盖。
"""
import argparse
import html as htmlmod
import json
import re
import sys
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# 终端 GBK 等非 UTF-8 编码会卡在含 emoji / 罕见 unicode 的 sample 打印、强制 utf-8
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def _normalize_name(s):
    """name 规约: wiki 跟 master 用不同标点 / 半角全角 / 尾部空格时仍能匹配。
    - NFKC: 半角片假名 → 全角 (ｱﾘｽ → アリス)
    - 每 3 个 ASCII 点 → 1 个全角省略号 (wiki '......' 6 dot vs master '……' 2 个 0x2026)
    - strip: master 偶尔尾部多空格 (rule 1)
    """
    if not s:
        return s
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'\.{3}', '…', s)
    return s.strip()


# rule 2: master 含 ♥ ♡ ☆ 等装饰符、wiki 抓时丢掉、master 端 strip 后 fallback 查
_DECORATION_RE = re.compile(r'[♥♡☆★◇◆♪♫]')

# rule 4: wiki 偶尔吞 Latin accent 字符 (如 master 'précieux' → wiki 'prcieux')
# 处理 U+00C0-U+00FF (Latin-1 Supplement、含常见 accent letters)
_LATIN_ACCENT_RE = re.compile(r'[À-ÿ]')


def _alt_keys(base):
    """生成 normalized name 的 fallback 备用 key、按优先级排列。"""
    keys = []
    k = _DECORATION_RE.sub('', base)
    if k != base:
        keys.append(k)
    k = _LATIN_ACCENT_RE.sub('', base)
    if k != base:
        keys.append(k)
    return keys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"

CRYSTAL_URL = "https://altema.jp/bxb/kiokukessyou"
BG_URL = "https://altema.jp/bxb/bladegraph"

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0.0.0 Safari/537.36"),
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    "Referer": "https://altema.jp/bxb/",
}

# 已知 section label、bg 用 <hr> + 行首【label】格式
_KNOWN_LABELS_RE = re.compile(r'【(?:効果|発動条件|入手方法|イラスト|レア度|効果量|特殊条件|対象|上限値)】')

# Crystal 系列硬规则: substring → 入手方法。优先级高于 wiki 抓取 (用户决策、2026-06-09)。
CRYSTAL_HARD_RULES = [
    ('純真記憶',       '純真記憶結晶交換所'),
    ('秘録記憶',       '記憶結晶ブキダス極弐'),
    ('アビス',         '「ユグドラシル・アビス」報酬'),
    ('メルティレコード', 'バレンタイン'),
    ('ディアリィレコード', 'ホワイトバレンタイン'),
]


def _resolve_crystal_hard(name):
    """crystal name 命中 series → 返硬规则 acquisition;否则 None"""
    if not name:
        return None
    for needle, value in CRYSTAL_HARD_RULES:
        if needle in name:
            return value
    return None


# Bladegraph 精确硬规则: master name → 入手方法。
# 用于 wiki 端 name 拼写跟 master 不同 (wiki 漏字 / 别字) 的情况。
BG_HARD_EXACT = {
    '【驚愕の】お菓子つくってみた【ラスト】': '2024/3/1 アドバンスダイヤパック購入特典',  # wiki name 漏头尾 【】
    'はて無い好奇心': 'イベント報酬｢魔帝アリス御前試合｣',                                  # wiki 用 'き'、master 用 'い'
}


def _resolve_bg_hard(name):
    return BG_HARD_EXACT.get(name) if name else None


def fetch_soup(url):
    print(f"fetching {url} ...")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, 'html.parser')


def _row_data_contents(row):
    raw = htmlmod.unescape(row.get('data-contents', '{}'))
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def crystal_acquisitions(soup):
    """crystal page: tds[1] 用换行 + 【label】 分段、抽 fields['入手方法']"""
    out = {}
    for row in soup.find_all('tr', class_='row'):
        d = _row_data_contents(row)
        if not d:
            continue
        name = d.get('name', '').strip()
        if not name:
            continue
        tds = row.find_all('td')
        if len(tds) < 2:
            continue
        lines = [l.strip() for l in tds[1].get_text('\n', strip=True).split('\n') if l.strip()]
        fields, key, buf = {}, None, []
        for line in lines:
            if line.startswith('【') and '】' in line:
                if key is not None:
                    fields[key] = '\n'.join(buf).strip()
                key = line[line.index('【') + 1: line.index('】')]
                buf = []
            else:
                buf.append(line)
        if key is not None:
            fields[key] = '\n'.join(buf).strip()
        nyushu = fields.get('入手方法', '').strip()
        if nyushu:
            out[_normalize_name(name)] = nyushu
    return out


def bg_acquisitions(soup):
    """bg page: tds[1] 用 <hr> 分 section、section 2 含 【入手方法】 标签 + 内容"""
    out = {}
    SENTINEL = "\x00HR\x00"
    for row in soup.find_all('tr', class_='row'):
        d = _row_data_contents(row)
        if not d:
            continue
        name = d.get('name', '').strip()
        if not name:
            continue
        tds = row.find_all('td')
        if len(tds) < 2:
            continue
        td = tds[1]
        for hr in td.find_all("hr"):
            hr.replace_with(SENTINEL)
        sections = [s.strip() for s in td.get_text("\n").split(SENTINEL)]
        if len(sections) < 3:
            continue
        # section 2 = 入手方法 + 内容
        lines = [l.strip() for l in sections[2].split("\n") if l.strip()]
        parts = []
        for line in lines:
            cleaned = _KNOWN_LABELS_RE.sub('', line).strip()
            if cleaned:
                parts.append(cleaned)
        nyushu = ' '.join(parts).strip()
        if nyushu:
            out[_normalize_name(name)] = nyushu
    return out


def patch_revise(master_path, revise_path, acq_map, field_name, hard_resolver=None):
    """从 master 按 name 匹配 acq_map、注入 *_revise.json 内 entry[field_name]。
    revise 数据跟 master 解耦、build_all 重 build master 不影响 revise (用户决策 2026-06-09)。
    hard_resolver(name) → str|None 优先于 wiki。
    返回 (matched_total, hard_count, wiki_count, total, sample_unmatched)"""
    master = json.loads(master_path.read_text(encoding='utf-8'))
    if revise_path.is_file():
        revise = json.loads(revise_path.read_text(encoding='utf-8'))
    else:
        revise = []
    revise_by_id = {r['id']: r for r in revise if isinstance(r, dict) and 'id' in r}

    hard_count = 0
    wiki_count = 0
    unmatched_sample = []
    for m_entry in master:
        mid = m_entry.get('id')
        name = m_entry.get('name')
        if mid is None or not name:
            continue

        hard = hard_resolver(name) if hard_resolver else None
        if hard:
            value = hard
            hard_count += 1
        else:
            base = _normalize_name(name)
            value = acq_map.get(base)
            if value is None:
                for k in _alt_keys(base):
                    value = acq_map.get(k)
                    if value is not None:
                        break
            if value is None:
                if len(unmatched_sample) < 5:
                    unmatched_sample.append(name)
                continue
            wiki_count += 1

        # 写入 revise (merge: 已有 entry 加字段、没的话新建)
        if mid not in revise_by_id:
            revise_by_id[mid] = {'id': mid, 'name': name}
        revise_by_id[mid][field_name] = value

    final = sorted(revise_by_id.values(), key=lambda r: r['id'])
    revise_path.write_text(
        json.dumps(final, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    return hard_count + wiki_count, hard_count, wiki_count, len(master), unmatched_sample


def main():
    parser = argparse.ArgumentParser(description="Patch 入手方法 from altema wiki")
    parser.add_argument('--skip-crystal', action='store_true')
    parser.add_argument('--skip-bg', action='store_true')
    args = parser.parse_args()

    if not args.skip_crystal:
        cr_soup = fetch_soup(CRYSTAL_URL)
        cr_map = crystal_acquisitions(cr_soup)
        print(f"  wiki crystal 入手方法: {len(cr_map)} entries")
        m, hard, wiki, t, sample = patch_revise(
            DATA_DIR / "crystals.json", DATA_DIR / "crystal_revise.json",
            cr_map, '入手方法', _resolve_crystal_hard,
        )
        pct = 100 * m / t if t else 0
        print(f"crystal: matched {m}/{t} ({pct:.1f}%)  [hard={hard} / wiki={wiki}]  → data/crystal_revise.json")
        if m < t:
            print(f"  unmatched sample (前 5): {sample}")

    if not args.skip_bg:
        bg_soup = fetch_soup(BG_URL)
        bg_map = bg_acquisitions(bg_soup)
        print(f"  wiki bg 入手方法: {len(bg_map)} entries")
        m, hard, wiki, t, sample = patch_revise(
            DATA_DIR / "bladegraphs.json", DATA_DIR / "bg_revise.json",
            bg_map, 'acquisition', _resolve_bg_hard,
        )
        pct = 100 * m / t if t else 0
        print(f"bg: matched {m}/{t} ({pct:.1f}%)  [hard={hard} / wiki={wiki}]  → data/bg_revise.json")
        if m < t:
            print(f"  unmatched sample (前 5): {sample}")


if __name__ == '__main__':
    main()
