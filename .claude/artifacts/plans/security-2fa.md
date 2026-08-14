# 二次认证（2FA）安全设置 Implementation Plan

> Status: APPROVED
> Source: `.claude/artifacts/designs/security-2fa.md`
> Mode: --deliberate
> Iterations: 1 / 3
> Author: user
> Last updated: 2026-08-14

## Requirements summary

在系统设置新增「安全设置」（2FA 总开关 + 邮箱/TOTP 通道开关）与「SMTP 配置」页签，采用**总开关 + 按用户可强制**模型；登录密码通过后对需 2FA 用户进入二次验证，支持邮箱验证码与 TOTP 双通道；已绑定用户对**敏感操作**（改密/财务写/删除）二次复核。SMTP 配置存库并覆盖环境变量，企业邮箱发信。

## Acceptance criteria

- AC-1 安全设置开启总开关后，用户管理可对单个用户标记「必须二次验证」。
- AC-2 被标记用户密码正确登录 → 返回待 2FA 暂态；未验证访问业务接口一律 401。
- AC-3 邮箱验证码：发送成功、校验通过签发 token、过期失效、重发限频（同邮箱 60s 内限 1 次）。
- AC-4 TOTP：生成二维码绑定、校验通过、解绑生效、备份码可用且一次性。
- AC-5 关闭总开关后，已绑定用户 2FA 校验暂停（fail-open），登录直接放行。
- AC-6 已绑定用户改密/财务写/删除触发二次复核，复核失败拒绝执行。
- AC-7 后端 `npm test` 全绿（含 twoFactor 用例），`npm run lint` 0 错误。
- AC-8 「SMTP 配置」保存后立即生效（优先于 env）；「测试发信」能收到测试邮件。
- AC-9 SMTP 未配置时，邮箱验证码通道 fail-open 并提示先配置 SMTP，不阻断 TOTP。

## RALPLAN-DR

### Principles

- **最小代码**：复用现有 `crypto.js`(AES-256-GCM)、`notificationService`(nodemailer)、`CreateSession`/`signAccessToken` 链路，不另起认证框架。
- **外科手术式改动**：每步只碰指定文件；敏感操作复核只挂在高危端点，不做全局拦截。
- **不假设**：2FA 判定、fail-open 语义、通道开关全部显式落在配置与 AC 上。
- **可验证成功标准**：所有 AC 二值可执行，测试全量覆盖。
- **跟随 spec In/Out scope**：FIDO 不在本期。

### Decision drivers

1. 上线速度与部署复杂度（内部货运系统，倾向低侵入）。
2. 维护成本（沿用 CompanyProfile 单行配置 vs 新增配置表）。
3. 安全强度（TOTP secret、SMTP 密码必须加密存储；pending token 短效）。
4. 现有代码契约（controllers→services/dataAccess 依赖方向不可破坏）。

### Viable options

**Option A: 基于签名 JWT 的 pending/reauth 短效 token（选定）**
- 实现思路：登录 2FA 用 5 分钟签名 JWT（无 DB 会话）；敏感复核用 3 分钟 reauth JWT，经 `X-Reauth-Token` 头携带，由中间件校验。
- 改动文件：`authController.js`、`middleware/auth.js`、`twoFactorService.js`、`routes/index.js`。
- Pros：无新增表、无状态，全程沿用现有 JWT 体系；pending 态天然短效自过期。
- Cons：JWT 无法服务端即时吊销（5 分钟窗口可接受）；需要前端管理 reauth 头。

**Option B: 暂态凭证建表（Sessions 复用）**
- 实现思路：pending/reauth 都落 Sessions 表，可服务端撤销。
- 改动文件：`Session.js`、`sessionService.js`、`authController.js`。
- Pros：可服务端吊销，精细控制。
- Cons：为 5 分钟过渡态引入表写入/清理，过度设计；与 refresh 会话语义混淆。

