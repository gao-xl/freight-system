# 客户门户增强（P3-1）· 产品规格 PRD

> 版本：v1.0（评审稿）
> 日期：2026-08-08
> 状态：待工程评审
> 读者：后端 / 前端开发、测试、产品
> 关联文档：《开源升级方案-OPC小团队二开版.md》《文档总览索引.md》《开发任务清单-未完成项.md》（任务 P3-1）
> 范围：客户自助门户（Portal）从「只读查询」升级为「可下载、可提交、可查价」的轻量服务能力

---

## 1. 问题陈述（Problem Statement）

现有客户门户（`frontend/src/views/portal/Portal.vue` + `backend/src/controllers/portalController.js`）是**纯只读**的：客户只能看订单状态、跟踪时间线和应收明细，四个接口（overview / myOrders / orderDetail / myBills）没有任何写操作，单证列表只返回元数据、没有下载入口，也没有运价查询。

对 OPC / 小团队货代而言，客户最频繁的三类需求——**要账单、要提单、补料（SI）**——目前全部要走电话 / 微信 / 邮件，由操作员手工导出再转发。这造成三重成本：

1. **操作员时间被低价值请求占用**：每单"发账单、发提单、收 SI"平均 2~3 次人工操作，OPC 模式下就是老板自己干；
2. **对账与结款周期拉长**：账单送达滞后 → 客户确认慢 → 回款慢，直接影响现金流；
3. **无线上痕迹**：SI 靠邮件/微信收，内容不规范、易丢、无版本、无审计，后续扯皮无据可查。

同时，运价是货代获客的钩子，客户想要"自己查价格"，但内部运价库（`FreightRate`）含货代成本信息，**直接暴露有泄漏风险**，需要可控的公开机制。

**不解决的成本**：客户体验停留在"打电话时代"，与东胜 DS7/DS8 的成熟客户门户差距拉大；OPC 卖"开箱即用核心链路"的主张在客户服务环节缺一块短板。

---

## 2. 目标（Goals）

| # | 目标 | 衡量方式（How will we know?） |
|---|------|------------------------------|
| G1 | 客户可自助下载账单 PDF 与单证文件，无需人工转发 | 上线 30 天，月结前自助下载账单的客户 ≥ 70% |
| G2 | SI 补料在线化，替代邮件/微信收料 | 在线 SI 占 SI 总量 ≥ 50%（90 天），且可审计、可追溯 |
| G3 | 客户可查询货代**主动公开**的运价 | 门户运价查询月活跃客户账号占比 ≥ 40% |
| G4 | 降低操作员低价值工作量 | 账单/单证相关咨询工单量下降 ≥ 40% |
| G5 | 不引入数据泄漏风险 | 安全验证用例全部通过：内部成本运价 0 条出现在门户响应；越权访问全部 404/403 |

---

## 3. 非目标（Non-Goals）

| 非目标 | 原因 |
|--------|------|
| 不做线上支付/收款 | 依赖支付合规与通道对接，独立立项；v1 仅"看得见、下得去" |
| 不做客户自助创建订单/订舱 | 订单是货代核心业务动作，OPC 场景下接单判断仍需人工，范围控制 |
| 不做税务发票（Invoice）下载 | 开票属财务合规流程，Invoice 状态机（draft→issued→paid）与账单是两回事，v1 门户只出"账单/对账单"，不开票 |
| 不做客户自定义权限体系 | 复用现有 RBAC customer 角色 + `User.customerId` 关联，不做细分 |
| 不做门户品牌深度定制（主题色/域名/多语言） | 独立体验优化项，v1 保持与主系统一致 |
| 不做 SI 与报关/单证字段的自动回填联动 | 数据血缘复杂，v1 只做"提交→处理→反馈"闭环 |

---

## 4. 用户故事（User Stories）

按优先级排序：

