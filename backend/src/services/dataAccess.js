'use strict';

// 数据访问服务层（架构契约入口）
// 依据：docs/架构解耦重构方案-高内聚低耦合.md §4.3 依赖方向规则
//
// 目的：controllers 层依法不得直接依赖 models 层（依赖须向下收敛到服务层）。
// 本文件是数据访问的「唯一被允许的出口」——控制器只应从这里取模型/事务句柄，
// 依赖方向为 controllers → services/dataAccess → models。
//
// 约定：
// - 业务查询/聚合逻辑沉淀到 domains/*/xxxService 后再被控制器调用，而不是在控制器里堆模型调用。
// - 简单的读/写归属（findByPk/findAll/create/update 等）可经本层取模型直用，但禁止绕过它去 require('../models')。
// - 跨域写收口仍生效：FinanceRecord/AuditLog 的写必须经 domains/finance 与 core/auditService，本层不豁免。

const models = require('../models');

module.exports = {
  ...models,
  sequelize: models.sequelize,
};