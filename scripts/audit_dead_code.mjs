#!/usr/bin/env node
// scripts/audit_dead_code.mjs — Dead code / 无效参数 audit。
//
// 输出 4 份 markdown 报告（到 audit/ 目录、gitignored）：
//   1. dead-exports.md     — `export const xxx` 但全项目 0 callsite
//   2. redundant-exports.md — callsite 仅在定义文件内部（export 关键字冗余）
//   3. dead-imports.md     — 顶部 import 但本文件未引用
//   4. arity-mismatch.md   — 函数定义参数数 vs callsite arg count 不一致
//
// 实现：纯 regex（避免新增 acorn dep）。精度 ~90%，B3 阶段 user 审会兜底 false positive。
//
// 用法：
//   node scripts/audit_dead_code.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'audit');

// ===== Step 1: 文件清单 =====

const SCAN_DIRS = [
  { dir: 'js', exts: ['.js'] },
  { dir: 'shared', exts: ['.js'] },
  { dir: 'pages_src', exts: ['.html'] },
  { dir: 'pages', exts: ['.html'] }, // build 产物、仅作 callsite 索引
  { dir: 'tests', exts: ['.cjs', '.mjs'] },
];

const SKIP_FILE_NAMES = new Set([
  // 这些 test 自带 cjs mirror 已删、保留 .cjs 为兼容
]);

const listFiles = () => {
  const files = [];
  for (const { dir, exts } of SCAN_DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (SKIP_FILE_NAMES.has(f)) continue;
      const fp = path.join(full, f);
      const stat = fs.statSync(fp);
      if (!stat.isFile()) continue;
      if (!exts.some((e) => f.endsWith(e))) continue;
      files.push({ rel: path.join(dir, f).replace(/\\/g, '/'), full: fp });
    }
  }
  // tests/ui/ 子目录
  const uiDir = path.join(ROOT, 'tests/ui');
  if (fs.existsSync(uiDir)) {
    for (const f of fs.readdirSync(uiDir)) {
      if (f.endsWith('.js')) {
        files.push({
          rel: 'tests/ui/' + f,
          full: path.join(uiDir, f),
        });
      }
    }
  }
  return files;
};

// ===== Step 2: 提取 inline JS（HTML 文件 inline `<script type="module">`) =====

const extractInlineJs = (text) => {
  // 返回 [{ start, end, content }]，start/end 是字符偏移
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

// 把 char-offset 转 line number (1-indexed)
const offsetToLine = (text, offset) => {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
};

// 拿"代码内容"（JS / HTML inline JS 合并）
const getCodeContent = (file, text) => {
  if (file.rel.endsWith('.html')) {
    return extractInlineJs(text)
      .map((b) => b.content)
      .join('\n\n/* === inline script boundary === */\n\n');
  }
  return text;
};

// ===== Step 3: 提取 exports =====

const EXPORT_PATTERNS = [
  // export const NAME =
  // export let NAME =
  // export var NAME =
  // export function NAME(
  // export async function NAME(
  // export class NAME
  /^\s*export\s+(?:const|let|var|function|async\s+function|class)\s+(\w+)/gm,
];

const extractExports = (file, text) => {
  const exports = [];
  if (file.rel.endsWith('.html')) {
    // 对 HTML 文件、提取 inline JS 块 + 计算 offset 累加
    const blocks = extractInlineJs(text);
    for (const b of blocks) {
      for (const pat of EXPORT_PATTERNS) {
        pat.lastIndex = 0;
        let m;
        while ((m = pat.exec(b.content)) !== null) {
          const lineInBlock = b.content.substring(0, m.index).split('\n').length;
          const blockStartLine = offsetToLine(text, b.start);
          exports.push({
            name: m[1],
            file: file.rel,
            line: blockStartLine + lineInBlock - 1,
          });
        }
      }
      // export { a, b, c } from / export { a, b }
      const namedRe = /^\s*export\s+\{([^}]+)\}(?:\s+from)?/gm;
      let m2;
      while ((m2 = namedRe.exec(b.content)) !== null) {
        const lineInBlock = b.content.substring(0, m2.index).split('\n').length;
        const blockStartLine = offsetToLine(text, b.start);
        for (const part of m2[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[1] || part.trim().split(/\s+as\s+/)[0];
          if (/^\w+$/.test(name)) {
            exports.push({
              name,
              file: file.rel,
              line: blockStartLine + lineInBlock - 1,
            });
          }
        }
      }
    }
  } else {
    for (const pat of EXPORT_PATTERNS) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(text)) !== null) {
        exports.push({
          name: m[1],
          file: file.rel,
          line: text.substring(0, m.index).split('\n').length,
        });
      }
    }
    const namedRe = /^\s*export\s+\{([^}]+)\}(?:\s+from)?/gm;
    let m2;
    while ((m2 = namedRe.exec(text)) !== null) {
      const lineNum = text.substring(0, m2.index).split('\n').length;
      for (const part of m2[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[1] || part.trim().split(/\s+as\s+/)[0];
        if (/^\w+$/.test(name)) {
          exports.push({ name, file: file.rel, line: lineNum });
        }
      }
    }
  }
  return exports;
};

