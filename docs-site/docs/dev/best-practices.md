---
title: 纪律与最佳实践
prev: /dev/migration
next: false
---

# 纪律与最佳实践

> 本页汇总二开时**必须遵守的纪律**与工程规范，避免踩坑。每一条都对应真实代码或安全事故。

## 1. 数据与金额

- **金额一律 DECIMAL**：`DataTypes.DECIMAL(14,2)`，**禁止 FLOAT**（精度问题）
- **唯一键加约束**：业务编号（code）在模型层加 `unique: true`
- **别硬编码密钥**：适配器密钥存 `IntegrationConfig` 表或环境变量

## 2. 权限与隔离（红线）

- **别绕过 `scopedWhere`**：新接口直接 `Model.findAll({ where: req.query })` 会绕过数据隔离
- **新接口必须挂 `guard(module, action)`**：哪怕内部工具接口
- **`protectedFields` 防篡改**：系统字段（如 `groupId`、`filePath`）用 `protectedFields` 剔除，禁止前端传改

## 3. 自动化与定时任务

- **幂等优先**：动作执行前先判断目标状态是否已满足；财务幂等用 `description` 里的 `#auto` 标记
- **预警必用 `upsertAlert` + `dedupKey`**：防重复轰炸，同一件事只报一次
- **单动作失败隔离**：每个动作/规则 `try/catch`，不影响其它
- **自动化必留痕**：每个自动化动作写 `AuditLog`，操作员 `SYSTEM`

```js
// automationService 的幂等约定
if (reached.has('loaded')) continue;   // 已到达则跳过
const exist = await FinanceRecord.findOne({
  where: { orderId: o.id, direction: 'receivable', description: { [Op.like]: '%#auto%' } },
});
if (exist) continue;
```

## 4. 事务

跨表、跨模块的原子操作用 `supports/transaction.js`：

```js
const { withTransaction } = require('../services/transaction');
const result = await withTransaction(async (t) => {
  // 多步写操作……
  return x;
});
```

典型场景：放单审批、报价转订单、订舱→财务。

## 5. 事件

- **必须容错**：handler 抛错被捕获记日志，但仍建议自己 try/catch
- **幂等优先**：handler 内用 dedupKey / 状态判断防重复
- **尽量 `onAsync`**：不让异步错误影响主流程

## 6. 代码结构

- **单文件 ≤ 300 行**：控制器逻辑下沉 `services/`，保持可读
- **路由只放 `routes/index.js`**：这是唯一权威来源，除非写成插件
- **新增不覆盖**：二开产物放 `backend/src/modules/<你的插件>/`，升级不冲突

## 7. 数据库

- **生产改表用迁移**，不用 `seed.js`（后者 force 清库）
- **迁移必须幂等**：`showAllTables` / `describeTable` 判断后再操作
- **SQLite → PostgreSQL**：量大建议切 PostgreSQL（JSONB 索引），迁移脚本通用

## 8. 安全

- **入参校验**：对外接口用 `middleware/validate.js` + `validation/schemas.js`
- **JWT 密钥**：生产环境 `NODE_ENV=production` 必须设置 `JWT_SECRET`，否则拒绝启动
- **审计**：写操作走 `audit` 中间件自动落 `AuditLog`

## 9. 上线前检查清单

- [ ] 新接口都挂了 `guard`，数据隔离没被绕过
- [ ] 金额字段是 DECIMAL，没有 FLOAT
- [ ] 密钥在 `IntegrationConfig` 表，没写死代码
- [ ] 自动化/事件 handler 幂等 + 容错
- [ ] 生产改表走了迁移，不是 seed
- [ ] 跑了回归：`node src/regression.js`

---

*至此，二次开发指引全册完。从 [总览](/dev/index) 重新出发，或按需查阅具体章节。*