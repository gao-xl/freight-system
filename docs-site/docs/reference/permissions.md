# 权限体系

RBAC 四表：`Role` / `Permission` / `UserRole` / `RolePermission`。

## 预置角色

| 角色 | 范围 | 说明 |
|------|------|------|
| admin | all | 全部权限 + 系统管理 |
| manager | all | 全部业务 + 审批 |
| operator | self/group | 业务操作员 |
| finance | self/group | 财务单据 |
| viewer | all | 只读 |
| customer | - | 客户自助门户 |

## 权限点

格式：`模块:动作`（如 `order:read`、`finance:update`）。

模块清单：`order / booking / customs / document / track / finance / quotation / customer / supplier / alert / dashboard / system / integration / print / qingdao / yard / api / audit`

## 数据范围（dataScope）

| scope | 可见行 |
|-------|--------|
| all | 全部 |
| group | 本组（groupId） |
| self | 本人负责（ownerId） |

中间件在 `/api` 下全局挂载，控制器用 `scopedWhere`（列表）与 `scopedFindOne`（单条）消费。

## 二开新增接口的权限要求

```js
// 1. 路由声明（routes 或插件 routes）
router.get('/my-thing', guard('order', 'read'), handler);
// 2. 控制器内用 scopedWhere 防绕过
const finalWhere = await scopedWhere(req, where);
// 3. 新权限点在 seed.js 的 permissionRecords 登记
```