// ===== Step 4: 提取 imports =====

const extractImports = (file, text) => {
  // [{ name, file, line }]
  const imports = [];
  const code = getCodeContent(file, text);
  // 多行 import { a, b, c, ... } from 'xxx'
  const re = /import\s+(?:\{([^}]+)\}|(\w+))?(?:\s*,\s*\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const offset = m.index;
    const line = code.substring(0, offset).split('\n').length;
    // m[1] = named imports `{ a, b }`、m[2] = default `Foo`、m[3] = named + default after `,`
    const namedGroup = (m[1] || '') + (m[3] ? ',' + m[3] : '');
    if (namedGroup) {
      for (const part of namedGroup.split(',')) {
        const tr = part.trim();
        if (!tr) continue;
        // `a as b` → 本地名是 b
        const localName = tr.split(/\s+as\s+/)[1] || tr.split(/\s+as\s+/)[0];
        if (/^\w+$/.test(localName)) {
          imports.push({ name: localName, file: file.rel, line, source: m[4] });
        }
      }
    }
    if (m[2]) {
      imports.push({ name: m[2], file: file.rel, line, source: m[4], kind: 'default' });
    }
  }
  return imports;
};

// ===== Step 5: 计算 callsite =====
//
// callsite 形态：
//   1. `\bNAME\s*\(`      — function call
//   2. `import {... NAME ...}` — named import
//   3. `Object.assign(window, { ..., NAME, ... })` — 暴露到 global（间接 callsite）
//   4. onclick="...NAME(..."  — HTML inline handler
//   5. `\bNAME\b` 在 `export { ..., NAME, ... }` 内 — re-export
//
// 注意：定义自己那行（line==defLine && file==defFile）不计入。

const allFilesText = new Map(); // file.rel → raw text
const allFilesCodeText = new Map(); // file.rel → code content (HTML 时是 inline JS)

