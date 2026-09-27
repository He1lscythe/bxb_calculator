# BxB Wiki

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語**

スマートフォン向け RPG『**ブレイブソード×ブレイズソウル**』の非公式 wiki 兼編成計算ツールです。
4,500 件以上のゲームデータを収録しています。

**サイト：** https://he1lscythe.github.io/bxb_calculator/

## 主な機能

- **データベース**：魔剣・結晶・心象結晶・ソウル。絞り込みと並べ替えに対応し、すべてのスキルに
  効果・範囲・発動条件のタグを付けています。魔装のデータは魔剣ページと編成で使われます。
- **編成**：ゲーム本来の計算順に沿って段階的にステータスを計算し、ギルバトのダメージと
  スコアもシミュレーションできます。
- **結晶シミュレーター**：Lv・重量・純度・残 HP を動かして、結晶の倍率を確認できます。
- **共有**：編成を短縮 URL、共有コード、JSON ファイルのいずれかで書き出せます。
- **データ修正**：ブラウザ上でデータを修正して送信すると、プルリクエストとして作成され、
  レビューを経て反映されます。

## 仕組み

```
ゲームのマスターデータ（別のパイプラインが Cloudflare R2 に同期）
        │
        ▼
scripts/master_to_business/build_*.py   Python：元データ → サイト用 JSON
        │
        ▼
data/*.json  +  *_revise.json            レビュー済みの修正データ
        │
        ▼
shared/*-adapter.js                      修正をマスターデータにマージ
        │
        ▼
pages/*.html  +  js/  +  shared/         静的ページと編成計算
```

- **フロントエンド**：フレームワークを使わない素の HTML・CSS・JavaScript です。
  `scripts/build.js` が `pages_src/` から `pages/` を組み立てます。長いリストは自作の仮想スクロール
  （`shared/virtual-list.js`）で描画しているため、結晶の 2,000 行以上をすべて展開しても重くなりません。
  画像は遅延読み込みです。
- **データ修正**：`shared/revise-core.js` が修正内容を差分（sparse diff）に変換します。公開サイトでは
  `api/save.js`（Vercel のサーバーレス関数）が差分を `data-staging` ブランチにマージし、
  Octokit でプルリクエストを作成します。
- **短縮 URL**：`api/share.js` が編成の共有文字列を Upstash Redis に保存します。キーは内容から
  決まる（SHA-256 を base64url にした先頭 10 文字）ため、同じ編成なら常に同じ URL になります。
- **CI（GitHub Actions）**：
  - `test.yml`：push とプルリクエストのたびにユニットテストと ESLint を実行。
  - `ui.yml`：Playwright の E2E テストを実行。
  - `update-database.yml`：上流の同期のたびにデータを再構築し、変更があるときだけコミット。
  - `sync-main-to-staging.yml`：`data-staging` を `main` に追従させる。
  - `pages-retry.yml`：GitHub Pages のデプロイが失敗したら再実行。

## 技術スタック

JavaScript · HTML/CSS · Python · Node.js · Vercel serverless functions · Upstash Redis ·
GitHub Actions · GitHub Pages · Playwright · ESLint · Prettier

## ディレクトリ構成

| パス | 内容 |
| --- | --- |
| `pages_src/` | 各ページの HTML ソース |
| `pages/` | ビルド済みページ（コミット済み、そのままデプロイ） |
| `js/` | ページごとの処理：リスト、描画、編集モード、絞り込み |
| `shared/` | 共通モジュール：ステータス計算、差分エンジン、仮想リスト、アダプター、効果タグ |
| `data/` | サイトが読み込む JSON（パイプラインで生成） |
| `icons/` | ゲーム内アイコン |
| `api/` | Vercel のサーバーレス関数（`save.js`、`share.js`） |
| `scripts/` | ビルドスクリプト、ローカル開発サーバー、データパイプライン |
| `tests/unit/` | ユニットテスト（`node:test`） |
| `tests/ui/` | Playwright の E2E テスト |
| `docs/` | 設計メモ（中国語）：構成、データ形式、ステータス計算 |

## ローカルでの実行

Node.js 20.19 以上と Python 3 が必要です。

```bash
npm ci
python scripts/start.py      # http://127.0.0.1:8787/pages/characters.html
```

`start.py` はローカル用の `/save` エンドポイントも提供し、修正を `data/*_revise.json` に書き込みます。
静的サーバーだけでよければ `node scripts/serve.js`（http://127.0.0.1:8765/）を使ってください。

`pages/` はリポジトリにコミット済みなので、`pages_src/` を編集したときだけ再ビルドが必要です。

```bash
npm run build:local          # または npm run watch
```

## テスト

```bash
npm test                          # ユニットテスト
npx playwright install chromium   # 初回のみ
npm run test:ui                   # E2E テスト（:8765 で scripts/serve.js を起動）
npm run lint
```

2026 年 9 月時点で、ユニットテスト 345 件、E2E テスト 91 件です。

## データの更新

ビルドスクリプトはゲームのマスターデータを読み込みますが、マスターデータ自体はこのリポジトリに
含まれていません。生成済みの JSON は `data/` にコミットされているため、サイトとテストはそれがなくても
動きます。ローカルで再構築する場合は、`BXB_MASTER_TABLES` にマスターデータのフォルダを指定して
実行してください。

```bash
pip install -r scripts/ci/requirements.txt
python scripts/master_to_business/build_all.py
```

## クレジット

- 入手方法と一部の効果量は [アルテマ](https://altema.jp/) の攻略 wiki を参照しています。

## 免責事項

本プロジェクトは非公式のファンメイド作品であり、『ブレイブソード×ブレイズソウル』の開発元・配信元とは
一切関係がなく、公認も受けていません。ゲーム名・画像・データの権利は各権利者に帰属します。
