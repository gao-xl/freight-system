// 前端 ESLint 配置（P1-6 修复：补齐前端静态检查覆盖）
// 采用 eslint 8 + eslint-plugin-vue 9（Vue 3 推荐组合），与后端 eslint 8 版本对齐。
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
  ],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  rules: {
    // 模板内未使用变量等 Vue 常见噪音，按团队习惯放宽
    'vue/multi-word-component-names': 'off',
    'vue/no-v-html': 'off',
    'vue/require-default-prop': 'off',
    'vue/attributes-order': 'off',
    'vue/attribute-hyphenation': 'off',
    'vue/v-on-event-hyphenation': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-constant-condition': ['error', { checkLoops: false }],
  },
  ignorePatterns: ['dist', 'dist-v0.2', 'node_modules', 'public/sw.js'],
};
