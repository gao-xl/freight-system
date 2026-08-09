// 系统健康检查服务（GET /api/system/health 数据源）
// 聚合 Node / 磁盘 / 端口 / 数据目录 / 数据库 / 迁移六项三态检查。
// 安全：detail 与 fix 不泄露敏感路径与密钥（数据目录以语义描述表示，不含真实路径）。
const fs = require('fs');
const path = require('path');
const net = require('net');
const config = require('../config');
const { sequelize } = require('../models');

// 数据目录（逻辑数据目录，非数据库文件位置），仅内部使用，不对外输出
function resolveDataDir() {
  return path.resolve(__dirname, '../../data');
}

async function checkNode() {
  const v = process.version;
  const major = parseInt(v.replace('v', '').split('.')[0], 10);
  if (major >= 18) return { item: 'node', status: 'ok', detail: `Node 运行时 ${v}` };
  return { item: 'node', status: 'fail', detail: `Node 运行时 ${v}`, fix: '请安装 Node 18 及以上版本' };
}

async function checkDisk() {
  const dataDir = resolveDataDir();
  try {
    const s = fs.statfsSync(dataDir);
    const freeGb = (Number(s.bavail) * Number(s.bsize)) / 1024 / 1024 / 1024;
    const status = freeGb >= 0.5 ? 'ok' : 'warn';
    return {
      item: 'disk',
      status,
      detail: `数据目录剩余空间 ${freeGb.toFixed(1)} GB`,
      ...(status === 'ok' ? {} : { fix: '请清理磁盘空间，保证数据目录剩余空间充足' }),
    };
  } catch (e) {
    return { item: 'disk', status: 'warn', detail: '数据目录空间读取失败', fix: '请检查数据目录挂载与权限' };
  }
}

function checkPort() {
  const port = config.port;
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => done({ item: 'port', status: 'ok', detail: `服务端口 ${port} 可达` }));
    socket.once('error', () => done({ item: 'port', status: 'fail', detail: `服务端口 ${port} 不可达`, fix: `请确认后端已启动并监听 ${port} 端口` }));
    socket.setTimeout(2000, () => done({ item: 'port', status: 'fail', detail: `服务端口 ${port} 响应超时`, fix: `请确认后端已启动并监听 ${port} 端口` }));
  });
}

function checkDataDir() {
  const dataDir = resolveDataDir();
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    const probe = path.join(dataDir, `.health-probe-${process.pid}.tmp`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return { item: 'dataDir', status: 'ok', detail: '数据目录可写' };
  } catch (e) {
    return { item: 'dataDir', status: 'fail', detail: '数据目录不可写', fix: '请检查数据目录权限（chmod 755）或磁盘只读状态' };
  }
}

async function checkDb() {
  try {
    await sequelize.authenticate();
    return { item: 'db', status: 'ok', detail: `数据库可达（${config.db.dialect}）` };
  } catch (e) {
    return { item: 'db', status: 'fail', detail: '数据库连接失败', fix: '请检查数据库服务与连接配置（DB_HOST/DB_NAME/DB_USER）' };
  }
}

async function checkMigration() {
  const migDir = path.join(__dirname, '../../migrations');
  let files = [];
  try {
    files = fs.readdirSync(migDir).filter((f) => f.endsWith('.js')).sort();
  } catch (e) {
    return { item: 'migration', status: 'warn', detail: '迁移目录读取失败', fix: '请检查后端安装完整性' };
  }
  try {
    const rows = await sequelize.query('SELECT name FROM "SequelizeMeta"', { type: sequelize.QueryTypes.SELECT });
    const done = new Set(rows.map((r) => r.name));
    const pending = files.filter((f) => !done.has(f));
    if (pending.length === 0) return { item: 'migration', status: 'ok', detail: `迁移已全部执行（${files.length} 个）` };
    return { item: 'migration', status: 'warn', detail: `有 ${pending.length} 个迁移待执行`, fix: '请重启后端自动执行迁移，或运行 npm run db:migrate' };
  } catch (e) {
    return { item: 'migration', status: 'warn', detail: '迁移状态读取失败', fix: '请重启后端自动执行迁移' };
  }
}

// 汇总：summary 取最差状态（任一 fail 为 fail，否则任一 warn 为 warn，全部 ok 为 ok）
async function collectHealth() {
  const checks = await Promise.all([checkNode(), checkDisk(), checkPort(), checkDataDir(), checkDb(), checkMigration()]);
  const rank = { ok: 0, warn: 1, fail: 2 };
  let summary = 'ok';
  for (const c of checks) {
    if (rank[c.status] > rank[summary]) summary = c.status;
  }
  return { checks, summary };
}

module.exports = { collectHealth, resolveDataDir };
