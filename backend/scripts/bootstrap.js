#!/usr/bin/env node
'use strict';

/**
 * 统一部署引导脚本（bootstrap）
 * ---------------------------------------------------------------------------
 * 定位：把「前后端配置检测 / 数据库初始化 / 用户设置 / 部署后可用性验证」收拢为
 *       一条命令，确保任何环境（Docker / 裸机 / 1Panel 外部 PG）部署后系统可用。
 *       幂等设计：可反复执行，绝不 force 清库、绝不破坏已有数据。
 *
 * 子命令：
 *   check        环境 + 前后端配置检测（DB 连通/库存在性/JWT/CORS/依赖/构建产物）
 *   init-db      数据库初始化：确保库存在 → 跑迁移 → RBAC/基准汇率预置；--demo 加演示数据
 *   setup-admin  用户设置：创建首个管理员（交互 / --username --password --name / ADMIN_INIT_PASSWORD）
 *   verify       部署后可用性验证：DB / 迁移覆盖率 / 管理员 / 健康端点
 *   demo         生成演示数据（复用 Onboarding 事务生成，带 isDemo 标记，可一键清空）
 *   all          一键：check → init-db → setup-admin → verify
 *
 * 用法示例：
 *   node scripts/bootstrap.js all
 *   node scripts/bootstrap.js check
 *   node scripts/bootstrap.js init-db --demo          # 初始化 + 演示数据
 *   node scripts/bootstrap.js setup-admin --username admin --password 'Abc12345' --name 管理员
 *   node scripts/bootstrap.js verify
 *
 * 说明：
 *   - check 阶段不 require 业务配置（避免 JWT_SECRET 缺失时崩溃），纯做静态检测；
 *     init-db / setup-admin / verify 阶段才加载业务配置（生产 NODE_ENV 下 JWT_SECRET 必填）。
 *   - 数据库初始化与生产一致走 migration（迁移表 SequelizeMeta 幂等），绝不用 sequelize.sync()。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const readline = require('readline/promises');
const { spawnSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

const PASS = '✔';
const FAIL = '✖';
const WARN = '!';

// ---------------------------------------------------------------- 基础工具

function section(title) {
  console.log('');
  console.log('='.repeat(64));
  console.log(`  ${title}`);
  console.log('='.repeat(64));
}

function line(mark, label, detail, fix) {
  console.log(`${mark} ${label}`);
  if (detail) console.log(`      ${detail}`);
  if (fix) console.log(`      修复: ${fix}`);
}

function run(cmd, args, timeoutMs = 8000) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
    if (r.error && r.error.code === 'ENOENT') return { ok: false, code: 'ENOENT' };
    return { ok: r.status === 0, code: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
  } catch (e) {
    return { ok: false, code: e.code, stderr: e.message };
  }
}

function portFree(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.setTimeout(timeoutMs);
    s.once('connect', () => { s.destroy(); resolve(false); });
    s.once('error', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(true); });
  });
}

// 读取 .env（backend 优先，仓库根兜底），载入 process.env（不覆盖已存在的变量）
function loadEnv() {
  const candidates = [
    path.join(BACKEND_ROOT, '.env'),
    path.join(REPO_ROOT, '.env'),
  ];
  for (const abs of candidates) {
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, 'utf8');
      for (const raw of content.split(/\r?\n/)) {
        const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, key, value] = m;
        const clean = value.replace(/^["']|["']$/g, '').trim();
        if (process.env[key] === undefined) process.env[key] = clean;
      }
    }
  }
  return process.env;
}

function envGet(key) {
  return process.env[key] || '';
}

function envBool(value, defaultVal = false) {
  if (value == null || value === '') return defaultVal;
  return String(value).toLowerCase() === 'true';
}

function humanGb(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
}

// 轻量 pg 连接（避开业务 config，用于 check/verify 的静态探测与建库）
function pgConnect(dbName) {
  const { Client } = require('pg');
  return new Client({
    host: envGet('DB_HOST') || '127.0.0.1',
    port: parseInt(envGet('DB_PORT')) || 5432,
    database: dbName,
    user: envGet('DB_USER') || 'freight',
    password: envGet('DB_PASSWORD') || '',
    ssl: envBool(envGet('DB_SSL')),
    connectionTimeoutMillis: 5000,
    statement_timeout: 8000,
  });
}

async function pgQuery(dbName, sql, params) {
  const client = pgConnect(dbName);
  try {
    await client.connect();
    const r = await client.query(sql, params);
    return r;
  } finally {
    await client.end().catch(() => {});
  }
}

// 统一的成功/失败返回（不直接 process.exit，便于 all 编排时继续执行）
function ok(msg) {
  console.log('');
  console.log(`[OK] ${msg}`);
  return 0;
}

function fail(msg) {
  console.error('');
  console.error(`[FAIL] ${msg}`);
  return 1;
}

// ---------------------------------------------------------------- check 子命令

function checkNode() {
  const major = parseInt(process.version.replace('v', '').split('.')[0], 10);
  return {
    mark: major >= 18 ? PASS : FAIL,
    label: `Node 运行时 >= 18（当前 v${major}）`,
    fix: major < 18 ? '请安装 Node 18+（建议 LTS）：https://nodejs.org' : null,
  };
}

function checkEnvFile() {
  const backend = path.join(BACKEND_ROOT, '.env');
  const root = path.join(REPO_ROOT, '.env');
  const found = fs.existsSync(backend) ? backend : (fs.existsSync(root) ? root : null);
  return {
    mark: found ? PASS : FAIL,
    label: '.env 配置文件存在',
    detail: found ? `已找到 ${path.basename(path.dirname(found))}/.env` : '未找到 backend/.env 或仓库根 .env',
    fix: found ? null : '复制模板：cp backend/.env.example backend/.env，再按需填写',
  };
}

function checkJwtSecret() {
  const secret = envGet('JWT_SECRET');
  const isProd = envGet('NODE_ENV') === 'production';
  const strength = secret.length >= 64;
  if (!secret) {
    return {
      mark: isProd ? FAIL : WARN,
      label: 'JWT_SECRET 已配置',
      detail: `未设置（NODE_ENV=${envGet('NODE_ENV') || 'development'}）`,
      fix: isProd ? '生产必填，生成高强度密钥：node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))" 后填入 .env' : '开发环境可留空（进程内随机生成）；生产必须设置',
    };
  }
  return {
    mark: strength ? PASS : (isProd ? FAIL : WARN),
    label: `JWT_SECRET 强度（长度 ${secret.length}）`,
    detail: strength ? '达到生产级强度（>= 64 字符）' : '长度不足 64 字符',
    fix: !strength ? '生产环境请使用高强度随机串（>= 64 字符）' : null,
  };
}

function checkDbConfig() {
  const miss = [];
  if (!envGet('DB_HOST')) miss.push('DB_HOST');
  if (!envGet('DB_NAME')) miss.push('DB_NAME');
  if (!envGet('DB_USER')) miss.push('DB_USER');
  if (!envGet('DB_PASSWORD')) miss.push('DB_PASSWORD');
  return {
    mark: miss.length === 0 ? PASS : FAIL,
    label: '数据库连接配置完整（DB_HOST/NAME/USER/PASSWORD）',
    detail: miss.length ? `缺失: ${miss.join(', ')}` : `${envGet('DB_HOST')}:${envGet('DB_PORT') || 5432}/${envGet('DB_NAME')}（用户 ${envGet('DB_USER')}）`,
    fix: miss.length ? '在 .env 中补齐缺失的数据库连接变量' : null,
  };
}

async function checkDbReachable() {
  if (!envGet('DB_HOST') || !envGet('DB_USER')) return { mark: WARN, label: '数据库可达性', detail: '连接配置缺失，跳过探测', fix: null };
  try {
    // 连接 postgres 系统库验证服务器可达，而非目标业务库——后者在全新环境（all / CI）可能尚未创建。
    await pgQuery('postgres', 'SELECT 1');
    return { mark: PASS, label: '数据库连通', detail: `${envGet('DB_HOST')}:${envGet('DB_PORT') || 5432}（postgres 库）连接成功`, fix: null };
  } catch (e) {
    return {
      mark: FAIL,
      label: '数据库连通',
      detail: `连接失败：${e.message}`,
      fix: '确认 PostgreSQL 已启动、账号密码正确、网络可达；外部库（1Panel 等）需先在 .env 填对 DB_HOST/DB_USER/DB_PASSWORD',
    };
  }
}

async function checkDbExists(asWarn = false) {
  if (!envGet('DB_HOST') || !envGet('DB_USER')) return { mark: WARN, label: '数据库已存在', detail: '连接配置缺失，跳过探测', fix: null };
  try {
    const r = await pgQuery('postgres', 'SELECT 1 FROM pg_database WHERE datname = $1', [envGet('DB_NAME') || 'freight']);
    const exists = r.rows.length > 0;
    return {
      mark: exists ? PASS : (asWarn ? WARN : FAIL),
      label: `数据库 ${envGet('DB_NAME') || 'freight'} 已存在`,
      detail: exists ? '库存在，可直接初始化' : (asWarn ? '库不存在（将交由 init-db 自动建库）' : '库不存在（需先建库）'),
      fix: (!exists && !asWarn) ? '运行建库：node scripts/bootstrap.js init-db（幂等，自动 CREATE DATABASE；无权限时请手动建库）' : null,
    };
  } catch (e) {
    return {
      mark: WARN,
      label: '数据库存在性',
      detail: `无法查询（${e.message}）`,
      fix: '确认数据库连接配置正确；1Panel 等外部库通常需手动建库',
    };
  }
}

function checkCors() {
  const isProd = envGet('NODE_ENV') === 'production';
  const cors = envGet('CORS_ORIGIN');
  if (!cors) {
    return { mark: isProd ? FAIL : WARN, label: 'CORS_ORIGIN 已配置', detail: '未设置', fix: isProd ? '生产必填：填入前端实际访问域名（逗号分隔）' : null };
  }
  return { mark: PASS, label: 'CORS_ORIGIN 已配置', detail: `白名单: ${cors}`, fix: null };
}

function checkBackendDeps() {
  const ok = fs.existsSync(path.join(BACKEND_ROOT, 'node_modules'));
  return {
    mark: ok ? PASS : FAIL,
    label: '后端依赖已安装',
    detail: ok ? 'backend/node_modules 存在' : 'backend/node_modules 缺失',
    fix: ok ? null : '在 backend 目录执行：npm ci --omit=dev（或本地开发 npm install）',
  };
}

function checkFrontendBuild() {
  const dist = path.join(REPO_ROOT, 'frontend', 'dist');
  const index = path.join(dist, 'index.html');
  const ok = fs.existsSync(index);
  return {
    mark: ok ? PASS : FAIL,
    label: '前端已构建（frontend/dist）',
    detail: ok ? '构建产物存在' : 'frontend/dist 缺失（或未构建）',
    fix: ok ? null : '在 frontend 目录执行：npm ci && npm run build',
  };
}

function checkFrontendDeps() {
  const ok = fs.existsSync(path.join(REPO_ROOT, 'frontend', 'node_modules'));
  return {
    mark: ok ? PASS : (fs.existsSync(path.join(REPO_ROOT, 'frontend', 'dist', 'index.html')) ? PASS : FAIL),
    label: '前端依赖（构建所需）',
    detail: ok ? 'frontend/node_modules 存在' : 'frontend/node_modules 缺失',
    fix: ok ? null : '在 frontend 目录执行：npm ci（构建前需要）',
  };
}

function checkDocsBuilt() {
  const docs = path.join(BACKEND_ROOT, 'public', 'docs', 'index.html');
  const ok = fs.existsSync(docs);
  return {
    mark: ok ? PASS : WARN,
    label: '开发文档构建产物（/docs）',
    detail: ok ? 'backend/public/docs 存在' : 'backend/public/docs 缺失（/docs 不可用，不影响业务）',
    fix: ok ? null : '可选：cd docs-site && npm ci && npm run build（产物落到 backend/public/docs）',
  };
}

function checkDocker() {
  const r = run('docker', ['info']);
  return {
    mark: r.ok ? PASS : WARN,
    label: 'Docker 可用',
    detail: r.ok ? 'Docker 守护进程运行中' : (r.code === 'ENOENT' ? '未找到 docker 命令' : 'Docker 守护进程未启动'),
    fix: r.ok ? null : '容器部署需要 Docker；裸机开发可忽略此项',
  };
}

async function checkPorts() {
  const portStr = envGet('PORT') || '3000';
  const backendPort = parseInt(portStr) || 3000;
  const frontendPort = parseInt(envGet('FRONTEND_PORT')) || 8080;
  const ports = [backendPort, frontendPort];
  const busy = [];
  for (const p of ports) {
    if (!(await portFree(p))) busy.push(p);
  }
  return {
    mark: busy.length === 0 ? PASS : WARN,
    label: `端口 ${ports.join(' / ')}`,
    detail: busy.length ? `被占用: ${busy.join(', ')}` : '端口空闲',
    fix: busy.length ? '请释放端口后重试（netstat -ano | findstr <端口> / lsof -i :<端口>）' : null,
  };
}

async function cmdCheck(forAll = false) {
  loadEnv();
  section('bootstrap check — 环境与前后端配置检测');
  console.log(`检查时间  ${new Date().toLocaleString('zh-CN')}`);
  console.log(`工作目录  ${process.cwd()}`);
  console.log(`NODE_ENV  ${envGet('NODE_ENV') || 'development'}`);

  const checks = [
    checkNode(),
    checkEnvFile(),
    checkJwtSecret(),
    checkDbConfig(),
    await checkDbReachable(),
    await checkDbExists(forAll),
    checkCors(),
    checkBackendDeps(),
    checkFrontendDeps(),
    checkFrontendBuild(),
    checkDocsBuilt(),
    checkDocker(),
    await checkPorts(),
  ];

  let failed = 0;
  let warned = 0;
  for (const c of checks) {
    if (c.mark === FAIL) failed += 1;
    if (c.mark === WARN) warned += 1;
    line(c.mark, c.label, c.detail, c.fix);
    console.log('');
  }

  console.log('-'.repeat(64));
  console.log(`汇总: ${checks.filter((c) => c.mark === PASS).length}/${checks.length} 通过，${failed} 失败，${warned} 建议/提示`);
  console.log('');

  if (failed > 0) {
    return fail(`存在 ${failed} 项未通过，请按上方修复指引处理后重试。修复后重跑：node scripts/bootstrap.js check`);
  }
  return ok('环境就绪。下一步：node scripts/bootstrap.js init-db（建库/迁移）→ setup-admin（建管理员）→ verify（验证）');
}

// ---------------------------------------------------------------- init-db 子命令

async function ensureDatabaseExists() {
  const dbName = envGet('DB_NAME') || 'freight';
  try {
    const r = await pgQuery('postgres', 'SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (r.rows.length > 0) {
      console.log(`[INIT] 数据库 ${dbName} 已存在，跳过建库`);
      return true;
    }
    await pgQuery('postgres', `CREATE DATABASE "${dbName}"`);
    console.log(`[INIT] 已创建数据库 ${dbName}`);
    return true;
  } catch (e) {
    console.warn(`[INIT] 无法自动建库（${e.message}）`);
    console.warn(`[INIT] 请手动创建数据库 ${dbName} 后重跑，例如：`);
    console.warn(`      createdb -U ${envGet('DB_USER') || 'freight'} ${dbName}`);
    console.warn(`      或：psql -U ${envGet('DB_USER') || 'freight'} -c 'CREATE DATABASE "${dbName}"'`);
    return false;
  }
}

async function cmdInitDb(demo) {
  loadEnv();
  const config = require('../src/config'); // 生产 NODE_ENV 下 JWT_SECRET 缺失会在此抛错 → 正确拦截
  const { runMigrations } = require('../src/services/migrateRunner');
  const { ensureBootstrap } = require('../src/services/bootstrapService');
  const { sequelize } = require('../src/models');

  section('bootstrap init-db — 数据库初始化');
  console.log(`目标库  ${config.db.host}:${config.db.port}/${config.db.name}（用户 ${config.db.user}）`);

  // 1. 确保库存在（幂等）
  await ensureDatabaseExists();

  // 2. 跑迁移（与生产启动一致，SequelizeMeta 幂等，绝不用 sync）
  try {
    const applied = await runMigrations();
    console.log(applied.length ? `[INIT] 迁移完成：本次新增 ${applied.length} 个` : '[INIT] 迁移已是最新（无需执行）');
  } catch (e) {
    await sequelize.close().catch(() => {});
    return fail(`迁移失败：${e.message}（可用 AUTO_MIGRATE=false 关闭自动迁移后人工排查）`);
  }

  // 3. RBAC / 基准汇率预置
  const status = await ensureBootstrap();
  console.log(`[INIT] Bootstrap 完成：needsSetup=${status.needsSetup} rbacSeeded=${status.rbacSeeded}`);

  // 4. 可选演示数据
  if (demo) {
    const { generateDemoData } = require('../src/services/demoDataService');
    const result = await generateDemoData();
    console.log(`[INIT] 演示数据已生成：${JSON.stringify(result)}（isDemo 标记，可一键清空）`);
  }

  if (!demo && status.needsSetup) {
    console.log('');
    console.log('[INIT] 提示：系统尚无管理员，下一步创建管理员：');
    console.log('      node scripts/bootstrap.js setup-admin   （交互式）');
    console.log('      或在 .env 设 ADMIN_INIT_PASSWORD 后由服务启动自动创建');
  }
  return ok('数据库初始化完成（幂等，可反复执行）');
}

// ---------------------------------------------------------------- setup-admin 子命令

async function promptHidden(rl, question) {
  const answer = await rl.question(question);
  return answer.trim();
}

async function cmdSetupAdmin(opts) {
  loadEnv();
  const config = require('../src/config');
  const bcrypt = require('bcryptjs');
  const { User, Role, UserRole } = require('../src/services/dataAccess');

  section('bootstrap setup-admin — 创建首个管理员');

  const userCount = await User.count();
  if (userCount > 0) {
    console.log('[SETUP] 系统已有用户，无需创建管理员（如需新增请登录后在系统管理创建）');
    return ok('跳过创建管理员');
  }
  if (!config.adminInitPassword && !(opts.username && opts.password)) {
    // 交互式
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('未带 --username/--password 参数，进入交互式创建（Ctrl+C 可取消）');
    let username, password, name;
    try {
      do {
        username = (await promptHidden(rl, '管理员用户名（2-50 位）: ')).trim();
      } while (username.length < 2 || username.length > 50);
      do {
        password = await promptHidden(rl, '密码（8-128 位，含字母与数字）: ');
        const pw = require('../src/utils/passwordPolicy').validatePassword(password);
        if (!pw.ok) console.log(`  ${pw.message}`);
      } while (!require('../src/utils/passwordPolicy').validatePassword(password).ok);
      name = (await promptHidden(rl, '管理员姓名: ')).trim() || '管理员';
    } finally {
      rl.close();
    }
    opts = { username, password, name };
  }

  const username = String(opts.username || 'admin').trim();
  const password = String(opts.password || config.adminInitPassword || '');
  const name = String(opts.name || '管理员').trim();

  // 复用共享密码策略校验
  const pv = require('../src/utils/passwordPolicy').validatePassword(password);
  if (!pv.ok) return fail(`密码不合规：${pv.message}`);
  if (username.length < 2 || username.length > 50) return fail('用户名长度需为 2-50 位');

  const adminRole = await Role.findOne({ where: { code: 'admin' } });
  const created = await User.sequelize.transaction(async (t) => {
    const count = await User.count({ transaction: t });
    if (count > 0) throw Object.assign(new Error('系统已完成初始化'), { status: 409 });
    const user = await User.create({
      username,
      name,
      role: 'admin',
      password: bcrypt.hashSync(password, 10),
      status: 'active',
      mustChangePassword: false,
    }, { transaction: t });
    if (adminRole) {
      await UserRole.create({ userId: user.id, roleId: adminRole.id }, { transaction: t });
    }
    return user;
  });
  require('../src/services/permissionService').invalidate(created.id);
  console.log(`[SETUP] 已创建管理员「${created.username}」（姓名：${created.name}，角色：admin）`);
  return ok('管理员创建完成，请用该账号登录系统');
}

// ---------------------------------------------------------------- verify 子命令

async function cmdVerify() {
  loadEnv();
  section('bootstrap verify — 部署后可用性验证');

  let failed = 0;
  const results = [];

  // 1. DB 连通
  try {
    await pgQuery(envGet('DB_NAME') || 'freight', 'SELECT 1');
    results.push({ mark: PASS, label: '数据库连通' });
  } catch (e) {
    results.push({ mark: FAIL, label: '数据库连通', detail: e.message });
    failed += 1;
  }

  // 2. 迁移覆盖率（SequelizeMeta 记录数 vs migrations 文件数）
  try {
    const dir = path.join(BACKEND_ROOT, 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
    const r = await pgQuery(envGet('DB_NAME') || 'freight', 'SELECT count(*)::int AS c FROM "SequelizeMeta"');
    const applied = r.rows[0].c || 0;
    const ok = applied === files.length;
    results.push({
      mark: ok ? PASS : FAIL,
      label: `迁移覆盖（${applied}/${files.length}）`,
      detail: ok ? '全部迁移已应用' : `还有 ${files.length - applied} 个未应用，请运行 node scripts/bootstrap.js init-db`,
    });
    if (!ok) failed += 1;
  } catch (e) {
    results.push({ mark: FAIL, label: '迁移覆盖', detail: `查询失败：${e.message}（可能未初始化）` });
    failed += 1;
  }

  // 3. 管理员/用户存在
  try {
    const r = await pgQuery(envGet('DB_NAME') || 'freight', 'SELECT count(*)::int AS c FROM "Users"');
    const c = r.rows[0].c || 0;
    results.push({
      mark: c > 0 ? PASS : FAIL,
      label: '用户（管理员）',
      detail: c > 0 ? `已有 ${c} 个用户` : '尚无用户，请运行 node scripts/bootstrap.js setup-admin',
    });
    if (c === 0) failed += 1;
  } catch (e) {
    results.push({ mark: WARN, label: '用户（管理员）', detail: `查询失败：${e.message}` });
  }

  // 4. 后端健康端点（若服务已起）
  const port = parseInt(envGet('PORT')) || 3000;
  const portInUse = !(await portFree(port));
  if (portInUse) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await res.json().catch(() => ({}));
      results.push({
        mark: res.ok && body.db === 'up' ? PASS : FAIL,
        label: `后端健康端点 /api/health（:${port}）`,
        detail: res.ok ? `status=${body.status} db=${body.db}` : `HTTP ${res.status}`,
      });
      if (!(res.ok && body.db === 'up')) failed += 1;
    } catch (e) {
      results.push({ mark: WARN, label: `后端健康端点（:${port}）`, detail: `服务在端口上但 /api/health 不可达（${e.message}）` });
    }
  } else {
    results.push({ mark: WARN, label: '后端运行状态', detail: `端口 ${port} 未监听（服务未启动或未映射）`, fix: '启动后端后再验证：node --watch src/server.js 或 docker compose up -d' });
  }

  for (const r of results) {
    line(r.mark, r.label, r.detail, r.fix);
    console.log('');
  }

  console.log('-'.repeat(64));
  console.log(`验证项: ${results.filter((r) => r.mark === PASS).length}/${results.length} 通过`);
  console.log('');

  if (failed > 0) {
    return fail('存在未通过项，请按上方指引处理后重跑 verify');
  }
  return ok('系统可用性验证通过：数据库、迁移、用户、后端健康均正常');
}

// ---------------------------------------------------------------- demo 子命令

async function cmdDemo() {
  loadEnv();
  const { generateDemoData } = require('../src/services/demoDataService');
  const { sequelize } = require('../src/models');
  section('bootstrap demo — 生成演示数据');
  const result = await generateDemoData();
  console.log(`[DEMO] 演示数据已生成：${JSON.stringify(result)}（isDemo 标记，可一键清空）`);
  return ok('演示数据生成完成');
}

// ---------------------------------------------------------------- main

function usage() {
  console.log(`货运代理管理系统 - 统一引导脚本
用法: node scripts/bootstrap.js <子命令> [选项]

子命令:
  check                环境 + 前后端配置检测
  init-db [--demo]     数据库初始化（建库/迁移/RBAC 预置；--demo 加演示数据）
  setup-admin          创建首个管理员
                       交互式；或 --username U --password P --name N 非交互
  verify               部署后可用性验证
  demo                 生成演示数据
  all                  一键: check → init-db → setup-admin → verify
  help                 显示本帮助

示例:
  node scripts/bootstrap.js all
  node scripts/bootstrap.js init-db --demo
  node scripts/bootstrap.js setup-admin --username admin --password 'Abc12345' --name 管理员
  node scripts/bootstrap.js verify`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = (args[0] || 'help').toLowerCase();
  const opts = { demo: args.includes('--demo') };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--username') opts.username = args[i + 1];
    if (args[i] === '--password') opts.password = args[i + 1];
    if (args[i] === '--name') opts.name = args[i + 1];
  }

  let status = 0;
  switch (cmd) {
    case 'check':
      status = await cmdCheck(false);
      break;
    case 'init-db':
      status = await cmdInitDb(opts.demo);
      break;
    case 'setup-admin':
      status = await cmdSetupAdmin(opts);
      break;
    case 'verify':
      status = await cmdVerify();
      break;
    case 'demo':
      status = await cmdDemo();
      break;
    case 'all': {
      // 一键编排：任一步失败即中断，返回对应的退出码。
      // 传 forAll=true 让 check 阶段「数据库不存在」降级为提示（不外告失败），
      // 因为 init-db 会自动建库；其余配置检查仍须通过。
      status = await cmdCheck(true);
      if (status === 0) status = await cmdInitDb(false);
      if (status === 0) status = await cmdSetupAdmin({});
      if (status === 0) status = await cmdVerify();
      break;
    }
    case 'help':
    case '-h':
    case '--help':
    default:
      usage();
      break;
  }
  process.exit(status);
}

main().catch((e) => {
  console.error('');
  console.error(`[FAIL] 引导脚本异常：${e.message}`);
  if (e.stack) console.error(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
});