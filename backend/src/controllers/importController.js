// Excel 批量导入控制器（客户/供应商/订单）
// 职责：路由入口编排 —— 校验 biz -> 解析 xlsx -> 逐行校验 -> 事务写入 -> 汇总报告。
// 具体业务规则（表头/示例/唯一性/日期校验）在 services/importBizService.js 中按类型配置。
const { Op } = require('sequelize');
const { User, Customer, sequelize } = require('../models');
const { ok, fail, asyncHandler } = require('../utils/response');
const { requirePermission } = require('../middleware/auth');
const { parseExcel } = require('../services/importService');
const { logger } = require('../utils/logger');
const {
  BIZ_CONFIG,
  pick,
  normalizeRow,
  ensureCodes,
  friendlyDbError,
  buildTemplateBuffer,
} = require('../services/importBizService');

// 动态权限中间件：按 :biz 映射到 customer/supplier/order 模块的指定权限
// 模板下载用 read，导入写入用 create（与既有 /customers/import 等权限口径一致）
function importGuard(action) {
  return (req, res, next) => {
    const cfg = BIZ_CONFIG[req.params.biz];
    if (!cfg) return res.status(400).json({ code: 1, message: `不支持的导入类型：${req.params.biz}` });
    return requirePermission(cfg.module, action)(req, res, next);
  };
}

/**
 * @openapi
 * /api/import/templates/{biz}:
 *   get:
 *     tags: [导入]
 *     summary: 下载 Excel 导入模板
 *     description: |
 *       按业务类型生成带中文表头与示例行的 xlsx 模板。
 *       biz 支持 customer（客户）、supplier（供应商）、order（订单）。
 *     parameters:
 *       - in: path
 *         name: biz
 *         required: true
 *         schema:
 *           type: string
 *           enum: [customer, supplier, order]
 *         description: 业务类型
 *     responses:
 *       200:
 *         description: xlsx 文件（attachment 下载）
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 不支持的导入类型
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const template = asyncHandler(async (req, res) => {
  const cfg = BIZ_CONFIG[req.params.biz];
  if (!cfg) return fail(res, `不支持的导入类型：${req.params.biz}`, 1, 400);
  const buf = buildTemplateBuffer(cfg);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${cfg.biz}-import-template.xlsx"`);
  res.send(Buffer.from(buf));
});

/**
 * @openapi
 * /api/import/{biz}:
 *   post:
 *     tags: [导入]
 *     summary: Excel 批量导入
 *     description: |
 *       multipart 上传 xlsx（字段名 file），逐行校验后导入。
 *       单行失败不阻断整体：返回成功/失败行报告，成功行在同一事务内统一提交。
 *       errors[].row 为 Excel 行号（表头占第 1 行，数据从第 2 行起）。
 *     parameters:
 *       - in: path
 *         name: biz
 *         required: true
 *         schema:
 *           type: string
 *           enum: [customer, supplier, order]
 *         description: 业务类型
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: xlsx 文件（≤10MB）
 *     responses:
 *       200:
 *         description: 导入结果
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, description: 数据总行数 }
 *                         success: { type: integer, description: 成功行数 }
 *                         failed: { type: integer, description: 失败行数 }
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               row: { type: integer, description: Excel 行号（从 1 起） }
 *                               message: { type: string }
 *       400:
 *         description: 文件缺失 / 无法解析 / 不支持的导入类型
 *       500:
 *         description: 事务失败，已整体回滚
 */
const importFile = asyncHandler(async (req, res) => {
  const cfg = BIZ_CONFIG[req.params.biz];
  if (!cfg) return fail(res, `不支持的导入类型：${req.params.biz}`, 1, 400);
  if (!req.file) return fail(res, '请上传 Excel 文件', 1, 400);

  let rawRows;
  try {
    rawRows = parseExcel(req.file.buffer);
  } catch (e) {
    return fail(res, '无法解析文件，请上传有效的 xlsx 文件', 1, 400);
  }
  // 去掉整行为空的尾行/杂行
  const rows = rawRows
    .map(normalizeRow)
    .filter((r) => Object.keys(r).some((k) => String(r[k] || '').trim() !== ''));
  if (!rows.length) return fail(res, '文件中没有数据', 1, 400);

  const me = await User.findByPk(req.user.id);
  const ctx = {
    groupId: me && me.groupId ? me.groupId : null,
    ownerId: req.user.id,
    seen: new Set(),
    customerMap: null,
  };

  // 订单导入：一次性解析客户名称 -> id（避免逐行查询）
  if (cfg.module === 'order') {
    const names = [...new Set(rows.map((r) => cleanValue(pick(r, '客户名称'))).filter(Boolean))];
    const found = names.length
      ? await Customer.findAll({ where: { name: { [Op.in]: names } }, attributes: ['id', 'name'] })
      : [];
    ctx.customerMap = new Map(found.map((c) => [c.name, c.id]));
  }

  // 一次性取回库中已存在的唯一字段值集合
  const inFileValues = [...new Set(rows.map((r) => cleanValue(pick(r, cfg.uniqueColumn))).filter(Boolean))];
  const existing = inFileValues.length
    ? await cfg.model.findAll({ where: { [cfg.uniqueField]: { [Op.in]: inFileValues } }, attributes: [cfg.uniqueField] })
    : [];
  const existingSet = new Set(existing.map((x) => String(x[cfg.uniqueField])));

  // 逐行校验：失败行记入 errors，不阻断整体
  const validRows = [];
  const errors = [];
  rows.forEach((r, i) => {
    const rowNo = i + 2; // 表头占第 1 行，数据从第 2 行起
    const result = cfg.validate(r, ctx, existingSet);
    if (result.ok) validRows.push({ rowNo, data: result.data });
    else errors.push({ row: rowNo, message: result.message });
  });

  // 客户/供应商先分配业务编码，并核对库中占用
  await ensureCodes(cfg, validRows);

  // 事务写入：成功行统一提交；单行数据库异常捕获后继续，最终仍提交其余行
  let success = 0;
  if (validRows.length) {
    const t = await sequelize.transaction();
    try {
      for (const v of validRows) {
        try {
          await cfg.model.create(v.data, { transaction: t });
          success += 1;
        } catch (e) {
          errors.push({ row: v.rowNo, message: friendlyDbError(e, cfg) });
        }
      }
      await t.commit();
    } catch (e) {
      await t.rollback();
      logger.error('[IMPORT] 事务失败', { biz: cfg.biz, message: e.message });
      return fail(res, '导入失败，已回滚，未写入任何数据', 1, 500);
    }
  }

  const total = rows.length;
  const failed = errors.length;
  ok(res, { total, success, failed, errors }, `成功导入 ${success} 条，失败 ${failed} 条`);
});

function cleanValue(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

module.exports = { importGuard, template, importFile };
