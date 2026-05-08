#!/usr/bin/env python3
"""
BxB viewer local server
- GET  /*           : serve static files from crawl directory
- POST /save        : write *_revise.json files
"""
import http.server
import json
import os
import socket
import threading
import webbrowser

PORT = 8787
DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(DIR, 'data')

# 与 api/save.js の ID_BUCKETS と保持一致。
# 値は (filename, session_ids_key)。masou は chara/soul と id namespace が違うため
# 独立な masou_session_ids を使う（chara id と masou id が衝突して entry を誤って消すのを防ぐ）。
ID_BUCKETS = {
    'revise':            ('characters_revise.json', 'session_ids'),
    'omoide_revise':     ('omoide_revise.json',     'session_ids'),
    'soul_revise':       ('souls_revise.json',      'session_ids'),
    'crystal_revise':    ('crystals_revise.json',   'session_ids'),
    'bladegraph_revise': ('bladegraph_revise.json', 'session_ids'),
    'masou_revise':      ('masou_revise.json',      'masou_session_ids'),
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIR, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_POST(self):
        if self.path != '/save':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            data   = json.loads(self.rfile.read(length))

            # id-level merge: 与 Vercel api/save.js 的合并逻辑保持一致。
            # 缺失的 id（在 session_ids 但 patch 里没有）= 用户清空了 diff → 删除条目。
            # bucket 单位で別々の session_ids を読む（masou は chara と id が衝突するため独立）。
            for key, (filename, sid_key) in ID_BUCKETS.items():
                if key not in data:
                    continue
                patches = data[key]
                if not isinstance(patches, list):
                    continue
                bucket_sids = data.get(sid_key) or []
                if not isinstance(bucket_sids, list):
                    bucket_sids = []
                if not bucket_sids and not patches:
                    continue
                merged = _merge_by_id(_read_data(filename), patches, bucket_sids)
                _write_data(filename, json.dumps(merged, ensure_ascii=False, indent=2) + '\n')

            # full-overwrite buckets（无 id-merge 语义）
            if 'omoide_templates' in data:
                _write_data('omoide_templates.json', json.dumps(data['omoide_templates'], ensure_ascii=False, indent=2) + '\n')

            self._json(200, {'ok': True})
        except Exception as e:
            self._json(500, {'error': str(e)})

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if args[1] not in ('200', '304'):
            super().log_message(fmt, *args)


def _write_data(name, text):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, name), 'w', encoding='utf-8') as f:
        f.write(text)


def _read_data(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _deep_merge(target, source):
    """字段级 deep merge（Vercel api/save.js と同等）。
    - source[k] is None → result[k] を削除（撤回マーカー）
    - 再帰後 空 dict になったキーも prune（落盘 revise.json をクリーンに保つ）"""
    if source is None:
        return None
    if not isinstance(source, dict):
        return source
    result = dict(target) if isinstance(target, dict) else {}
    for k, sv in source.items():
        merged = _deep_merge(result.get(k), sv)
        if merged is None:
            result.pop(k, None)
        else:
            result[k] = merged
    for k in list(result.keys()):
        v = result[k]
        if isinstance(v, dict) and not v:
            del result[k]
    return result


def _has_real_content(entry):
    """id / name 以外のフィールドが残っていれば revise として意味あり"""
    return any(k not in ('id', 'name') for k in entry)


def _merge_by_id(existing, patches, session_ids):
    """id-level merge：保留未触及的 entry；session_ids 内の id は field-level deep merge；
    session_ids 内なのに patch 不在の id = 削除。
    deep merge 後 id/name しか残らない空 entry も削除（全フィールドが null 撤回された場合）。"""
    session_set = set(session_ids)
    # session_ids 不包含的 patch 直接忽略：避免 existing 同 id 与 patch 同時押し込まれて重複
    patch_map = {p.get('id'): p for p in (patches or [])
                 if p.get('id') is not None and p.get('id') in session_set}
    merged = []
    for c in (existing or []):
        cid = c.get('id')
        if cid not in session_set:
            merged.append(c)
        elif cid in patch_map:
            entry = _deep_merge(c, patch_map.pop(cid))
            if _has_real_content(entry):
                merged.append(entry)
        # else: deleted (skip)
    for p in patch_map.values():
        # 新規 id の patch も deep_merge を通して null マーカーや空 dict を prune
        entry = _deep_merge({}, p)
        if _has_real_content(entry):
            merged.append(entry)
    merged.sort(key=lambda c: c.get('id') or 0)
    return merged


def _lan_ips():
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None):
            ip = info[4][0]
            if ip.startswith('192.') or ip.startswith('10.') or ip.startswith('172.'):
                if ip not in ips:
                    ips.append(ip)
    except Exception:
        pass
    return ips

url = f'http://127.0.0.1:{PORT}/pages/characters.html'
print(f'Server running at {url}')
for ip in _lan_ips():
    print(f'  LAN access : http://{ip}:{PORT}/pages/characters.html')
print('Press Ctrl+C to stop')

# Open browser in background, then run server on main thread so Ctrl+C works
threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()

with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
