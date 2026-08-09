# 货运系统部署路线图（现状 → 可部署可用）

> 本清单覆盖从「当前未提交工作」到「最终可部署可上线」的全部步骤，含代码编辑、审查、测试、CI/CD、生产就绪、部署演练与复盘。
> 每个阶段标注：目标、任务、使用的插件/工具、验证方式、门禁（Gate）。
> 约定：**阶段门禁未通过，不得进入下一阶段。**

当前基线（2026-08-09）：
- 工作区存在一批未提交改动：可观测性中间件、密码强度策略、数据保留清理、任务失败告警、2 个新迁移（more-tables / query-indexes）、备份/恢复增强、3 个新测试。
- CI 已配置（backend lint+test / frontend build / docs build / 多架构镜像推送 GHCR）。
- 待办 P3（仓库清理 + .gitignore 补全）大部分已完成，需落地删除。

---

## 阶段 0 · 收尾与提交当前工作（冻结基线）

**目标**：把当前未提交工作整理成可审查、可回滚的干净提交，作为后续所有步骤的基线。

| # | 任务 | 插件/工具 | 验证 |
|---|------|----------|------|
| 0.1 | 仓库清理（P3）：删除 `backend/data/*.txt` 调试文件、`.fix.tgz`、`pa.tgz`、`backend/d1-poc.*`、`backend/fix-deps.js`、`backend/.fix-extract/`、`.fix-x/`、`.pa-x/` | 手动 + `git status` | 确认无残留、确认 `.gitignore` 已覆盖（缺则补） |
| 0.2 | 复核 `.gitignore`：统一 `**/data/*.txt`、`*.tgz`、`*.tar.gz`、`dist-e*`、`backend/public/docs` 规则，杜绝误提交 | 手动 | `git status --short` 仅剩预期改动 |
| 0.3 | 全量回归验证改动：后端 lint、后端测试（需本地 PostgreSQL）、前端 build、docs build、后端启动装配 | dev-verify | 全部通过 |
| 0.4 | 对工作区 diff 执行代码审查 | brooks-review + coderabbit | 无 P0/P1 遗留 |
| 0.5 | 按逻辑分组提交（迁移 / 可观测性 / 安全 / 运维 / 测试） | dev-code-review → dev-commit-writer | 每个提交 message 规范、可回滚 |

**门禁 0**：全部改动已提交、CI 绿、审查无 P0/P1。

---

## 阶段 1 · 代码健康与质量关

**目标**：全仓库健康度体检，清偿技术债，建立可持续的质量基线。

| # | 任务 | 插件/工具 | 验证 |
|---|------|----------|------|
| 1.1 | 全仓库健康面板（四维评分：PR 质量/架构/技术债/测试质量） | brooks-lint (brooks-health) | 输出健康分与问题清单 |
| 1.2 | 架构审计：模块依赖、分层完整性、循环依赖检测 | brooks-lint (brooks-audit) | 架构图与违规清单 |
| 1.3 | 技术债评估与优先级排序，产出重构清单 | brooks-lint (brooks-debt) | 按可执行顺序的重构 backlog |
| 1.4 | 测试套件质量审查（mock 滥用、脆弱断言、覆盖幻觉） | brooks-lint (brooks-test) | 测试问题清单 |
| 1.5 | 修复体检发现的 P0/P1 项（代码编辑） | 直接编辑 + dev-fix | 复测通过、无回归 |
| 1.6 | 对修复提交再次审查 | coderabbit + brooks-review | 无 P0/P1 |

**门禁 1**：健康评分达标、P0/P1 清零、架构违规修复。

---

## 阶段 2 · 测试补全（tailtest）

**目标**：关键服务/控制器覆盖到位，测试可稳定在 CI 与本地 PostgreSQL 下运行。

| # | 任务 | 插件/工具 | 验证 |
|---|------|----------|------|
| 2.1 | 对未覆盖的 src 文件批量生成测试 | tailtest | 每个文件生成可运行测试 |
| 2.2 | 优先补齐高风险模块：workflowService、reportService、alertService、orderService、notificationService、financeStatement | tailtest + 手动 | 用例通过 |
| 2.3 | 全量测试套件在 PostgreSQL 下跑通（`npm test`） | dev-tdd / dev-verify | 全绿 |
| 2.4 | 覆盖率报告门禁（关键模块 ≥ 阈值） | coderabbit 补审 + 覆盖率工具 | 报告达标 |

**门禁 2**：`npm test` 全绿、关键模块覆盖达标、CI 无 flaky。

---

## 阶段 3 · CI/CD 完善（CircleCI）

**目标**：流水线可复现、迁移有校验、安全有扫描，多平台镜像可交付。

