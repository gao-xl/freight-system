# 二次认证（2FA）安全设置 Spec

> Status: ALIGNED
> Author: user
> Last updated: 2026-08-14

## Background

系统已有扎实的认证管线（JWT + httpOnly refresh token + 会话轮换 + 登录锁定 + 强制改密 + tokenVersion 全局吊销），但**无任何二次认证**。目标是在"系统设置"里新增"安全设置"页签，提供**总开关 + 按用户可强制**的执行模型，支持**邮箱验证码 + TOTP 应用验证码**双通道。FIDO/WebAuthn 明确留作二期。

## In scope

- 系统设置新增「SMTP 配置」页签：host/port/user/pass/from 可写，**存库并覆盖环境变量**，支持「测试发信」连通性校验。
- 系统设置新增「安全设置」页签：二次认证**总开关**（通道启用/停用、邮箱验证码开关、TOTP 开关）。
- **邮箱验证码通道**：登录 2FA + 敏感操作复核（复用现有 SMTP/nodemailer）。
- **TOTP 通道**：绑定二维码、校验、解绑、备份码（兼容 Google Authenticator / RFC 6238）。
- **用户管理**：对单个用户标记「必须二次验证」（`User.twoFactorEnabled + 已绑定通道`）。
- **登录流程接入**：密码校验通过后，若该用户需 2FA，则返回**待二次验证暂态凭证**；二次验证通过后签发正式 token。
- **敏感操作复核**：改密 / 财务 / 删除等高危操作，若用户已绑定 2FA 则二次复核（纳入本次）。
- 后端单测 + 前端 vitest 骨架测试，CI 通过。

## Out of scope

- **FIDO / WebAuthn 通行密钥**（二期增强，独立特性）。
- 短信验证码、硬件安全钥匙。
- **强制全员 2FA**（本方案是按用户可选模型）。
- 忘记密码发送 / 邮箱归属验证（C 方案，另一独立特性）。
- 备份码以外的账户恢复流程（如人工重置 2FA 属用户管理既有能力）。

## Assumptions

- 系统级安全设置存 `CompanyProfile` 单行（沿用 `defaultCurrency` 模式，id=1），或新增 `SystemSetting` 配置表（需迁移）。**默认采用 CompanyProfile 扩展字段**，避免新增表。
- SMTP 配置：**优先读数据库**（`CompanyProfile.smtpHost/Port/User/Pass/From`），数据库为空时回退到环境变量 `SMTP_*`。`notificationService.resolveChannel` 修改为优先查库。
- 邮箱验证码复用 `notificationService` 的 nodemailer 封装，发送方配置从上述链路动态获取。
- TOTP secret（Base32）加密存储，复用 `utils/crypto` 的 AES-256-GCM。
- 前端 `SystemManage.vue` 新增「安全设置」tab；`Login.vue` 增加二次验证步骤视图。
- 凭证传递走 httpOnly cookie（沿用现有 `ft_refresh` 方案），不新增明文敏感头。

## Solution

（概要，非实现计划）

1. **数据层 / 迁移**：`User` 增加 `twoFactorEnabled BOOL`、`twoFactorType ENUM('totp','email')`、`totpSecretEnc STRING`、`totpVerifiedAt DATE`；`CompanyProfile` 增加 `security2faEnabled BOOL`、`securityEmailEnabled BOOL`、`securityTotpEnabled BOOL`、`smtpHost/Port/User/Pass/From STRING`。新增迁移 `20260814xxxxxx-add-2fa.js`。
2. **SMTP 配置链路**：`notificationService.resolveChannel('email')` 改为**优先读 `CompanyProfile.smtp*`，为空回退 env**；`systemController` 新增 SMTP 读写 + `POST /system/smtp/test`（测试发信，返回连通结果）。
2. **后端服务** `services/twoFactorService.js`：
   - TOTP：基于 `otplib` 生成/校验，扫描二维码（`otpauth://` URI），绑定+首验，备份码（10 个随机码，存哈希）。
   - 邮箱验证码：生成 6 位码，经 `notificationService` 发送，DB/内存记录 + 过期 + 重发限频（防刷）。
   - 暂态凭证：登录 2FA 未完成时签发**短效 pending token**（如 5 分钟，不含业务权限），仅允许访问 `2fa/verify`、`2fa/resend`、`logout`。