1. **作为客户操作员**，我希望在我的订单里一键下载该单的账单 PDF，以便直接对账付款，不再找货代要文件。
2. **作为客户操作员**，我希望下载已发布单证（提单/装箱单/发票等）的电子文件，以便传给国外收货人或报关行。
3. **作为客户操作员**，我希望在线提交 SI 补料（发货人/收货人/唛头/件重尺等），以便不再发邮件/微信，且能随时看到处理进度。
4. **作为货代操作员**，我希望看到待处理的 SI 清单并逐条处理（通过/驳回+原因），以便把客户补料闭环进订单。
5. **作为客户操作员**，我希望按起运港/目的港/箱型查询货代公开的运价，以便初步估算费用、决定是否询价。
6. **作为货代老板/销售**，我希望把某条运价标记为"对外公开"、其余保持内部成本，以便用运价获客又不泄露成本。

边界与异常：
- 客户尝试下载**不属于自己客户档案**的订单账单/单证 → 404（不提示"存在但不属于你"）。
- 客户在存在"处理中"的 SI 时再次提交 → 明确提示，不静默覆盖（策略见开放问题 Q1）。
- 内部运价（`isPublic=false`）出现在门户查询 → 0 条（安全验证用例）。

---

## 5. 需求明细（Requirements）

### 5.0 前置缺陷修复（P0，随本迭代一并交付）

| 项 | 现状 | 要求 |
|----|------|------|
| BUG-1 | `portalController.myOrders`（L35-36）与 `myBills`（L65）引用**未定义变量** `status` / `keyword`，前端传筛选参数即抛 ReferenceError → 500 | 补充 `const { status, keyword } = req.query;` 解构，修复后"我的订单"关键字/状态下拉筛选可用；补一条回归用例 |
| BUG-2 | `myOrders` 的 `where` 复用了变量 `where`，`status` 过滤与分页条件并存时需确认无覆盖 | 重构为 `const where = { customerId, ...(status ? { status } : {}) }` 的显式构造，消灭隐式行为 |

**验收**：给定一个 customer 角色账号，当在前端输入关键词或选择状态下拉并点击查询，Then 列表按条件正确过滤且接口返回 200（不再 500）。

### 5.1 功能 A：账单 PDF 下载（P0）

| 需求 | 说明 |
|------|------|
| A-1 单订单账单下载 | `GET /api/portal/orders/:orderId/bill` → 返回该订单应收账单 PDF（attachment，文件名 `对账单-{orderNo}.pdf`） |
| A-2 我的账单入口 | 前端"我的账单"tab 每行增加「下载账单」按钮；订单详情费用区增加「下载账单」 |
| A-3 权限 | 服务端强制 `order.customerId === req.user.customerId`，否则 404；`:orderId` 不接受任何客户指定逻辑 |
| A-4 月结对账单（P1） | `GET /api/portal/statement?month=YYYY-MM` → 汇总该客户当月应收，生成对账单 PDF（复用 `financeStatement` 归属规则） |

**验收标准**：
- Given 客户账号 A 属于客户档案 C1、且 C1 下存在订单 O1，When 客户调用 `GET /portal/orders/O1/bill`，Then 返回 200 且 Content-Type 为 application/pdf、文件名含订单号。
- Given 同一 O1 属于客户 C1，When **客户档案 C2 的账号**调用同一接口，Then 返回 404，且响应体不含任何 O1 信息。
- Given 订单 O1 无任何应收费用，When 下载账单，Then 返回合法 PDF（可为空账单，但不得 500）。

### 5.2 功能 B：单证（提单等）文件下载（P0）

| 需求 | 说明 |
|------|------|
| B-1 单证下载 | `GET /api/portal/orders/:orderId/documents/:docId/download` |
| B-2 双路径 | 该单证有 `filePath` → 下载原文件（复用 `documentController.resolveUploadPath` 的路径穿越防护）；无文件 → 调 `printService.render(null, doc.docType, orderId)` 动态生成 PDF |
| B-3 权限链 | `Document → orderId → Order.customerId === req.user.customerId` 全链路校验，任一环不满足即 404 |
| B-4 前端入口 | 订单详情"单证"区每个文档加「下载」按钮（现有 `orderDetail` 已返回 documents 元数据，仅补按钮与下载动作） |

