"""fetch_wiki_acquisition.py — 从 altema wiki 抓「入手方法」+ crystal「max_value」、patch 进 *_revise.json

每次数据更新 workflow:
1. python scripts/master_to_business/build_all.py            # master → data/*.json
2. python scripts/master_to_business/fetch_wiki_acquisition.py  # 本脚本、wiki → patch revise
3. python scripts/master_to_business/copy_images.py          # (按需) <assets> → icons/

抓的字段 (沿用 viewer 既有 read 端):
- crystal: '入手方法' 日文 key (cr-list.js 用此 key 读) + 'max_value'
- bg:      'acquisition' 英文 key (bg-list.js 用 c.acquisition 读)

**max_value 为什么在这里抓** (2026-09-11):
原本 max_value 只来自 `data/_wiki_aux.json` 的 crystal_max_value —— 那是 2026-06-09 的**一次性快照**,
之后再没更新过,于是 ① 6 月后新增的結晶永远 max_value=null ② build 每轮还把这份旧值重新盖回
revise,把用户在 viewer 里改过的值冲掉 (实测 1310101 ぶるーまじぇんだ 被 1 → 1.1 → 1 来回刷)。
altema 的結晶页本来就在这个脚本里下载了 (抓 入手方法 用),【効果量】那一列就是
`initial～max` 区间,取上限即 max_value —— 跟旧快照对了 947 条、946 条一致 (99.9%),
唯一不同的是 wiki 后来自己改了的那条。所以不用新增任何 HTTP 请求、也不用改 yml
(run_update 模块 B 每轮都会调本脚本)。

按 name 反查 wiki entry、wiki 没匹配 → 不写该字段、不覆盖。
重跑 idempotent。
"""
import argparse
import html as htmlmod
import json
import re
import sys
import time
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


# altema 偶发 403 (按 IP 限流、不是封禁) —— 隔一会儿重试就过。CI 一直能抓到,
# 但本地连着跑几次就会撞上,所以统一加退避重试。
def fetch_soup(url, retries=4, backoff=15):
    print(f"fetching {url} ...")
    resp = None
    for i in range(retries):
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            return BeautifulSoup(resp.text, 'html.parser')
        print(f"  -> {resp.status_code}, retry {i + 1}/{retries}")
        if i + 1 < retries:
            time.sleep(backoff)
    resp.raise_for_status()


# 【効果量】 是 'initial～max' 区间、混着和数字 (億/万/千 复合)。
#   '1.13～5倍' → 5 / '3億3千万～16億5千万' → 1.65e9 / '1440万～10億8000万' → 1.08e9
_JP_UNITS = (('億', 1e8), ('万', 1e4))


def _jp_small(s):
    """千 以下的部分 + 裸数字。'5千' → 5000、'8000' → 8000、'1.65倍' → 1.65"""
    s = s.strip()
    if not s:
        return 0.0
    if '千' in s:
        head, tail = s.split('千', 1)
        hm = re.search(r'-?\d+(?:\.\d+)?', head)
        tm = re.search(r'-?\d+(?:\.\d+)?', tail)
        return (float(hm.group()) if hm else 1.0) * 1000 + (float(tm.group()) if tm else 0.0)
    m = re.search(r'-?\d+(?:\.\d+)?', s)
    return float(m.group()) if m else 0.0


def jp_num(s):
    """和数字字符串 → float。不含数字则 None (altema 的 '極' 'なし' 这类)"""
    if not s:
        return None
    s = s.replace(',', '').replace('，', '').strip()
    if not re.search(r'\d', s):
        return None
    total = 0.0
    for unit, mul in _JP_UNITS:
        if unit in s:
            head, s = s.split(unit, 1)
            total += _jp_small(head) * mul
    return total + _jp_small(s)


def _range_parts(s):
    if not s:
        return []
    return re.split(r'[～~〜]', s.split('\n')[0])


def range_upper(s):
    """区间字符串的上限侧。'1.13～5倍' → 5.0;单值则原样返回"""
    parts = _range_parts(s)
    return jp_num(parts[-1]) if parts else None


def range_lower(s):
    """区间字符串的下限侧。用来推 altema 跟 master 的单位比例 (见 crystal_values)"""
    parts = _range_parts(s)
    return jp_num(parts[0]) if parts else None


