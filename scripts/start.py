#!/usr/bin/env python3
"""
BxB v2 viewer local dev server (Phase 7 Session 1)
- GET  /*           : serve static files from crawl directory
- POST /save        : write *_revise.json files (4 bucket: chara/masou/soul/crystal)

v2 vs wiki main 差异:
- 4 bucket (砍 bg/omoide/omoide_templates/_check 共 6 个)
- chara/masou/soul revise key 用 master id (base_id 4 位 / weapon_costumes.id 7 位 / jobs.id)
- crystal revise key 用 materials.id

跟 api/save.js (Vercel) 同 deepMerge 算法 + 同 ID_BUCKETS schema、本地/远端语义一致。
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

# 4 bucket (chara/masou/soul/crystal)、跟 save-client.js POST body 一致
# value = (filename, session_ids_key)
# masou 独立 session_ids_key 因为 masou.id 7 位、chara base_id 4 位、namespace 重叠风险低但保留 wiki main 同 pattern
ID_BUCKETS = {
    'chara_revise':   ('chara_revise.json',   'session_ids'),
    'soul_revise':    ('soul_revise.json',    'session_ids'),
    'crystal_revise': ('crystal_revise.json', 'session_ids'),
    'masou_revise':   ('masou_revise.json',   'masou_session_ids'),
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

            # id-level merge: 跟 Vercel api/save.js 一致
            # session_ids 内有但 patch 不存在的 id = 用户清空了 diff → 删除条目
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
    """字段级 deep merge (跟 shared/revise-core.js deepApply 等价、Python 版)
    - source[k] is None → 删除 result[k] (tombstone 撤回标记)
    - 空 dict prune (保持 revise.json 干净)"""
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


_META_KEYS = frozenset({'id', 'name', 'chara_id', 'chara_name'})


def _has_real_content(entry):
    """metadata 之外字段还有 → revise 有意义。
    chara_id / chara_name 是 masou_revise 可读 metadata、撤回判定不计。"""
    return any(k not in _META_KEYS for k in entry)


def _merge_by_id(existing, patches, session_ids):
    """id-level merge: 未触及的 entry 保留;session_ids 内的 id field-level deep merge;
    session_ids 内但 patch 缺失的 id = 删除。
    deep merge 后只剩 id/name 空 entry 也删 (所有字段被 null 撤回时)。"""
    session_set = set(session_ids)
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
        # else: 删除 (skip)
    for p in patch_map.values():
        # 新 id 的 patch 也走 deep_merge 来 prune null / 空 dict
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


if __name__ == '__main__':
    url = f'http://127.0.0.1:{PORT}/pages/characters.html'
    print(f'BxB v2 server running at {url}')
    for ip in _lan_ips():
        print(f'  LAN access : http://{ip}:{PORT}/pages/characters.html')
    print('Press Ctrl+C to stop')

    threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()

    with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopped.')
