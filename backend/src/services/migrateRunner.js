// 零依赖迁移执行器：启动时自动跑 migrations/ 目录下未执行的迁移
// 与 sequelize-cli 共用 SequelizeMeta 表（表结构一致），两者互不冲突：
//   - sequelize-cli db:migrate 照常可用（手动场景）
//   - 启动自动迁移只执行"未记录"的文件，天然幂等
// 用途：OPC/小团队自部署零命令启动（AUTO_MIGRATE 默认开，config.autoMigrate 可关）

const path = require('path');
const fs = require('fs');
const Sequelize = require('sequelize');
const sequelize = require('../db');
const { logger } = require('../utils/logger');

// 返回本次新执行的迁移文件名数组
async function runMigrations() {
  const q = sequelize.getQueryInterface();
  // 确保 SequelizeMeta 存在（与 sequelize-cli 同构），不存在则建
  await q.createTable(
    'SequelizeMeta',
    { name: { type: Sequelize.STRING(255), primaryKey: true } },
    { ifNotExists: true }
  );
  const doneRows = await sequelize.query('SELECT name FROM "SequelizeMeta"', {
    type: sequelize.QueryTypes.SELECT,
  });
  const done = new Set(doneRows.map((r) => r.name));

  const dir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const applied = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const migration = require(path.join(dir, file));
    if (typeof migration.up !== 'function') continue;
    try {
      await migration.up(q, Sequelize);
    } catch (e) {
      // 幂等容错：部分存量迁移（如 accounting-period）直接 addIndex，会撞 sync 从模型建的索引
      // 索引已存在且符合模型定义，跳过是安全的；其余错误照常抛出中止。
      // 用 SQLSTATE 42P07（duplicate_object）判断而非正则匹配错误文本——后者对中文/非英文
      // 错误信息（如「关系 ... 已经存在」）会失效，导致本应幂等跳过的迁移中止整个启动。
      const msg = String(e && e.message || '');
      const sqlstate = e && e.original && e.original.code;
      const isAlreadyExists = sqlstate === '42P07' || /already exists/i.test(msg);
      if (isAlreadyExists) {
        logger.warn(`[MIGRATE] ${file} 跳过（目标已存在，幂等容错）：${msg}`);
      } else {
        logger.error(`[MIGRATE] 迁移失败 ${file}，启动中止（可用 AUTO_MIGRATE=false 关闭自动迁移后人工排查）`, {
          message: msg,
        });
        throw e;
      }
    }
    await sequelize.query('INSERT INTO "SequelizeMeta" (name) VALUES (?)', {
      replacements: [file],
    });
    applied.push(file);
    logger.info(`[MIGRATE] 已执行 ${file}`);
  }
  return applied;
}

module.exports = { runMigrations };
