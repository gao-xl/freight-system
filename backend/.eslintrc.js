'use strict';

// 架构依赖方向铁律（契约文件）
// 依据：docs/架构解耦重构方案-高内聚低耦合.md §4.3 依赖方向规则
//
// 说明：
// - 用 import/no-restricted-paths 按「目录」精确拦截跨层/跨域依赖，弥补 no-restricted-imports
//   只能按字面 import 路径匹配的不足（模型经 index 聚合导出时字面路径不含模型名，旧规则空转）。
// - 覆盖面：依赖方向（向下）、跨域写收口（FinanceRecord/AuditLog）、报表/打印等聚合读门面。
// - 本文件为配置即契约：即使 eslint 未接入 CI，评审与二开也以此规则为准。

module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
  plugins: ['import'],
  settings: {
    'import/resolver': {
      node: { extensions: ['.js'] },
    },
  },
  rules: {
    // S4 质量护栏：过长文件与高复杂度告警（warn 不阻断构建，仅提示拆分时机）
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    'complexity': ['warn', { max: 20 }],
    'no-restricted-imports': ['error', {
      patterns: [
        // 铁律 1：禁止依赖控制器层（依赖只能向下）。services/domain/core 不得 import controllers
        { group: ['**/controllers/*'], message: '架构铁律 §4.3：禁止依赖控制器层（依赖只能向下）。控制器逻辑应下沉到 domains/*/xxxService 或 xxxDomain。' },
      ],
    }],
    // 按目录精确收敛架构依赖方向（zone.target 为受审计的「导入方」位置，zone.from 为被禁止 Import 的位置）
    // 语义：target 目录下的文件不得 import from 目录下的路径。
    'import/no-restricted-paths': ['error', {
      zones: [
        // 铁律 2（E6）：跨域写收口——任何模块不得「直接 import FinanceRecord 模型文件」，
        // 必须经 aggregates 索引（require('../models')）或 domains/finance/financeService。
        // 控制器/模块注册表/测试为契约例外（见 overrides）。
        { target: './src', from: './src/models/FinanceRecord.js' },
        // 铁律 3（E6）：审计写收口——任何模块不得「直接 import AuditLog 模型文件」，
        // 必须经 core/auditService.record() 写入。
        { target: './src', from: './src/models/AuditLog.js' },
        // 铁律 4（E8）：全量收敛——controllers 层不得直接从 models 层取模型，
        // 一律经 services/dataAccess 数据访问服务层（依赖方向 controllers → services → models）。
        { target: './src/controllers', from: './src/models' },
      ],
    }],
  },
  overrides: [
    // 允许的例外层：routes 挂载控制器、模块注册表、测试、插件路由
    { files: ['src/routes/**'], rules: { 'no-restricted-imports': 'off', 'import/no-restricted-paths': 'off' } },
    // controllers 层：不可从 models 层直取模型（import/no-restricted-paths 的 E8 铁律 4 生效），
    // 但允许依赖同层 baseController、子层 services/domains 及 utils/middleware（放行 no-restricted-imports 的"禁依赖控制器层"）。
    { files: ['src/controllers/**'], rules: { 'no-restricted-imports': 'off' } },
    { files: ['src/modules/**'], rules: { 'no-restricted-imports': 'off', 'import/no-restricted-paths': 'off' } },
    { files: ['tests/**', '**/*.test.js'], rules: { 'no-restricted-imports': 'off', 'import/no-restricted-paths': 'off' } },
    // 模型层自身聚合导出模型，允许直接引用模型文件（含 index.js 聚合）
    { files: ['src/models/**'], rules: { 'import/no-restricted-paths': 'off' } },
  ],
};