// Excel 导出工具（exceljs）
const ExcelJS = require('exceljs');
const { logger } = require('../utils/logger');

// 通用导出：data 为对象数组，columns 为 [{ header, key, width, style }]
async function exportBuffer(data, columns, sheetName = 'Sheet1') {
  const wb = new ExcelJS.Workbook();
  wb.creator = '货代管理系统';
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 16 }));
  ws.getRow(1).font = { bold: true };
  for (const row of data) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  logger.info('[EXPORT] Excel 生成', { rows: data.length, sheet: sheetName });
  return buf;
}

module.exports = { exportBuffer };