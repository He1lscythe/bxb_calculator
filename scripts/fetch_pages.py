import requests
from bs4 import BeautifulSoup
import time
import os

BASE_URL = "https://altema.jp"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch(url: str) -> BeautifulSoup:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"
    return BeautifulSoup(resp.text, "html.parser")


def save_html(soup: BeautifulSoup, filename: str):
    path = os.path.join(OUT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(soup.prettify())
    print(f"Saved: {path}")


def main():
    # --- 1. Character list page ---
    print("Fetching character list...")
    list_url = f"{BASE_URL}/bxb/charalist"
    list_soup = fetch(list_url)
    save_html(list_soup, "charalist.html")

    # Quick preview: collect all character links
    links = list_soup.select("a[href^='/bxb/chara/']")
    char_urls = list(dict.fromkeys(
        BASE_URL + a["href"] for a in links if a["href"].split("/")[-1].isdigit()
    ))
    print(f"Found {len(char_urls)} character links")
    for u in char_urls[:10]:
        print(" ", u)
    if len(char_urls) > 10:
        print(f"  ... and {len(char_urls) - 10} more")

    # --- 2. Single character page (example: 1647) ---
    print("\nFetching example character page (1647)...")
    time.sleep(1)
    chara_url = f"{BASE_URL}/bxb/chara/1647"
    chara_soup = fetch(chara_url)
    save_html(chara_soup, "chara_1647.html")

    # Quick preview: dump text content
    print("\n--- Page text preview ---")
    for tag in chara_soup.select("h1, h2, h3, th, td")[:40]:
        text = tag.get_text(strip=True)
        if text:
            print(f"  <{tag.name}>: {text}")


if __name__ == "__main__":
    main()
