# 数据模型

共 40+ 模型，核心关系如下。

## 主数据

| 模型 | 说明 | 关键字段 |
|------|------|----------|
| Customer | 客户 | name, code, level, ownerId |
| Supplier | 供应商/承运人 | name, type |
| User / Role / Permission | RBAC | role, groupId |

## 业务主线

```
Quotation(报价) ─┐
                ├─► Order(订单) ──► Booking(订舱)
Customer ───────┘        │
                         ├─► CustomsDeclaration(报关)
                         ├─► ShipmentTrack(运输跟踪)
                         ├─► OrderNode(实例节点)
                         ├─► Document(单证)
                         ├─► FinanceRecord(财务流水)
                         ├─► Invoice(发票) / PaymentTransaction(支付) / ReleaseRecord(放单)
                         └─► OrderContainer(多箱)
```

## 自动化与扩展

| 模型 | 说明 |
|------|------|
| AlertRecord | 预警记录（幂等 dedupKey） |
| BusinessRule | 业务规则（DB 化规则引擎） |
| WorkflowConfig | 流程状态机配置 |
| ReportDefinition | 自定义报表定义 |
| CustomField | 自定义字段定义 |
| IntegrationConfig | 对接适配器配置（密钥在此表） |
| ApiKey | API Key（脚本认证） |
| PrintTemplate | 打印模板（区块化配置） |
| FreightRate | 本地运价小库 |

## 软删除与并发

核心 10 表启用 `paranoid` 软删除（`deletedAt` 非空即删除，列表自动过滤）+ `version` 乐观锁。

## 迁移

- 开发初始化：`npm run seed`（会**清库重建**，仅首次/重置用）
- 生产升级：`npm run db:migrate`（增量迁移，`backend/migrations/` 共 11 个文件）

```bash
cd backend
npm run db:migrate       # 应用全部迁移
npm run db:migrate:undo  # 回退最近一个
```
