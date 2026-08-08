---
title: 权限与数据隔离
prev: /dev/plugins
next: /dev/migration
---

# 权限与数据隔离

> 新加接口/模块时，**必须**正确接入权限与数据隔离，否则会绕过系统的安全模型。本页讲清如何做。

## 1. RBAC 权限

系统用 `Role / Permission / UserRole / RolePermission` 四表实现 RBAC。

### 后端：guard

```js
// middleware/auth.js
const guard = (module, action) => [authRequired, requirePermission(module, action)];
```

用法（`routes/index.js`）：

```js
router.get('/orders', guard('order', 'read'), order.list);
```

- 权限编码格式：`${module}:${action}`，同时登记 `${module}:*`
- 常用 action：`read / create / update / delete`，以及各业务的语义动作

### 前端：meta.permission

```js
// router/index.js
{ path: '/orders', component: OrderList, meta: { permission: 'order:read' } }
```

全局守卫 `router.beforeEach` 会在无权限时跳 `/403`；`MainLayout.vue` 的 `menuGroupsFiltered` 会按 `hasPermission` 自动显隐菜单。

### auth store 的 hasPermission

```js
// stores/auth.js
hasPermission(need) {
  if (!need) return true;
  const perms = this.permissions;
  if (perms.includes('*')) return true;                 // 超级权限
  const [module, action] = need.split(':');
  return perms.includes(need) || (action && perms.includes(`${module}:*`));
}
```

> 支持精确 `module:action` 或模块通配 `module:*`。

## 2. 数据隔离（Data Scope）

模型带 `groupId / ownerId` 即可按用户的数据范围过滤。

### 后端中间件

```js
// middleware/dataScope.js
async function scopedWhere(req, baseWhere = {}, opts = {})
// opts: { groupCol='groupId', ownerCol='ownerId' }
```

行为：

| scope | 过滤逻辑 |
|-------|----------|
| `all` | 不过滤（返回 baseWhere） |
| `group` | `groupId ∈ groupIds OR groupId IS NULL` |
| `self` | `ownerId = userId` |

配套：
- `resolveDataScope(userId)` → `{ scope, groupIds }`
- `dataScope(req, res, next)`：中间件，注入 `req.dataScope`（含 API Key 收窄）
- `scopedFindOne(req, model, where, include)`：详情/更新/删除用
- `attachOwnership(req, body)`：create 自动补 `groupId/ownerId`

业务路由统一挂载：`routes/index.js` 里 `router.use(authRequired, dataScope);` 在领域路由前注入。

### 用 crudController 自动获得隔离

```js
crudController({
  model: Xxx,
  name: 'xxx',
  scoped: true,          // 开启数据隔离
});
```

开启后：list 走 `scopedWhere`，写操作 `attachOwnership` 自动补 `groupId/ownerId`。

## 3. 二开者的红线

- **别绕过 scopedWhere**：新接口直接 `Model.findAll({ where: req.query })` 会绕过数据隔离
- **新接口必须用 guard**：哪怕只是个内部工具接口，也要挂 `guard(module, action)`
- **API Key 收窄**：`dataScope` 中间件已处理 API Key 的权限收窄（`getEffectivePermissions`）

## 4. 权限缓存

`permissionService` 有内存缓存（`permCache` / `rolePermCache`）。改权限后调用 `permissionService.invalidate(userId)` 失效缓存。

## 下一步

[数据库迁移](/dev/migration) —— 生产环境改表的正确姿势。