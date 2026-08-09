// 幂等初始化脚本：node src/init-db.js [--demo] [--force]
// 定位：替代 seed.js（force 清库）成为新用户/部署的初始化入口，可反复执行不破坏数据
//   - 默认：sync（不 force，只补缺的表）→ ensureBootstrap（空表预置权限点/角色/基准汇率/可选 admin）
//   - --demo：额外生成演示数据（isDemo=true，可一键清空，见 DELETE /api/system/demo-data）
//   - --force：显式清库重建（危险操作，与旧 seed.js 行为一致；非必要不使用）
//
// 用法示例：
//   npm run init-db                      # 幂等初始化（推荐，任意次数安全）
//   npm run init-db -- --demo            # 初始化 + 演示数据
//   node src/init-db.js --force          # 清库重建（慎用！）

const { sequelize } = require('./models');
const { ensureBootstrap } = require('./services/bootstrapService');
const { generateDemoData } = require('./services/demoDataService');
const { logger } = require('./utils/logger');

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const demo = args.includes('--demo');

  if (force) {
    logger.warn('[INIT] --force：将清库重建（与旧 seed.js 行为一致），3 秒后执行，Ctrl+C 可取消');
    await new Promise((r) => setTimeout(r, 3000));
    await sequelize.sync({ force: true });
    logger.info('[INIT] 数据库已重建（force）');
  } else {
    // 幂等：不 force，只补缺表
    await sequelize.sync();
    logger.info('[INIT] 数据库同步完成（幂等）');
  }

  const status = await ensureBootstrap();
  logger.info(`[INIT] Bootstrap 完成：needsSetup=${status.needsSetup} rbacSeeded=${status.rbacSeeded}`);

  if (demo) {
    const result = await generateDemoData();
    logger.info(`[INIT] 演示数据已生成：${JSON.stringify(result)}（isDemo 标记，可一键清空）`);
  }

  if (!force && !demo && status.needsSetup && !process.env.ADMIN_INIT_PASSWORD) {
    logger.info('[INIT] 提示：系统尚无管理员，首次访问 http://localhost:PORT 将引导创建首个管理员');
  }
  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  logger.error('[INIT] 初始化失败', { message: e.message, stack: e.stack });
  process.exit(1);
});
