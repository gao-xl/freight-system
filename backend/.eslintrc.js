'use strict';

// 架构依赖方向铁律（契约文件）
// 依据：docs/架构解耦重构方案-高内聚低耦合.md §4.3 依赖方向规则
//
// 启用方式（尚未安装 eslint）：
//   cd backend && npm i -D eslint@^8
//   然后执行：npx eslint src/  （可接入 CI / package.json scripts.lint）
//
// 说明：
// - no-restricted-imports 不支持按"import 来源文件"过滤（如仅限 services/**），
//   此处用路径模式粗拦 + code review 红线兜底；精确拦截（import/no-restricted-paths）
//   待引入 eslint-plugin-import 后启用（F1 阶段）。
// - 本文件为配置即契约：即使 eslint 未安装，评审与二开也以此规则为准。

module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        // 铁律 1：禁止依赖控制器层（依赖只能向下）。services/domain/core 不得 import controllers
        { group: ['**/controllers/*'], message: '架构铁律 §4.3：禁止依赖控制器层（依赖只能向下）。控制器逻辑应下沉到 domains/*/xxxService 或 xxxDomain。' },
        // 铁律 2（E6）：跨域写收口——除 financeService 与模型层外，任何模块禁止直接 import FinanceRecord 模型
        { group: ['**/models/FinanceRecord'], message: '架构铁律 §4.4#2：非 finance 域不得直接写 FinanceRecord，请走 domains/finance/financeService.createRecord 或事件。' },
        // 铁律 3（E6）：审计写收口——AuditLog.create 只允许出现在 core/auditService.js
        { group: ['**/models/AuditLog'], message: '架构铁律 §4.4#3：AuditLog 只能经 core/auditService.record() 写入，禁止直接 import AuditLog 模型。' },
      ],
    }],
  },
  overrides: [
    // 允许的例外层：routes 挂载控制器、controllers 自身、测试、插件路由
    { files: ['src/routes/**'], rules: { 'no-restricted-imports': 'off' } },
    { files: ['src/controllers/**'], rules: { 'no-restricted-imports': 'off' } },
    { files: ['src/modules/**'], rules: { 'no-restricted-imports': 'off' } },
    { files: ['tests/**', '**/*.test.js'], rules: { 'no-restricted-imports': 'off' } },
  ],
};
