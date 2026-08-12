'use strict';

// 方案 A：读缓存失效订阅
// 订阅运价写事件（CRUD + 恢复），写入后失效对应命名空间的读缓存。
// 作用：运价 list/compare/search/门户查询 缓存较长 TTL（默认 300s），
// 一旦运价被修改/新增/删除，立即失效，避免用户看到过期运价。
//
// 注意：baseController 的 create/update/remove/restore 会发 {module}.created/.updated/.deleted/.restored；
// 但 batchRemove / batchUpdate 不发事件，由 freightRateController 手动包装失效（见该控制器）。

const { logger } = require('../utils/logger');
const { invalidateNamespace } = require('./readCache');

let subscribed = false;

function subscribe() {
  if (subscribed) return;
  const events = require('./eventBus');
  const RATE_EVENTS = ['freightRate.created', 'freightRate.updated', 'freightRate.deleted', 'freightRate.restored'];
  for (const name of RATE_EVENTS) {
    events.onAsync(name, async () => {
      try {
        await invalidateNamespace('rate');
        logger.info(`[CACHE] 运价写事件 ${name}，已失效 rate 读缓存`);
      } catch (e) {
        logger.warn('[CACHE] 运价缓存失效失败（TTL 兜底）', { message: e.message });
      }
    });
  }
  subscribed = true;
  logger.info(`[CACHE] 已订阅 ${RATE_EVENTS.length} 类运价写事件用于读缓存失效`);
}

module.exports = { subscribe };