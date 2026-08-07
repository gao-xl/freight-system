// 打印模板控制器
// 模板管理 + 字段库 + 预览 + PDF 渲染
const { ok, fail, asyncHandler } = require('../utils/response');
const { crudController } = require('./baseController');
const { PrintTemplate } = require('../models');
const { FIELDS, defaultContent } = require('../data/printFields');
const printService = require('../services/printService');

const base = crudController({ model: PrintTemplate, searchFields: ['name'], order: [['id', 'DESC']] });

// GET /print-templates?docType=bl  列表（按单据类型过滤）
const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.docType) where.docType = req.query.docType;
  const list = await PrintTemplate.findAll({ where, order: [['isDefault', 'DESC'], ['id', 'DESC']] });
  ok(res, list);
});

// POST /print-templates  新增（默认填充 content）
const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  delete body.id;
  if (!body.content) body.content = JSON.stringify(defaultContent(body.docType));
  const item = await PrintTemplate.create(body);
  ok(res, item, '创建成功');
});

// POST /print-templates/:id/copy  复制模板
const copy = asyncHandler(async (req, res) => {
  const src = await PrintTemplate.findByPk(req.params.id);
  if (!src) return fail(res, '模板不存在', 1, 404);
  const item = await PrintTemplate.create({
    name: `${src.name}（副本）`,
    docType: src.docType,
    content: src.content,
    pageSize: src.pageSize,
    logoUrl: src.logoUrl,
    header: src.header,
    footer: src.footer,
    isDefault: false,
  });
  ok(res, item, '复制成功');
});

// PUT /print-templates/:id/default  设为默认（同类型其它取消）
const setDefault = asyncHandler(async (req, res) => {
  const tpl = await PrintTemplate.findByPk(req.params.id);
  if (!tpl) return fail(res, '模板不存在', 1, 404);
  await PrintTemplate.update({ isDefault: false }, { where: { docType: tpl.docType } });
  await tpl.update({ isDefault: true });
  ok(res, tpl, '已设为默认');
});

// GET /print-templates/fields/:docType  字段库
const fields = asyncHandler(async (req, res) => {
  ok(res, FIELDS[req.params.docType] || []);
});

// POST /print-templates/:id/preview  用示例数据预览（返回 HTML）
const preview = asyncHandler(async (req, res) => {
  const tpl = await PrintTemplate.findByPk(req.params.id);
  if (!tpl) return fail(res, '模板不存在', 1, 404);
  const bizData = req.body?.data || {};
  const content = typeof tpl.content === 'string' ? JSON.parse(tpl.content) : tpl.content;
  const blocks = printService.resolveFields(content.blocks || [], bizData);
  const html = printService.renderHTML(tpl, blocks, tpl.header, tpl.footer);
  ok(res, { html });
});

// GET /print/:docType/:bizId?template=&format=pdf|html  渲染并下载
const print = asyncHandler(async (req, res) => {
  const { docType, bizId } = req.params;
  const templateId = req.query.template || null;
  const format = req.query.format || 'pdf';
  const { html, pdf, tpl } = await printService.render(templateId, docType, bizId);
  if (format === 'html') {
    res.type('html').send(html);
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${docType}-${bizId}.pdf"`);
  res.send(pdf);
});

module.exports = { ...base, list, create, copy, setDefault, fields, preview, print };