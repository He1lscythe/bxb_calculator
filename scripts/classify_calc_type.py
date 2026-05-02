#!/usr/bin/env python3
"""
Add calc_type (加算 / 乘算) to every skill in characters_classified.json and souls.json.
Rules (priority order):
  1. effect contains N倍          → 乘算
  2. effect contains N%           → 乘算
  3. effect contains が[N]上昇     → 加算
  4. effect contains が[N]増加     → 加算
  5. effect contains が[N]アップ   → 加算
  6. effect contains +N / ＋N     → 加算
  7. bunrui ∈ {6,7,17,18,19}      → 加算
  8. fallback                     → 乘算

Discrepancies reported:
  A) fallback 乘算 but bairitu ≥ 100  (looks like flat stat amount → should be 加算)
  B) add_rule 加算 but 0 < bairitu < 10  (looks like multiplier → should be 乘算)
  C) skills with BOTH 倍/% AND が[N]上昇/増加 patterns (ambiguous, rule 1/2 wins)
"""
import json, re, os, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')
ADD_BUNRUI_SET = {6, 7, 17, 18, 19}

_MULT_PAT = [
    (re.compile(r'\d+(?:\.\d+)?倍'), 'N倍'),
    (re.compile(r'\d+(?:\.\d+)?%'),  'N%'),
]
_ADD_PAT = [
    (re.compile(r'が[\d,]+(?:億|万)?上昇'),            'がN上昇'),
    (re.compile(r'が\d+増加'),                          'がN増加'),
    (re.compile(r'が[\d,]+(?:\.\d+)?(?:億|万)?アップ'), 'がNアップ'),
    (re.compile(r'[+＋][\d,]+'),                       '+N'),
]


_HIT_PLUS = re.compile(r'[+＋][\d,]+')

def classify(effect, bunrui):
    """Return (calc_type, rule_label).  calc_type: 0=乘算 1=加算"""
    # Special: bunrui=7 (Hit数) with +N → hit count is always additive,
    # even if the same effect text also mentions N% for a secondary effect.
    if bunrui and 7 in bunrui and _HIT_PLUS.search(effect):
        return 1, 'hit_count'
    for pat, label in _MULT_PAT:
        if pat.search(effect):
            return 0, label
    for pat, label in _ADD_PAT:
        if pat.search(effect):
            return 1, label
    if bunrui and any(b in ADD_BUNRUI_SET for b in bunrui):
        return 1, 'bunrui'
    return 0, 'fallback'


def process_skills(items, get_skills_fn):
    disc_a = []  # fallback乘算 but bairitu>=100
    disc_b = []  # add_rule加算 but 0<bairitu<10
    disc_c = []  # ambiguous: both 倍/% AND がN上昇 patterns
    counts = collections.Counter()

    for item in items:
        for skill in get_skills_fn(item):
            effects = skill.get('effects')
            if not effects:
                continue
            e0 = effects[0]
            bunrui  = e0.get('bunrui', skill.get('bunrui', []))
            effect  = skill.get('effect', '')
            bairitu = e0.get('bairitu', skill.get('bairitu', 0))
            name    = skill.get('name', '')

            ct, rule = classify(effect, bunrui)
            e0['calc_type'] = ct
            counts[ct] += 1

            info = {
                'source': item.get('name', '?'),
                'skill':  name,
                'effect': effect[:100],
                'bunrui': bunrui,
                'bairitu': bairitu,
                'rule': rule,
            }

            # Discrepancy A: fallback 乘算 but bairitu looks like flat amount
            if rule == 'fallback' and isinstance(bairitu, (int, float)) and bairitu >= 100:
                disc_a.append(info)

            # Discrepancy B: add rule but bairitu looks like multiplier
            if rule.startswith('がN') or rule == '+N':
                if isinstance(bairitu, float) and 0 < bairitu < 10 and bairitu != int(bairitu):
                    disc_b.append(info)

            # Discrepancy C: effect contains BOTH 倍/% AND がN上昇 patterns
            has_mult = any(p.search(effect) for p, _ in _MULT_PAT)
            has_add  = any(p.search(effect) for p, _ in _ADD_PAT)
            if has_mult and has_add:
                disc_c.append(info)

    return counts, disc_a, disc_b, disc_c


def chars_skills(c):
    for state in c.get('states', {}).values():
        yield from state.get('skills', [])


def soul_skills(s):
    yield from s.get('skills', [])


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def save(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


REPORT_PATH = os.path.join(ROOT, 'scripts', 'calc_type_report.txt')


def write_disc(out, title, rows, limit=40):
    out.write(f'\n=== {title} ===\n')
    if not rows:
        out.write('  (none)\n')
        return
    seen = {}
    for r in rows:
        k = r['effect']
        if k not in seen:
            seen[k] = r
    unique = list(seen.values())
    out.write(f'  {len(unique)} unique effects (showing up to {limit}):\n')
    for r in unique[:limit]:
        out.write(f"  [{r['rule']}] bairitu={r['bairitu']}  bunrui={r['bunrui']}\n")
        out.write(f"    skill : {r['skill']}\n")
        out.write(f"    effect: {r['effect']}\n")


# ── main ──────────────────────────────────────────────────────────────────────
chars_path = os.path.join(DATA_DIR, 'characters.json')
souls_path = os.path.join(DATA_DIR, 'souls.json')

chars = load(chars_path)
souls = load(souls_path) if os.path.exists(souls_path) else []

c_counts, c_a, c_b, c_c = process_skills(chars, chars_skills)
s_counts, s_a, s_b, s_c = process_skills(souls, soul_skills)

total = c_counts + s_counts

with open(REPORT_PATH, 'w', encoding='utf-8') as out:
    out.write('=== calc_type results ===\n')
    out.write(f'  加算(1): {total[1]}  乘算(0): {total[0]}  total: {sum(total.values())}\n')
    write_disc(out, 'Discrepancy A: fallback→乘算 but bairitu≥100 (may be 加算)', c_a + s_a)
    write_disc(out, 'Discrepancy B: add_rule→加算 but bairitu looks like multiplier (<10 float)', c_b + s_b)
    write_disc(out, 'Discrepancy C: both 倍/% AND がN上昇 patterns (rule picks 乘算)', c_c + s_c)

save(chars_path, chars)
if souls:
    save(souls_path, souls)

print(f'加算(1): {total[1]}  乘算(0): {total[0]}  total: {sum(total.values())}')
print(f'Report written to: {REPORT_PATH}')
print('Saved.')
