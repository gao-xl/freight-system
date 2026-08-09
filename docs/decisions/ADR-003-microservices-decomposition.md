# ADR-003: 微服务化拆包方案（Docker 单体 → 分布式）

## Status: 建议（Proposed）— 待评审后进入执行

## Context

当前 `docker-compose.yml` 是标准单体：`pg`（PostgreSQL 16）+ `backend`（Node/Express 单体，39 个 controller、47 个模型、12 个集成适配器）+ `frontend`（Nginx）。后端已具备模块化骨架（`ModuleRegistry` 协议、`eventBus` 事件总线），但——

- **分层未完成**：`automationService.js:5` 反向 import `orderController`；`orderController.js` 539 行内嵌状态机；controller 直连 model。
- **进程内事件总线**：`services/eventBus.js` 使用 `EventEmitter`，**无法跨进程/跨服务消费**。
- **Order 中心枢纽**：`models/index.js` 有 14 张表 `belongsTo Order`，且 `alertService`/`ruleEngineService`/`workflowService`/`printService` 直连各域模型。
- **单一共享库**：47 个模型全部挂在一个 PostgreSQL 上，无数据所有权边界。
- **ADR-002 已定**"逻辑模块化先行、物理拆分延后"，触发条件未满足。

用户明确选择**微服务化拆包**，驱动收益：独立扩缩容、故障隔离/高可用、独立部署/发布节奏。

## Decision Drivers

| Driver | Priority | Evidence | Tradeoff |
| --- | --- | --- | --- |
| 独立扩缩容 | 高 | 订单/跟踪为高频域，财务/报表为低频域，负载不均 | 拆出可独立横向扩容的边界，但增加分布式一致性成本 |
| 故障隔离/高可用 | 高 | 预警/自动化/集成的定时任务可能拖垮吞吐 | 单服务崩溃不影响整体，但需服务编排与容错 |
| 独立部署/发布节奏 | 中 | 各域由不同人/团队二开 | 独立发布，但引入版本漂移与契约版本管理 |
| 数据一致性 | 高（约束） | Order 为核心聚合，14 表关联 Finance/Customer 等 | 拆库面临跨服务事务，需 Saga/事件驱动 |
| 现有解耦进度 | 高（约束） | F0–F5 未完成，逻辑边界未统一 | 物理拆包不应早于逻辑边界稳定 |

## Reality Check（代码勘察结论）

| 事实 | 位置 | 对拆包的影响 |
| --- | --- | --- |
| 进程内 EventEmitter | `services/eventBus.js` | **阻塞项**：跨服务事件必须先引入消息队列 |
| Order 中心枢纽，14 表 belongsTo Order | `models/index.js` | 服务边界必须围绕 Order 聚合设计，否则拆出的是"逻辑碎片" |
| 横切服务直连 6–10 个模型 | `alertService.js:2` / `ruleEngineService.js:18` / `workflowService.js:7` / `printService.js` | 暴露出"跨域读"需求，微服务下必须改为服务门面或事件投影 |
| 分层倒置 | `automationService.js:5` | 拆包前必须消除，否则变成跨包依赖 |
| 单一共享 PostgreSQL | `docker-compose.yml` | 数据所有权未界定，拆库是最大风险点 |

## Options Considered

| Option | Benefits | Costs | Risks | Rejected Or Selected Because |
| --- | --- | --- | --- | --- |
| A. 模块化单体 + 可拆分准备（维持 ADR-002） | 成本最低，边界可逆 | 不满足"独立扩缩容/故障隔离" | 触发条件未满足 | 已评估，但用户明确要求分布式收益，故不作为最终形态 |
| B. 微服务化拆包（Big Bang 一次性重写） | 直达目标 | 一次性大迁移，回归面爆炸 | 高失败率，业务中断 | **拒绝**：47 模型跨域耦合未解，Big Bang 必失败 |
| **C. 绞杀者式（Strangler）增量拆包** | 渐进，每步可验证可回滚 | 中期双轨（单体+新服务）过渡 | 过渡期运维复杂 | **选定**：符合微服务增量成熟路径，收益逐步兑现 |
| D. 单体水平扩展（多实例+LB） | 轻量，快速应对并发 | 不解决独立部署/故障隔离 | 共享库单点 | 已评估，可作 C 的过渡期手段，非最终目标 |

## Decision

**采用绞杀者式（Strangler Pattern）增量拆包**，分三阶段推进：**先做逻辑边界与基础设施地基 → 再逐个提取高危高价值域为独立服务 → 最后按域拆分数据所有权**。绝不在逻辑边界未稳定时做 Big Bang 重写。

