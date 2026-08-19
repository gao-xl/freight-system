const { IntegrationConfig } = require('../services/dataAccess');
const { Op } = require('sequelize');
const { crudController } = require('./baseController');
const { IntegrationClient, adapters } = require('../integrations');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');

// P0 凭据泄露修复：IntegrationConfig 的 apiKey 经模型 afterFind 透明解密为明文，
// base CRUD 直接回传整个实例会向外暴露外部系统（海关/港口/财务）的访问凭据。
// 列表/详情/更新等只读与回显路径一律掩码；创建（本次刚提供）保留明文供调用方留档。
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

const base = crudController({
  model: IntegrationConfig,
  searchFields: ['code', 'name'],
  order: [['id', 'ASC']],
});

// 掩码响应：列表 / 详情 / 更新不外泄明文 apiKey
async function listSafe(req, res) {
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const where = {};
  if (req.query.keyword) {
    where[Op.or] = [
      { code: { [Op.like]: `%${req.query.keyword}%` } },
      { name: { [Op.like]: `%${req.query.keyword}%` } },
    ];
  }
  // 精确字段过滤
  for (const key of Object.keys(req.query)) {
    if (['page', 'pageSize', 'keyword'].includes(key)) continue;
    const val = req.query[key];
    if (val === '' || val === undefined || val === null) continue;
    if (IntegrationConfig.rawAttributes[key]) where[key] = val;
  }
  const { rows, count } = await IntegrationConfig.findAndCountAll({ where, order: [['id', 'ASC']], offset, limit, distinct: true });
  ok(res, { list: rows.map((r) => toSafe(r)), total: count, page, pageSize });
}
async function getSafe(req, res) {
  const item = await IntegrationConfig.findByPk(req.params.id);
  if (!item) return fail(res, '记录不存在', 1, 404);
  ok(res, toSafe(item));
}
async function createSafe(req, res) {
  const body = { ...req.body };
  delete body.id;
  // beforeSave 会把 apiKey 加密入库，create 返回实例上的已是密文。
  // 此处暂存本次提交的原始明文，仅在本响应回显一次供调用方留档，不外泄额外密钥。
  const originalKey = body.apiKey;
  const item = await IntegrationConfig.create(body);
  const json = toSafe(item, true);
  if (originalKey) json.apiKey = originalKey;
  ok(res, json, '创建成功');
}
async function updateSafe(req, res) {
  const item = await IntegrationConfig.findByPk(req.params.id);
  if (!item) return fail(res, '记录不存在', 1, 404);
  const body = { ...req.body };
  delete body.id;
  await item.update(body);
  ok(res, toSafe(item), '更新成功');
}

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

// 说明：覆写方法一律用 asyncHandler 包裹——裸 async 函数在底层查库/参数转换抛错时，
// 会以 unhandledRejection 形式崩掉整个服务器进程（曾因按纯文本 id 查整数主键触发），
// asyncHandler 统一转为 JSON 错误响应。
module.exports = {
  ...base,
  list: asyncHandler(listSafe),
  get: asyncHandler(getSafe),
  create: asyncHandler(createSafe),
  update: asyncHandler(updateSafe),
  trigger,
  registry,
};