**Option C: FIDO/WebAuthn 纳入本期**
- 实现思路：引入 WebAuthn 全套（credential 存储、challenge、attestation、前端 navigator.credentials）。
- 改动文件：面广（后端 + 前端 + 浏览器兼容处理）。
- Pros：最高安全强度。
- Cons：spec 明确 out-of-scope；改动量大、周期长、设备侧 UX 复杂。

> Option A 选定理由：A 与 B 在安全强度上等价（JWT 短效 + 密钥签名），A 改动面最小、零状态、复用现有签名链路；B 为 3-5 分钟过渡态引入表管理不划算。C 被 spec 排除，仅作对比。

## Implementation steps

（deliberate 模式：每步 cite 具体文件）

### Phase 1 — 依赖与数据模型

1. `backend/package.json` dependencies 新增 `otplib@^12.0.1`、`qrcode@^1.5.4`；运行 `npm install`。
2. 新建迁移 `backend/migrations/20260814000001-add-2fa.js`（沿用项目的 async/await 风格，参照 `20260814000000-add-login-lockout.js`）：
   - User：`twoFactorEnabled BOOLEAN default false`、`twoFactorType ENUM('totp','email')`、`totpSecretEnc STRING(255)`、`totpVerifiedAt DATE`、`backupCodesEnc TEXT`。
   - CompanyProfile：`security2faEnabled`/`securityEmailEnabled`/`securityTotpEnabled` BOOLEAN default false、`smtpHost`/`smtpUser`/`smtpPassEnc`/`smtpFrom` STRING、`smtpPort` INTEGER。
   - down()：DROP TYPE IF EXISTS 对应 ENUM + 回滚列（参照项目既有 ENUM down 约定）。
3. 更新模型：`backend/src/models/User.js`（追加字段）、`backend/src/models/CompanyProfile.js`（追加字段）。

### Phase 2 — 配置与后端服务

4. `backend/src/config/index.js` 追加 `twoFactor` 块：`pendingTtl:'5m'`、`reauthTtl:'3m'`、`codeTtl:300000`、`resendWindowMs:60000`、`maxAttempts:5`（均可 env 覆盖）。
5. 新建 `backend/src/services/twoFactorService.js`（依赖方向：此服务经 `require('./dataAccess')` 取模型）：
   - TOTP：`setupTotp(user)` 用 otplib 生成 secret → 加密入库(`crypto.encryptSecret`) → 返回 `{secret, otpauthUri, qrDataURL(qrcode)}`；`verifyTotp(user,code)` 校验并置 `totpVerifiedAt`。
   - 备份码：`generateBackupCodes` 生成 10 个 → SHA-256 哈希存 `backupCodesEnc`(JSON) → `verifyBackupCode` 校验并一次性消费。
   - 邮箱码：`sendEmailCode(user,type)` 生成 6 位码 → 由 `notificationService` 发送 → 存内存 Map(`{userId,code,expiresAt,lastSentAt}`)；`resend` 受 `resendWindowMs` 限频。
   - 暂态 token：`signPendingToken(user)` / `verifyPendingToken(t)`（payload 含 `2faPending:true,userId`）；`signReauthToken(user)` / `verifyReauthToken(t)`（payload 含 `reauth:true,userId`）。
   - 判定：`needs2fa(user)` = `user.twoFactorEnabled && company.security2faEnabled && (通道开关命中)`。
6. `backend/src/services/notificationService.js` `resolveChannel('email')`（约 line 37-48）：改为**优先读 `CompanyProfile.smtpHost`，为空回退 `config.notification.smtp*`**；`smtpPassEnc` 经 `decryptSecret` 解密。`sendEmail` 支持 587 STARTTLS（`secure` 按端口 465 判断，非 465 用 `startTLS`）。

### Phase 3 — 认证控制器与路由

7. `backend/src/controllers/authController.js`：
   - `login`（line 74-116）：密码校验通过后调 `needs2fa(user)`；若需 2FA → 签发 pending token 返回 `{pending:true, pendingToken, channels:[...]}`（**不下发 refresh cookie、不 createSession**）；否则走原链路。
   - 新增 `post2faSend`（邮箱码发送）、`post2faVerify`（校验邮箱码/TOTP/备份码 → 进入 `createSession + signAccessToken` 原链路）、`setupTotp`、`disable2fa`、`reauthVerify`（敏感复核，校验通过签发 reauth token）。