| # | 任务 | 插件/工具 | 验证 |
|---|------|----------|------|
| 3.1 | 评估并对齐 CI：新增迁移校验 job（对全新 DB 依次跑迁移，验证 schema 一致性）、安全扫描 job | circleci | 流水线全绿 |
| 3.2 | 若采用 CircleCI：新增 `.circleci/config.yml`，复刻 GH Actions 的 backend/frontend/docs/docker 任务 | circleci-cli (validate) | `circleci config validate` 通过 |
| 3.3 | 打通多架构镜像构建与推送（amd64+arm64 → GHCR） | circleci / docker buildx bake | 镜像可拉取、架构正确 |
| 3.4 | 端到端跑通流水线（含迁移校验、安全扫描） | circleci | 一次 PR 全链路绿 |

**门禁 3**：流水线全绿、迁移校验通过、安全扫描无高危、多架构镜像可达。

---

## 阶段 4 · 生产就绪审查（staff-engineer-mode）

**目标**：上线前 go/no-go 审查，覆盖安全、可靠性、可观测性、运维。

| # | 任务 | 插件/工具 | 验证 |
|---|------|----------|------|
| 4.1 | 加载生产就绪评审专家，产出 release-readiness 评审工件 | staff-engineer-mode (production-readiness-review) | 结构化评审清单 |
| 4.2 | 安全审查：JWT_SECRET 必填校验、密钥/环境变量、helmet、限流、上传安全、审计完整 | staff-engineer-mode (secure-sdlc / input-validation) | 无高危 |
| 4.3 | 备份/恢复演练：`pg_dump` 备份 → 清库 → `pg_restore` 恢复 → 数据校验 | staff-engineer-mode (backup-and-recovery) | 恢复后数据完整 |
| 4.4 | 可靠性核验：优雅停机、健康检查、资源上限、数据保留、任务失败告警 | staff-engineer-mode (container-runtime / scheduled-job) | 各机制实测生效 |
| 4.5 | 可观测性核验：请求 ID 贯穿日志、RED 指标、慢查询日志 | staff-engineer-mode (observability-and-alerting) | 日志/指标可查 |

**门禁 4**：评审无 go-blocker，安全/备份/可靠性/可观测全项通过。

---

## 阶段 5 · 部署演练（上线预演）

**目标**：在干净环境完整走一遍首次部署 + 日常运维 + 升级路径。

| # | 任务 | 插件/工具 | 验证 |
|---|------|----------|------|
| 5.1 | 全新环境 `docker compose up -d --build`，验证 onboarding /setup-admin 流程 | 手动 + docker | 三服务健康、可登录 |
| 5.2 | 首次初始化（`npm run seed` 或迁移 + 引导）验证 | 手动 | 建表/演示数据正确 |
| 5.3 | 备份 → 恢复演练（含定时任务、上传文件、审计日志） | staff-engineer-mode (backup) + 手动 | 完整恢复 |
| 5.4 | 升级演练：按 `docs-site/docs/deploy/upgrade.md` 从旧版本升级 | 手动 | 无数据丢失 |
| 5.5 | 对部署形态的系统跑冒烟测试 | dev-verify | 全绿 |

**门禁 5**：全新部署成功、升级成功、备份恢复成功、冒烟通过。

---

## 阶段 6 · 复盘与文档（收尾）

**目标**：沉淀经验、补齐交付文档、做项目复盘。

| # | 任务 | 插件/工具 | 验证 |
|---|------|----------|------|
| 6.1 | 产出发布说明 / 版本说明 / 上线检查单 | product-lifecycle-workbench (product-doc-writing) | 文档齐全 |
| 6.2 | 更新技术文档（部署、运维、升级、二开）至与实际一致 | product-lifecycle-workbench / doc 维护 | 文档与实现同步 |
| 6.3 | 项目复盘：目标达成、风险登记、遗留项、经验教训 | 复盘文档 | 形成可执行遗留清单 |
| 6.4 | 沉淀到项目记忆（约束/约定/经验） | 手动 | 供后续会话复用 |

**门禁 6**：文档可交付、复盘完成、遗留项已登记并排期。

---

## 关键验收标准（最终上线判据）

- [ ] 流水线全绿，迁移在全新库可复现
- [ ] 生产就绪评审无 go-blocker
- [ ] 备份可完整恢复（含数据 + 单证 + 审计）
- [ ] 平滑升级无数据丢失
- [ ] 三服务（pg / backend / frontend）健康、资源有上限
- [ ] 安全项（JWT_SECRET 必填、helmet、限流、审计）全部生效
- [ ] 文档与实现一致，复盘完成