# altema 的下限 / master 的 initial_value 超过这个倍数 → 认为 altema 用的是百分数
SCALE_HINT = 50.0


def num_like_revise(x):
    """整数值写成 int —— revise 里既有的写法就是 `"max_value": 2` 而不是 `2.0`。
    jp_num 一律返回 float,不归一化的话会把 ~150 条没动过的 entry 刷成 `2.0`、制造无意义 diff。"""
    if x is None:
        return None
    r = round(x, 6)
    return int(r) if abs(r - round(r)) < 1e-9 else r


def _row_data_contents(row):
    raw = htmlmod.unescape(row.get('data-contents', '{}'))
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def crystal_acquisitions(soup):
    """crystal page: tds[1] 用换行 + 【label】 分段 → {normalized name: {label: text}}
    出现过的 label: 効果 / 入手方法 / 効果量 / 上限値 / 対象 / 特殊条件。
    (【上限値】 是 '極' 这种等级标签、**不是** max_value;数值在 【効果量】 的区间上限)"""
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
        out[_normalize_name(name)] = fields
    return out


def crystal_values(soup, init_of=None):
    """crystal: {name: {'入手方法': str, 'max_value': float}} — 只放取到的 field

    **单位换算** (2026-09-11): altema 对 `Wave_Heal` 用**百分数** (`'1～9%'`),
    而 master 的 `initial_value` 是**分数** (`0.01`) —— 直接取上限会写成 100 倍。
    判据用「効果量下限 ÷ master initial_value」: 实测这个比例只有两簇 ——
    874 条 ≈1 (同单位) 和 9 条 ≈100 (全部是 Wave_Heal);其余 87 条 (DamageLimitBreak /
    BlazeGauge) 比例在 2.8~10 之间,那是 wiki 的区间下限跟 initial_value 基准不同、
    不是单位问题,上限本身是对的。
    ⚠ **不能拿「带不带 %」当判据**: BlazeAbsorb / InstantDeath / Stun / Mez / RateDamage /
      JustGuard_Heal 有 19 条也带 %,但 master 本来就存百分数 (如 init=25.0),除 100 会写错。
    """
    out = {}
    rescaled = []
    for name, f in crystal_acquisitions(soup).items():
        vals = {}
        nyushu = (f.get('入手方法') or '').strip()
        if nyushu:
            vals['入手方法'] = nyushu
        eff = f.get('効果量', '')
        mx = range_upper(eff)
        if mx is not None:
            init = init_of(name) if init_of else None
            lo = range_lower(eff)
            if init and lo and init > 0 and lo / init >= SCALE_HINT:
                mx /= 100.0
                rescaled.append(name)
            vals['max_value'] = num_like_revise(mx)
        if vals:
            out[name] = vals
    if rescaled:
        print(f"  单位换算 (altema 百分数 → master 分数、÷100): {len(rescaled)} 条"
              f" {rescaled[:4]}{' …' if len(rescaled) > 4 else ''}")
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
            out[_normalize_name(name)] = {'acquisition': nyushu}
    return out


_FACTOR_KEYS = ('M_L_max', 'M_W_max', 'M_P_max')


