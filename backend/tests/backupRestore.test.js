// 备份恢复服务单元测试（不依赖真实 PostgreSQL）
// 覆盖：业务模块-表白名单校验、按模块聚类、pg_restore --list 解析、服务器备份列表/删除。
// 运行：node --test --test-concurrency=1 tests/backupRestore.test.js
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeTables, groupTablesByModule, allowedTables, BACKUP_MODULES } = require('../src/services/backupModules');
const { parsePgRestoreList, listServerBackups, deleteServerBackup } = require('../src/services/backupRestoreService');
const { sanitizeEnvFile } = require('../scripts/backup');

describe('业务模块-表映射（backupModules）', () => {
  test('allowedTables 覆盖全部业务表', () => {
    const allowed = allowedTables();
    // 关键业务表必须可恢复
    for (const t of ['Orders', 'Customers', 'FinanceRecords', 'Bookings', 'Suppliers', 'Users', 'Invoices']) {
      assert.ok(allowed.has(t), `应允许表 ${t}`);
    }
  });

  test('normalizeTables 只保留白名单表并去重', () => {
    const { valid, invalid } = normalizeTables(['Orders', 'Orders', 'Customers', "users'; DROP TABLE Orders;--", 'NotATable']);
    assert.deepEqual(valid, ['Orders', 'Customers']);
    assert.deepEqual(invalid, ["users'; DROP TABLE Orders;--", 'NotATable']);
  });

  test('normalizeTables 处理非数组输入', () => {
    assert.deepEqual(normalizeTables(undefined), { valid: [], invalid: [] });
    assert.deepEqual(normalizeTables('Orders'), { valid: [], invalid: [] });
  });

  test('groupTablesByModule 按模块聚类，忽略未知表', () => {
    const groups = groupTablesByModule(['Orders', 'OrderContainers', 'Customers', 'Unknown']);
    const order = groups.find((g) => g.key === 'order');
    const customer = groups.find((g) => g.key === 'customer');
    assert.ok(order, '应包含订单模块');
    assert.deepEqual(order.tables.sort(), ['OrderContainers', 'Orders'].sort());
    assert.deepEqual(customer.tables, ['Customers']);
    assert.ok(!groups.find((g) => g.key === 'unknown'));
  });

  test('每个模块都有友好标签且表非空', () => {
    for (const [key, mod] of Object.entries(BACKUP_MODULES)) {
      assert.ok(mod.label, `模块 ${key} 应有标签`);
      assert.ok(Array.isArray(mod.tables) && mod.tables.length > 0, `模块 ${key} 应有表`);
    }
  });
});

describe('pg_restore --list 解析（parsePgRestoreList）', () => {
  test('解析 TABLE / TABLE DATA 条目，忽略索引/序列/约束，去重', () => {
    const sample = [
      ';',
      '; Archive created at 2026-08-09 00:00:00',
      '; dbname: freight',
      '2; 16385 16385 TABLE public "Users" postgres',
      '3; 0 0 TABLE DATA public "Users" postgres',
      '5; 16387 16387 TABLE public Customers postgres',
      '6; 0 0 TABLE DATA public Customers postgres',
      '10; 0 0 SEQUENCE public "Orders_id_seq" postgres',
      '21; 0 0 INDEX public orders_pkey postgres',
      '34; 0 0 CONSTRAINT public "Orders_pkey" postgres',
    ].join('\n');
    const tables = parsePgRestoreList(sample);
    assert.deepEqual(tables.sort(), ['Customers', 'Users'].sort());
  });

  test('引号内含空格或空输入均安全', () => {
    assert.deepEqual(parsePgRestoreList(''), []);
    assert.deepEqual(parsePgRestoreList(';;;;;'), []);
    const quoted = '2; 16385 16385 TABLE public "Weird Name" postgres\n3; 0 0 TABLE DATA public "Weird Name" postgres';
    assert.deepEqual(parsePgRestoreList(quoted), ['Weird Name']);
  });
});

