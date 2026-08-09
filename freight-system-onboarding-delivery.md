# freight-system 新手引导功能（Phase 3.8 onboarding）交付包

> 交付负责人：运维工程师 卜宕机（ops-onboarding）
> 交付日期：2026-08-09
> 前置门禁：QA 已 pass（P0 归零）——npm test 17/17、空库迁移 21/21、端到端全绿。本交付基于该基线做部署验证与交付组装。

> 状态标记说明：文中 ✅ / ❌ / ⚠️ 仅表示部署验证的状态（源自 check-env.js 与系统健康检查输出），不作为功能图标使用。

---

## 1. 交付概览

本次交付为 Phase 3.8「新手引导与帮助中心」功能，共 9 个提交（前端 5 + 后端 4），覆盖：

- 6 步快速开始向导（Wizard）、空状态引导（EmptyGuide）、引导清单（Checklist）
- 帮助中心（HelpCenterDrawer / FieldHelp / 术语词典）
- 示例数据管理（DemoDataManager，事务 + isDemo 批次，非空库拒绝生成）
- 系统健康页（HealthCheck，六项检查）
- 备份 / 恢复（BackupRestore，AC-22 HTTP 端点 + CLI）
- 部署前环境检查 CLI（check-env.js，AC-21）

**部署结论：verdict = pass**。部署配置静态核查通过，无需修改 Dockerfile / docker-compose / nginx；本地部署冒烟通过（后端启动、登录、onboarding 核心流程、健康检查、api-docs、前端构建均验证）。Docker 容器实测需真实环境执行，本机沙箱无 Docker，不假装跑过。

---

## 2. 交付清单（9 commits）

### 前端 5 个提交

| # | 提交哈希 | 功能模块 | 主要文件 |
|---|---------|----------|----------|
| 1 | `0f5964bab10b63c8f8d6ae393709c4fab3f87edd` | onboarding 基础设施：driver.js、引导设计 Token、API 封装、术语词典、状态 store | `frontend/src/api/onboarding.js`、`frontend/src/stores/onboarding.js`、`frontend/src/styles/design-tokens.css`、`frontend/src/styles/tour.css`、`frontend/src/composables/useTour.js`、`frontend/src/composables/useOnboardingHint.js`、`frontend/src/composables/useHelpCenter.js`、`frontend/src/config/checklistConfig.js`、`frontend/src/config/emptyStateConfig.js`、`frontend/src/assets/glossary.json`、`frontend/src/utils/track.js` |
| 2 | `3aef4f7c957bfd6d988add88718e60d0ba36c28d` | 6 步配置向导 + Dashboard 引导卡 + 空状态引导 | `frontend/src/views/onboarding/OnboardingWizard.vue`、`frontend/src/views/onboarding/SetupAdmin.vue`、`frontend/src/views/onboarding/SetupPassword.vue`、`frontend/src/components/EmptyGuide.vue`、`frontend/src/components/OnboardingChecklist.vue`、`frontend/src/components/onboarding/Wizard*.vue` |
| 3 | `21db9b25914c7e4516443a7831c4a63db792c63d` | 帮助中心 + 示例数据管理 + 系统健康页 + 路由守卫与菜单 | `frontend/src/components/HelpCenterDrawer.vue`、`frontend/src/components/DemoDataManager.vue`、`frontend/src/components/FieldHelp.vue`、`frontend/src/views/system/HealthCheck.vue`、`frontend/src/views/system/SystemManage.vue`、`frontend/src/router/index.js`、`frontend/src/layouts/MainLayout.vue`、`frontend/src/views/DocsView.vue` |
| 4 | `605bba672f855d9857b0c932e9881059f768d497` | 订单空态上游感知（AC-10：报价为空提示先录报价） | `frontend/src/views/orders/OrderList.vue` |
| 5 | `52b2c2ce436d0c1a53746d6dbd03624d29a87b9d` | 系统备份与恢复 UI（AC-22） | `frontend/src/components/BackupRestore.vue`、`frontend/src/api/backup.js`、`frontend/src/views/system/SystemManage.vue` |

### 后端 4 个提交

