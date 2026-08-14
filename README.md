# 货运代理管理系统

面向中小货代、公司内部部署使用的业务管理系统，覆盖货代核心业务：客户、报价、订单、订舱、报关、单证、运输跟踪、财务、发票。前后端分离，数据存于 PostgreSQL，支持按角色和小组做权限与数据隔离。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 功能一览

- 客户与供应商：档案、360° 视图（订单/财务/信用）、多联系人、跟进记录、Excel 批量导入
- 订单与业务链路：进出口订单、一单多箱、流程节点、订舱、报关、单证、跟踪、放单
- 财务与发票：应收应付、批量核销、开票、对账、账期结账、AR 账龄
- 报价与运价：报价单（发送/确认/转订单）、运价库检索与比价
- 预警与自动化：可配置规则引擎、自动推进节点、自动生成应收
- 系统管理：RBAC 角色权限、小组数据隔离、自定义字段、审计日志、备份恢复、系统健康
- 客户门户：客户自助查单、账单与提单 PDF 下载、在线补料（SI）

## 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | Vue 3 · Vite · Element Plus · Pinia · Vue Router · Axios · ECharts |
| 后端 | Node.js（≥22）· Express · Sequelize ORM · JWT · Helmet · 限流 |
| 数据库 | PostgreSQL 16+（仅支持 PostgreSQL） |
| 鉴权 | JWT + bcrypt + RBAC（角色 / 权限 / 用户-角色 / 角色-权限） |

## 快速开始

本地开发需要 Node.js ≥ 22 与 PostgreSQL 16+。

```bash
# 后端
cd backend
npm install
cp ../.env.example ../.env
npm run seed          # 首次初始化：建表 + 演示数据
npm run dev           # http://localhost:3000

# 前端（另开终端）
cd frontend
npm install
npm run dev           # http://localhost:5173（已将 /api 代理到 3000）
```

默认账号（首次登录会要求改密）：

| 账号 | 角色 |
| --- | --- |
| admin | 系统管理员 |
| manager | 经理 |
| operator | 操作员 |
| finance | 财务 |

### 数据库初始化

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 全新部署 / 开发重置 | `npm run seed` | 重建表结构并写入演示数据，会清空现有数据 |
| 版本升级（保留数据） | `npm run db:migrate` | 增量迁移，生产环境请用这个 |

`.env` 中配置 `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD`。

### 首次使用

首次登录后，系统会在数据为空时引导初始化：公司信息、币种、示例数据、安全设置、使用偏好等步骤；也可跳过。核心页面数据为空时会给出就近的操作提示。示例数据可在"系统管理 → 示例数据"一键生成或清空（有真实数据时拒绝生成以保护数据）。

## 项目结构

```
backend/
├── src/
│   ├── server.js            # 入口：中间件、路由挂载、模块加载、优雅停机
│   ├── routes/              # 业务路由
│   ├── controllers/         # 控制器（baseController 为统一 CRUD 工厂）
│   ├── middleware/          # auth / dataScope / validate / audit / observability
│   ├── models/              # Sequelize 模型
│   ├── services/            # 业务服务（dataAccess / workflow / automation / alert …）
│   ├── integrations/        # 外部对接适配器
│   ├── modules/             # 插件模块（notification、qingdao-port 等）
│   └── migrations/          # 数据库迁移
frontend/
└── src/
    ├── views/               # 页面
    ├── api/                 # 接口封装
    ├── router/              # 路由
    └── layouts/             # 布局与菜单
```

## 文档与接口参考

- 接口速查：[`docs/API接口速查.md`](docs/API接口速查.md) — 接口约定与认证、通用 CRUD 形态、各模块端点速查、调用示例
- 接口在线文档：启动后端后访问 `/api-docs`（Swagger，含调用示例）
- 文档导航：[`docs/文档总览索引.md`](docs/文档总览索引.md)
- 总体设计：[`docs/项目设计方案.md`](docs/项目设计方案.md)
- 二次开发：[`docs/二开指南.md`](docs/二开指南.md)
- 安全设计：[`docs/安全设计.md`](docs/安全设计.md)
- 贡献指南：[`CONTRIBUTING.md`](CONTRIBUTING.md)

## 部署与运维

- 前端：`cd frontend && npm run build`，产物在 `frontend/dist/`，交给 Nginx 托管并代理 `/api`
- 后端：`node src/server.js`，可用 pm2 守护。生产环境必须设置 `NODE_ENV=production` 和 `JWT_SECRET`
- Docker：`docker compose up -d`，内置 PostgreSQL 服务，容器已配置资源限制与健康检查
- 部署前检查：`cd backend && node scripts/check-env.js`
- 备份 / 恢复：`cd backend && npm run backup`（归档到 `backend/backups/`，保留最近 7 份），恢复用 `npm run restore`
- 正式上线安全加固：`cd backend && npm run security:harden -- --apply --force-admin-password`（清理预置测试账号、强制 admin 首登改密、强制现存会话重新登录；默认 dry-run 预览，确认后加 `--apply`）
- 监控：`/api/metrics`（Prometheus）、`/api/health`（数据库连通性）

## 安全

- JWT 密钥在生产环境必须通过环境变量提供，缺失则拒绝启动
- Helmet 安全头、CORS 白名单、全局与登录限流
- 上传文件扩展名白名单、路径穿越校验、字段保护
- bcrypt 密码加密、操作审计日志、RBAC 权限点、数据范围隔离
- 预置账号（演示/初始化）统一 `mustChangePassword=true`，首次登录强制改密

完整安全设计见 [`docs/安全设计.md`](docs/安全设计.md)。

## 环境变量

完整列表见 [`.env.example`](.env.example)，关键项：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `NODE_ENV` | 运行环境（生产必设） | development |
| `PORT` | 后端端口 | 3000 |
| `JWT_SECRET` | JWT 密钥（生产必填） | 开发时随机生成 |
| `DB_*` | PostgreSQL 连接信息 | 本地 freight |
| `DB_POOL_MAX` | 连接池大小 | 30 |
| `CORS_ORIGIN` | 跨域白名单（逗号分隔） | localhost:5173 |
| `BACKUP_KEEP` / `BACKUP_DIR` | 备份保留份数 / 目录 | 7 / ./backups |

## License

[MIT](LICENSE) © freight-system contributors