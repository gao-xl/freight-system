const { IntegrationConfig } = require('../models');
const { crudController } = require('./baseController');
const { IntegrationClient, adapters } = require('../integrations');
const { ok, fail, asyncHandler } = require('../utils/response');

const base = crudController({
  model: IntegrationConfig,
  searchFields: ['code', 'name'],
  order: [['id', 'ASC']],
});

// 触发对接（发送数据到外部系统）
const trigger = asyncHandler(async (req, res) => {
  const { code, action, payload } = req.body || {};
  if (!code) return fail(res, '缺少对接编码');
  const client = await IntegrationClient.get(code);
  try {
    const result = action === 'query' ? await client.query(payload) : await client.send(payload);
    ok(res, result, '对接请求已发送');
  } catch (e) {
    fail(res, `对接失败：${e.message}`, 1, 502);
  }
});

// 已注册适配器列表
const registry = asyncHandler(async (req, res) => {
  ok(res, Object.values(adapters).map(a => ({ code: a.code, name: a.name })));
});

module.exports = { ...base, trigger, registry };