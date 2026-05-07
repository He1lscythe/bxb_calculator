#!/usr/bin/env node
// scripts/build.js — 把 pages_src/*.html 中的 {{include name}} 替换成 pages_src/name 内容，
// 输出到 pages/。Partials（文件名以 `_` 开头）不会作为页面输出，只能被 include。
//
// Usage:
//   node scripts/build.js          # 一次性 build
//   node scripts/build.js --watch  # 监视 pages_src/，改动自动 rebuild
//
// 输出文件顶部加 banner：
//   <!-- AUTO-GENERATED from pages_src/<file> — DO NOT EDIT. Run `node scripts/build.js` to rebuild. -->

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'pages_src');
const OUT  = path.join(ROOT, 'pages');

const INCLUDE_RE = /\{\{\s*include\s+([^}\s]+)\s*\}\}/g;
const MAX_DEPTH  = 10;

const resolveIncludes = (text, stack = []) => {
  if (stack.length > MAX_DEPTH) {
    throw new Error('include depth exceeded: ' + stack.join(' -> '));
  }
  return text.replace(INCLUDE_RE, (_, name) => {
    if (stack.includes(name)) {
      throw new Error('include cycle: ' + stack.concat(name).join(' -> '));
    }
    const fragPath = path.join(SRC, name);
    let content;
    try {
      content = fs.readFileSync(fragPath, 'utf8');
    } catch (e) {
      throw new Error(`partial not found: ${fragPath} (referenced from ${stack[stack.length - 1] || 'top'})`);
    }
    return resolveIncludes(content, stack.concat(name));
  });
};

const buildFile = (file) => {
  const srcPath = path.join(SRC, file);
  const outPath = path.join(OUT, file);
  const src = fs.readFileSync(srcPath, 'utf8');
  const banner = `<!-- AUTO-GENERATED from pages_src/${file} — DO NOT EDIT. Run \`node scripts/build.js\` to rebuild. -->\n`;
  const body = resolveIncludes(src, [file]);
  fs.writeFileSync(outPath, banner + body, 'utf8');
};

const buildAll = () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  // Partials (filenames starting with `_`) are include-only, not built as pages.
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.html') && !f.startsWith('_'));
  let ok = 0, fail = 0;
  for (const f of files) {
    try { buildFile(f); ok++; }
    catch (e) { console.error(`[fail] ${f}: ${e.message}`); fail++; }
  }
  const ts = new Date().toLocaleTimeString();
  console.log(`[build ${ts}] ${ok} ok${fail ? `, ${fail} fail` : ''}`);
};

buildAll();

if (process.argv.includes('--watch')) {
  console.log(`[watch] watching pages_src/ (Ctrl+C to stop)`);
  let timer = null;
  const debounce = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { buildAll(); }
      catch (e) { console.error('[error]', e.message); }
    }, 150);
  };
  fs.watch(SRC, { persistent: true }, debounce);
}
