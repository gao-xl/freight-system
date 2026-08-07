// B4 事件总线（core 级）：跨模块解耦 + 公司定制外部挂载点
// 用法：
//   const events = require('../services/eventBus');
//   events.emit('order.created', { orderId, orderNo });
//   events.on('order.created', async (payload) => { ... });
//
// 事件命名规范：{module}.{action}
// CRUD 事件（baseController 自动发射）：{module}.created / .updated / .deleted
// 领域事件（控制器/服务手动发射）：{module}.{domain-action}
const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');

const emitter = new EventEmitter();
// 防止监听器泄漏警告
emitter.setMaxListeners(50);

// 事件登记表（便于二开查阅 + 前端事件流展示）
const EVENT_TYPES = {
  // ── CRUD 事件（baseController 自动发射） ──
  'order.created': '订单创建',
  'order.updated': '订单更新',
  'order.deleted': '订单删除',
  'order.transitioned': '订单状态流转',
  'customer.created': '客户创建',
  'customer.updated': '客户更新',
  'customer.deleted': '客户删除',
  'customer.followed': '客户跟进',
  'supplier.created': '供应商创建',
  'supplier.updated': '供应商更新',
  'supplier.deleted': '供应商删除',
  'booking.created': '订舱创建',
  'booking.updated': '订舱更新',
  'booking.deleted': '订舱删除',
  'booking.shipped': '订舱装船',
  'customs.created': '报关创建',
  'customs.updated': '报关更新',
  'customs.deleted': '报关删除',
  'document.created': '单证创建',
  'document.updated': '单证更新',
  'document.deleted': '单证删除',
  'document.generated': '单证生成',
  'finance.created': '财务记录创建',
  'finance.updated': '财务记录更新',
  'finance.deleted': '财务记录删除',
  'finance.billed': '财务开票',
  'quotation.created': '报价创建',
  'quotation.updated': '报价更新',
  'quotation.deleted': '报价删除',
  'quotation.confirmed': '报价确认',
  'quotation.converted': '报价转订单',
  'track.created': '跟踪记录创建',
  'track.updated': '跟踪记录更新',
  'track.deleted': '跟踪记录删除',
  // ── 系统事件 ──
  'alert.created': '预警创建',
  'alert.resolved': '预警解除',
  'automation.executed': '自动化执行',
  'user.login': '用户登录',
};

function emit(eventName, payload) {
  const envelope = { event: eventName, payload, time: new Date().toISOString() };
  logger.info(`[EVENT] ${eventName}`, payload && typeof payload === 'object' ? payload : { payload });
  emitter.emit(eventName, envelope);
  return envelope;
}

function on(eventName, handler) {
  emitter.on(eventName, handler);
  return () => emitter.off(eventName, handler);
}

// 异步监听：捕获异常避免影响主流程
function onAsync(eventName, handler) {
  emitter.on(eventName, async (env) => {
    try { await handler(env); }
    catch (e) { logger.error(`[EVENT] ${eventName} 处理失败`, { message: e.message }); }
  });
}

module.exports = { emit, on, onAsync, EVENT_TYPES };