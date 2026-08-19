'use strict';

// 共享上传中间件：统一内存上传的配置（文件类型白名单 + 大小限制）。
// 由 routes/index.js 与各业务模块共同引用，避免 multer 配置在多处重复维护后漂移。
// V3 加固：导入仅接受电子表格扩展名，拒绝任意文件上传。
const multer = require('multer');

const IMPORT_EXT = new Set(['.xlsx', '.xls', '.csv']);
function importFileFilter(req, file, cb) {
  const name = (file && file.originalname) || '';
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (IMPORT_EXT.has(ext)) return cb(null, true);
  const e = new Error('不支持的文件类型，导入仅允许 xlsx/xls/csv');
  e.status = 400;
  cb(e);
}

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: importFileFilter,
});

module.exports = { uploadMemory, importFileFilter };