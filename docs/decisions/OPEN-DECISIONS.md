# 悬而未决登记册（OPEN-DECISIONS）

> 规则：只追加 + 就地关闭（OPEN → RESOLVED，补 Resolution 字段）。
> 每次 Phase 开始时，把未决项复现到工作上下文最前面，逐条判断能否关闭。

| Date | Source | Open Item | Related Constraints | Current Leaning | Blocked By | Resolves When | Status |
|------|--------|-----------|---------------------|-----------------|------------|---------------|--------|
| 2026-08-08 | P2.4 | FinanceRecord 既有 `rate` 字段与新增 `exchangeRate` 字段重叠 | `rate` 无业务逻辑使用仅 schema 放行；`exchangeRate` 已由模型钩子统一计算 | 统一为一个字段（保留 exchangeRate，废弃 rate） | 避免破坏现有 API 与既有数据 | 2026-08-08 Phase 3 已收敛：rate 保留列作兼容别名（≠1 时兜底折算），exchangeRate 为唯一汇率入口；前端/seed 均不依赖 rate | RESOLVED |
| 2026-08-08 | P2.4 | 历史/种子数据 `localAmount` 为 NULL | seed 用 bulkCreate 不触发钩子；回填需查外部汇率（网络风险） | 新记录自动折算；历史数据按需回填（脚本 + 汇率快照） | 无可靠汇率来源 | 用户确认回填需求后 | OPEN |
| 2026-08-08 | P2.4 | 既有文件超 300 行（orderController 434 / moduleRegistry 302 / routes/index 391） | 代码组织规范：单文件 ≤300 行、单一职责 | 拆分为 controller + service 组合 | 重构回归风险 | F1 完成（方案已定：docs/架构解耦重构方案-高内聚低耦合.md E1-E3；F0 已抽 orderDomain 纯函数） | 方案已定，F1 执行中 |
| 2026-08-09 | 架构 F0 | 迁移版本前缀再次撞号：并行会话新增 `20260809000000-add-order-si-fields` 与 `20260809000000-notification-records` 两个同前缀迁移 | migrateRunner 按文件名 sort，顺序确定但语义歧义 | 不动存量文件名（SequelizeMeta 记录文件名，改名会导致已执行迁移重复执行）；新迁移严格 20260809000000+ 递增 | 并行会话合并 | 并行会话合并时统一编号 | OPEN |
| 2026-08-09 | 架构 F0 | eslint 未安装，`backend/.eslintrc.js` 已建但未生效 | 无 lint 静态检查（质量评估 P0 短板）；package.json 被并行会话占用，本轮未改 | 由 CI/本地 `npm i -D eslint@^8` 后接入；精确 importer 过滤待 eslint-plugin-import | 并行会话合并 package.json | 并行会话合并后接入 CI | OPEN |
| 2026-08-08 | P2.4 | 单票利润用原始多币种金额相加（USD 应收 + CNY 应付未折算） | 已有 `/orders/:id/profit` 按原币种合计 | 改为 localAmount 本币口径计算毛利 | 需重算历史记录口径 | 2026-08-08 Phase 3.7 已解决：profit/profitSummary 改用 localAmount 本币口径（缺省回退原币，历史兼容） | RESOLVED |
| 2026-08-08 | P2.5 | financeController `writeoff/issueInvoice/cancelInvoice` 用 `ok(res,null,msg,1,404)` 但 ok() 只收 3 参 → not-found 被当作成功返回 HTTP 200 + code:0 | ok() 签名 (res,data,message)；fail() 才收 (res,message,code,httpStatus) | 改为 fail() 正确返回 404 | 前端可能按 HTTP status 判断，需同步改前端 | 2026-08-08 Phase 3 已修复：financeController 9 处 + releaseController 1 处全部改 fail()，grep 验证清零，冒烟 5/5 | RESOLVED |
