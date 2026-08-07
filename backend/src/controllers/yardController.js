// 场站信息查询控制器
const { ok, fail, asyncHandler } = require('../utils/response');
const { crudController } = require('../controllers/baseController');
const { YardMeta } = require('../models');
const svc = require('../services/yardService');

// 场站名录 CRUD（复用通用 CRUD）
const metaBase = crudController({
  model: YardMeta,
  searchFields: ['code', 'name'],
  order: [['id', 'ASC']],
});

// GET /yards  场站名录列表
const yards = asyncHandler(async (req, res) => {
  const list = await svc.listYards();
  ok(res, list);
});

// GET /yards/status?containerNo=&billNo=&yardCode=  按箱号/提单号+场站查询
const status = asyncHandler(async (req, res) => {
  const { containerNo, billNo, yardCode } = req.query;
  if ((!containerNo && !billNo) || !yardCode) {
    return fail(res, '请提供箱号/提单号 与 场站编码', 1, 400);
  }
  const data = await svc.queryContainer(
    { containerNo, billNo, yardCode },
    req.user?.id
  );
  ok(res, data);
});

// POST /yards/query  手动触发场站状态查询
const query = asyncHandler(async (req, res) => {
  const { containerNo, billNo, yardCode } = req.body || {};
  if ((!containerNo && !billNo) || !yardCode) {
    return fail(res, '请提供箱号/提单号 与 场站编码', 1, 400);
  }
  const data = await svc.queryContainer(
    { containerNo, billNo, yardCode },
    req.user?.id
  );
  ok(res, data, '查询完成');
});

// GET /yards/records?orderId=&containerNo=&billNo=  历史查询记录
const records = asyncHandler(async (req, res) => {
  const data = await svc.records({
    orderId: req.query.orderId ? parseInt(req.query.orderId, 10) : null,
    containerNo: req.query.containerNo,
    billNo: req.query.billNo,
  });
  ok(res, data);
});

// POST /yards 或 PUT /yards/:id 已有（去重接口名，人工录入走 POST /yards/records）
// PUT /yards/:id  人工录入/修正场站状态
const manualCreate = asyncHandler(async (req, res) => {
  const rec = await svc.manualUpsert(req.body || {}, req.user?.id);
  ok(res, rec, '已录入');
});

module.exports = {
  ...metaBase,
  yards,
  status,
  query,
  records,
  manualCreate,
};