const countCallsites = (name, defFile, defLine) => {
  let total = 0;
  const byFile = new Map(); // file → count
  const byKind = { call: 0, namedImport: 0, windowAssign: 0, onclick: 0, reExport: 0 };

  const nameRe = new RegExp(`\\b${name}\\b`, 'g');

  for (const [file, codeText] of allFilesCodeText) {
    if (!codeText.match(nameRe)) continue;

    // 在 codeText 内逐行扫描
    const lines = codeText.split('\n');
    let fileCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      // skip 仅含 export/import 关键字的定义行（粗略）
      // 用 word-boundary `\bNAME\b` 然后判断 context
      if (!new RegExp(`\\b${name}\\b`).test(ln)) continue;

      // 跳过纯注释行
      if (/^\s*\/\//.test(ln) || /^\s*\*/.test(ln)) continue;

      // 判断各类 context
      const inCall = new RegExp(`\\b${name}\\s*\\(`).test(ln);
      const inNamedImport = new RegExp(
        `import\\s+(?:\\{[^}]*\\b${name}\\b[^}]*\\}|\\w+\\s*,\\s*\\{[^}]*\\b${name}\\b[^}]*\\})\\s+from`,
      ).test(ln);
      const inWindowAssign =
        /Object\.assign\s*\(\s*window\s*,/.test(ln) ||
        /Object\.assign\s*\(\s*window\b/.test(
          // 检查多行 Object.assign 块 — 简化：看前面 5 行有没有 Object.assign(window,
          lines.slice(Math.max(0, i - 20), i + 1).join('\n'),
        );
      const inOnclick = /(?:onclick|onchange|oninput)\s*=/.test(ln) && inCall;
      const inReExport = /^\s*export\s+\{/.test(ln);

      // 是定义行本身？— 通过位置和定义行号判断
      // codeText 在 HTML 文件里是 inline JS concat、line 跟 raw text 有偏移
      // 简化：在 file === defFile 时、看是否是定义行的 export/const/function 声明
      let isDef = false;
      if (file === defFile) {
        if (
          new RegExp(
            `^\\s*export\\s+(?:const|let|var|function|async\\s+function|class)\\s+${name}\\b`,
          ).test(ln)
        ) {
          isDef = true;
        } else if (new RegExp(`^\\s*(?:const|let|var|function)\\s+${name}\\b`).test(ln)) {
          isDef = true;
        }
      }
      if (isDef) continue;

      // 排除：multi-line comment 中的 NAME（粗略：行包含 `*/` 或 / 形式不计）
      // 排除：字符串字面量中的 NAME（粗略：行包含 `'NAME'` 或 `"NAME"`）
      const isInString =
        new RegExp(`['"\`][^'"\`]*\\b${name}\\b[^'"\`]*['"\`]`).test(ln) && !inCall && !inOnclick;
      if (isInString && !inWindowAssign && !inReExport && !inNamedImport) continue;

      let recorded = false;
      if (inCall) {
        byKind.call++;
        recorded = true;
      } else if (inNamedImport) {
        byKind.namedImport++;
        recorded = true;
      } else if (inOnclick) {
        byKind.onclick++;
        recorded = true;
      } else if (inWindowAssign) {
        byKind.windowAssign++;
        recorded = true;
      } else if (inReExport) {
        byKind.reExport++;
        recorded = true;
      } else {
        // bare reference — 也算（比如 setTimeout(fn, 1000) 或 const x = NAME）
        byKind.call++;
        recorded = true;
      }
      if (recorded) {
        total++;
        fileCount++;
      }
    }
    if (fileCount > 0) byFile.set(file, fileCount);
  }

  return { total, byFile, byKind };
};

// ===== Step 6: 提取函数定义参数 =====

const extractFunctions = (file, text) => {
  // [{ name, requiredArity, totalArity, hasRest, line, file }]
  const code = getCodeContent(file, text);
  const funcs = [];

  // pattern 1: function NAME(args) { ... }
  // pattern 2: const NAME = (args) => { ... }
  // pattern 3: const NAME = function (args) { ... }
  // pattern 4: const NAME = async (args) => ...
  // pattern 5: export const NAME = ...
  const patterns = [
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/g,
  ];

  for (const pat of patterns) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(code)) !== null) {
      const name = m[1];
      const argsStr = m[2];
      const args = parseParams(argsStr);
      const lineNum = code.substring(0, m.index).split('\n').length;
      funcs.push({
        name,
        requiredArity: args.required,
        totalArity: args.total,
        hasRest: args.hasRest,
        file: file.rel,
        line: lineNum,
      });
    }
  }

  return funcs;
};