3. **路由**：`POST /auth/2fa/send`、`POST /auth/2fa/verify`、`POST /auth/2fa/setup`（TOTP 绑定）、`POST /auth/2fa/disable`；`systemController` 增加安全设置读/写；`systemController.userUpdate` 透传 `twoFactorEnabled`。
4. **登录流程**：`authController.login` 密码通过后，若用户需 2FA → 返回 pending 暂态态（不签发正式 token）；`POST /auth/2fa/verify` 校验通过后进入现有 `createSession + signAccessToken` 链路。
5. **敏感操作复核**：`middleware/auth.js` 新增 `requireReauthIfEnabled`，对指定高危端点（改密、财务写、删除）在用户已绑定 2FA 时要求暂态复核凭证。
6. **前端**：`SystemManage.vue` 加「安全设置」tab（总开关 + 通道开关）与「SMTP 配置」tab（含测试发信按钮）；用户管理加「必须二次验证」列/开关；`Login.vue` 加 2FA 验证步骤；个人中心加 TOTP 绑定/邮箱验证码配置入口。

## Edge cases & risks

| Category | Notes |
|---|---|
| 边界条件 | 总开关关 → 已绑定用户是否仍需验证（**默认 fail-open**：总开关关则跳过 2FA，避免锁死全员） |
| 失败模式 | SMTP 未配置/发送失败 → 邮箱验证码通道应 fail-open 并记录告警，不阻断登录 |
| 安全风险 | pending token 需极短有效期 + 限频，防暴力猜码；TOTP secret 必须加密存储；备份码一次性且哈希 |
| 风险 | 用户忘记/丢失 TOTP → 需管理员在用户管理重置（复用既有用户管理） |
| 兼容 | 存量已登录会话不受影响；新会话才走 2FA |

## Acceptance criteria

- AC-1 管理员在「安全设置」开启总开关后，用户管理可对单个用户标记「必须二次验证」。
- AC-2 被标记用户密码正确登录后，接口返回待二次验证状态；未验证前访问业务接口一律 401。
- AC-3 邮箱验证码：发送成功、校验通过签发 token、过期失效、重发限频（同一邮箱 N 分钟内限 M 次）。
- AC-4 TOTP：生成二维码完成绑定、校验通过、解绑生效、备份码可用且一次性。
- AC-5 关闭总开关后，所有已绑定用户的 2FA 校验暂停（fail-open），登录直接放行。
- AC-6 已绑定用户改密 / 财务写 / 删除高危操作触发二次复核，复核失败拒绝执行。
- AC-7 后端 `npm test` 全绿（含 2FA 用例），前端 `npm test` 含 2FA 组件骨架测试，CI 通过。
- AC-8 「SMTP 配置」页可保存 host/port/user/pass/from；保存后 `notificationService` 立即按新配置发信（优先于环境变量）；「测试发信」按钮可收到测试邮件并返回连通结果。
- AC-9 SMTP 未配置时，邮箱验证码通道 fail-open 并提示需先配置 SMTP，不阻断其他 2FA 通道。

## Open questions

- **SMTP 企业邮箱授权**：使用企业邮箱（如腾讯企业邮/网易企业邮），需确认 SMTP 开启、授权码/密码可用、465(SSL) 或 587(STARTTLS) 端口出站放行。此项在「SMTP 配置」页测试发信时验证。

## Core entities (ontology)

| Entity | Type | Key fields | Relationship |
|---|---|---|---|
| User | 系统用户(已有) | +twoFactorEnabled, twoFactorType, totpSecretEnc | 被标记强制验证 |
| CompanyProfile | 单行配置(已有) | +security2faEnabled 等 3 个开关, +smtpHost/Port/User/Pass/From | 全局安全设置 + SMTP |
| TwoFactorIssue | 暂态凭证(新增) | userId, type, code/session, expiresAt | 登录→验证间过渡 |
| BackupCode | 备份码(新增,可并入User) | userId, codeHash, used | TOTP 兜底恢复 |

## Interview metadata

- Mode: default
- Waves: 3
- Final ambiguity: 25%
- Status: PASSED

### Clarity breakdown

| Dimension | Score | Weight | Weighted |
|---|---|---|---|
| Goal | 0.9 | 0.40 | 0.36 |
| Scope | 0.6 | 0.25 | 0.15 |
| AC | 0.6 | 0.25 | 0.15 |
| Context | 0.9 | 0.10 | 0.09 |
| Ambiguity | | | 25% |