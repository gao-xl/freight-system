'use strict';

// 兼容层：ModuleRegistry 的实现已迁移至 src/core/moduleRegistry.js
// 此处仅做转发，保持既有 require('../services/moduleRegistry') 调用点不变。
// 新代码请直接 require('../core/moduleRegistry')。
//
// 协议说明与用法见 src/core/moduleRegistry.js 顶部注释，以及 docs/二开指南.md「写插件」章节。
const { ModuleRegistry, ModuleRegistryImpl } = require('../core/moduleRegistry');

module.exports = { ModuleRegistry, ModuleRegistryImpl };
