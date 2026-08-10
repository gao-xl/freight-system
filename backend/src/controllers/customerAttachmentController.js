// P1 客户附件控制器：上传/下载/列表/删除
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { CustomerAttachment, Customer } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const { scopedFindOne } = require('../middleware/dataScope');

// 上传根目录（与单证上传共用，避免重复目录）
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 允许上传的扩展名白名单（防上传可执行文件/任意类型）
const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv']);
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_EXT.has(ext)) return cb(null, true);
  cb(new Error('不支持的文件类型，仅允许 ' + [...ALLOWED_EXT].join(', ')));
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 }, fileFilter });

// 解析并校验存储路径，防止路径穿越（../ 越出 UPLOAD_DIR）
function resolveUploadPath(att) {
  if (!att.filePath) return null;
  const resolved = path.resolve(UPLOAD_DIR, att.filePath);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) return null;
  return resolved;
}

// 列表：GET /customers/:id/attachments
const list = asyncHandler(async (req, res) => {
  const customer = await scopedFindOne(req, Customer, { id: req.params.id });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  const rows = await CustomerAttachment.findAll({
    where: { customerId: customer.id },
    order: [['id', 'DESC']],
    attributes: ['id', 'customerId', 'category', 'title', 'originalName', 'mimeType', 'size', 'remark', 'uploadedBy', 'createdAt'],
  });
  ok(res, rows);
});

// 上传：POST /customers/:id/attachments（multipart 字段 file；可选 category/title/remark）
const create = asyncHandler(async (req, res) => {
  const customer = await scopedFindOne(req, Customer, { id: req.params.id });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  if (!req.file) return fail(res, '请选择要上传的文件', 1, 400);
  const { category = 'other', title, remark } = req.body;
  const originalName = req.file.originalname;
  const att = await CustomerAttachment.create({
    customerId: customer.id,
    category,
    title: title || originalName,
    filePath: req.file.filename,
    originalName,
    mimeType: req.file.mimetype,
    size: req.file.size,
    remark: remark || null,
    uploadedBy: req.user?.id,
    groupId: customer.groupId,
    ownerId: customer.ownerId,
  });
  ok(res, { id: att.id, category: att.category, title: att.title, originalName, size: att.size }, '上传成功');
});

// 下载：GET /customers/attachments/:id/download
const download = asyncHandler(async (req, res) => {
  const att = await CustomerAttachment.findByPk(req.params.id);
  if (!att) return fail(res, '附件不存在', 1, 404);
  const customer = await scopedFindOne(req, Customer, { id: att.customerId });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  const filePath = resolveUploadPath(att);
  if (!filePath || !fs.existsSync(filePath)) return fail(res, '文件不存在或不完整', 1, 404);
  res.download(filePath, att.originalName || `attachment-${att.id}`);
});

// 删除：DELETE /customers/attachments/:id
const remove = asyncHandler(async (req, res) => {
  const att = await CustomerAttachment.findByPk(req.params.id);
  if (!att) return fail(res, '附件不存在', 1, 404);
  const customer = await scopedFindOne(req, Customer, { id: att.customerId });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  // 软删除记录；物理文件一并清理（尽力而为，失败不阻断）
  const filePath = resolveUploadPath(att);
  if (filePath && fs.existsSync(filePath)) fs.unlink(filePath, () => {});
  await att.destroy();
  ok(res, null, '附件已删除');
});

module.exports = { upload, list, create, download, remove };