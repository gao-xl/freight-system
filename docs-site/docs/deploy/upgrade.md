# 升级迁移

## 两条路径（重要）

| 场景 | 命令 | 说明 |
|------|------|------|
| 首次初始化 / 演示重置 | `npm run seed` | **会清库重建**（force sync），生产禁用 |
| 生产升级 | `npm run db:migrate` | 增量迁移，保留数据 |

## 升级步骤

```bash
cd backend
git pull                       # 拉取新代码
npm install                    # 新依赖
npm run db:migrate             # 应用新迁移（backend/migrations/）
npm run dev                    # 或 docker compose 重建
```

## 迁移文件

`backend/migrations/` 按时间戳命名，当前 11 个：

```
20260807000000-initial              基础表
20260807000001-data-scope-columns   groupId/ownerId
20260807000002-api-keys             API Key
20260807000003-finance-local-amount 汇率本币字段
20260807000004-custom-fields-columns customFields 列
20260807000005-freight-rates        本地运价
20260808000006-business-rules       规则引擎
20260808000007-settle-month         账期月份
20260808000008-workflow-configs     流程配置
20260808000009-report-definitions   报表定义
20260808000010-soft-delete-version  软删除+乐观锁
```

## 升级注意

- 迁移只追加，不修改已执行文件（改历史迁移 = 生产环境灾难）
- 新功能如失败，先看 `npm run db:migrate` 输出；回退用 `npm run db:migrate:undo`
- 大版本升级前先备份（见《备份恢复》）
