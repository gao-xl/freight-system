// 临时验证脚本：确认 backupScheduler 依赖链可加载、config.backup 配置生效
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'verify-' + Math.random().toString(36).slice(2);
process.env.BACKUP_MAX_AGE_DAYS = '35';
process.env.BACKUP_KEEP = '7';

const config = require('./src/config');
const scheduler = require('./src/services/backupScheduler');

// 1) 校验 config.backup 配置
console.log('=== config.backup ===');
console.log(JSON.stringify(config.backup, null, 2));

// 2) 校验导出函数存在
console.log('=== exports ===');
console.log(Object.keys(scheduler).join(', '));

// 3) 校验默认自动备份为强制开启
if (config.backup.auto !== true) {
  console.error('FAIL: backup.auto 应为 true（默认强制开启）');
  process.exit(1);
}
if (config.backup.schedule !== '30 3 1 * *') {
  console.error(`FAIL: 默认月度 cron 应为 30 3 1 * *，实际 ${config.backup.schedule}`);
  process.exit(1);
}
if (config.backup.maxAgeDays !== 35) {
  console.error(`FAIL: maxAgeDays 应为 35，实际 ${config.backup.maxAgeDays}`);
  process.exit(1);
}
console.log('OK: 强制自动备份配置正确');