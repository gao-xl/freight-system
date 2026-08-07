const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Document, Order, Customer, Booking } = require('../models');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { scopedWhere, scopedFindOne } = require('../middleware/dataScope');

// 单证状态机：定义允许流转路径
const DOC_FLOW = {
  draft: ['issued', 'archived'],
  issued: ['sent', 'archived'],
  sent: ['received', 'archived'],
  received: ['archived'],
  archived: [],
};

// 单证类型 → 默认标题/编号前缀
const DOC_META = {
  bl: { title: '海运提单', prefix: 'BL' },
  packing_list: { title: '装箱单', prefix: 'PL' },
  invoice: { title: '商业发票', prefix: 'IV' },
  certificate_of_origin: { title: '原产地证', prefix: 'CO' },
  insurance: { title: '保险单', prefix: 'IN' },
  other: { title: '其他单证', prefix: 'DOC' },
};

// 上传根目录
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 允许上传的扩展名白名单（防上传可执行文件/任意类型）
const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv']);
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_EXT.has(ext)) return cb(null, true);
  cb(new Error('不支持的文件类型，仅允许 ' + [...ALLOWED_EXT].join(', ')));
}

// multer 存储：按 uuid 命名，保留扩展名
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter,
});

const base = crudController({
  model: Document,
  searchFields: ['docNo', 'title'],
  includes: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
  order: [['id', 'DESC']],
  // 系统托管字段：禁止用户通过 create/update/batch-update 篡改存储路径/原文件名/类型/提取状态
  protectedFields: ['filePath', 'originalName', 'mimeType', 'extractionStatus'],
  scoped: true,
});

// 解析并校验上传文件路径，防止路径穿越（../ 越出 UPLOAD_DIR）
function resolveUploadPath(doc) {
  if (!doc.filePath) return null;
  const resolved = path.resolve(UPLOAD_DIR, doc.filePath);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) return null;
  return resolved;
}

// 上传附件：POST /documents/:id/upload
const uploadFile = asyncHandler(async (req, res) => {
  const doc = await scopedFindOne(req, Document, { id: req.params.id });
  if (!doc) return fail(res, '单证不存在', 1, 404);
  if (!req.file) return fail(res, '未接收到文件', 1000, 400);

  const originalName = req.file.originalname;
  const ext = path.extname(originalName || '').toLowerCase();
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  // 记录原文件名用于下载，实际落库为存储文件名
  await doc.update({ filePath: req.file.filename, originalName, mimeType: mimeMap[ext] || req.file.mimetype, extractionStatus: 'pending' });
  // 异步提取文本（不阻塞上传响应）
  require('../services/fileExtractService').extractAndSave(doc).catch(() => {});
  ok(res, { id: doc.id, filePath: doc.filePath, originalName, mimeType: doc.mimeType, extractionStatus: doc.extractionStatus }, '上传成功');
});

// 下载：GET /documents/:id/download（attachment）
const download = asyncHandler(async (req, res) => {
  const doc = await scopedFindOne(req, Document, { id: req.params.id });
  if (!doc) return fail(res, '单证不存在', 1, 404);
  const filePath = resolveUploadPath(doc);
  if (!filePath || !fs.existsSync(filePath)) return fail(res, '文件不存在', 1, 404);
  const name = encodeURIComponent(doc.originalName || `document-${doc.id}`);
  res.download(filePath, doc.originalName || `document-${doc.id}`);
});

// 编号生成：前缀 + 日期 + 序号
async function genDocNo(prefix, docType) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await Document.count({ where: { docType } });
  return `${prefix}${date}${String(count + 1).padStart(3, '0')}`;
}

