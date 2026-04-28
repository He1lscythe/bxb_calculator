#!/usr/bin/env python3
"""Download senzai_kaiho icons 1-114 into crawl/icon/omoide/"""
import os
import time
import requests

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icon", "omoide")
BASE_URL = "https://img.altema.jp/bxb/senzai_kaiho/icon/{}.jpg"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

os.makedirs(OUT_DIR, exist_ok=True)

session = requests.Session()
ok, skip, fail = 0, 0, 0

for i in range(1, 115):
    path = os.path.join(OUT_DIR, f"{i}.jpg")
    if os.path.exists(path):
        skip += 1
        continue
    url = BASE_URL.format(i)
    try:
        r = session.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            with open(path, "wb") as f:
                f.write(r.content)
            print(f"  [{i:3d}] OK  ({len(r.content)} bytes)")
            ok += 1
        else:
            print(f"  [{i:3d}] HTTP {r.status_code}")
            fail += 1
    except Exception as e:
        print(f"  [{i:3d}] ERROR: {e}")
        fail += 1
    time.sleep(0.3)

print(f"\nDone. OK={ok}  skip={skip}  fail={fail}")
print(f"Saved to: {OUT_DIR}")
