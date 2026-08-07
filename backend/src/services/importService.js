// Excel 批量导入工具（xlsx）
const XLSX = require('xlsx');
const { logger } = require('../utils/logger');

// 解析上传的 Excel 文件为对象数组
// opts: { buffer, sheetName }
function parseExcel(buffer, sheetName) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
  if (!ws) throw new Error('未找到工作表');
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows;
}

// 生成供前端下载的导入模板（Excel buffer）
function buildTemplate(headers, sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([{}]);
  // 表头为 keys，示例为空
  const headerRow = {};
  headers.forEach((h) => { headerRow[h.key] = ''; });
  const dataSheet = XLSX.utils.json_to_sheet([headerRow]);
  XLSX.utils.book_append_sheet(wb, dataSheet, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  logger.info('[IMPORT] 模板生成', { sheet: sheetName, cols: headers.length });
  return buf;
}

// 通用单行清洗：去除多余的空白字符
function cleanStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

module.exports = { parseExcel, buildTemplate, cleanStr };