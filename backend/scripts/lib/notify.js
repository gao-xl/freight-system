// 运维脚本独立通知模块（不依赖数据库 / 后端进程）
// ---------------------------------------------------------------
// 用途：供 ops-daily.js（每日备份+异地同步）与 ops-healthcheck.js（宕机告警）
// 在「后端可能已宕机、数据库可能不可用」时仍能外发告警。
// 因此本模块只读 .env 环境变量，不 require src/models / src/config，
// 不写 NotificationRecord（数据库挂了也不影响告警送达）。
//
// 渠道与主系统一致（见 src/services/notificationService.js）：
//   - email          邮件（SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / NOTIFY_EMAIL_TO）
//   - wechat_webhook 企业微信群机器人（WECHAT_WEBHOOK）
//   - webhook        通用 HTTP Webhook（WEBHOOK_URL）
// 缺配置/未启用自动跳过（fail-open），默认零副作用。
// ---------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const FETCH_TIMEOUT_MS = 10000;

// 加载 .env：优先 backend/.env，其次仓库根 .env（与 backup.js 的 findEnvFile 一致）
function loadEnv() {
  const candidates = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}
loadEnv();

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function channelConfig(channel) {
  const e = process.env;
  if (channel === 'email') {
    if (!e.SMTP_HOST) return null;
    return {
      host: e.SMTP_HOST,
      port: parseInt(e.SMTP_PORT) || 465,
      user: e.SMTP_USER || '',
      pass: e.SMTP_PASS || '',
      from: e.SMTP_FROM || (e.SMTP_USER ? `货代系统 <${e.SMTP_USER}>` : ''),
      to: e.NOTIFY_EMAIL_TO || '',
      enabled: e.NOTIFY_EMAIL !== 'off',
    };
  }
  if (channel === 'wechat_webhook') {
    if (!e.WECHAT_WEBHOOK) return null;
    return { url: e.WECHAT_WEBHOOK, enabled: e.NOTIFY_WECHAT !== 'off' };
  }
  if (channel === 'webhook') {
    if (!e.WEBHOOK_URL) return null;
    return { url: e.WEBHOOK_URL, enabled: e.NOTIFY_WEBHOOK !== 'off' };
  }
  return null;
}

async function sendEmail(cfg, { subject, text }) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: Number(cfg.port) === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transporter.sendMail({ from: cfg.from, to: cfg.to, subject, text });
}

async function sendWechat(cfg, content) {
  const res = await fetchWithTimeout(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content } }),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
  const body = await res.json();
  if (body.errcode !== 0) throw new Error(`企微返回 errcode=${body.errcode} ${body.errmsg || ''}`);
  return body;
}

async function sendWebhook(cfg, { eventType, payload }) {
  const res = await fetchWithTimeout(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: eventType,
      time: new Date().toISOString(),
      data: payload,
      source: 'freight-system-ops',
    }),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
  return res.json();
}

/**
 * 向全部已配置渠道推送一条运维消息。
 * @param {object} opts
 * @param {string} opts.eventType  事件类型（ops.backup.completed / ops.down / ops.recovered ...）
 * @param {string} opts.title      标题（企微正文首行 / 邮件主题）
 * @param {string} opts.message    详情（企微正文 / 邮件正文）
 * @param {object} [opts.payload]  附加数据（webhook 用）
 * @returns {Promise<Array<{channel:string,status:string,error?:string}>>}
 */
async function notify({ eventType, title, message, payload = {} }) {
  const channels = ['email', 'wechat_webhook', 'webhook'];
  const results = [];
  for (const channel of channels) {
    const cfg = channelConfig(channel);
    if (!cfg || cfg.enabled === false) continue;
    const rec = { channel, status: 'sent' };
    try {
      if (channel === 'email') {
        await sendEmail(cfg, {
          subject: `【货代系统】${title}`,
          text: `事件：${eventType}\n时间：${new Date().toISOString()}\n\n${message}\n\n${JSON.stringify(payload).slice(0, 800)}`,
        });
      } else if (channel === 'wechat_webhook') {
        await sendWechat(cfg, `【${title}】\n${message}`);
      } else if (channel === 'webhook') {
        await sendWebhook(cfg, { eventType, payload: { title, message, ...payload } });
      }
    } catch (e) {
      rec.status = 'failed';
      rec.error = String(e.message || e).slice(0, 300);
    }
    results.push(rec);
  }
  return results;
}

module.exports = { notify, channelConfig, loadEnv };
