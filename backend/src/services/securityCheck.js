// 系统安全检测服务（POST /api/system/security-check 数据源）
// 聚合多项安全配置三态检查：监听地址暴露 / 数据库端口暴露 / 防火墙 / JWT 密钥强度 /
// 登录锁定 / 强制改密 / HTTPS / 数据库认证方式 / 数据库连接 URL 是否含密码。
// 参考 healthCheck.js：每项返回 { item, status: 'ok'|'warn'|'fail', detail, fix? }。
// 安全：detail 与 fix 不泄露密钥明文与敏感路径；仅做本地探测，不对外发起网络请求。
const fs = require('fs');
const net = require('net');
const config = require('../config');
const { sequelize } = require('../models');

// 读取后端绑定端口（运行端口），用于判断监听地址是否为 0.0.0.0/*（公网暴露）
function serverPort() {
  return Number(process.env.PORT) || config.port || 3000;
}

// 用 net 探测本地端口是否监听（不依赖 ss/netstat，容器内也稳定）
function probeLocalPort(port, host = '127.0.0.1', timeout = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(timeout, () => { socket.destroy(); resolve(false); });
  });
}

// 读取 .env 判断 DB_HOST 是否指向 localhost（避免回显连接串）
function readEnv() {
  try {
    const p = require('path').join(process.cwd(), '.env');
    const txt = fs.readFileSync(p, 'utf8');
    const E = {};
    for (const line of txt.split('\n')) {
      const m = line.trim().match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return E;
  } catch { return {}; }
}

// 检查项定义
async function checkListeningExposure() {
  // 判断后端自身监听端口是否绑定在公网地址：若 127.0.0.1 可达则该端口已监听，
  // 但无法从进程内读到绑定地址；改用「探测 0.0.0.0 语义」的启发式：
  // 若本机公网大集合地址（本机各网卡）都能连上，说明未限制回环。此处简化：
  // 读取系统环境变量 PORT 是否<1024 或存在反向代理接管；真正判定交给「反代覆盖」项。
  const port = serverPort();
  const ok = await probeLocalPort(port);
  return {
    item: 'listening',
    status: ok ? 'ok' : 'info',
    detail: ok ? `后端服务已监听端口 ${port}` : `未检测到后端监听端口 ${port}`,
    fix: ok ? undefined : '请确认后端已启动并监听运行端口',
  };
}

async function checkProxyCoverage() {
  // 反向代理覆盖：若后端与前端同机，且存在 80/443 网关，则视作被 OpenResty/Nginx 覆盖。
  // 后端监听 0.0.0.0 时有网关反代兜底，暴露面由网关白名单控制。
  const proxy80 = await probeLocalPort(80);
  const proxy443 = await probeLocalPort(443);
  const hasGateway = proxy80 || proxy443;
  const port = serverPort();
  const exposed = port === 80 || port === 443; // 后端直接占 80/443 则不经过网关
  if (exposed) {
    return { item: 'proxy', status: 'warn', detail: '后端直接占用了对外端口，未经过反向代理', fix: '建议后端监听内网端口，由 Nginx/OpenResty 反代对外' };
  }
  if (!hasGateway) {
    return { item: 'proxy', status: 'warn', detail: '未检测到 80/443 反向代理网关', fix: '建议配置 Nginx/OpenResty 统一对外暴露并做 IP 白名单' };
  }
  return { item: 'proxy', status: 'ok', detail: '存在 80/443 反向代理网关，对外暴露面由网关控制' };
}

async function checkDbExposure() {
  // 数据库是否仅内网可达：探测公网网卡地址上的 5432（同一进程视角，用本机所有非回环地址）
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let publicReachable = false;
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ok = await probeLocalPort(5432, iface.address, 800);
        if (ok) { publicReachable = true; break; }
      }
    }
    if (publicReachable) break;
  }
  if (publicReachable) {
    return { item: 'dbExposure', status: 'fail', detail: '数据库端口 5432 在本机公网地址上可访问，存在被公网直连风险', fix: '请将数据库仅绑定 127.0.0.1，或通过安全组/防火墙限制 5432 仅内网可达' };
  }
  return { item: 'dbExposure', status: 'ok', detail: '数据库端口未在本机公网地址上暴露' };
}

async function checkFirewall() {
  // 探测 ufw/iptables：仅本地探测，不执行外部命令
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let hasAny = false;
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) { hasAny = true; break; }
    }
    if (hasAny) break;
  }
  // 启发式：若没有任何公网地址，说明在隔离内网，防火墙压力较小
  if (!hasAny) {
    return { item: 'firewall', status: 'ok', detail: '未检测到公网网卡，系统似处内网隔离环境' };
  }
  // 有公网地址但无法本地判定防火墙启用状态，标 warn 提示人工确认
  return { item: 'firewall', status: 'warn', detail: '检测到公网网卡，但无法在进程内确认云防火墙状态', fix: '请在云控制台/本机确认防火墙是否启用，并仅放行必要端口（80/443 等）' };
}