**验收标准**：
- Given C1 的订单 O1 有已上传提单（docType=bl, filePath 非空），When 客户下载，Then 返回该文件且 originalName 正确。
- Given O1 有 draft 状态且无 filePath 的单证，When 客户下载，Then 返回动态生成的 PDF（不落盘、不留临时文件）。
- Given 其他客户的单证，When 客户尝试下载，Then 404。
- Given docId 指向不存在的单证或 orderId 与 doc 的 orderId 不一致，Then 404（参数错配防探测）。

### 5.3 功能 C：SI 补料在线提交（P0，全新）

**5.3.1 数据模型：`ShippingInstruction`（新模型 + 迁移）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 自增 |
| siNo | STRING(50) | 编号，`SI + 日期 + 序号`（复用 `genDocNo` 模式） |
| orderId | INT, NOT NULL | 关联订单 |
| shipper / consignee / notifyParty | TEXT | 发货人 / 收货人 / 通知方 |
| marks | TEXT | 唛头 |
| cargoDesc | TEXT | 货描 |
| containers | TEXT(JSON) | 箱信息数组（箱号/箱型/铅封号） |
| packages / grossWeight / volume | STRING | 件数 / 毛重 / 体积（客户侧自由文本，操作员复核） |
| status | ENUM('submitted','processing','completed','rejected') | 状态机见 5.3.3 |
| submittedAt / processedAt | DATE | 提交 / 处理时间 |
| processedBy | INT | 处理人（操作员） |
| processRemark | TEXT | 处理备注（驳回原因必填） |
| groupId / ownerId | INT | 数据隔离，从订单继承 |
| version | INT | 乐观锁（系统惯例） |
| timestamps + paranoid | - | 系统惯例 |

**5.3.2 接口**

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/portal/orders/:orderId/si` | POST | customer | 提交 SI（校验订单归属）；存在 submitted/processing 状态的 SI 时按 Q1 策略处理 |
| `/api/portal/orders/:orderId/si` | GET | customer | 我的 SI 历史（按时间倒序） |
| `/api/portal-si` | GET | operator/admin/manager（`guard('order','read')` 口径） | 内部 SI 列表（分页 + status 筛选 + orderNo 关键词） |
| `/api/portal-si/pending` | GET | 同上 | 待处理（submitted/processing）快捷清单 |
| `/api/portal-si/:id` | GET | 同上 | 详情 |
| `/api/portal-si/:id/process` | POST | `guard('order','update')` | `{ to: 'processing'\|'completed'\|'rejected', remark }`，状态机校验 + 审计 + 事件 |

**5.3.3 状态机**

```
submitted ──► processing ──► completed
    │              │
    └──────────────┴──► rejected（processRemark 必填）──►（客户重新提交）──► submitted
