const { QuotationTemplate } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');

const base = crudController({
  model: QuotationTemplate,
  searchFields: ['name', 'originPort', 'destPort'],
  order: [['id', 'DESC']],
  scoped: true,
});

// 按条件筛选可用模板（匹配运输方式/服务类型/起运港/目的港）
const match = asyncHandler(async (req, res) => {
  const { type, mode, serviceType, originPort, destPort } = req.query;
  const where = {};
  if (type) where.type = type;
  if (mode) where.mode = mode;
  if (serviceType) where.serviceType = serviceType;
  const rows = await QuotationTemplate.findAll({
    where,
    order: [
      // 优先匹配港口完全一致的模板
      [QuotationTemplate.sequelize.literal(
        `CASE WHEN originPort=${QuotationTemplate.sequelize.escape(originPort || '')} AND destPort=${QuotationTemplate.sequelize.escape(destPort || '')} THEN 0 ELSE 1 END`
      )],
      ['id', 'DESC'],
    ],
    limit: 20,
  });
  ok(res, rows);
});

module.exports = { ...base, match };