8. `backend/src/middleware/auth.js`：新增 `requirePending2fa`（校验 `2faPending` token，仅放行 2fa 端点）；新增 `requireReauthIfEnabled`（若 `needs2fa(req.user)` 且请求无有效 `X-Reauth-Token` → 428 + 挑战；有则校验 `reauth` token）。
9. `backend/src/routes/index.js`：
   - `POST /auth/2fa/send`、`POST /auth/2fa/verify`、`POST /auth/2fa/setup`、`POST /auth/2fa/disable`、`POST /auth/2fa/reauth`（挂 `authRequired` + `requirePending2fa` 或普通 auth）。
   - 敏感端点追加 `requireReauthIfEnabled`：`POST /auth/change-password`(line 110)、`POST /finance/periods/:code/close`(line 390)、`POST /finance/:id/reverse`(line 409)、`POST /finance/batch-delete`(line 402)、`DELETE /finance/:id`(line 415)、`DELETE /users/:id`(line 180)、`DELETE /orders/:id`(line 322)。

### Phase 4 — 系统设置读写

10. `backend/src/controllers/systemController.js`：
    - 新增 `getSecuritySettings`：返回 2FA 开关 + SMTP（`smtpPass` 仅返回是否已配置）。
    - 新增 `putSecuritySettings`：保存 2FA 开关 + SMTP（`smtpPass` 经 `encryptSecret`）。
    - 新增 `smtpTest`：用当前配置发测试邮件，返回连通结果。
    - `updateUser`（line 95-140）：透传 `twoFactorEnabled` 开关。
    - `module.exports`（line 325）追加上述函数。

### Phase 5 — 校验与前端

11. `backend/src/validation/schemas.js`：新增 `twoFactorSend`、`twoFactorVerify`、`totpSetup`、`securitySettingsUpdate`、`smtpTest`（Joi）。
12. `frontend/src/api/`：新增 2FA + system settings 的 API 封装（参照现有 `frontend/src/api/onboarding.js` 风格）。
13. `frontend/src/views/system/SystemManage.vue`：新增「安全设置」tab（总开关 + 邮箱/TOTP 通道开关 + 测试发信）与「SMTP 配置」tab；用户表格(line 8-30)加「2FA」列/开关。
14. `frontend/src/views/Login.vue`：登录后若返回 `pending`，切到 2FA 验证步骤视图（邮箱码/TOTP）。
15. 个人中心新增 TOTP 绑定 / 备份码展示组件（复用 `SetupPassword.vue` 交互模式）。

### Phase 6 — 测试与收尾

16. 新建 `backend/tests/twoFactor.test.js`：TOTP 绑定/校验/解绑、备份码一次性、邮箱码发送/限频/过期、pending token 拒绝业务接口、reauth 428→通过、fail-open（关总开关）。
17. `backend/package.json` `test` 脚本追加 `tests/twoFactor.test.js`。
18. `backend/.env.example`：追加 `TWO_FACTOR_*` 注释与「SMTP 可在设置页配置」说明。

## Workspace setup

- 实施前运行 `git status --short` 与 `git branch --show-current`。
- 若 working tree 干净且本 plan 会改代码/迁移/测试，先询问是否创建 worktree（`git worktree add -b codex/security-2fa ../freight-system-security-2fa`）。
- 若当前分支为 `main`/`master`/`release/*`，默认推荐 worktree。
- 若 tree 已 dirty，先保护现有改动，勿混入本 plan。

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| pending token 被暴力猜测 | 5 分钟短效 + 密钥签名 + 限定仅 2fa 端点 + 校验次数限 `maxAttempts` |
| TOTP/备份码/SMTP 密码泄露 | 全部经 `encryptSecret`(AES-256-GCM) 加密存储；备份码存哈希一对一 |
| SMTP 未配置导致邮箱通道失效 | `resolveChannel` 返回 null → fail-open，登录/2FA 不阻断，记录告警 |
| 开启总开关后锁死全员 | 默认 fail-open（关总开关即跳过）；绑定前用户可先用邮箱码过渡 |
| 用户丢失 TOTP | 备份码一次性兜底 + 管理员在用户管理重置（复用既有 updateUser） |
| 敏感复核误伤正常操作 | 仅挂高危端点（结账/冲销/删除），且前端在 428 时弹出 2FA 提示重试 |

