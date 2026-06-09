// ESLint flat config — only critical rules to start; style rules are Prettier's job.
// 开 3 条 critical：no-undef / no-unused-vars / no-redeclare。
// 其他规则保持 ESLint 默认 off、避免一次性引入大量 noise。

import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'pages/**',            // build 产物、跟 pages_src/ 同源
      'data/**',
      'docs/**',
      '_lookup/**',
      'draft/**',
      'audit/**',
      'icon/**',
      '__pycache__/**',
    ],
  },

  // 前端 ES module (js/ shared/ — 浏览器 import)
  {
    files: ['js/**/*.js', 'shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // 项目特有的 inline onclick 全局 (window.* 挂载的 setter)、避免 no-undef 误报
        // 这些函数都通过 Object.assign(window, {...}) 注册到 window、HTML onclick 直接调
        state: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-redeclare': 'error',
    },
  },

  // Vercel api/ (package.json "type":"module" → .js 默认 ESM)
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-redeclare': 'error',
    },
  },

  // Build / scripts (Node)
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-redeclare': 'error',
    },
  },

  // Tests (.cjs — Node CommonJS)
  {
    files: ['tests/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-redeclare': 'error',
    },
  },
];
