// 测试环境预载：统一加载 backend/.env.test 的 TEST_DB_* 变量
// 使所有测试文件（含 spawn 出的子进程）都能取得正确的测试库连接参数，
// 避免各测试文件各自回落 DB_PASSWORD='' 导致 SCRAM 密码错误。
// 通过 npm test 脚本中的 --require ./tests/setup-env.js 注入，node:test 会将其传播给子进程。
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), quiet: true });