// A5 一键生成：GET /documents/generate?orderId=&docType=
// 按订单自动生成单证草稿，并套用默认打印模板（返回 HTML 供套打）
const generate = asyncHandler(async (req, res) => {
  const { orderId, docType = 'bl' } = req.query;
  if (!orderId) return fail(res, '缺少 orderId', 1001, 400);
  const validTypes = Object.keys(DOC_META);
  if (!validTypes.includes(docType)) return fail(res, `不支持的 docType：${docType}`, 1002, 400);

  const { buildOrderScopeWhere } = require('../middleware/dataScope');
  const orderWhere = await buildOrderScopeWhere(req, { id: Number(orderId) });
  const order = await Order.findOne({
    where: orderWhere,
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }],
  });
  if (!order) return fail(res, '订单不存在', 1, 404);

  const meta = DOC_META[docType];
  const docNo = await genDocNo(meta.prefix, docType);

  // 生成草稿单证
  const doc = await Document.create({
    docType,
    docNo,
    orderId: order.id,
    title: `${meta.title} - ${order.orderNo}`,
    status: 'draft',
    issuedBy: order.customer?.name || '',
    issueDate: new Date().toISOString().slice(0, 10),
    remark: `由订单 ${order.orderNo} 自动生成`,
    groupId: order.groupId || null,
    ownerId: order.ownerId || req.user.id,
  });

  // 套打预览：复用打印模板引擎（若存在默认模板则渲染 HTML）
  let printHtml = null;
  try {
    const printService = require('../services/printService');
    const { PrintTemplate } = require('../models');
    const tpl = await PrintTemplate.findOne({ where: { docType, isDefault: true } });
    if (tpl) {
      const bizData = await printService.loadBizData(docType, order.id);
      const content = typeof tpl.content === 'string' ? JSON.parse(tpl.content) : tpl.content;
      const blocks = printService.resolveFields(content.blocks || [], bizData);
      printHtml = printService.renderHTML(tpl, blocks, tpl.header, tpl.footer);
    }
  } catch (e) { /* 打印失败不阻断生成 */ }

  const full = await Document.findByPk(doc.id, {
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
  });
  ok(res, { document: full, printHtml }, '单证生成成功');
});

// A5 状态流转：POST /documents/:id/status { to }
const changeStatus = asyncHandler(async (req, res) => {
  const { to } = req.body;
  const doc = await scopedFindOne(req, Document, { id: req.params.id });
  if (!doc) return fail(res, '单证不存在', 1, 404);
  const allowed = DOC_FLOW[doc.status] || [];
  if (!to) return fail(res, '缺少目标状态 to', 1001, 400);
  if (!allowed.includes(to)) return fail(res, `不允许从「${doc.status}」流转到「${to}」`, 1003, 400);
  await doc.update({ status: to });
  const full = await Document.findByPk(doc.id, {
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
  });
  ok(res, full, '状态已更新');
});

// B5 全文搜索：GET /documents/search?q=  在单证内容（提取文本）中检索
const searchContent = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return fail(res, '缺少搜索关键字 q', 1001, 400);
  const kw = q.trim();
  const { Op } = require('sequelize');
  const baseWhere = {
    [Op.or]: [
      { extractedText: { [Op.like]: `%${kw}%` } },
      { docNo: { [Op.like]: `%${kw}%` } },
      { title: { [Op.like]: `%${kw}%` } },
    ],
  };
  const finalWhere = await scopedWhere(req, baseWhere);
  const rows = await Document.findAll({
    where: finalWhere,
    attributes: ['id', 'docType', 'docNo', 'title', 'orderId', 'status', 'originalName', 'extractionStatus'],
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
    order: [['id', 'DESC']],
    limit: 50,
  });
  ok(res, { keyword: kw, total: rows.length, list: rows });
});

// 预览（inline）：GET /documents/:id/file
const preview = asyncHandler(async (req, res) => {
  const doc = await scopedFindOne(req, Document, { id: req.params.id });
  if (!doc) return fail(res, '单证不存在', 1, 404);
  const filePath = resolveUploadPath(doc);
  if (!filePath || !fs.existsSync(filePath)) return fail(res, '文件不存在', 1, 404);
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(doc.originalName || 'preview') + '"');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = { ...base, upload, uploadFile, download, preview, generate, changeStatus, DOC_FLOW, searchContent };