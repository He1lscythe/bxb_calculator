#!/usr/bin/env python3
"""
BxB viewer local server
- GET  /*           : serve static files from crawl directory
- POST /save        : write characters.json + characters_revise.json
"""
import http.server
import json
import os
import threading
import webbrowser

PORT = 8787
DIR  = os.path.dirname(os.path.abspath(__file__))


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

            if 'characters' in data:
                _write('characters.json', json.dumps(data['characters'], ensure_ascii=False, indent=2))
                # keep .js in sync so file:// mode still works
                _write('characters.js',
                       'var CHARA_DATA = ' + json.dumps(data['characters'], ensure_ascii=False) + ';\n')

            if 'revise' in data:
                _write('characters_revise.json', json.dumps(data['revise'], ensure_ascii=False, indent=2))

            if 'crystals' in data:
                _write('crystals.json', json.dumps(data['crystals'], ensure_ascii=False, indent=2))

            if 'crystal_revise' in data:
                _write('crystals_revise.json', json.dumps(data['crystal_revise'], ensure_ascii=False, indent=2))

            if 'souls' in data:
                _write('souls.json', json.dumps(data['souls'], ensure_ascii=False, indent=2))
                _write('souls.js', 'var SOULS_DATA = ' + json.dumps(data['souls'], ensure_ascii=False) + ';\n')

            if 'soul_revise' in data:
                _write('souls_revise.json', json.dumps(data['soul_revise'], ensure_ascii=False, indent=2))

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


def _write(name, text):
    with open(os.path.join(DIR, name), 'w', encoding='utf-8') as f:
        f.write(text)


url = f'http://127.0.0.1:{PORT}/index.html'
print(f'Server running at {url}')
print('Press Ctrl+C to stop')

# Open browser in background, then run server on main thread so Ctrl+C works
threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()

with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
