---
title: 前端规范
prev: /dev/coding-backend
next: /dev/custom-fields
---

# 前端规范

> 基于真实前端结构（`frontend/src/`）定义的 Vue3 规范。所有前端二开必须遵守。

## 1. 目录结构

```
frontend/src/
├── views/           页面组件（按业务分组）
├── router/index.js  路由（meta.permission 控制权限）
├── stores/          Pinia 状态（auth / quotation）
├── api/             请求封装（request.js + index.js）
├── layouts/         布局（MainLayout.vue 菜单按权限过滤）
├── composables/     组合式函数
├── components/      通用组件
└── utils/           工具（dicts.js 字典）
```

## 2. 页面规范

页面组件放在 `views/<module>/`，一个页面一个文件：

```
views/orders/OrderList.vue
views/orders/OrderDetail.vue
views/system/CustomFieldManage.vue
```

- 页面组件只负责渲染与交互，数据请求走 `api/` 封装
- 复用通用 CRUD 列表结构，避免每个页面重复造列表
- 单文件保持可读，逻辑复杂的抽到 `composables/`

## 3. 路由与权限

`router/index.js` 每个路由配 `meta`：

```js
{
  path: '/orders',
  component: OrderList,
  meta: { title: '订单管理', icon: 'Order', permission: 'order:read' },
}
```

- `permission` 缺省则不设权限（如登录页）
- 详情页 `hidden: true`（不进菜单）
- 全局守卫 `router.beforeEach` 自动处理：未登录 → `/login`；无权限 → `/403`

## 4. 权限控制

用 auth store 的 `hasPermission(need)` 控制显隐：

```js
// stores/auth.js
hasPermission(need) {
  if (!need) return true;
  if (this.permissions.includes('*')) return true;
  const [module, action] = need.split(':');
  return this.permissions.includes(need) || (action && this.permissions.includes(`${module}:*`));
}
```

- 菜单由 `MainLayout.vue` 的 `menuGroupsFiltered` 按 `hasPermission` 自动过滤
- 页面内对按钮/操作做权限控制时，同样用 `hasPermission`

## 5. 数据请求

统一走 `api/request.js` 封装的请求实例（自动带 token、统一错误处理）：

```js
import api from '../api';
// 调用后端接口
const { data } = await api.get('/orders', { params });
```

## 6. 状态管理

- 全局且有跨页共享的状态用 Pinia（如 `auth` 用户信息、`quotation` 报价状态）
- 页面局部状态用组件内 `ref` / `reactive`，不塞进 store

## 7. 命名规范

| 项 | 规范 | 示例 |
|----|------|------|
| 页面组件 | 大驼峰 + 后缀 | `OrderList.vue` |
| 目录 | 小写复数 | `views/orders/` |
| 路由路径 | `/模块/资源` | `/orders/:id` |
| 权限 meta | 模块:动作 | `order:update` |

## 8. 与后端扩展点的对应

- 新增业务模块前端：在 `views/` 加页面 → `router/index.js` 注册并配 `meta.permission` → 菜单自动显隐
- 自定义字段：前端按 `GET /api/custom-fields?bizType=` 动态渲染表单与列表列，无需改页面结构

## 下一步

进入 [扩展点体系](/dev/custom-fields)，从「配置化扩展（零代码）」开始。