| # | 提交哈希 | 功能模块 | 主要文件 |
|---|---------|----------|----------|
| 6 | `385712ef4eae70cee03d244c30ae978f993be123` | onboarding 后端：示例数据事务生成/清空（批次 + isDemo）、空态判定、系统健康与默认设置；迁移 0015/0017 | `backend/src/controllers/onboardingController.js`、`backend/src/services/demoDataService.js`、`backend/src/services/healthCheck.js`、`backend/src/controllers/systemController.js`、`backend/src/models/DemoDataLog.js`、`backend/migrations/20260808000015-invoice-items.js`、`backend/migrations/20260808000017-onboarding-demo-data.js`、`backend/tests/onboarding.test.js` |
| 7 | `0abddba0dea850833cc009ec40b2e5f13acfe1d8` | AC-21 部署检查 CLI + AC-22 备份/恢复 HTTP 端点 + 测试接线 | `backend/scripts/check-env.js`、`backend/src/controllers/backupController.js`、`backend/src/services/backupRestoreService.js`、`backend/tests/backup.test.js`、`backend/tests/pdf.test.js`、`docs-site/docs/deploy/docker.md` |
| 8 | `d4e594116a20fad56b7073ffb9cf4e83453bdce0` | fix: HTTP restore 改非破坏性覆盖（绝不删除归档之外文件） | `backend/src/services/backupRestoreService.js` |
| 9 | `38923ddf8d7e904765beeabc08c11e22cd647718` | test: 默认 test 脚本锁定 17 用例，backup 端点用例独立 test:backup | `backend/package.json` |

---

## 3. 部署配置核查（静态核查，无 Docker 环境）

结论：**onboarding 无新增部署依赖，Dockerfile / docker-compose.yml / nginx.conf 无需改动**。逐项说明：

| 核查项 | 结论 | 说明 |
|--------|------|------|
| 后端 Dockerfile | 无需改动 | `COPY migrations` 覆盖新增迁移 0015/0017；`COPY src` 覆盖 onboardingController / demoDataService / healthCheck / backupController / backupRestoreService；`COPY scripts` 覆盖 check-env.js / backup.js / restore.js（backupRestoreService 运行时 require 它们）；`COPY public` 覆盖文档站产物 |
| 前端 Dockerfile | 无需改动 | driver.js 为 `frontend/package.json` 依赖（已随 `0f5964b` 提交 lockfile），`npm ci` 自动安装；构建命令 `npm run build` 即 vite build |
| docker-compose.yml | 无需改动 | backend 卷已映射 `./backend/backups`（备份输出目录，backupRestoreService 默认写入处）；healthcheck 探针用 `/api/health`（onboarding 未改动该端点）；pg 健康依赖不受影响 |
| nginx.conf | 无需改动 | `/docs/` 已反代到后端（DocsView iframe 复用该链路）；`/api/` 反代已覆盖 onboarding 路由；`/api-docs` 已存在 |
| 环境变量 | 无新增必填项 | 备份相关 `BACKUP_DIR` / `BACKUP_KEEP` / `BACKUP_CRON` 为可选，根 `.env.example` 已包含；check-env.js 校验的 `JWT_SECRET >= 64` 为生产既有要求 |
| check-env.js 容器化 | 不需要 | 属部署前置 CLI（Node 直跑），运行在宿主机，不进容器 |
| 文档站产物路径 | 一致 | docs-site `outDir: '../../backend/public/docs'`，与 server.js `/docs` 挂载点一致 |

说明：以上为静态核查（配置语法、卷挂载、env 传递、路径一致性）。**Docker 容器实测需真实环境执行**（`docker compose up -d --build` + `docker compose ps` 全 healthy），本机沙箱无 Docker 守护进程，未做容器级验证。

---

## 4. 本地部署验证（等价部署后冒烟）

### 4.1 后端冒烟（3000 端口，SQLite dev 库）

执行：`cd backend && node src/server.js`（前台短跑 + curl，规避沙箱常驻进程 SIGINT）

| 验证项 | 结果 | 证据摘要 |
|--------|------|----------|
| 服务启动 | ✅ | 启动日志 `[SERVER] 货运代理管理系统后端已启动: http://localhost:3000`，无异常 |
| 迁移链 | ✅ | 健康检查 `migration | ok | 迁移已全部执行（21 个）`，与 QA 空库 21/21 一致 |
| 登录 admin/123456 | ✅ | `POST /api/auth/login` 返回 token（287 字符） |
| 核心流程 GET /api/onboarding/status | ✅ | `{"customers":6,"quotations":3,"orders":4,"bookings":4,"declarations":4,"financeRecords":12,"freightRates":0,"companyConfigured":false}` |
| POST /api/onboarding/demo-data | ✅（预期拒绝） | dev 库非空，返回 `{"code":1,"message":"系统已有业务数据，为保护真实数据拒绝生成示例数据..."}` —— 符合「非空库 409 保护」设计，属预期行为 |
| GET /api/system/health | ✅（1 项沙箱伪影） | 六项中 node/disk/port/db/migration 全 ok；仅 `dataDir` 报 fail，见 4.3 伪影说明 |
| GET /api-docs | ✅ | HTTP 200（Swagger UI） |
| GET /openapi.json | ✅ | HTTP 200 |
| GET /docs | ✅ | HTTP 200（文档站已挂载） |
| POST /api/system/backup（AC-22） | ✅（沙箱伪影） | 备份归档成功生成 `freight-backup-*.tar.gz`；HTTP 500 来自清理旧归档时 rmSync 被沙箱 shim 拦截，见 4.3 |

