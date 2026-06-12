"""maken2_api.py — BxB game API client (pure HTTP, 免模拟器/ADB/Frida).

本会话逆向 + 实弹验证 (2026-06-11):
  POST /login (设备指纹, 静态 bootstrap key 加密) → {session_id, encryption_key}
  GET  /master_data  (X-Session 头, session key 加解密) → 完整 MasterDataSet
  GET  /asset-version (同 X-Session)                    → 资源 manifest

应用层加密 (Api.RequestManager / WWWWrapper):
  AES-256-CBC, IV = 密文前 16 字节, PKCS#7;  (可选 gzip) → msgpack
  Content-Type: application/x-maken2(-ce) = 加密(+gzip);  application/x-msgpack = 明文(错误/未认证兜底)

凭据 (env):
  BXB_UNIQUE_KEY      游客账号 unique_key (per-账号持久凭据, 见 HOWTO_api_replay.md)
  BXB_BOOTSTRAP_KEY   静态 bootstrap key (全版本固定、APK 升大版才变)

详见 unpacking/HOWTO_api_replay.md。
"""
import gzip
import os
import uuid

import msgpack
import requests
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

BASE = os.environ.get("BXB_API_BASE", "https://bxb.grimoire.codes")
CT_ENCRYPTED = "application/x-maken2; charset=utf-8"
TIMEOUT = 120


def maken2_encode(obj, key: bytes, compress: bool = False) -> bytes:
    """msgpack → (gzip) → AES-256-CBC(IV 前置)。"""
    pt = msgpack.packb(obj, use_bin_type=True)
    if compress:
        pt = gzip.compress(pt)
    iv = os.urandom(16)
    return iv + AES.new(key, AES.MODE_CBC, iv).encrypt(pad(pt, 16))


def maken2_decode(blob: bytes, key: bytes, compressed: bool):
    """AES-256-CBC(IV 前置) → (gunzip) → msgpack。"""
    iv, ct = blob[:16], blob[16:]
    pt = unpad(AES.new(key, AES.MODE_CBC, iv).decrypt(ct), 16)
    if compressed:
        pt = gzip.decompress(pt)
    return msgpack.unpackb(pt, raw=False, strict_map_key=False)


def _is_ce(resp) -> bool:
    return "x-maken2-ce" in (resp.headers.get("Content-Type") or "")


def _is_encrypted(resp) -> bool:
    return "x-maken2" in (resp.headers.get("Content-Type") or "")


def get_credentials():
    """从 env 取 (unique_key, bootstrap_key_bytes)。缺失抛错。"""
    uk = os.environ.get("BXB_UNIQUE_KEY")
    bk = os.environ.get("BXB_BOOTSTRAP_KEY")
    if not uk or not bk:
        raise RuntimeError(
            "缺少凭据: 设置环境变量 BXB_UNIQUE_KEY + BXB_BOOTSTRAP_KEY "
            "(GitHub Actions secrets; 见 HOWTO_api_replay.md)"
        )
    return uk, bk.encode("ascii")


def _device_fingerprint(unique_key: str) -> dict:
    # device_unique_identifier 不参与账号校验 (实测全 0 也能登录) — 填占位即可
    return {
        "unique_key": unique_key,
        "platform": 2,
        "device": "ci-runner",
        "os_version": "Linux",
        "app_version": os.environ.get("BXB_APP_VERSION", "2.5.34"),
        "device_unique_identifier": "0" * 32,
        "graphics_memory_size": 0,
        "graphics_device_name": "ci",
        "processor_count": 2,
        "processor_frequency": 0,
        "processor_type": "ci",
        "system_memory_size": 0,
        "unity_version": "2021.3.58f1",
        "request_token": uuid.uuid4().hex,  # 客户端随机 Guid、无服务器状态
    }


