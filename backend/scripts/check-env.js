#!/usr/bin/env node
'use strict';

/**
 * 首次部署环境检查（AC-21 / ADR-007）
 * 运行：node scripts/check-env.js
 *
 * 逐项检查（与 docs-site/docs/deploy/docker.md「首次部署检查清单」一一对应）：
 *   1. Node 运行时 >= 18
 *   2. Docker 已安装且守护进程运行（docker info）
 *   3. docker compose version 可用
 *   4. 端口 3000 / 5175 / 8080 空闲
 *   5. 磁盘剩余 >= 5GB
 *   6. 内存 >= 2GB（PostgreSQL 最低要求提示）
 *   7. .env 存在且 JWT_SECRET 为生产级强度（>= 64 字符）
 *   8. 时区建议 Asia/Shanghai（建议项，不阻塞）
 *
 * 每项输出 [通过]/[失败] + 中文修复指引（可复制命令）；
 * 结尾汇总：全部通过提示执行 docker compose 三步曲，存在失败则退出码 1。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

const PASS = '✅';
const FAIL = '❌';
const NOTE = '⚠️';

// ---------------------------------------------------------------- 工具

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
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(true); });
  });
}

function humanGb(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
}

// 读取 .env（backend 优先，仓库根兜底），返回 { path, content } 或 null
function findEnv() {
  const candidates = [
    path.join(BACKEND_ROOT, '.env'),
    path.join(REPO_ROOT, '.env'),
  ];
  for (const abs of candidates) {
    if (fs.existsSync(abs)) return { abs, content: fs.readFileSync(abs, 'utf8') };
  }
  return null;
}

function envValue(content, key) {
  const m = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
  if (!m) return '';
  return m[1].trim().replace(/^["']|["']$/g, '');
}

// ---------------------------------------------------------------- 检查项

function checkNode() {
  const v = process.version;
  const major = parseInt(v.replace('v', '').split('.')[0], 10);
  return {
    key: 'node',
    label: 'Node 运行时 >= 18',
    ok: major >= 18,
    detail: `当前 ${v}（主版本 ${major}）`,
    fix: '请安装 Node 18 及以上版本：https://nodejs.org（建议使用 LTS）',
  };
}

function checkDocker() {
  const r = run('docker', ['info']);
  return {
    key: 'docker',
    label: 'Docker 已安装且守护进程运行',
    ok: r.ok,
    detail: r.ok ? 'Docker 守护进程运行中' : (r.code === 'ENOENT' ? '未找到 docker 命令' : 'docker info 失败，守护进程可能未启动'),
    fix: r.code === 'ENOENT'
      ? '请安装 Docker：https://docs.docker.com/get-docker/（Windows 用 Docker Desktop）'
      : '请启动 Docker 守护进程：sudo systemctl start docker（或打开 Docker Desktop）',
  };
}

function checkCompose() {
  const r = run('docker', ['compose', 'version']);
  let detail = 'docker compose version 可用';
  if (r.ok && r.stdout) detail = r.stdout.split('\n')[0];
  return {
    key: 'compose',
    label: 'docker compose version 可用',
    ok: r.ok,
    detail: r.ok ? detail : 'docker compose 不可用（可能是旧版 docker-compose）',
    fix: '请升级 Docker 至支持 compose v2 的版本，或安装 docker-compose：sudo apt install docker-compose-plugin',
  };
}

async function checkPorts() {
  const ports = [3000, 5175, 8080];
  const busy = [];
  for (const p of ports) {
    if (!(await portFree(p))) busy.push(p);
  }
  return {
    key: 'ports',
    label: `端口 ${ports.join(' / ')} 空闲`,
    ok: busy.length === 0,
    detail: busy.length === 0 ? '端口均未被占用' : `以下端口被占用: ${busy.join(', ')}`,
    fix: '请停止占用端口的进程后重试：Windows 用 netstat -ano | findstr <端口>，Linux/Mac 用 lsof -i :<端口>',
  };
}

function checkDisk() {
  const target = process.cwd() || REPO_ROOT;
  let freeGb = 0;
  let detail = '';
  try {
    const s = fs.statfsSync(target);
    freeGb = (Number(s.bavail) * Number(s.bsize)) / 1024 / 1024 / 1024;
    detail = `磁盘剩余 ${freeGb.toFixed(1)} GB（要求 >= 5GB）`;
  } catch (e) {
    detail = '磁盘空间读取失败';
  }
  return {
    key: 'disk',
    label: '磁盘剩余 >= 5GB',
    ok: freeGb >= 5,
    detail,
    fix: '请清理磁盘空间或扩容：df -h 查看占用，删除不再需要的大文件',
  };
}

function checkMemory() {
  const totalGb = os.totalmem() / 1024 / 1024 / 1024;
  return {
    key: 'memory',
    label: '内存 >= 2GB（PostgreSQL 最低要求）',
    ok: totalGb >= 2,
    detail: `内存总量 ${totalGb.toFixed(1)} GB（要求 >= 2GB）`,
    fix: '请为服务器/虚拟机分配至少 2GB 内存（PostgreSQL 最低要求）',
  };
}

function checkEnvSecret() {
  const env = findEnv();
  if (!env) {
    return {
      key: 'env',
      label: '.env 存在且 JWT_SECRET 生产级强度',
      ok: false,
      detail: '未找到 .env（backend/.env 或仓库根 .env）',
      fix: '请复制模板并生成生产密钥：cp backend/.env.example backend/.env，然后用 openssl rand -hex 32 生成 JWT_SECRET 填入',
    };
  }
  const secret = envValue(env.content, 'JWT_SECRET');
  const ok = secret.length >= 64;
  return {
    key: 'env',
    label: '.env 存在且 JWT_SECRET 生产级强度',
    ok,
    detail: ok
      ? `.env 存在（${path.basename(env.abs)}），JWT_SECRET 长度 ${secret.length}（>= 64）`
      : `.env 存在（${path.basename(env.abs)}），但 JWT_SECRET 长度 ${secret.length}（要求 >= 64）`,
    fix: '请在 .env 中设置高强度 JWT_SECRET（>= 64 字符），生成命令：openssl rand -hex 32',
  };
}

function checkTimezone() {
  const current = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
      return process.env.TZ || '';
    }
  })();
  const ok = current === 'Asia/Shanghai';
  return {
    key: 'timezone',
    label: '时区建议 Asia/Shanghai',
    ok,
    advisory: true, // 建议项，不参与失败判定
    detail: ok ? `当前时区 ${current}` : `当前时区 ${current || '未知'}（建议 Asia/Shanghai）`,
    fix: '建议设置时区：Linux/Mac 用 sudo timedatectl set-timezone Asia/Shanghai；Docker 部署在 compose 中设置 TZ=Asia/Shanghai',
  };
}

// ---------------------------------------------------------------- 汇总

const COMPOSE_STEPS = `docker compose 三步曲：
  1. cp .env.example .env 并填好 JWT_SECRET / DB_PASSWORD（若未配置）
  2. docker compose up -d --build
  3. docker compose ps 确认全部 healthy，浏览器打开 http://localhost:8080`;

async function main() {
  console.log('');
  console.log('freight-system 首次部署环境检查（AC-21 / ADR-007）');
  console.log('--------------------------------------------------');
  console.log(`检查时间  ${new Date().toLocaleString('zh-CN')}`);
  console.log(`工作目录  ${process.cwd()}`);
  console.log('');

  const checks = [
    checkNode(),
    checkDocker(),
    checkCompose(),
    await checkPorts(),
    checkDisk(),
    checkMemory(),
    checkEnvSecret(),
    checkTimezone(),
  ];

  let failed = 0;
  let advised = 0;
  for (const c of checks) {
    const mark = c.ok ? PASS : (c.advisory ? NOTE : FAIL);
    if (!c.ok && !c.advisory) failed += 1;
    if (!c.ok && c.advisory) advised += 1;
    console.log(`${mark} ${c.label}`);
    console.log(`      ${c.detail}`);
    if (!c.ok && c.fix) {
      console.log(`      修复: ${c.fix}`);
    }
    console.log('');
  }

  console.log('--------------------------------------------------');
  const totalOk = checks.filter((c) => c.ok).length;
  console.log(`汇总: ${totalOk}/${checks.length} 项通过${advised ? `，${advised} 项为建议（时区）` : ''}`);
  console.log('');

  if (failed === 0) {
    console.log('环境就绪，可以开始部署。');
    console.log(COMPOSE_STEPS);
    console.log('');
    process.exit(0);
  }

  console.log(`存在 ${failed} 项未通过，请按上方修复指引处理后再部署。`);
  console.log('修复后可重新运行: node scripts/check-env.js');
  console.log('');
  process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[检查失败]', e.message);
    process.exit(1);
  });
}

module.exports = { checkNode, checkDocker, checkCompose, checkPorts, checkDisk, checkMemory, checkEnvSecret, checkTimezone };
