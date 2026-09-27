# BxB Wiki

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

A fan-made wiki and team-building calculator for the mobile RPG
**Brave Sword × Blaze Soul** (ブレイブソード×ブレイズソウル), covering 4,500+ in-game
entries. The site's interface is in Japanese.

**Live site:** https://he1lscythe.github.io/bxb_calculator/

## Features

- **Databases** for 魔剣 (characters), 結晶 (crystals), 心象結晶 (bladegraphs) and ソウル
  (souls), with filters, sorting, and effect tags that classify every skill by effect,
  scope and trigger condition. 魔装 (costume) data feeds the character pages and the
  team builder.
- **Team builder (編成)** that computes a team's stats through a staged pipeline
  following the game's own rules, and simulates guild-battle damage and score.
- **Crystal simulator** for trying different levels, weight, purity and remaining HP on
  a crystal's multiplier.
- **Sharing:** export a team as a short link, a code string, or a JSON file.
- **Community corrections:** edit an entry in the browser and submit it; the change is
  opened as a pull request for review.

## How it works

```
game master tables (synced to Cloudflare R2 by a separate pipeline)
        │
        ▼
scripts/master_to_business/build_*.py   Python: raw tables → site JSON
        │
        ▼
data/*.json  +  *_revise.json            reviewed community corrections
        │
        ▼
shared/*-adapter.js                      merge corrections into the master data
        │
        ▼
pages/*.html  +  js/  +  shared/         static viewers and team calculator
```

- **Front end:** plain HTML, CSS and JavaScript, with no framework. `scripts/build.js`
  assembles `pages_src/` into `pages/`. Long lists use a custom virtual scroller
  (`shared/virtual-list.js`), so the crystal list stays responsive with all 2,000+ rows
  expanded, and images load lazily.
- **Corrections:** `shared/revise-core.js` turns each edit into a sparse diff. On the live
  site, `api/save.js` (a Vercel serverless function) merges the diff into the
  `data-staging` branch and opens a pull request with Octokit.
- **Short links:** `api/share.js` stores a team's share string in Upstash Redis under a
  content-addressed key (the first 10 characters of its SHA-256, base64url), so the same
  team always gets the same link.
- **CI (GitHub Actions):**
  - `test.yml` runs unit tests and ESLint on every push and pull request.
  - `ui.yml` runs the Playwright end-to-end tests.
  - `update-database.yml` rebuilds the data after each upstream sync and commits only
    when something changed.
  - `sync-main-to-staging.yml` keeps `data-staging` up to date with `main`.
  - `pages-retry.yml` re-runs failed GitHub Pages deployments.

## Tech stack

JavaScript · HTML/CSS · Python · Node.js · Vercel serverless functions · Upstash Redis ·
GitHub Actions · GitHub Pages · Playwright · ESLint · Prettier

## Project structure

| Path | Contents |
| --- | --- |
| `pages_src/` | HTML sources for each page |
| `pages/` | Built pages (committed and deployed) |
| `js/` | Page logic: lists, rendering, edit modes, filters |
| `shared/` | Shared modules: stat calculator, diff engine, virtual list, adapters, effect tags |
| `data/` | Generated JSON served by the site |
| `icons/` | Images for game entities |
| `api/` | Vercel serverless functions (`save.js`, `share.js`) |
| `scripts/` | Build script, local dev servers, data pipeline |
| `tests/unit/` | Unit tests (`node:test`) |
| `tests/ui/` | Playwright end-to-end tests |
| `docs/` | Design notes, in Chinese: project map, data schema, stat calculation |

## Running locally

Requires Node.js 20.19+ and Python 3.

```bash
npm ci
python scripts/start.py      # http://127.0.0.1:8787/pages/characters.html
```

`start.py` also serves a local `/save` endpoint that writes corrections to
`data/*_revise.json`. For a static server without it, run `node scripts/serve.js`
(http://127.0.0.1:8765/).

`pages/` is committed, so you only need to rebuild after editing `pages_src/`:

```bash
npm run build:local          # or: npm run watch
```

## Tests

```bash
npm test                          # unit tests
npx playwright install chromium   # first run only
npm run test:ui                   # end-to-end tests (starts scripts/serve.js on :8765)
npm run lint
```

As of September 2026 there are 345 unit tests and 91 end-to-end tests.

## Data updates

The build scripts read the game's master tables, which are not stored in this repository.
The generated JSON in `data/` is committed, so the site and the tests run without them.
To rebuild locally, set `BXB_MASTER_TABLES` to a folder of master tables and run:

```bash
pip install -r scripts/ci/requirements.txt
python scripts/master_to_business/build_all.py
```

## Credits

- Acquisition details and some effect values are cross-referenced from the
  [altema](https://altema.jp/) wiki.

## Disclaimer

This is an unofficial fan project. It is not affiliated with or endorsed by the developer
or publisher of Brave Sword × Blaze Soul. Game names, images and data belong to their
respective owners.
