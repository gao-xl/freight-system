// 场站信息查询统一服务层
// 屏蔽各场站差异，对外提供统一查询入口；未启用对接时降级为人工录入/空结果。
const { Op } = require('sequelize');
const { YardRecord, YardMeta, Order } = require('../models');
const { IntegrationClient } = require('../integrations');
const { logger } = require('../utils/logger');

const YARD_ADAPTER = 'yard_qingdao';

// 内置场站名录（未落库时兜底展示）
const YARD_LIST = [
  { code: 'evergreen', name: '长荣场站', mode: 'api' },
  { code: 'smart', name: '捷丰场站', mode: 'api' },
  { code: 'daya', name: '大亚场站', mode: 'scraper' },
  { code: 'qqct', name: 'QQCT场站', mode: 'api' },
  { code: 'qqctu', name: 'QQCTU场站', mode: 'api' },
  { code: 'qinggang', name: '青港场站', mode: 'manual' },
  { code: 'donggang', name: '东港场站', mode: 'manual' },
  { code: 'hanjin', name: '韩进场站', mode: 'manual' },
  { code: 'shengshi', name: '胜狮场站', mode: 'manual' },
  { code: 'zhongchuang', name: '中创场站', mode: 'manual' },
  { code: 'minjun', name: '珉钧场站', mode: 'manual' },
];

// 获取场站名录（优先取库，兜底内置）
async function listYards() {
  const metas = await YardMeta.findAll({ order: [['id', 'ASC']] });
  if (metas.length) return metas;
  return YARD_LIST;
}

// 按箱号/提单号+场站查询场站状态
// 返回统一结构；若该场站未启用自动对接则返回空结果（前端引导人工录入）
async function queryContainer({ containerNo, billNo, yardCode }, userId) {
  const now = new Date();
  let result = null;
  let source = 'manual';

  // 尝试自动对接（仅当接口启用）
  const client = await IntegrationClient.get(YARD_ADAPTER).catch(() => null);
  if (client && client.cfg && client.cfg.enabled) {
    try {
      const adapterQuery = await client.query({ containerNo, billNo, yardCode });
      result = adapterQuery;
      source = gardenerMode(yardCode);
    } catch (e) {
      logger.error('[YARD] 自动查询失败', { message: e.message, yardCode, containerNo });
      result = null;
    }
  }

  // 落库：关联订单（按箱号/提单号匹配在途订单）
  let orderId = null;
  if (containerNo) {
    const o = await Order.findOne({ where: { containerNo } });
    if (o) orderId = o.id;
  } else if (billNo) {
    const o = await Order.findOne({ where: { [Op.or]: [{ orderNo: billNo }] } });
    if (o) orderId = o.id;
  }

  const meta = await YardMeta.findOne({ where: { code: yardCode } });
  const record = await YardRecord.create({
    orderId,
    containerNo,
    billNo,
    yardCode,
    yardName: meta?.name || (YARD_LIST.find((y) => y.code === yardCode)?.name) || yardCode,
    status: result?.status || '在场',
    location: result?.location || '',
    eventTime: result?.eventTime || now,
    source,
    raw: result ? JSON.stringify(result) : '',
    queryBy: userId,
    queryAt: now,
  });

  return {
    ...(result || {}),
    containerNo,
    billNo,
    yardCode,
    yardName: record.yardName,
    status: record.status,
    location: record.location,
    eventTime: record.eventTime,
    source,
    recordId: record.id,
    ready: !!result,
  };
}

function gardenerMode(yardCode) {
  const meta = YARD_LIST.find((y) => y.code === yardCode);
  return meta?.mode === 'api' || meta?.mode === 'scraper' ? 'api' : 'manual';
}

// 历史查询记录
async function records({ orderId, containerNo, billNo }) {
  const where = {};
  if (orderId) where.orderId = orderId;
  if (containerNo) where.containerNo = containerNo;
  if (billNo) where.billNo = billNo;
  return YardRecord.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 });
}

// 人工录入/修正场站状态
async function manualUpsert({ orderId, containerNo, billNo, yardCode, yardName, status, location, eventTime }, userId) {
  const rec = await YardRecord.create({
    orderId: orderId || null,
    containerNo,
    billNo,
    yardCode,
    yardName: yardName || yardCode,
    status: status || '在场',
    location,
    eventTime: eventTime ? new Date(eventTime) : new Date(),
    source: 'manual',
    queryBy: userId,
    queryAt: new Date(),
  });
  return rec;
}

module.exports = { listYards, queryContainer, records, manualUpsert, YARD_LIST };