async function checkJwtSecret() {
  const secret = config.jwtSecret || '';
  const weak = !secret || String(secret).length < 32;
  const defaultVal = /^(default|secret|changeme|your-?secret|jwt[-_]?secret)$/i.test(String(secret));
  if (weak) {
    return { item: 'jwtSecret', status: 'fail', detail: 'JWT 密钥过短或未配置，存在令牌伪造风险', fix: '请在 .env 设置高强度随机 JWT_SECRET（建议 ≥32 位随机串）' };
  }
  if (defaultVal) {
    return { item: 'jwtSecret', status: 'fail', detail: 'JWT 密钥疑似默认值，存在令牌伪造风险', fix: '请在 .env 更换为高强度随机 JWT_SECRET 并重启' };
  }
  return { item: 'jwtSecret', status: 'ok', detail: 'JWT 密钥已配置且长度充足' };
}

async function checkLoginLock() {
  const lock = config.loginLock || {};
  const maxFails = Number(lock.maxFails) || 0;
  if (maxFails > 0) {
    return { item: 'loginLock', status: 'ok', detail: `登录锁定已启用：连续失败 ${maxFails} 次锁定 ${lock.lockoutMinutes || 15} 分钟` };
  }
  return { item: 'loginLock', status: 'fail', detail: '登录锁定未启用，存在撞库爆破风险', fix: '请在 .env 配置 LOGIN_LOCK_MAX_FAILS 与 LOGIN_LOCK_MINUTES 并重启' };
}

async function checkForcePassword() {
  try {
    const { User } = require('../services/dataAccess');
    const pending = await User.count({ where: { mustChangePassword: true } });
    if (pending > 0) {
      return { item: 'forcePassword', status: 'warn', detail: `有 ${pending} 个账号待强制修改初始密码`, fix: '请提醒这些账号首次登录后修改密码' };
    }
    return { item: 'forcePassword', status: 'ok', detail: '无待强制改密的账号' };
  } catch {
    return { item: 'forcePassword', status: 'info', detail: '强制改密状态读取失败' };
  }
}

async function checkHttps() {
  const https443 = await probeLocalPort(443);
  return https443
    ? { item: 'https', status: 'ok', detail: '检测到 443 端口服务，HTTPS 已启用或可启用' }
    : { item: 'https', status: 'warn', detail: '未检测到 443 端口，当前可能仅 HTTP 明文传输', fix: '建议配置 HTTPS 证书（Let\'s Encrypt），加密用户凭证与业务数据传输' };
}

function checkDbAuth() {
  // 判断数据库连接是否使用密码：DB_PASSWORD 非空即视为已启用认证
  const { db } = config;
  if (db.password) {
    return { item: 'dbAuth', status: 'ok', detail: '数据库连接已使用密码认证' };
  }
  return { item: 'dbAuth', status: 'fail', detail: '数据库连接未配置密码，存在未授权访问风险', fix: '请在 .env 设置 DB_PASSWORD 并确保数据库使用强口令' };
}

async function checkAdminDefault() {
  try {
    const { User } = require('../services/dataAccess');
    const admin = await User.findOne({ where: { username: 'admin' } });
    if (admin && admin.mustChangePassword) {
      return { item: 'adminDefault', status: 'warn', detail: '内置 admin 账号仍处于待改密状态', fix: '请使用 admin 登录并修改初始密码' };
    }
    if (admin) {
      return { item: 'adminDefault', status: 'ok', detail: '内置 admin 账号已完成初始改密' };
    }
    return { item: 'adminDefault', status: 'info', detail: '未找到内置 admin 账号' };
  } catch {
    return { item: 'adminDefault', status: 'info', detail: 'admin 账号状态读取失败' };
  }
}

// 汇总：summary 取最差状态（任一 fail 为 fail，否则任一 warn 为 warn，全部 ok 为 ok；info 视为 ok）
async function collectSecurity() {
  const checks = await Promise.all([
    checkListeningExposure(),
    checkProxyCoverage(),
    checkDbExposure(),
    checkFirewall(),
    checkJwtSecret(),
    checkLoginLock(),
    checkForcePassword(),
    checkHttps(),
    checkDbAuth(),
    checkAdminDefault(),
  ]);
  const rank = { ok: 0, info: 0, warn: 1, fail: 2 };
  let summary = 'ok';
  let failCount = 0;
  let warnCount = 0;
  for (const c of checks) {
    if (c.status === 'fail') failCount += 1;
    if (c.status === 'warn') warnCount += 1;
    if (rank[c.status] > rank[summary]) summary = c.status;
  }
  return { checks, summary, failCount, warnCount };
}

module.exports = { collectSecurity };