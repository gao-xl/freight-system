---
title: 快速上手
prev: /dev/philosophy
next: /dev/git-workflow
---

# 快速上手

> 目标：把开发环境跑起来，摸清目录结构，然后完成你的**第一个二次开发实验**。

## 1. 准备开发环境

```bash
# 后端（监听 :3000）
cd backend
cp .env.example .env        # 首次
npm install
node src/seed.js            # 初始化数据库 + 种子数据（admin / 123456）
node src/server.js          # 启动后端

# 前端（监听 :5173）
cd ../frontend
npm install
npm run dev                 # 启动前端
```

浏览器打开 `http://localhost:5173`，用 `admin / 123456` 登录。

> ⚠️ `seed.js` 会 **force sync 清空重建**数据库，仅用于初始化/重置。已有数据的迁移请用 [数据库迁移](/dev/migration) 的迁移脚本。

## 2. 目录结构速览

```
freight-system/
├── backend/                     # Node.js 后端
│   ├── src/
│   │   ├── config/              # 配置（数据库、JWT、外部 URL）
│   │   ├── db/                  # 数据库连接
│   │   ├── models/              # Sequelize 模型（40+）
│   │   ├── controllers/         # 控制器（baseController 是通用 CRUD 工厂）
│   │   ├── routes/index.js      # 路由总表（唯一权威来源）
│   │   ├── services/            # 业务服务（预警/自动化/事件/规则/报表…）
│   │   ├── core/                # 核心（moduleRegistry 插件注册表）
│   │   ├── integrations/        # 外部对接（adapters/ 放适配器）
│   │   ├── middleware/          # 中间件（auth/audit/dataScope/validate）
│   │   ├── modules/             # 插件目录！放新插件到这里
│   │   └── server.js            # 启动入口
│   ├── migrations/              # 生产迁移脚本
│   └── scripts/                 # 备份/恢复等运维脚本
├── frontend/                    # Vue3 前端
│   └── src/
│       ├── views/               # 页面
│       ├── router/index.js      # 路由（meta.permission 控制权限）
│       ├── stores/              # Pinia（auth 含 hasPermission）
│       └── layouts/MainLayout.vue  # 菜单（按权限过滤）
└── docker-compose.yml           # 一键部署
```

**二开人员最常碰的目录只有三处**：`backend/src/models/`、`backend/src/controllers/`、`backend/src/modules/`。

## 3. 你的第一个二开实验

用「事件订阅」做一次最小改动，验证整条链路通不通：

1. 在后端 `src/server.js` 启动阶段（或写进一个插件）加一段监听：

```js
const events = require('./services/eventBus');

// 在 server.js 里注册一次（进程生命周期只注册一次）
events.onAsync('order.created', async (env) => {
  console.log('收到新订单 payment test →', env.payload?.data?.orderNo);
});
```

2. 重启后端，在前端新建一个订单
3. 观察后端日志，出现 `收到新订单 ...` 即链路打通

> 更规范的做法是写成一个插件，见 [插件协议](/dev/plugins)。上面只是验证「事件 → 你的代码」这条二开主链路。

## 4. 常用验证命令

| 动作 | 命令 |
|------|------|
| 手动触发预警扫描 | `POST /api/alerts/run` |
| 手动触发自动化 | `POST /api/automation/run` |
| 健康检查 | `GET /api/health` |
| 查看后端日志 | `npm run dev` 终端输出（含 `[MODULE]` `[EVENT]` 标记） |

## 下一步

读完 [二开哲学](/dev/philosophy)，理解「配置 > 代码、扩展点不动核心、新增不覆盖」三条铁律，再决定你的需求走哪条路径。