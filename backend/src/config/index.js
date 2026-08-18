const crypto = require('crypto');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// 生产/测试环境强制 JWT_SECRET，防止默认密钥被伪造
// 生产环境必须设置环境变量 JWT_SECRET，缺失则拒绝启动
if (isProd && !process.env.JWT_SECRET) {
  throw new Error('生产环境必须设置环境变量 JWT_SECRET（高强度随机串）');
}
if (isTest && !process.env.JWT_SECRET) {
  throw new Error('测试环境必须设置环境变量 JWT_SECRET（高强度随机串）');
}

// JWT 密钥：生产/测试用环境变量；仅开发环境允许一次性随机生成（绝不写死）
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET && !isTest) {
  // eslint-disable-next-line no-console
  console.warn('[CONFIG] 开发环境使用随机 JWT_SECRET（本次进程有效），生产环境请通过环境变量配置高强度密钥（参考 .env.example）');
}

module.exports = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  isProd,
  // 启动自动迁移：默认开启（OPC 零命令友好）；AUTO_MIGRATE=false 关闭（大客户/超大生产库自控锁表风险）
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  // 无人值守部署备选：设置后 Bootstrap 直接创建 admin（mustChangePassword=true 强制首登改密）
  adminInitPassword: process.env.ADMIN_INIT_PASSWORD || '',
  jwtSecret,
  // M2 修复：监控抓取令牌（Prometheus/Grafana 用）。生产环境 /api/metrics 必须携带该令牌
  // 或持有 admin 权限的登录会话方可访问；未配置时生产环境仅允许 admin 会话访问。
  metricsToken: process.env.METRICS_TOKEN || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  // M3 refresh token 有效期（默认 30 天），登录/刷新时签发 opaque token 存 Sessions 表
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  db: {
    dialect: process.env.DB_DIALECT || 'postgres',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'freight',
    user: process.env.DB_USER || 'freight',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    // 单条 SQL 超时（ms）：防止慢查询/失控查询占死连接池，默认 10s
    statementTimeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 10000,
    // 连接池：默认 30 以应对并发请求（生产并发较开发更高，避免池满载排队）
    pool: { max: parseInt(process.env.DB_POOL_MAX) || 30, min: 0, idle: 10000 },
    logging: false,
  },
  // AuditLog 保留天数：0 表示关闭自动清理（默认关闭，避免意外删审计）；>0 启用每日清理
  auditRetentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS) || 0,
  // CORS 白名单（逗号分隔），生产必填
  // D5 修复：过滤空串/纯空格项，避免 CORS_ORIGIN="" 时白名单混入空字符串
  corsOrigins: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  // 限流参数
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 分钟
    max: parseInt(process.env.RATE_LIMIT_MAX) || 300, // 全局限流
    loginMax: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 20, // 登录次数
  },
  // S3 登录锁定：连续失败 maxFails 次锁定 lockoutMinutes 分钟（防撞库爆破）
  loginLock: {
    maxFails: parseInt(process.env.LOGIN_LOCK_MAX_FAILS) || 5,
    lockoutMinutes: parseInt(process.env.LOGIN_LOCK_MINUTES) || 15,
  },
  // S4 二次认证(2FA)：pending/reauth 短效 token 与邮箱验证码的时效/限频参数
  twoFactor: {
    pendingTtl: process.env.TWO_FACTOR_PENDING_TTL || '5m', // 登录 2FA 暂态 token 有效期
    reauthTtl: process.env.TWO_FACTOR_REAUTH_TTL || '3m', // 敏感操作复核 token 有效期
    codeTtlMs: parseInt(process.env.TWO_FACTOR_CODE_TTL_MS) || 300000, // 邮箱验证码有效期(5 分钟)
    resendWindowMs: parseInt(process.env.TWO_FACTOR_RESEND_WINDOW_MS) || 60000, // 重发最小间隔(60s)
    maxAttempts: parseInt(process.env.TWO_FACTOR_MAX_ATTEMPTS) || 5, // 单次暂态期最多校验次数
  },
  // 外部系统对接配置（端口/海关/财务等），可在运行期通过 IntegrationConfig 表动态维护
  integrations: {
    port: process.env.PORT_SVC_URL || 'http://localhost:4001',
    customs: process.env.CUSTOMS_SVC_URL || 'http://localhost:4002',
    finance: process.env.FINANCE_SVC_URL || 'http://localhost:4003',
  },
  // E1 外部跟踪自动拉取：默认开启；适配器无 IntegrationConfig 密钥（未启用/无 apiKey）时自动跳过（fail-open）
  trackAutoPull: {
    enabled: process.env.TRACK_AUTO_PULL !== 'off', // 总开关，默认开
    schedule: process.env.TRACK_AUTO_PULL_SCHEDULE !== 'off', // 船期同步（每 6h）
    ais: process.env.TRACK_AUTO_PULL_AIS !== 'off', // AIS 船位（每 2h）
    yard: process.env.TRACK_AUTO_PULL_YARD !== 'off', // 场站状态（每 4h）
  },
  // E2 通知推送：渠道缺配置/未启用时自动跳过（fail-open），默认零副作用
  notification: {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: parseInt(process.env.SMTP_PORT) || 465,
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFrom: process.env.SMTP_FROM || '',
    emailTo: process.env.NOTIFY_EMAIL_TO || '',
    smtpEnabled: process.env.NOTIFY_EMAIL !== 'off', // NOTIFY_EMAIL=off 关闭邮件渠道
    wechatWebhook: process.env.WECHAT_WEBHOOK || '',
    wechatEnabled: process.env.NOTIFY_WECHAT !== 'off', // NOTIFY_WECHAT=off 关闭企微渠道
    webhookUrl: process.env.WEBHOOK_URL || '',
    webhookEnabled: process.env.NOTIFY_WEBHOOK !== 'off', // NOTIFY_WEBHOOK=off 关闭通用渠道
    // P2-4 客户通知渠道：微信订阅号模板消息（公众号）。WECHAT_MP_OPENIDS 为接收模板消息的 openid 列表（逗号分隔）
    wechatMpAppId: process.env.WECHAT_MP_APPID || '',
    wechatMpSecret: process.env.WECHAT_MP_SECRET || '',
    wechatMpTemplate: process.env.WECHAT_MP_TEMPLATE || '',
    wechatMpOpenIds: String(process.env.WECHAT_MP_OPENIDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    wechatMpEnabled: process.env.NOTIFY_WECHAT_MP !== 'off', // NOTIFY_WECHAT_MP=off 关闭客户微信渠道
    // 可选订阅的关键业务事件（逗号分隔），默认只推送预警；如 order.created,order.transitioned
    businessEvents: process.env.NOTIFY_BUSINESS_EVENTS || '',
  },
  // F7 缓存：REDIS_URL 已设置时启用 Redis 共享缓存，否则退回进程内内存缓存（单实例）
  cache: {
    redisUrl: process.env.REDIS_URL || '',
    // 方案 A：高频只读接口读缓存 TTL（秒）。看板类短 TTL（容忍 30s 短暂过期），
    // 运价类参考数据给较长 TTL + 写事件失效（见 freight-rate 模块订阅）。
    dashboardTtl: parseInt(process.env.CACHE_DASHBOARD_TTL) || 30,
    rateTtl: parseInt(process.env.CACHE_RATE_TTL) || 300,
  },
  // PDF 渲染：低配服务器可选项，用于规避无头浏览器(Chromium)的打印峰值内存
  //   PDF_RENDERER=chromium（默认） 无头浏览器渲染，版式最完整，峰值内存最高
  //   PDF_RENDERER=pdfkit          轻量纯文本渲染，不拉起 Chromium，几乎不占内存，版式降级
  //   PDF_RENDERER=off             关闭 PDF 生成（单证仍保留 HTML 预览/打印能力）
  pdf: {
    renderer: process.env.PDF_RENDERER || 'chromium',
    // 并发渲染上限：低配服务器务必设 1，防止多用户同时打印时 Chromium 内存叠加导致 OOM。
    // 超过该值的打印请求排队等待（信号量），不阻塞其它普通接口。
    maxConcurrency: parseInt(process.env.PDF_MAX_CONCURRENCY) || 1,
    // 渲染结果缓存 TTL（秒）：同一单据重复打印时复用上次结果，显著降低渲染与查库压力。
    // 0 或缺失表示关闭缓存（数据极其敏感、每次都要最新时设为 0）。
    cacheTtl: parseInt(process.env.PDF_CACHE_TTL) || 60,
  },
  // 备份调度（强制月度备份 + 超期提醒/补备）
  // 默认强制开启（fail-closed）：BACKUP_AUTO=off 才整体关闭（仅特殊场景，如外部 cron 已接管）
  backup: {
    auto: process.env.BACKUP_AUTO !== 'off',
    // 月度自动备份 cron：默认每月 1 号 03:30
    schedule: process.env.BACKUP_CRON || '30 3 1 * *',
    // 每日超期检查 cron：默认每日 09:00
    freshnessCron: process.env.BACKUP_FRESHNESS_CRON || '0 9 * * *',
    // 超期阈值（天）：距上次备份超过该值则提醒并（强制时）补备
    maxAgeDays: parseInt(process.env.BACKUP_MAX_AGE_DAYS) || 35,
    // 保留份数
    keep: parseInt(process.env.BACKUP_KEEP) || 7,
    // 备份输出目录（默认 backend/backups）
    dir: process.env.BACKUP_DIR || '',
  },
};