const parseParams = (argsStr) => {
  // 返回 { required, total, hasRest }
  const s = argsStr.trim();
  if (!s) return { required: 0, total: 0, hasRest: false };
  // 简单 split 逗号、不考虑嵌套花括号 / 默认值含逗号
  // 用 depth tracking 分割：
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    if (c === ')' || c === '}' || c === ']') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) parts.push(cur);

  let required = 0;
  let total = 0;
  let hasRest = false;
  for (const p of parts) {
    const tr = p.trim();
    if (!tr) continue;
    total++;
    if (tr.startsWith('...')) {
      hasRest = true;
      total--; // rest 不算固定 arity
      continue;
    }
    if (!tr.includes('=')) required++;
  }
  return { required, total, hasRest };
};

// ===== Step 7: 计算 callsite arg count =====

const countCallsiteArgs = (name) => {
  // 返回 [{ file, line, argCount, raw }]
  const results = [];
  const callRe = new RegExp(`\\b${name}\\s*\\(`, 'g');

  for (const [file, codeText] of allFilesCodeText) {
    if (!callRe.test(codeText)) {
      callRe.lastIndex = 0;
      continue;
    }
    callRe.lastIndex = 0;

    let m;
    while ((m = callRe.exec(codeText)) !== null) {
      const startIdx = m.index + m[0].length;
      // 找匹配的右括号
      let depth = 1;
      let i = startIdx;
      let inStr = null;
      let inTpl = false;
      while (i < codeText.length && depth > 0) {
        const c = codeText[i];
        const prev = i > 0 ? codeText[i - 1] : '';
        if (inStr) {
          if (c === inStr && prev !== '\\') inStr = null;
        } else if (inTpl) {
          if (c === '`' && prev !== '\\') inTpl = false;
          // template 内的 ${...} 没处理（简化）
        } else {
          if (c === '"' || c === "'") inStr = c;
          else if (c === '`') inTpl = true;
          else if (c === '(') depth++;
          else if (c === ')') depth--;
        }
        if (depth === 0) break;
        i++;
      }
      const argsRaw = codeText.substring(startIdx, i);
      // 跳过定义行（这里的 \(... 是 function declaration 的参数列表）
      const lineStartIdx = codeText.lastIndexOf('\n', m.index) + 1;
      const lineText = codeText.substring(lineStartIdx, codeText.indexOf('\n', m.index));
      if (
        new RegExp(`(?:function|const|let|var)\\s+${name}\\s*\\(`).test(lineText) ||
        new RegExp(`${name}\\s*=\\s*(?:async\\s+)?\\(`).test(lineText) ||
        new RegExp(`${name}\\s*=\\s*function\\s*\\(`).test(lineText) ||
        new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).test(lineText)
      ) {
        continue; // skip 定义
      }

      // count args by depth 0 commas — 关键：每遇到 d=0 的 `,` 既 +argCount
      // 又 reset segmentHasContent；最后如果 segmentHasContent 再 +1。
      // 这样能正确处理 trailing comma（最后逗号后 segmentHasContent=false 不再+1）。
      // 也跳过 single-line `//` comment + multi-line `/* */` comment 内的字符。
      let argCount = 0;
      let segmentHasContent = false;
      let d = 0;
      let inS = null;
      let inT = false;
      let inLineComment = false;
      let inBlockComment = false;
      for (let k = 0; k < argsRaw.length; k++) {
        const c = argsRaw[k];
        const next = k + 1 < argsRaw.length ? argsRaw[k + 1] : '';
        const prev = k > 0 ? argsRaw[k - 1] : '';
        if (inLineComment) {
          if (c === '\n') inLineComment = false;
          continue;
        }
        if (inBlockComment) {
          if (c === '*' && next === '/') {
            inBlockComment = false;
            k++; // skip the '/'
          }
          continue;
        }
        if (inS) {
          if (c === inS && prev !== '\\') inS = null;
          segmentHasContent = true;
          continue;
        }
        if (inT) {
          if (c === '`' && prev !== '\\') inT = false;
          segmentHasContent = true;
          continue;
        }
        // comment start (在 string / template 外才识别)
        if (c === '/' && next === '/') {
          inLineComment = true;
          k++;
          continue;
        }
        if (c === '/' && next === '*') {
          inBlockComment = true;
          k++;
          continue;
        }
        if (c === '"' || c === "'") {
          inS = c;
          segmentHasContent = true;
          continue;
        }
        if (c === '`') {
          inT = true;
          segmentHasContent = true;
          continue;
        }
        if (c === '(' || c === '{' || c === '[') {
          d++;
          segmentHasContent = true;
          continue;
        }
        if (c === ')' || c === '}' || c === ']') {
          d--;
          segmentHasContent = true;
          continue;
        }
        if (c === ',' && d === 0) {
          argCount++;
          segmentHasContent = false;
          continue;
        }
        if (!/\s/.test(c)) segmentHasContent = true;
      }
      if (segmentHasContent) argCount++;
      const lineNum = codeText.substring(0, m.index).split('\n').length;
      results.push({ file, line: lineNum, argCount, raw: argsRaw.trim().substring(0, 80) });
    }
  }

  return results;
};