```

- 流转校验放服务层（参照 `workflowService.transition` 的校验+审计+事件模式），非法流转返回 400。
- 每次提交 / 处理写 `AuditLog`（复用现有审计机制）。
- 提交时 `eventBus.emit('portal.si.submitted')`、处理完成时 `eventBus.emit('portal.si.processed')` —— 事件订阅由现有通知能力（企微 Webhook 示例插件 / 站内 AlertRecord）消费，**v1 只要求事件发出与站内记录，不强制外发渠道**（依赖见 Q4）。

**验收标准**：
- Given C1 客户账号，When 对 C1 订单 O1 提交合法 SI，Then 返回 201、状态 submitted、`siNo` 生成、审计落库、事件发出。
- Given 同一账号对**非本客户**订单提交，Then 404。
- Given 操作员对一条 submitted 的 SI 调 process `{to:'rejected', remark:''}`，Then 400（驳回必须填原因）。
- Given SI 处于 completed，When 再调 process，Then 400（状态机拒绝非法流转）。
- Given 存在一条 processing 状态的 SI，When 客户再次提交，Then 按 Q1 策略返回（默认 409 + 明确提示，见开放问题）。

### 5.4 功能 D：门户运价查询（P0，含公开机制）

**5.4.1 数据模型变更：`FreightRate` 增加 `isPublic` 列（迁移）**

- `isPublic: BOOLEAN, defaultValue: false` —— **默认内部**，杜绝"忘了标记"导致的成本泄漏。
- 管理端：运价 CRUD（`freightRateController`）支持读写 `isPublic`；前端运价管理页加「对外公开」开关，并显示"门户可见"标识。

**5.4.2 查询接口**

`GET /api/portal/rates?originPort=&destPort=&containerType=&keyword=`
- where：`isPublic = true` 且有效期覆盖当日（空有效期=长期，复用 `freightRate.search` 的有效期逻辑）；
- 排序：`rate ASC`，limit 50；
- **响应字段白名单裁剪**：`id / route / originPort / destPort / carrier / containerType / rate / currency / validFrom / validTo / updatedAt` —— 不含 `groupId / ownerId / remark`（remark 可能含内部备注）；
- **不走 scopedWhere 的组隔离**（客户跨组可见公开运价），但必须在服务层显式写 `isPublic: true`，不允许复用带 scoped 的 `search` 直接对外。

**5.4.3 前端**：门户新增「运价查询」tab（查询表单 + 结果表格，`rate` 列标明币种）。

**验收标准**（安全验证用例，纳入自动化测试）：
- Given 库中有 20 条内部运价（isPublic=false）+ 3 条公开运价，When 客户调用 `/portal/rates`，Then 响应 3 条且全部 isPublic=true，内部运价 0 条泄漏。
- Given 公开运价超出有效期，When 查询，Then 不出现该条。
- Given 客户传 `containerType=45HQ`，Then 400（复用 `CONTAINER_TYPES` 白名单校验）。

### 5.5 P1（重要增强，可作二期）

| 项 | 说明 |
|----|------|
| P1-1 月结对账单 PDF | A-4：`printService.loadBizData` 扩展 customerId+month 维度（当前仅支持按 orderId） |
| P1-2 SI 附件上传 | 复用 multer 白名单（PDF/图片/Office），`POST /portal/orders/:orderId/si/attachments` |
| P1-3 账单 Excel 导出 | 复用 `exportService` |
| P1-4 SI 状态变化外发通知 | 依赖出站通知能力（P3-2 邮件/企微），事件已预留 |
| P1-5 门户 `overview` 性能 | 大客户场景全量扫 FinanceRecord 统计应收，改为聚合查询或缓存 |

### 5.6 P2（后续考虑，设计时预留）

- 线上支付（付款链接/回单回传）
- 客户查价 → 生成询价单（与 `Quotation` 联动）
- PDF 精排升级（puppeteer 渲染 HTML，替代 pdfkit 纯文本流，涉及容器镜像体积 +2~3 人日）
- 门户品牌定制（logo/主题/独立域名）
- 多语言（英文门户，面向海外客户）

---

## 6. 技术方案要点（工程评审用）

### 6.1 复用清单（已存在，勿重复造）

| 能力 | 位置 | 复用方式 |
|------|------|----------|
| 打印/PDF 引擎 | `backend/src/services/printService.js` | `render(templateId, docType, bizId)`；docType 支持 `statement`/`settlement`（按 orderId 加载 FinanceRecord） |
| 打印路由 | `GET /api/print/:docType/:bizId` | 仅作参考；门户走**专用接口**以叠加 customerId 校验，不直接暴露给 customer 角色 |
| 单证文件路径防护 | `documentController.resolveUploadPath`（L67-72） | 提取为公共 utils 或门户内复刻同逻辑（绝对路径 + startsWith 边界校验） |
| 对账单归属规则 | `financeStatementController.statement`（L36-43） | 月结汇总时复用"订单 customerId 优先、counterpartyId 兜底"的归属逻辑 |
| 运价有效期/白名单 | `freightRateController.search`（L37-44） | 门户查询复制其有效期与 `CONTAINER_TYPES` 校验逻辑，但 where 强制 `isPublic` |
| 事件总线 | `core/eventBus`（P1.1） | SI 提交/处理 emit，警报/通知引擎消费 |
| 状态机+审计模式 | `workflowService.transition` / `AuditLog` | SI 处理接口参照其校验+审计+事件三段式 |
| 分页/响应 | `utils/response`（ok/fail/asyncHandler/getPagination） | 全部新接口统一走 |
| 权限中间件 | `requireRole` / `guard(module, action)` / `authRequired` | portal 接口沿用 `requireRole('customer', ...)`；内部 SI 接口走 `guard('order', ...)` |

### 6.2 新增清单

| 项 | 内容 |
|----|------|
| 模型 | `ShippingInstruction.js` + 迁移（`202608080000XX-portal-si.js`） |
| 迁移 | `FreightRate` 加 `isPublic` 列（`202608080000XX-freight-rate-public.js`） |
| 控制器 | `portalController` 扩展 4 接口（bill / document download / si POST+GET / rates）+ 新增 `portalSiController`（内部清单与处理） |
| printService 扩展 | `loadBizData` 增加 portalStatement 分支（customerId+month → FinanceRecord include Order） |
| 前端 | `Portal.vue`：账单下载按钮、单证下载按钮、SI 表单+历史、运价 tab；`FreightRateManage` 加 isPublic 开关；新增操作员「SI 处理」页 |
| 测试 | 越权 404 用例、运价泄漏用例、SI 状态机用例、BUG-1 回归用例；`npm test` 全绿 |

### 6.3 关键约束（评审重点）

1. **门户一切读接口的服务端强制归属**：一律用 `req.user.customerId`，不接受 body/query 传入客户 ID。这是与内部接口（走 group 隔离）不同的第二道闸门，二者缺一不可。
2. **PDF 为简化排版**：当前 `printService.toPdf` 用 pdfkit 渲染剥离标签后的纯文本（L144-161），**不是 HTML 精确排版**——无表格边框、无 logo 水印。v1 对账单 PDF 接受"结构化文本流"形态，正式版式走 P2 精排升级。需在门户 UI 上明示"下载版为简化格式"。
3. **customer 角色走 `scopedWhere` 会因组归属被拒**：门户下载/账单/单证接口必须独立做 customerId 校验，不能直接调内部 `/documents/:id/download`（`scopedFindOne` 按 groupId 过滤，customer 用户大概率无组）。
4. **迁移链**：现链 0000→0010（11 个），新迁移编号续 0011/0012，`npm test` 与迁移链验证需通过。
5. **SQLite 默认 + PG 兼容**：新模型/迁移沿用现有 Sequelize 定义风格，不引入方言。

---

## 7. 成功指标（Metrics）

| 类型 | 指标 | 基线（估） | 目标（30/90 天） | 采集方式 |
|------|------|-----------|-----------------|----------|
| 激活 | 月活跃客户账号 / 总客户账号 | 仅登录查看 | ≥ 60%（30 天） | 审计日志 / 登录表 |
| 采用 | 在线 SI 占 SI 总量 | 0% | ≥ 50%（90 天） | `ShippingInstruction` 计数 vs 线下口径 |
| 采用 | 月结前自助下载账单客户占比 | 0% | ≥ 70% | 下载接口埋点 + 客户维度聚合 |
| 效率 | 账单/单证类咨询工单量 | 现有人工量 | -40% | 工单/沟通记录 |
| 健康 | 门户接口 4xx/5xx 错误率 | - | < 1% | 服务端日志 |
| 安全 | 内部运价泄漏条数 | - | 0（自动化用例守护） | 安全回归用例 |

北极星建议：**客户自助完成率** =（自助下载 + 在线 SI + 运价查询）/（对应总需求），反映门户是否真正替代人工交互。

---

## 8. 开放问题（Open Questions）

| # | 问题 | 谁回答 | 阻塞性 |
|---|------|--------|--------|
| Q1 | SI 重复提交策略：同订单存在 submitted/processing 的 SI 时，是拦截（409 等处理完再提）还是版本化（每次新记录）？建议 v1 拦截，简单且符合补料流程 | 产品 + 操作员 | **阻塞 M1** |
| Q2 | 运价公开方式：`isPublic` 标记 vs 从已确认报价（Quotation）聚合？`isPublic` 更轻，报价聚合更贴"只公开报出去的价格" | 产品 + 销售 | 阻塞 D 方案定稿 |
| Q3 | PDF 版式：v1 接受 pdfkit 简化文本流，还是 M1 就上 puppeteer 精排（+2~3 人日 + 容器镜像体积）？建议 v1 简化 | 工程 + 产品 | 阻塞 A-1 验收标准细化 |
| Q4 | SI 状态变化通知渠道：v1 仅站内（AlertRecord+角标）还是直接接企微 Webhook（示例插件已有）？ | 工程 | 非阻塞（事件已预留） |
| Q5 | 账单 PDF 是否只含应收（客户视角），还是应收应付都展示？建议只含应收+本币金额（localAmount） | 财务 + 产品 | 非阻塞 |
| Q6 | 同一客户多个账号是否看到全部订单（现状：是，按 customerId 共享）？是否要按联系人细分？建议 v1 保持现状 | 产品 | 非阻塞 |

---

## 9. 风险与依赖（Risks & Dependencies）

| 风险 | 等级 | 缓解 |
|------|------|------|
| 内部运价成本泄漏（isPublic 默认 false 仍可能被人为全开） | **P0** | 默认关闭 + 门户响应字段白名单 + 自动化泄漏用例 + 管理端 UI 红色提示"公开后将向客户展示" |
| 越权访问（跨客户下载/提交） | **P0** | 服务端强制 customerId + 错配即 404 防探测 + 越权用例进自动化测试 |
| BUG-1 未修导致筛选 500 延续 | P1 | 本迭代 P0 前置修复 + 回归用例 |
| pdfkit 简化版式拉低对账单观感 | P1 | UI 明示"简化格式"；P2 精排升级排期 |
| 依赖项：SI 外发通知依赖 P3-2 出站通知能力 | P1 | v1 只发事件 + 站内记录，不阻塞交付 |
| 依赖项：月结对账单 PDF 依赖 printService 扩展 | P1 | 排 M1 后端，P1-1 为二期项 |
| overview 大客户性能 | P2 | 聚合查询优化（P1-5） |

---

## 10. 分期建议（Timeline）

| 期 | 内容 | 预估 | 交付物 |
|----|------|------|--------|
| **M1 后端**（3~4 人日） | BUG-1/2 修复；`ShippingInstruction` 模型+迁移；`portalSiController`（list/pending/process）；门户 4 接口（bill / document download / si / rates）；`FreightRate.isPublic` 迁移；printService portalStatement 分支；越权+泄漏+状态机测试 | 3~4 人日 | 后端接口 + 测试全绿 + 迁移链验证 |
| **M2 前端**（2~3 人日） | Portal.vue 扩展（账单/单证下载、SI 表单+历史、运价 tab）；运价管理页 isPublic 开关；操作员 SI 处理页 | 2~3 人日 | 前端可操作闭环 |
| **M3 联调与安全验证**（1~2 人日） | 端到端联调（客户提交 SI → 操作员处理 → 客户看状态）；越权/泄漏安全回归；文档更新（《二开指南》portal 章节） | 1~2 人日 | 验收通过 + 文档 |

**M1 通过后即可先行验收**（后端先行不影响前端联调时序），P1 项（月结 PDF、SI 附件、Excel、通知外发）作为二期独立排期，不得挤入 M1 范围。

---

> 附：本文档中的现状描述均基于 2026-08-08 代码核查（portalController.js / printService.js / financeStatementController.js / freightRateController.js / documentController.js / dataScope.js / routes/index.js / Portal.vue）。