class Session:
    """一次登录的 session,持有 session_id + 32B 加密 key。"""

    def __init__(self, session_id: str, key: bytes, login_resp: dict):
        self.session_id = session_id
        self.key = key
        self.login_resp = login_resp

    def _get(self, path: str):
        r = requests.get(
            BASE + path,
            headers={"Content-Type": CT_ENCRYPTED, "X-Session": self.session_id},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        if _is_encrypted(r):
            return maken2_decode(r.content, self.key, _is_ce(r))
        # 明文 msgpack = 错误/未认证兜底响应
        return msgpack.unpackb(r.content, raw=False, strict_map_key=False)

    def get_master_data(self) -> dict:
        d = self._get("/master_data")
        if d.get("error_reason"):
            raise RuntimeError(
                f"/master_data error: {d.get('error_type')}/{d.get('error_reason')}"
            )
        return d

    def get_asset_version(self) -> dict:
        """资源 manifest {version, files:[{name, version, md5, size, ...}]}。

        端点未 100% 钉死 (HOWTO_assets_download 实测 /asset-version 路径存在、无 session 时返错误)。
        逐个候选试,返回第一个含 'files' 的。响应可能 x-maken2 加密或 gzip+msgpack 明文。
        """
        last = None
        for path in ("/asset-version", "/asset_version", "/asset/version"):
            try:
                r = requests.get(
                    BASE + path,
                    headers={"Content-Type": CT_ENCRYPTED, "X-Session": self.session_id},
                    timeout=TIMEOUT,
                )
            except requests.RequestException as e:
                last = str(e)
                continue
            if r.status_code != 200:
                last = f"{path} → HTTP {r.status_code}"
                continue
            obj = None
            if _is_encrypted(r):
                try:
                    obj = maken2_decode(r.content, self.key, _is_ce(r))
                except Exception as e:
                    last = f"{path} → decrypt fail {e}"
            else:
                # gzip+msgpack (asset-version.gz 格式) 或 明文 msgpack
                for dec in (
                    lambda b: msgpack.unpackb(gzip.decompress(b), raw=False, strict_map_key=False),
                    lambda b: msgpack.unpackb(b, raw=False, strict_map_key=False),
                ):
                    try:
                        obj = dec(r.content)
                        break
                    except Exception:
                        obj = None
            if isinstance(obj, dict) and isinstance(obj.get("files"), list):
                return obj
            last = f"{path} → 非 manifest (keys={list(obj)[:6] if isinstance(obj, dict) else type(obj).__name__})"
        raise RuntimeError(f"asset-version 端点未命中: {last}")


def login() -> Session:
    """用 env 凭据登录,返回 Session。"""
    uk, bootstrap = get_credentials()
    body = _device_fingerprint(uk)
    payload = maken2_encode(body, bootstrap, compress=False)
    r = requests.post(
        BASE + "/login", data=payload, headers={"Content-Type": CT_ENCRYPTED}, timeout=TIMEOUT
    )
    r.raise_for_status()
    resp = maken2_decode(r.content, bootstrap, _is_ce(r))
    if resp.get("error_reason") or not resp.get("session_id"):
        raise RuntimeError(
            f"login 失败: error_reason={resp.get('error_reason')!r} "
            f"(unique_key 不被服务器识别? 见 HOWTO_api_replay.md)"
        )
    import base64

    key = base64.b64decode(resp["encryption_key"])
    return Session(resp["session_id"], key, resp)


if __name__ == "__main__":
    # 冒烟测试: 登录 + 拉 master_data 顶层概览 (不写盘)
    s = login()
    print(f"login ok: user_id={s.login_resp.get('user_id')} session={s.session_id[:12]}…")
    m = s.get_master_data()
    print(f"master_data_version={m.get('master_data_version')} tables={len([k for k,v in m.items() if isinstance(v,list)])}")
    print(f"  weapons={len(m.get('weapons',[]))} materials={len(m.get('materials',[]))} jobs={len(m.get('jobs',[]))}")
