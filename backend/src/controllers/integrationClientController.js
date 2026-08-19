const { Op } = require('sequelize');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { IntegrationClient } = require('../services/dataAccess');

// P2-1 API 集成网关：外部调用方（入站回调渠道）注册管理
// 路由：/api/v1/integrations/clients*

// P0 凭据泄露修复：apiKey 经模型 afterFind 透明解密为明文，绝不可直接回传前端
// （否则持 integration:read 权限的用户可一次性拉取全部 HMAC 回调密钥并伪造海关回执）。
// 列表 / 更新等非新建操作一律掩码；仅在创建（调用方本次刚提供明文）时保留原始值。
function maskSecret(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '******';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}
function toSafe(item, keepKey = false) {
  const json = { ...item.toJSON() };
  if (!keepKey) json.apiKey = json.apiKey ? maskSecret(json.apiKey) : '';
  return json;
}

// GET /integrations/clients?q=&enabled=&page=&pageSize=
const list = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const { q, enabled } = req.query;
  const where = {};
  if (q) {
    where[Op.or] = [
      { name: { [Op.like]: `%${q}%` } },
      { code: { [Op.like]: `%${q}%` } },
    ];
  }
  if (enabled === 'true' || enabled === 'false') where.enabled = enabled === 'true';
  const { rows, count } = await IntegrationClient.findAndCountAll({
    where, order: [['id', 'DESC']], limit, offset, distinct: true,
  });
  ok(res, { list: rows.map((r) => toSafe(r)), total: count, page, pageSize });
});

// POST /integrations/clients
// body: { code, name, apiKey, enabled, config, remark }
const create = asyncHandler(async (req, res) => {
  const { code, name, apiKey, enabled = true, config, remark } = req.body || {};
  if (!code || !name) return fail(res, '缺少 code 或 name', 1, 400);
  const exists = await IntegrationClient.findOne({ where: { code } });
  if (exists) return fail(res, `调用方编码 ${code} 已存在`, 1, 409);
  const item = await IntegrationClient.create({ code, name, apiKey: apiKey || '', enabled, config, remark });
  // beforeSave 会把 apiKey 加密入库，create 返回实例上已是密文；仅本响应回显本次提交的明文留档
  const json = toSafe(item, true);
  if (apiKey) json.apiKey = apiKey;
  ok(res, json, '创建成功');
});

// PUT /integrations/clients/:id
// body: { name, apiKey, enabled, config, remark }（apiKey 仅显式传值时轮换）
const update = asyncHandler(async (req, res) => {
  const item = await IntegrationClient.findByPk(req.params.id);
  if (!item) return fail(res, '调用方不存在', 1, 404);
  const { name, apiKey, enabled, config, remark } = req.body || {};
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (enabled !== undefined) patch.enabled = !!enabled;
  if (config !== undefined) patch.config = config;
  if (remark !== undefined) patch.remark = remark;
  if (typeof apiKey === 'string' && apiKey) patch.apiKey = apiKey;
  await item.update(patch);
  ok(res, toSafe(item), '更新成功');
});

// DELETE /integrations/clients/:id
const remove = asyncHandler(async (req, res) => {
  const item = await IntegrationClient.findByPk(req.params.id);
  if (!item) return fail(res, '调用方不存在', 1, 404);
  await item.destroy();
  ok(res, null, '已删除');
});

module.exports = { list, create, update, remove };