def patch_revise(master_path, revise_path, value_map, hard_field=None, hard_resolver=None):
    """从 master 按 name 匹配 value_map、把各 field 注入 *_revise.json。
    value_map: {normalized name: {field: value}}
    revise 数据跟 master 解耦、build_all 重 build master 不影响 revise (用户决策 2026-06-09)。
    hard_resolver(name) → str|None 只对 hard_field 生效、优先于 wiki。

    max_value 的写入条件: **已有三因子、且原本没有 max_value 的不写**。
    三因子在的时候 `crystalEffectiveValue` 走公式、max_value 只是 fallback,而
    純真記憶/秘録記憶/アビス 这些 series build_crystals 是**故意**只给因子不给 max_value 的
    (实测若无条件写、会给 100 条这类 entry 平白加上一个用不到的 key)。
    但原本**就有** max_value 的要照常刷新 —— 否则 Wave_Heal 那 3 条 (有因子 + 百分数旧值)
    的单位就永远修不了。

    返回 (matched_total, hard_count, wiki_count, total, sample_unmatched, per_field)"""
    master = json.loads(master_path.read_text(encoding='utf-8'))
    if revise_path.is_file():
        revise = json.loads(revise_path.read_text(encoding='utf-8'))
    else:
        revise = []
    revise_by_id = {r['id']: r for r in revise if isinstance(r, dict) and 'id' in r}

    hard_count = 0
    wiki_count = 0
    per_field = {}
    unmatched_sample = []
    for m_entry in master:
        mid = m_entry.get('id')
        name = m_entry.get('name')
        if mid is None or not name:
            continue

        base = _normalize_name(name)
        found = value_map.get(base)
        if found is None:
            for k in _alt_keys(base):
                found = value_map.get(k)
                if found is not None:
                    break
        vals = dict(found) if found else {}

        # hard rule 只覆盖 hard_field (入手方法 / acquisition)、
        # 从 wiki 取到的其他 field (max_value) 照常保留 —— 以前 hard 一命中就把整个
        # wiki 查询短路掉,导致 series 系那 370 条的 max_value 永远更新不了。
        hard = hard_resolver(name) if hard_resolver else None
        if hard:
            vals[hard_field] = hard
            hard_count += 1
        elif found is not None:
            wiki_count += 1

        if not vals:
            if len(unmatched_sample) < 5:
                unmatched_sample.append(name)
            continue

        # 写入 revise (merge: 已有 entry 加字段、没的话新建)
        if mid not in revise_by_id:
            revise_by_id[mid] = {'id': mid, 'name': name}
        target = revise_by_id[mid]
        for field, value in vals.items():
            if (field == 'max_value' and target.get('max_value') is None
                    and any(target.get(k) is not None for k in _FACTOR_KEYS)):
                continue
            target[field] = value
            per_field[field] = per_field.get(field, 0) + 1

    final = sorted(revise_by_id.values(), key=lambda r: r['id'])
    revise_path.write_text(
        json.dumps(final, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    return hard_count + wiki_count, hard_count, wiki_count, len(master), unmatched_sample, per_field


def main():
    parser = argparse.ArgumentParser(description="Patch 入手方法 from altema wiki")
    parser.add_argument('--skip-crystal', action='store_true')
    parser.add_argument('--skip-bg', action='store_true')
    args = parser.parse_args()

    if not args.skip_crystal:
        cr_soup = fetch_soup(CRYSTAL_URL)
        # master 的 initial_value 用来判 altema 那边的单位 (见 crystal_values)
        _cry = json.loads((DATA_DIR / 'crystals.json').read_text(encoding='utf-8'))
        _init = {}
        for c in (_cry if isinstance(_cry, list) else _cry.values()):
            if c.get('name') and c.get('initial_value') is not None:
                _init.setdefault(_normalize_name(c['name']), c['initial_value'])
        cr_map = crystal_values(cr_soup, _init.get)
        n_mx = sum(1 for v in cr_map.values() if 'max_value' in v)
        print(f"  wiki crystal: {len(cr_map)} entries (入手方法 あり "
              f"{sum(1 for v in cr_map.values() if '入手方法' in v)} / 効果量→max_value あり {n_mx})")
        m, hard, wiki, t, sample, per = patch_revise(
            DATA_DIR / "crystals.json", DATA_DIR / "crystal_revise.json",
            cr_map, '入手方法', _resolve_crystal_hard,
        )
        pct = 100 * m / t if t else 0
        print(f"crystal: matched {m}/{t} ({pct:.1f}%)  [hard={hard} / wiki={wiki}]  "
              f"written={per}  → data/crystal_revise.json")
        if m < t:
            print(f"  unmatched sample (前 5): {sample}")

    if not args.skip_bg:
        bg_soup = fetch_soup(BG_URL)
        bg_map = bg_acquisitions(bg_soup)
        print(f"  wiki bg 入手方法: {len(bg_map)} entries")
        m, hard, wiki, t, sample, per = patch_revise(
            DATA_DIR / "bladegraphs.json", DATA_DIR / "bg_revise.json",
            bg_map, 'acquisition', _resolve_bg_hard,
        )
        pct = 100 * m / t if t else 0
        print(f"bg: matched {m}/{t} ({pct:.1f}%)  [hard={hard} / wiki={wiki}]  "
              f"written={per}  → data/bg_revise.json")
        if m < t:
            print(f"  unmatched sample (前 5): {sample}")


if __name__ == '__main__':
    main()
