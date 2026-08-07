# 悬而未决登记册（OPEN-DECISIONS）

> 规则：只追加 + 就地关闭（OPEN → RESOLVED，补 Resolution 字段）。
> 每次 Phase 开始时，把未决项复现到工作上下文最前面，逐条判断能否关闭。

| Date | Source | Open Item | Related Constraints | Current Leaning | Blocked By | Resolves When | Status |
|------|--------|-----------|---------------------|-----------------|------------|---------------|--------|
| 2026-08-08 | P2.4 | FinanceRecord 既有 `rate` 字段与新增 `exchangeRate` 字段重叠 | `rate` 无业务逻辑使用仅 schema 放行；`exchangeRate` 已由模型钩子统一计算 | 统一为一个字段（保留 exchangeRate，废弃 rate） | 避免破坏现有 API 与既有数据 | v1.1 大版本窗口 | OPEN |
| 2026-08-08 | P2.4 | 历史/种子数据 `localAmount` 为 NULL | seed 用 bulkCreate 不触发钩子；回填需查外部汇率（网络风险） | 新记录自动折算；历史数据按需回填（脚本 + 汇率快照） | 无可靠汇率来源 | 用户确认回填需求后 | OPEN |
| 2026-08-08 | P2.4 | 既有文件超 300 行（orderController 434 / moduleRegistry 302 / routes/index 391） | 代码组织规范：单文件 ≤300 行、单一职责 | 拆分为 controller + service 组合 | 重构回归风险 | Phase 3 空闲窗口 | OPEN |
| 2026-08-08 | P2.4 | 单票利润用原始多币种金额相加（USD 应收 + CNY 应付未折算） | 已有 `/orders/:id/profit` 按原币种合计 | 改为 localAmount 本币口径计算毛利 | 需重算历史记录口径 | 与 localAmount 回填项一起 | OPEN |
| 2026-08-08 | P2.5 | financeController `writeoff/issueInvoice/cancelInvoice` 用 `ok(res,null,msg,1,404)` 但 ok() 只收 3 参 → not-found 被当作成功返回 HTTP 200 + code:0 | ok() 签名 (res,data,message)；fail() 才收 (res,message,code,httpStatus) | 改为 fail() 正确返回 404 | 前端可能按 HTTP status 判断，需同步改前端 | 前端批处理完成后统一处理 | OPEN |