// ===== 主流程 =====

const main = () => {
  console.log('Scanning files...');
  const files = listFiles();
  console.log(`  ${files.length} files`);

  // load all file contents
  for (const f of files) {
    const text = fs.readFileSync(f.full, 'utf8');
    allFilesText.set(f.rel, text);
    allFilesCodeText.set(f.rel, getCodeContent(f, text));
  }

  console.log('Extracting exports...');
  const allExports = [];
  for (const f of files) {
    const exps = extractExports(f, allFilesText.get(f.rel));
    allExports.push(...exps);
  }
  // 去重（同名 export 可能在 multiple files、保留全部）
  console.log(`  ${allExports.length} exports total`);

  console.log('Extracting imports...');
  const allImports = [];
  for (const f of files) {
    const imps = extractImports(f, allFilesText.get(f.rel));
    allImports.push(...imps);
  }
  console.log(`  ${allImports.length} imports total`);

  console.log('Computing callsites per export...');
  const exportCallsites = []; // [{ exp, count, byFile, byKind }]
  for (const exp of allExports) {
    const cs = countCallsites(exp.name, exp.file, exp.line);
    exportCallsites.push({ exp, ...cs });
  }

  console.log('Extracting function definitions + arity...');
  const allFuncs = [];
  for (const f of files) {
    const fs2 = extractFunctions(f, allFilesText.get(f.rel));
    allFuncs.push(...fs2);
  }
  console.log(`  ${allFuncs.length} function defs`);

  console.log('Checking arity mismatches...');
  const arityIssues = [];
  // 去重函数名（同名定义在多文件 → 跳过 audit、太复杂）
  const funcsByName = new Map();
  for (const fn of allFuncs) {
    if (!funcsByName.has(fn.name)) funcsByName.set(fn.name, []);
    funcsByName.get(fn.name).push(fn);
  }

  for (const [name, defs] of funcsByName) {
    if (defs.length > 1) continue; // 同名多定义、ambiguous、跳
    const def = defs[0];
    const callsites = countCallsiteArgs(name);
    for (const cs of callsites) {
      // 排除定义自己（虽然 countCallsiteArgs 内已 skip 定义模式）
      if (cs.file === def.file && cs.line === def.line) continue;
      // 缺参：argCount < requiredArity && !hasRest
      // 多参：argCount > totalArity && !hasRest
      if (cs.argCount < def.requiredArity) {
        arityIssues.push({
          def,
          cs,
          kind: 'too-few',
          expected: def.requiredArity,
          actual: cs.argCount,
        });
      } else if (!def.hasRest && cs.argCount > def.totalArity) {
        arityIssues.push({
          def,
          cs,
          kind: 'too-many',
          expected: def.totalArity,
          actual: cs.argCount,
        });
      }
    }
  }

  console.log('Generating reports...');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // === report 1: dead exports ===
  const dead = exportCallsites
    .filter((e) => e.total === 0)
    .sort((a, b) => a.exp.file.localeCompare(b.exp.file) || a.exp.line - b.exp.line);
  let md1 = '# Dead Exports (0 callsite)\n\n';
  md1 += `生成时间：${new Date().toISOString()}\n\n`;
  md1 += `共 **${dead.length}** 条嫌疑。\n\n`;
  md1 += '| 文件:行号 | NAME | 备注 |\n|---|---|---|\n';
  for (const d of dead) {
    md1 += `| \`${d.exp.file}:${d.exp.line}\` | \`${d.exp.name}\` | 0 callsite |\n`;
  }
  fs.writeFileSync(path.join(OUT_DIR, 'dead-exports.md'), md1, 'utf8');

  // === report 2: redundant exports (callsite 仅在定义文件) ===
  const redundant = exportCallsites
    .filter((e) => {
      if (e.total === 0) return false;
      // 全部 callsite 都在定义文件
      const otherFiles = [...e.byFile.keys()].filter((f) => f !== e.exp.file);
      return otherFiles.length === 0;
    })
    .sort((a, b) => a.exp.file.localeCompare(b.exp.file) || a.exp.line - b.exp.line);
  let md2 = '# Redundant Exports (仅 module-internal 用)\n\n';
  md2 += `生成时间：${new Date().toISOString()}\n\n`;
  md2 += `共 **${redundant.length}** 条嫌疑。callsite 全部在定义所在文件、export 关键字冗余。\n\n`;
  md2 += '| 文件:行号 | NAME | callsite 数 | 备注 |\n|---|---|---|---|\n';
  for (const r of redundant) {
    md2 += `| \`${r.exp.file}:${r.exp.line}\` | \`${r.exp.name}\` | ${r.total} (全在同文件) | 建议改为 const / function（不 export） |\n`;
  }
  fs.writeFileSync(path.join(OUT_DIR, 'redundant-exports.md'), md2, 'utf8');

  // === report 3: dead imports ===
  // 一个 import 是 dead 当：file 内部除 import 行外的 occurrence count == 0
  const deadImports = [];
  for (const imp of allImports) {
    // 在 imp.file 内统计 imp.name 出现次数（排除 import 行本身）
    const codeText = allFilesCodeText.get(imp.file) || '';
    const lines = codeText.split('\n');
    let occur = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      // skip import statement 行（含 `import` 关键字且本行有 from）
      if (/^\s*import\s/.test(ln) && /\bfrom\s+['"]/.test(ln)) continue;
      // skip multi-line import 内的行（粗略：上一非空行末是 `,`、当前在 `{ ... }` 内）
      // 简化：在 import 行后续行直到 } 都跳过
      // 改用 char-level 检查：lines join 起来 check imp.name 在 import block 内？
      // 简化版本：直接 grep `\bNAME\b`
      if (new RegExp(`\\b${imp.name}\\b`).test(ln)) {
        occur++;
      }
    }
    if (occur === 0) {
      deadImports.push(imp);
    }
  }
  // 但还要排除：多行 import block 内的同名 NAME 行（imp.line 周围几行 import 块内的 ln 也算 import）
  // 用一个更稳的判定：把 import block (从 `import {` 到 `}` from) 整段排除
  // 重新算：
  const codeImportBlocks = new Map(); // file → [{start, end}]
  for (const [file, codeText] of allFilesCodeText) {
    const blocks = [];
    const re = /import\s+(?:\{[^}]*\}|\w+)(?:\s*,\s*\{[^}]*\})?\s+from\s+['"][^'"]+['"]\s*;?/g;
    let m;
    while ((m = re.exec(codeText)) !== null) {
      const startLine = codeText.substring(0, m.index).split('\n').length;
      const endLine = startLine + m[0].split('\n').length - 1;
      blocks.push({ startLine, endLine });
    }
    codeImportBlocks.set(file, blocks);
  }

  const deadImportsAccurate = [];
  for (const imp of allImports) {
    const codeText = allFilesCodeText.get(imp.file) || '';
    const lines = codeText.split('\n');
    const blocks = codeImportBlocks.get(imp.file) || [];
    let occur = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      // skip lines inside any import block
      const inImportBlock = blocks.some((b) => lineNum >= b.startLine && lineNum <= b.endLine);
      if (inImportBlock) continue;
      const ln = lines[i];
      if (new RegExp(`\\b${imp.name}\\b`).test(ln)) {
        occur++;
      }
    }
    if (occur === 0) {
      deadImportsAccurate.push(imp);
    }
  }

  const byFileMap = new Map();
  for (const d of deadImportsAccurate) {
    if (!byFileMap.has(d.file)) byFileMap.set(d.file, []);
    byFileMap.get(d.file).push(d);
  }
  let md3 = '# Dead Imports (顶部 import 但本文件未引用)\n\n';
  md3 += `生成时间：${new Date().toISOString()}\n\n`;
  md3 += `共 **${deadImportsAccurate.length}** 条嫌疑、跨 ${byFileMap.size} 文件。\n\n`;
  for (const [file, items] of [...byFileMap].sort((a, b) => a[0].localeCompare(b[0]))) {
    md3 += `## \`${file}\` (${items.length})\n\n`;
    for (const im of items) {
      md3 += `- 行 ${im.line}：\`${im.name}\` from \`${im.source}\`\n`;
    }
    md3 += '\n';
  }
  fs.writeFileSync(path.join(OUT_DIR, 'dead-imports.md'), md3, 'utf8');

  // === report 4: arity mismatch ===
  let md4 = '# Arity Mismatch (函数定义参数数 vs callsite 不一致)\n\n';
  md4 += `生成时间：${new Date().toISOString()}\n\n`;
  md4 += `共 **${arityIssues.length}** 条嫌疑。\n\n`;
  md4 += '> **审阅指南**：\n';
  md4 +=
    '> - **Too-many**（callsite 传太多）= 多数有意义、callsite 多余参被丢、可能反映 callsite stale 或 def 改过没同步 — 优先审。\n';
  md4 +=
    '> - **Too-few**（callsite 传太少）= JS 没强制 required 概念、callsite 用 `arg ?? default` / `arg || {}` convention 不传 optional 是常态 — **多数 false positive**、只关注 def 函数体内对该参数有强引用（如 `arg.X.Y`）但 callsite 不传的 case。\n';
  md4 += '> - 脚本纯 regex 解析、不识别 default param 复杂表达式 — 漏 / 误报必有。\n\n';

  const tooFew = arityIssues.filter((a) => a.kind === 'too-few');
  const tooMany = arityIssues.filter((a) => a.kind === 'too-many');

  md4 += `## Too few args (缺参=潜在 bug、共 ${tooFew.length})\n\n`;
  md4 += '| 函数 | 定义 | callsite | 期望 / 实际 | 调用上下文 |\n|---|---|---|---|---|\n';
  for (const a of tooFew.sort((x, y) => x.def.name.localeCompare(y.def.name))) {
    md4 += `| \`${a.def.name}\` | \`${a.def.file}:${a.def.line}\` | \`${a.cs.file}:${a.cs.line}\` | ${a.expected} / ${a.actual} | \`${a.cs.raw}\` |\n`;
  }
  md4 += `\n## Too many args (多余参=无害、共 ${tooMany.length})\n\n`;
  md4 += '| 函数 | 定义 | callsite | 期望 / 实际 | 调用上下文 |\n|---|---|---|---|---|\n';
  for (const a of tooMany.sort((x, y) => x.def.name.localeCompare(y.def.name))) {
    md4 += `| \`${a.def.name}\` | \`${a.def.file}:${a.def.line}\` | \`${a.cs.file}:${a.cs.line}\` | ${a.expected} / ${a.actual} | \`${a.cs.raw}\` |\n`;
  }
  fs.writeFileSync(path.join(OUT_DIR, 'arity-mismatch.md'), md4, 'utf8');

  console.log('Done.');
  console.log(`  audit/dead-exports.md: ${dead.length} entries`);
  console.log(`  audit/redundant-exports.md: ${redundant.length} entries`);
  console.log(`  audit/dead-imports.md: ${deadImportsAccurate.length} entries`);
  console.log(`  audit/arity-mismatch.md: ${arityIssues.length} entries`);
};

main();