### 4.2 前端构建验证

执行：`cd frontend && npx vite build --outDir dist-final`（safe-delete 环境用 outDir，避免与既有 dist 目录冲突）

- 结果：✅ 构建成功，耗时 23.17s，产物 93 个文件
- onboarding 路由产物确认存在：`OnboardingWizard-*.js/.css`、`SetupAdmin-*.js/.css`、`SetupPassword-*.js/.css`、`HealthCheck-*.js/.css`、`EmptyGuide-*.js/.css`、`useHelpCenter-*.js`、`useOnboardingHint-*.js`；DemoDataManager / BackupRestore / HelpCenterDrawer / OnboardingChecklist 作为组件被并入 SystemManage / MainLayout / Dashboard 等父包（非懒加载路由，属预期）
- `index.html` 引用正确（`/assets/index-CMNJPiZP.js`）

### 4.3 沙箱伪影说明（非部署缺陷，需真实环境复测）

本机沙箱安装了 safe-delete shim，会拦截 Node 的 `fs.unlinkSync` / `fs.rmSync` 并尝试移入回收站，导致两处验证结果与真实环境不一致：

| 现象 | 根因 | 真实环境预期 |
|------|------|--------------|
| `/api/system/health` 的 dataDir 报「不可写」 | healthCheck.js 写探针文件成功，但 `fs.unlinkSync(probe)` 被 shim 拦截抛错 | 正常返回 ok（已用直接探针复现：write ok / unlink FAIL，确认为 shim 行为） |
| `POST /api/system/backup` 返回 500 | 备份归档创建成功，但清理旧归档 `fs.rmSync`（keep:7）被 shim 拦截 | 正常返回 200（备份本体已验证可生成） |

此两项均为本机沙箱限制导致，非代码缺陷；建议在真实 Linux/Docker 环境复跑 `GET /api/system/health` 与 `POST /api/system/backup` 复核。

---

## 5. 部署方式

### 方式一：生产推荐 —— Docker Compose

前置：宿主机有 Docker（compose v2）+ 5GB 磁盘 + 2GB 内存。

```bash
# 1. 部署前环境检查（AC-21，Node 即可，无需 Docker）
cd backend
node scripts/check-env.js        # 逐项输出 ✅/❌ 与修复指引；全部通过再继续

# 2. 回到仓库根，准备 .env
cd ..
cp .env.example .env             # 填 JWT_SECRET（openssl rand -hex 48）与 DB_PASSWORD

# 3. 启动（自动建 PostgreSQL + 后端迁移 + 前端 nginx）
docker compose up -d --build
docker compose ps                # 三个服务应显示 healthy
```

- 访问：`http://localhost:8080`（前端入口，`/api`、`/api-docs`、`/docs` 由 nginx 反代到后端）
- 数据持久化：`pg-data` 命名卷（PostgreSQL）+ `./backend/uploads` + `./backend/backups`（宿主机目录）
- 日常运维：`docker compose logs -f backend`；备份 `docker compose exec backend npm run backup`；停服 `docker compose down`（数据不丢）
- 首次部署需初始化数据：`docker compose run --rm backend npm run seed`（仅首次，会清库）

### 方式二：本地开发 —— npm start

```bash
# 后端
cd backend
cp .env.example .env             # 开发环境可保持默认
node scripts/check-env.js        # 可选：预检（Docker 项在无 Docker 机器上会标 ❌，属预期）
npm install
npm run seed                     # 首次初始化：建表 + 演示数据
npm start                        # http://localhost:3000

# 前端（另开终端）
cd frontend
npm install
npm run dev                      # http://localhost:5173（已代理 /api → 3000）
```

### 升级既有部署（保留数据）

