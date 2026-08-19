'use strict';
// 集成测试前置门禁：npm test:integration 的 pretest 钩子。
// 用极短连接超时（3s）探测本地测试库（freight_test）。库不可达时立即以非零码退出并给出可操作
// 提示，杜绝原来「直接跑集成测试空转 ~18 分钟、无报错、无 fail-fast」的挂起体验。
// 本脚本自身受总超时保护（系统配置，见外部调用方的 --test-timeout 语义），不会无限等待。

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), quiet: true });

const { Client } = require('pg');

const host = process.env.TEST_DB_HOST || '127.0.0.1';
const port = parseInt(process.env.TEST_DB_PORT, 10) || 5432;
const database = process.env.TEST_DB_NAME || 'freight_test';
const user = process.env.TEST_DB_USER || 'freight';
const password = process.env.TEST_DB_PASSWORD || '';

const client = new Client({
  host, port, database, user, password,
  connectionTimeoutMillis: parseInt(process.env.DB_CHECK_TIMEOUT_MS, 10) || 3000,
});

(async () => {
  await client.connect();
  try {
    await client.query('SELECT 1');
    // eslint-disable-next-line no-console
    console.log(`[TEST-DB] 测试库可达 (${host}:${port}/${database})`);
    process.exit(0);
  } finally {
    await client.end().catch(() => {});
  }
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[TEST-DB] 本机 PostgreSQL（${database} 测试库）未启动或不可达：${err.message}`);
  // eslint-disable-next-line no-console
  console.error('提示：请先启动本地 PostgreSQL 并创建测试库 freight_test（见 backend/.env.test），再运行 npm run test:integration');
  process.exit(1);
});