## Verification steps

- 验证 AC-1/AC-2：设 `security2faEnabled=on`，给用户标记 2FA → 登录返回 `pending`，无 token 访问 `/api/orders` 回 401。
- 验证 AC-3：发邮箱码 → 收信 → 正确码签发 token；错误/过期码拒绝；60s 内重发被限。
- 验证 AC-4：TOTP 二维码绑定 → 正确码通过、解绑生效、备份码用后即失效。
- 验证 AC-5：关总开关 → 已绑定用户直接登录成功。
- 验证 AC-6：已绑定用户无 reauth 头调 `POST /finance/periods/:code/close` 回 428；带有效 reauth 头通过。
- 验证 AC-7：`npm install && npm test && npm run lint`（0 error）。
- 验收 all：`git diff` 核对 ADR 与 Implementation steps。

## Pre-mortem (deliberate)

1. **Scenario**：某管理员开启总开关后忘记自身已绑定，退出登录被锁。
   **Trigger**：`me` 返回需 2FA，但该账号从未绑定 TOTP 且邮箱码通道被关。
   **Mitigation**：总开关页二次确认 + 提示「开启前请先确保 admin 已绑定」；邮箱通道 fail-open 兜底；保留管理员可经用户管理重置。

2. **Scenario**：SMTP 企业邮箱授权码输错，邮箱验证码全体失效。
   **Trigger**：`resolveChannel` 拿到错误 pass，`sendMail` 抛错。
   **Mitigation**：「SMTP 配置」页强制先「测试发信」成功才允许保存；发送失败仅记日志不抛错阻断（沿用 notificationService fail-open 约定）。

3. **Scenario**：迁移在已有生产库执行失败（ENUM 冲突）。
   **Trigger**：同一 `twoFactorType` ENUM 二次迁移。
   **Mitigation**：沿用项目约定 `DROP TYPE IF EXISTS` + `IF NOT EXISTS` 幂等写法；`npm run db:migrate` 前先备份（沿用既有备份流程）。

## Expanded test plan (deliberate)

- **Unit**：`twoFactorService` 的 TOTP 生成/校验、备份码哈希与一次性、邮箱码生成/过期/限频、pending/reauth token 签名校验、`needs2fa` 判定矩阵（总开关/通道/用户标记）。
- **Integration**：`authController.login` 2FA 分支（pending 响应、无 refresh cookie）；`post2faVerify` 成功签发正式会话；`updateUser` 透传 `twoFactorEnabled`；`notificationService` SMTP 优先读库回退 env。
- **E2E**：前端登录 2FA 步骤（Login.vue）、敏感操作 428→弹 2FA→重试成功（SystemManage/Finance 页）、TOTP 绑定流程。
- **Observability**：新增 `twoFactor.login_2fa_required`、`twoFactor.email_send_fail`、`twoFactor.reauth_denied` 计数（prom-client，参照 `metricsService.js`）；2FA 事件写 AuditLog（`auditService`）。

## ADR

- **Decision**：采用「CompanyProfile 单行托管安全开关 + SMTP」+「签名短效 JWT 承载 pending/reauth」+「otplib TOTP + 邮箱 OTP 双通道」实现 2FA。
- **Drivers**：低侵入上线（driver 1）、维护成本（driver 2）、加密存储（driver 3）、依赖方向契约（driver 4）。
- **Alternatives considered**：
  - Option B（暂态凭证建表）→ rejected，5 分钟过渡态引入表管理不划算。
  - Option C（FIDO 本期）→ rejected，spec out-of-scope，改动面大。
  - speakeasy vs otplib → chosen otplib（维护活跃、API 简洁、RFC 6238 兼容）。