三个不可跳过的地基决策：

1. **引入消息队列（RabbitMQ 或 NATS）替换进程内 eventBus**：这是跨服务通信的唯一正路，现有的 `eventBus` API（`emit/on/onAsync`）保留为门面，底层替换为 broker 客户端，业务代码改动最小。
2. **引入 API 网关**：前端只连网关，网关负责路由/鉴权透传/限流，服务实例变更对前端透明。
3. **数据所有权优先于数据库拆分**：第一阶段共享 PostgreSQL 但**明确每张表的数据所有者服务**，跨域写一律走服务门面或事件；确认边界稳定后再逐步 Per-Service DB。

## Status

Proposed。需评审：阶段划分、服务边界、消息队列选型、数据所有权映射，确认后进入 F0 执行。

## Bounded Context Map（目标服务边界）

| Context | Responsibility | Model/Language | Owned Data（第一阶段数据所有者） | Upstream Dependencies | Downstream Consumers | Translation Surface |
| --- | --- | --- | --- | --- | --- | --- |
| gateway（网关/BFF） | 路由、鉴权透传、限流、文档 | HTTP | 无（透传） | 前端 | 各业务服务 | 统一 API 契约，前端不感知服务拆分 |
| identity（身份/RBAC） | 登录、JWT、角色权限、Session、API Key | User/Role/Permission/Session/ApiKey/Group/Department | User, Role, Permission, UserRole, RolePermission, Session, ApiKey, Group, UserGroup, Department | 无 | 所有服务（鉴权） | 签发/校验 token，供网关与各服务鉴权 |
| order（订单聚合） | 订单、订舱、报关、单证、箱、EDI、放单、跟踪写 | Order, Booking, CustomsDeclaration, Document, OrderContainer, OrderNode, EdiMessage, ReleaseRecord, ShipmentTrack, QingdaoNode | Order 及其子表 | customer（读客户主数据）、finance（读应收） | finance、tracking、report、alert | 对外暴露 orderService 门面；状态机纯函数 |
| master-data（主数据） | 客户、供应商、报价 | Customer, CustomerFollow, Supplier, Quotation, QuotationItem | Customer, CustomerFollow, Supplier, Quotation, QuotationItem | identity | order、finance、report | 客户/供应商名与联系方式的标准视图 |
| finance（财务） | 费用、发票、收款、账期、核销、费率模板 | FinanceRecord, Invoice, PaymentRecord, PaymentTransaction, AccountingPeriod, FeeTemplate, ExchangeRate, InvoiceTitle, CompanyAccount | FinanceRecord, Invoice, PaymentRecord, PaymentTransaction, AccountingPeriod, FeeTemplate, ExchangeRate, InvoiceTitle, CompanyAccount | order、master-data | report、dashboard | 唯一写 Finance 系的门面；账期/锁账校验 |
| integration（集成） | 港口、场站、汇率、EDI传输、跟踪自动抓取、USD支付 | IntegrationConfig | IntegrationConfig | order（读订单发货信息） | order、tracking | 统一适配器签名（已有 12 个） |
| observability（预警/通知/自动化） | 预警、规则引擎、通知推送、自动化任务、报表定义 | AlertRecord, BusinessRule, WorkflowConfig, ReportDefinition, NotificationRecord, AuditLog | AlertRecord, BusinessRule, WorkflowConfig, ReportDefinition, NotificationRecord, AuditLog | 各域（订阅事件） | 无（出站） | 订阅事件投影，不直连各域模型 |

> 注：`AuditLog` 为横切审计，可归 observability 或独立 audit 服务；`PrintTemplate`/`CustomField` 为内核能力，归 gateway 侧或独立 kernel 服务。此映射为目标形态，第一阶段可先以"逻辑包"形式存在，不立即物理拆库。

## Runtime Dependency Adoption

