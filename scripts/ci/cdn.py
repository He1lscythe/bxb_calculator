"""cdn.py — BxB 资源 CDN 客户端 (无鉴权 plain HTTP)。

抓包确认 (2026-06-12, Maken.HTTP.Get/Download @ OnePlus):
  GET {ASSET_BASE}/version_lz4/android/current          → 当前 asset 版本号 (纯文本 int)
  GET {ASSET_BASE}/version_lz4/android/version-{ver}.gz  → manifest (gzip+msgpack {version, files:[...]})
  GET {ASSET_BASE}/package_lz4/android/{name}.v{ver}.dat → 单个资源 (LZ4 Unity AssetBundle)
全部无鉴权、无 X-Session。manifest entry: {name, crc, version, removable, size, md5}。
"""
import gzip
import hashlib

import msgpack
import requests

ASSET_BASE = "https://bxb-asset.grimoire.codes"
VERSION_BASE = ASSET_BASE + "/version_lz4/android"
PACKAGE_BASE = ASSET_BASE + "/package_lz4/android"
TIMEOUT = 60


def get_current_version() -> int:
    r = requests.get(f"{VERSION_BASE}/current", timeout=TIMEOUT)
    r.raise_for_status()
    return int(r.text.strip())


def get_manifest(version: int = None) -> dict:
    """返回 {version, files:[{name, version, md5, size, ...}]}。version 缺省取 current。"""
    if version is None:
        version = get_current_version()
    r = requests.get(f"{VERSION_BASE}/version-{version}.gz", timeout=TIMEOUT)
    r.raise_for_status()
    return msgpack.unpackb(gzip.decompress(r.content), raw=False, strict_map_key=False)


def manifest_index(manifest: dict) -> dict:
    """{name: entry} 便于查 version/md5。"""
    return {f["name"]: f for f in manifest.get("files", [])}


def download_dat(name: str, version: int, dest_path, verify_md5: str = None) -> bool:
    """下 {name}.v{version}.dat 到 dest_path。md5 不符 → False。"""
    url = f"{PACKAGE_BASE}/{name}.v{version}.dat"
    r = requests.get(url, timeout=TIMEOUT)
    if r.status_code != 200:
        return False
    if verify_md5 and hashlib.md5(r.content).hexdigest() != verify_md5:
        return False
    from pathlib import Path
    p = Path(dest_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(r.content)
    return True


if __name__ == "__main__":
    v = get_current_version()
    m = get_manifest(v)
    print(f"current asset version = {v} | manifest files = {len(m.get('files', []))}")
    idx = manifest_index(m)
    for k in ("weapon-stand-s-100101", "materia-icon-120101", "npc-motion-1"):
        print(f"  {k}: {idx.get(k)}")