- **Why chosen**：CompanyProfile 单行已是系统默认配置的既有模式（`defaultCurrency`），零新增表；短效签名 JWT 复用现有 JWT 体系、无状态自过期；SMTP 存库覆盖 env 满足"设置页可配企业邮箱"的核心诉求。
- **Consequences**：受 2FA 影响的新登录/敏感操作会增加一步交互；pending token 无服务端即时吊销（5 分钟窗口可接受）；需新增 2 个 npm 依赖。
- **Follow-ups**：FIDO/WebAuthn（二期）；短信通道（未纳入）；备份码 UI 完善与人工重置后台流水。

## Review trail

- Planner draft v1：最小 path = CompanyProfile 单行 + 签名短效 JWT + otplib，≥2 viable options。
- Architect challenge v1（见下）。
- Critic verdict v1：APPROVED with reservations（见下）。
- Final iterations: 1 / 3

### Architect challenge (v1)

- **Steelman against favored option**：最有力反方——"短效签名 JWT 无服务端吊销"。若 pending/reauth token 在被签发后 5 分钟内账号被禁用/改密，token 仍有效到自然过期。反方论点：鉴权场景应具备服务端即时吊销能力。若成立，应改用 Sessions 表方案（Option B）。**回应**：pending token 仅能访问 2fa 端点且 5 分钟短效，禁用/改密场景由 `tokenVersion` 校验在正式 token 层兜底；reauth token 3 分钟且仅限单个高危操作，风险窗口极窄。为降低风险，reauth 校验时额外比对 `user.tokenVersion`（与 `authRequired` 一致），若被改密则即时失效。
- **Tradeoff tension**：速度/简单（Option A 零表） vs 可撤销性（Option B 表）。**取舍依据**：内部低并发系统 + 极端短效窗口，选简单；tokenVersion 兜底撤销。
- **Synthesis path**：不融合；A 为主，B 的表撤销能力由 `tokenVersion` 比对替代。
- **Principle violations**：无违反（最小代码、外科手术、不假设均满足）。

### Critic verdict (v1)

| 维度 | 状态 | 备注 |
|---|---|---|
| Principle consistency | ✓ | 复用 crypto/notification/session 链路，无新认证框架 |
| Alternative exploration | ✓ | A/B/C 真候选，B/C 有 invalidation rationale |
| Risk mitigation clarity | ✓ | 每行 risk 有具体 mitigation |
| AC testability | ✓ | 全部二值可执行 |
| Verification concreteness | ✓ | 命令/端点/测试名明确 |
| File/line coverage | ✓ | 18 步均 cite 文件与行号 |
| Pre-mortem present | ✓ | 3 个场景 + trigger + mitigation |
| Expanded test plan present | ✓ | unit/integration/e2e/observability 各一段 |

**Verdict: APPROVED**

**Reservations**（至少 1 条，防软通过）：
- Implementation step 9 把 `requireReauthIfEnabled` 挂到 7 个端点，但**未覆盖「批量删除」类端点内的循环删除**（如 `POST /finance/batch-delete` 内部逐行删）——中间件只挡了入口，不挡内部逻辑。Mitigation 建议：批量端点同样适用，且复核一次授权整批（reauth token 有效期内），已隐含；但需在实现时确认 `batchRemove` 不会再内联触发其他敏感行为。
- Implementation step 5 的邮箱码存内存 Map，**多实例部署时内存态不共享**（代码注释已提 Redis 可选）。当前系统为单实例（见架构决策），可接受；若未来多实例需迁 Redis。已列入 Follow-ups 意识。
- `smtpTest` 需在**保存前**用提交的配置试发而非仅用已存配置，step 10 未明确该顺序；建议实现为"试发用表单值，成功才落库"。

### Critic notes (过关补充)

- 采纳 Architect 的 tokenVersion 兜底：reauth 校验时比对 `user.tokenVersion`，改密即失效。
- 采纳 Critic reservation 3：`smtpTest` 用表单值试发，成功才保存。