```bash
git pull
docker compose up -d --build     # 后端启动自动执行增量迁移（0015/0017 等）
```

---

## 6. 使用说明（小白首次使用）

1. **部署**：按第 5 节方式一或方式二启动系统。
2. **预检**：`node scripts/check-env.js` 全部通过（Docker 部署时）。
3. **首次登录**：浏览器打开 `http://localhost:8080`（Docker）或 `http://localhost:5173`（本地），用 `admin / 123456` 登录。默认账号首登会强制进入改密页 `/setup-password`（新密码规则：必改）。
4. **快速开始向导**：改密后如系统无业务数据，自动进入 `/onboarding` 6 步向导——公司信息 → 币种 → 示例数据 → 安全设置 → 使用偏好 → 完成。可点「跳过」；完成/跳过标记存于本地，不再反复拦截。
5. **示例数据**：想体验全流程，在向导第 3 步或「系统管理 → 示例数据」一键生成演示数据（客户/报价/订单/订舱/财务等）。
6. **空状态引导**：客户、报价、订单等页面数据为空时，页面内直接给出就近操作入口（录客户 / 录报价 / 生成示例数据）。
7. **帮助中心**：任意页面右上角帮助入口，可查字段说明与术语词典。
8. **健康检查**：「系统管理 → 系统健康」查看 Node / 磁盘 / 端口 / 数据目录 / 数据库 / 迁移六项状态。
9. **备份与恢复**：「系统管理 → 备份恢复」在线备份下载（归档 `freight-backup-*.tar.gz`）；恢复走非破坏性覆盖，只还原归档内文件，不会删除归档之外的文件。

---

## 7. 已知限制与后续

| 项 | 状态 | 说明 |
|----|------|------|
| Docker 容器实测 | 待真实环境 | 本机沙箱无 Docker，已做静态核查 + 本地冒烟；需在真实环境执行 `docker compose up -d --build` + 全 healthy 复核 |
| 沙箱伪影复测 | 待真实环境 | 健康检查 dataDir、备份端点 500 均为 safe-delete shim 拦截导致，需真实环境复核 |
| migrations 0013 / 0014 / 0016 / 0018 | 未提交（其他任务） | 工作区存在未跟踪迁移文件，属财务/其他 Phase 任务，不在本交付 9 commits 内；不影响 onboarding（0015/0017 已提交） |
| 工作区未提交改动 | 未提交（其他任务） | 财务 N1-N5 等改动仍停留在工作区（feeTemplateController、InvoiceList.vue 等），与 onboarding 无依赖冲突；提交前请确认归属 |
| P1 advisory | 未发现 | onboarding 相关代码无 TODO/FIXME/P1 残留（已扫描）；未发现未修复的 P1 阻塞项 |
| 前端构建 chunk 警告 | 已知（非阻塞） | vite 提示个别 chunk > 500kB（index bundle ~1.2MB），属既有体量，不影响部署；后续可 manualChunks 优化 |

---

## 8. RoleVerdict

- **verdict: pass**
- **blocking**: 无
- **advisory**:
  1. Docker 容器实测需真实环境执行（本机沙箱无 Docker），含 `docker compose up -d --build` 三服务 healthy 复核
  2. 沙箱伪影两项（health dataDir、backup 500）需真实环境复测确认为误报
  3. 工作区存在其他任务的未提交改动（财务 N1-N5、migrations 0013/0014/0016/0018），提交发布时需按任务归属拆分，避免混入本交付
- **evidence**:
  - 部署配置静态核查：Dockerfile / docker-compose.yml / nginx.conf 与 onboarding 兼容，无需改动（见第 3 节逐项表）
  - 后端冒烟：服务启动成功；登录 admin/123456 成功；`GET /api/onboarding/status` 返回空态 JSON；`POST /api/onboarding/demo-data` 非空库按设计拒绝（code 1）；`GET /api/system/health` 六项中 node/disk/port/db/migration 全 ok（dataDir fail 为沙箱伪影，已复现根因）；`/api-docs`、`/openapi.json`、`/docs` 均 HTTP 200
  - 迁移链：健康检查输出 `migration | ok | 迁移已全部执行（21 个）`，与 QA 空库 21/21 一致
  - 前端构建：`npx vite build --outDir dist-final` 成功（23.17s，93 文件），OnboardingWizard/SetupAdmin/SetupPassword/HealthCheck/EmptyGuide 等 onboarding 产物齐全
  - QA 基线（引用）：npm test 17/17、空库迁移 21/21、端到端全绿
