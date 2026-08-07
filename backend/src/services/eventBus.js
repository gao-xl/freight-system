// B4 事件总线（core 级）：跨模块解耦 + 公司定制外部挂载点
// 用法：
//   const events = require('../services/eventBus');
//   events.emit('order.created', { orderId, orderNo });
//   events.on('order.created', async (payload) => { ... });
// 事件清单：order.created / order.updated / order.transitioned / quotation.confirmed /
//           finance.billed / booking.scheduled / customer.followed
const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');

const emitter = new EventEmitter();
// 防止监听器泄漏警告
emitter.setMaxListeners(50);

// 事件登记表（便于二开查阅）
const EVENT_TYPES = {
  'order.created': '订单创建',
  'order.updated': '订单更新',
  'order.transitioned': '订单状态流转',
  'quotation.confirmed': '报价确认',
  'quotation.converted': '报价转订单',
  'finance.billed': '财务开票',
  'booking.scheduled': '订舱确认',
  'customer.followed': '客户跟进',
  'document.generated': '单证生成',
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