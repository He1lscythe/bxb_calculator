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

# 与 api/save.js 的 ID_BUCKETS 保持一致
ID_BUCKETS = {
    'revise':            'characters_revise.json',
    'omoide_revise':     'omoide_revise.json',
    'soul_revise':       'souls_revise.json',
    'crystal_revise':    'crystals_revise.json',
    'bladegraph_revise': 'bladegraph_revise.json',
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

            session_ids = data.get('session_ids') or []
            if not isinstance(session_ids, list):
                session_ids = []

            # id-level merge: 与 Vercel api/save.js 的合并逻辑保持一致。
            # 缺失的 id（在 session_ids 但 patch 里没有）= 用户清空了 diff → 删除条目
            for key, filename in ID_BUCKETS.items():
                if key not in data:
                    continue
                patches = data[key]
                if not isinstance(patches, list):
                    continue
                if not session_ids and not patches:
                    continue
                merged = _merge_by_id(_read_data(filename), patches, session_ids)
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


def _merge_by_id(existing, patches, session_ids):
    """id-level merge：保留未触及的 entry；session_ids 内的 id 用 patch 替换；
    在 session_ids 但不在 patch 的 id = 删除。"""
    session_set = set(session_ids)
    patch_map = {p.get('id'): p for p in (patches or []) if p.get('id') is not None}
    merged = []
    for c in (existing or []):
        cid = c.get('id')
        if cid not in session_set:
            merged.append(c)
        elif cid in patch_map:
            merged.append(patch_map.pop(cid))
        # else: deleted (skip)
    merged.extend(patch_map.values())
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

url = f'http://127.0.0.1:{PORT}/pages/index.html'
print(f'Server running at {url}')
for ip in _lan_ips():
    print(f'  LAN access : http://{ip}:{PORT}/pages/index.html')
print('Press Ctrl+C to stop')

# Open browser in background, then run server on main thread so Ctrl+C works
threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()

with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