describe('服务器备份列表 / 删除（listServerBackups / deleteServerBackup）', () => {
  test('列出备份目录中的备份与快照，排除无关文件，按时间倒序', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-bklist-'));
    const oldDir = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = dir;
    try {
      fs.writeFileSync(path.join(dir, 'freight-backup-20260809-120000.tar.gz'), Buffer.alloc(10));
      fs.writeFileSync(path.join(dir, 'freight-prerestore-20260809-130000.tar.gz'), Buffer.alloc(20));
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
      const items = listServerBackups();
      assert.equal(items.length, 2);
      assert.equal(items[0].filename, 'freight-prerestore-20260809-130000.tar.gz', '最新在前');
      assert.equal(items[0].kind, 'prerestore');
      assert.equal(items[1].kind, 'backup');
      assert.ok(items[0].sizeText, '应有可读大小');
    } finally {
      process.env.BACKUP_DIR = oldDir;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('删除只接受合法备份文件名，路径穿越被拒绝', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-bkdel-'));
    const oldDir = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = dir;
    try {
      fs.writeFileSync(path.join(dir, 'freight-backup-20260809-120000.tar.gz'), Buffer.alloc(10));
      assert.equal(deleteServerBackup('../../etc/passwd').ok, false);
      assert.equal(deleteServerBackup('notes.txt').ok, false);
      const r = deleteServerBackup('freight-backup-20260809-120000.tar.gz');
      assert.equal(r.ok, true);
      assert.equal(fs.existsSync(path.join(dir, 'freight-backup-20260809-120000.tar.gz')), false);
      assert.equal(deleteServerBackup('freight-backup-20260809-120000.tar.gz').ok, false, '重复删除应报不存在');
    } finally {
      process.env.BACKUP_DIR = oldDir;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('环境变量脱敏（scripts/backup.sanitizeEnvFile）', () => {
  function writeEnv(content) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-sani-'));
    const abs = path.join(dir, '.env');
    fs.writeFileSync(abs, content, 'utf8');
    return { dir, abs };
  }

  test('敏感键值替换为 ***，普通键与注释/空行原样保留', () => {
    const { dir, abs } = writeEnv(
      [
        '# 注释',
        'DB_HOST=127.0.0.1',
        'DB_PASSWORD=super-secret',
        'DB_USER=freight',
        'JWT_SECRET=abc123',
        'API_KEY=xyz',
        'UPLOAD_MAX_KB=20480',
        '',
      ].join('\n')
    );
    try {
      const out = sanitizeEnvFile(abs).toString('utf8').split('\n');
      assert.ok(out[0].startsWith('# 注释'), '注释保留');
      assert.equal(out[1], 'DB_HOST=127.0.0.1', '普通键保留');
      assert.equal(out[2], 'DB_PASSWORD=***', '密码脱敏');
      assert.equal(out[3], 'DB_USER=freight', '普通键保留');
      assert.equal(out[4], 'JWT_SECRET=***', '密钥脱敏');
      assert.equal(out[5], 'API_KEY=***', 'API key 脱敏');
      assert.equal(out[6], 'UPLOAD_MAX_KB=20480', '非敏感键保留');
      assert.equal(out[7], '', '空行保留');
      const whole = out.join('\n');
      assert.ok(!whole.includes('super-secret'), '不携带明文密码');
      assert.ok(!whole.includes('abc123'), '不携带明文密钥');
      assert.ok(!whole.includes('xyz'), '不携带明文 API_KEY');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('非标准行（无等号/无键名）原样保留，不误伤', () => {
    const { dir, abs } = writeEnv('PASSWORD\n= must-not-match\nKEY_ONLY\n');
    try {
      const lines = sanitizeEnvFile(abs).toString('utf8').split('\n');
      assert.equal(lines[0], 'PASSWORD', '无等号行不是键值对，原样保留');
      assert.equal(lines[1], '= must-not-match', '无键名行原样保留');
      assert.equal(lines[2], 'KEY_ONLY', '键名无值原样保留');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});