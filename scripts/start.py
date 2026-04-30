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

            if 'revise' in data:
                _write_data('characters_revise.json', json.dumps(data['revise'], ensure_ascii=False, indent=2))

            if 'omoide_revise' in data:
                _write_data('omoide_revise.json', json.dumps(data['omoide_revise'], ensure_ascii=False, indent=2))

            if 'crystal_revise' in data:
                _write_data('crystals_revise.json', json.dumps(data['crystal_revise'], ensure_ascii=False, indent=2))

            if 'soul_revise' in data:
                _write_data('souls_revise.json', json.dumps(data['soul_revise'], ensure_ascii=False, indent=2))

            if 'omoide_templates' in data:
                _write_data('omoide_templates.json', json.dumps(data['omoide_templates'], ensure_ascii=False, indent=2))

            if 'bladegraph_revise' in data:
                _write_data('bladegraph_revise.json', json.dumps(data['bladegraph_revise'], ensure_ascii=False, indent=2))

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
