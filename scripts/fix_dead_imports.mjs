#!/usr/bin/env node
// scripts/fix_dead_imports.mjs — 读 audit/dead-imports.md、batch 删 dead imports。
//
// 算法：
//   1. parse audit 报告拿 (file, line, name, source) tuples
//   2. 对每个 (file, name) re-verify：file 内除 import block 外 grep `\bNAME\b` count == 0
//   3. 按文件 group、对每个 import statement 找出所有 dead names
//   4. surgical 删除：
//      a. import statement 内全部 named 都 dead → 整行 import 删
//      b. 部分 dead → 重写 import statement 不含 dead names
//      c. default + named mixed：删 named、保留 default
//
// Usage:
//   node scripts/fix_dead_imports.mjs --dry-run  # 只预览改动、不写
//   node scripts/fix_dead_imports.mjs            # 实际改

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT = path.join(ROOT, 'audit', 'dead-imports.md');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ===== Step 1: parse audit report =====

const parseReport = () => {
  const text = fs.readFileSync(REPORT, 'utf8');
  // Section: ## `file.path` (N)
  // Item:    - 行 N：`NAME` from `source`
  const sections = text.split(/^## /m).slice(1);
  const entries = []; // { file, line, name, source }
  for (const sec of sections) {
    const headerMatch = sec.match(/^`([^`]+)`/);
    if (!headerMatch) continue;
    const file = headerMatch[1];
    const itemRe = /^- 行 (\d+)：`([^`]+)` from `([^`]+)`/gm;
    let m;
    while ((m = itemRe.exec(sec)) !== null) {
      entries.push({
        file,
        line: +m[1],
        name: m[2],
        source: m[3],
      });
    }
  }
  return entries;
};

// ===== Step 2: re-verify each entry (extract inline JS for HTML) =====

const extractInlineJs = (text) => {
  const blocks = [];
  const re = /<script\s+type=(?:"module"|'module')\s*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({
      start: m.index + m[0].indexOf(m[1]),
      end: m.index + m[0].indexOf(m[1]) + m[1].length,
      content: m[1],
    });
  }
  return blocks;
};

const getCodeContent = (file, text) => {
  if (file.endsWith('.html')) {
    return extractInlineJs(text)
      .map((b) => b.content)
      .join('\n\n/* === inline script boundary === */\n\n');
  }
  return text;
};

// find import block line ranges in code text
const findImportBlocks = (codeText) => {
  // multi-line import { ... } from '...'
  const blocks = [];
  const re = /import\s+(?:\{[^}]*\}|\w+)(?:\s*,\s*\{[^}]*\})?\s+from\s+['"][^'"]+['"]\s*;?/g;
  let m;
  while ((m = re.exec(codeText)) !== null) {
    const startLine = codeText.substring(0, m.index).split('\n').length;
    const endLine = startLine + m[0].split('\n').length - 1;
    blocks.push({ startLine, endLine, raw: m[0] });
  }
  return blocks;
};

const verifyDead = (entry) => {
  const fullPath = path.join(ROOT, entry.file);
  if (!fs.existsSync(fullPath)) return { ok: false, reason: 'file missing' };
  const text = fs.readFileSync(fullPath, 'utf8');
  const codeText = getCodeContent(entry.file, text);
  const blocks = findImportBlocks(codeText);
  const lines = codeText.split('\n');
  let occur = 0;
  const re = new RegExp(`\\b${entry.name}\\b`);
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const inImportBlock = blocks.some((b) => lineNum >= b.startLine && lineNum <= b.endLine);
    if (inImportBlock) continue;
    if (re.test(lines[i])) occur++;
  }
  return { ok: occur === 0, occur };
};

// ===== Step 3: group by (file, importStatement) and rewrite =====

// 找原始文件中 import statement 的 char-offset 范围（raw text、不是 inline 转换的 code text）
// 对 HTML 文件：import 在 inline `<script type="module">` 内、要算 inline block 内的 offset
const findRawImportStatements = (file, text) => {
  // 返回 [{ startOffset, endOffset, raw, fromSource }]
  const statements = [];
  let searchText = text;
  let baseOffset = 0;

  if (file.endsWith('.html')) {
    // 对每个 inline block 单独 parse
    const inlineBlocks = extractInlineJs(text);
    for (const ib of inlineBlocks) {
      const re = /import\s+(?:\{[^}]*\}|\w+)(?:\s*,\s*\{[^}]*\})?\s+from\s+['"]([^'"]+)['"]\s*;?/g;
      let m;
      while ((m = re.exec(ib.content)) !== null) {
        statements.push({
          startOffset: ib.start + m.index,
          endOffset: ib.start + m.index + m[0].length,
          raw: m[0],
          fromSource: m[1],
        });
      }
    }
  } else {
    const re = /import\s+(?:\{[^}]*\}|\w+)(?:\s*,\s*\{[^}]*\})?\s+from\s+['"]([^'"]+)['"]\s*;?/g;
    let m;
    while ((m = re.exec(searchText)) !== null) {
      statements.push({
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        raw: m[0],
        fromSource: m[1],
      });
    }
  }

  return statements;
};

// rewrite single import statement removing dead names
// returns: { newRaw, allDead }
const rewriteImport = (raw, deadNames) => {
  // raw 示例：
  //   "import { A, B, C } from './foo.js';"
  //   "import Foo, { A, B } from './foo.js';"
  //   "import {\n  A,\n  B,\n  C,\n} from './foo.js';"
  //   "import Foo from './foo.js';"
  //   "import './foo.js';"  (side-effect import — 不动)

  // 解析 default + named
  const m = raw.match(
    /^import\s+(?:(\w+)(?:\s*,\s*\{([^}]+)\})?|\{([^}]+)\})\s+from\s+(['"][^'"]+['"])\s*(;?)$/s,
  );
  if (!m) {
    // side-effect import / weird shape — 不动
    return { newRaw: raw, allDead: false };
  }
  const defaultName = m[1];
  const namedRaw = m[2] || m[3];
  const fromClause = m[4];
  const semi = m[5];

  if (!namedRaw) {
    // 只 default import — deadNames 内有 default name 才删
    if (defaultName && deadNames.has(defaultName)) {
      return { newRaw: '', allDead: true };
    }
    return { newRaw: raw, allDead: false };
  }

  // parse named imports
  const namedItems = namedRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // `a as b` → local name b
      const parts = s.split(/\s+as\s+/);
      return { full: s, local: parts[1] || parts[0] };
    });

  // Fast path: 此 statement 内 named 都不在 deadNames、且 default 也不删 → 不改、原文返回
  const willRemoveAny =
    namedItems.some((it) => deadNames.has(it.local)) || (defaultName && deadNames.has(defaultName));
  if (!willRemoveAny) {
    return { newRaw: raw, allDead: false };
  }

  const keptNamed = namedItems.filter((it) => !deadNames.has(it.local));

  if (keptNamed.length === 0 && (!defaultName || deadNames.has(defaultName))) {
    return { newRaw: '', allDead: true };
  }

  // rebuild
  let result = 'import ';
  if (defaultName && !deadNames.has(defaultName)) {
    result += defaultName;
    if (keptNamed.length > 0) result += ', ';
  }
  if (keptNamed.length > 0) {
    if (keptNamed.length <= 3) {
      result += `{ ${keptNamed.map((it) => it.full).join(', ')} }`;
    } else {
      // multi-line（>3 imports）
      result += `{\n  ${keptNamed.map((it) => it.full).join(',\n  ')},\n}`;
    }
  }
  result += ` from ${fromClause}${semi}`;
  return { newRaw: result, allDead: false };
};

// ===== Step 4: 主流程 =====

const main = () => {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);
  console.log('Parsing audit report...');
  const entries = parseReport();
  console.log(`  ${entries.length} entries`);

  console.log('Re-verifying each entry...');
  const verified = [];
  const skipped = [];
  for (const e of entries) {
    const v = verifyDead(e);
    if (v.ok) verified.push(e);
    else skipped.push({ ...e, reason: v.reason || `occur=${v.occur}` });
  }
  console.log(`  verified dead: ${verified.length}`);
  console.log(`  skipped (still used): ${skipped.length}`);
  if (skipped.length > 0) {
    console.log('  Skipped entries:');
    for (const s of skipped.slice(0, 10)) {
      console.log(`    ${s.file}:${s.line} ${s.name} — ${s.reason}`);
    }
    if (skipped.length > 10) console.log(`    ... and ${skipped.length - 10} more`);
  }

  // group verified by file
  const byFile = new Map(); // file → Set<name>
  for (const e of verified) {
    if (!byFile.has(e.file)) byFile.set(e.file, new Set());
    byFile.get(e.file).add(e.name);
  }
  console.log(`Files to fix: ${byFile.size}`);

  let totalRewritten = 0;
  let totalDeleted = 0;
  for (const [file, deadNames] of byFile) {
    const fullPath = path.join(ROOT, file);
    const text = fs.readFileSync(fullPath, 'utf8');
    const statements = findRawImportStatements(file, text);

    // 收集 rewrites（按 endOffset 倒序、防止前面修改影响后面 offset）
    const rewrites = [];
    for (const stmt of statements) {
      const result = rewriteImport(stmt.raw, deadNames);
      if (result.newRaw !== stmt.raw) {
        rewrites.push({ stmt, newRaw: result.newRaw, allDead: result.allDead });
      }
    }
    if (rewrites.length === 0) continue;

    // 倒序 apply
    rewrites.sort((a, b) => b.stmt.startOffset - a.stmt.startOffset);

    let newText = text;
    for (const r of rewrites) {
      const before = newText.substring(0, r.stmt.startOffset);
      const after = newText.substring(r.stmt.endOffset);
      let replacement = r.newRaw;
      if (r.allDead) {
        // 删整行：包括前后 \n
        // 把 before 末尾的 trailing newline 去掉、或把 after 起始的 newline 去掉
        // 简化：删 stmt + 后续 \n（如果 after 以 \n 开头）
        // 但要保留 before 末尾的换行（除非 before 也是空）
        if (after.startsWith('\n')) {
          newText = before + after.substring(1);
        } else if (before.endsWith('\n')) {
          newText = before + after;
        } else {
          newText = before + after;
        }
        totalDeleted++;
        console.log(`  ${file}: 整行删 \`${r.stmt.raw.substring(0, 80)}...\``);
      } else {
        newText = before + replacement + after;
        totalRewritten++;
        console.log(
          `  ${file}: 重写 import (删 ${[...deadNames].filter((n) => r.stmt.raw.includes(n)).join(', ')})`,
        );
      }
    }

    if (!DRY_RUN) {
      fs.writeFileSync(fullPath, newText, 'utf8');
    }
  }

  console.log(`\nSummary: ${totalDeleted} 整行删 + ${totalRewritten} 重写 import statement`);
  console.log(`Skipped: ${skipped.length}`);
  if (DRY_RUN) console.log('(dry-run — no files modified)');
};

main();