| Dependency | Capability Needed | Failure Mode | Timeout/Retry/Fallback | Adoption Criteria | Revisit Trigger |
| --- | --- | --- | --- | --- | --- |
| 消息队列（RabbitMQ/NATS） | 跨服务事件投递 | broker 不可用 → 事件丢失/堆积 | 生产者重试 + 死信队列；消费者 at-least-once + 幂等 | 事件投递耗时 < 50ms，吞吐满足现有事件量 | 事件 QoS 不足时评估 Kafka |
| API 网关 | 路由/鉴权/限流 | 网关单点 | 网关多副本 + 健康检查 | 前端全部请求改走网关后回归 | 网关成为瓶颈时拆 BFF |
| PostgreSQL（共享过渡） | 数据存储 | 单库故障 | 沿用现有备份/恢复；Postgres 16 主从 | 数据所有者映射完成即进入拆库 | 边界稳定后 Per-Service DB |
| 服务发现 | 服务实例注册/发现 | 注册中心故障 | 网关缓存 + 静态 fallback | 第二个服务上线时引入 | 服务数 >3 时引入 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Decision Record | Owner |
| --- | --- | --- | --- | --- | --- |
| 跨服务事件投递不一致 | 高 | 数据漂移（如财务未随订单推进生成应收） | 事件 at-least-once + 消费者幂等 + 对账任务 | 阶段一先替换 eventBus 底层 | ASSUMED: 后端负责人 |
| 拆库后跨服务事务失效 | 高 | 财务/订单一致性破坏 | 先共享库明确所有者，边界稳定后再拆；跨域写改 Saga/事件 | 阶段三 | ASSUMED: 后端负责人 |
| Order 中心枢纽拆分导致聚合查询回归 | 中 | 详情/时间线/报表瘫痪 | 先建 orderService 聚合读门面再拆 | 阶段一 | ASSUMED: 后端负责人 |
| 分阶段双轨（单体+新服务）运维复杂 | 中 | 部署/排错成本上升 | 每阶段独立 commit、独立验证、可回滚 | 全程 | ASSUMED: 运维 |
| 消息队列/网关引入新技术栈 | 中 | 小团队学习成本 | 选型倾向运维成熟、文档齐全的轻量方案 | 阶段一 | ASSUMED: 后端负责人 |

## Consequences

正面：
- 订单/跟踪等高频域可独立扩容，财务/报表等低频域不拖累整体。
- 单服务故障隔离，预警/自动化/集成任务崩溃不再拖垮主链路。
- 各域独立发布，二开团队互不阻塞。
- 网关对内收敛，前端对服务拆分透明。

负面：
- 引入消息队列、网关、服务发现、分布式一致性（Saga/事件投影）四类新复杂度。
- 中期双轨过渡，运维面显著扩大。
- 拆库阶段跨服务事务改造工作量大，需对账任务兜底。
- 与 ADR-002"延后物理拆分"的决定方向相反，需修订 ADR-002。

## 迁移路径（Strangler 三阶段）

| 阶段 | 内容 | 做 | 不动 | 验证 | 回滚 |
|---|---|---|---|---|---|
| **F0 地基**（基础设施） | 引入消息队列，eventBus 底层替换为 broker（API 不变）；引入 API 网关；建立数据所有权映射表 | 消息队列 + 网关 + 表-服务映射 | 业务逻辑、路由 | 现有全部事件消费回归；前端走网关冒烟 | 网关/broker 双镜像，一键切回单体 |
| **F1 逻辑边界** | 完成现有解耦方案 F0–F5：抽 orderDomain/orderService、消除 automationService 反向依赖、审计门面、跨域写收口 | 领域服务、门面、事件收口 | 路由、DB 表 | 解耦方案自带回归 + 订单全链路 | 每子项独立 commit |
| **F2 提取服务** | 按边界逐个提取：先 identity（依赖最少）→ order → finance → master-data → integration → observability | 新服务独立进程 + 独立 Dockerfile | 未提取的域仍归单体 | 每服务独立冒烟 + 网关全量回归 | 服务回退单体，额外服务下线 |
| **F3 数据所有权→拆库** | 边界稳定后，按数据所有者逐域拆分 Per-Service DB；跨域读改服务门面/事件投影 | 数据迁移 + 跨域调用改造 | 业务语义 | 财务全链路 + 订单推进 + 对账回归 | 拆库前全量备份，可回滚共享库 |

## Evidence

- 分层倒置：`backend/src/services/automationService.js:5`
- 状态机在控制器：`backend/src/controllers/orderController.js:11-28,101-159`
- 进程内事件总线：`backend/src/services/eventBus.js`（`EventEmitter`）
- Order 中心枢纽：`backend/src/models/index.js`（14 表 belongsTo Order）
- 横切直连多域：`alertService.js` / `ruleEngineService.js` / `workflowService.js` / `printService.js`
- 当前部署拓扑：`docker-compose.yml`（pg + backend + frontend）

## Revisit Triggers

- ADR-002 需修订：触发条件由"社区插件需求"扩展为"独立扩缩容/故障隔离/独立发布需求出现"。
- F0 完成且全量回归通过后，重新评估 F2 服务划分是否仍匹配。
- 若小团队运维某个分布式环节（消息队列/网关）持续超支，回退评估"模块化单体 + 水平扩展"（Option D）。