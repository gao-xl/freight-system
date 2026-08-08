// 文件文本提取服务（B5）
// 支持 Word(docx/doc)、PDF、Excel(xlsx/xls) 文本提取，供全文检索使用。
// 依赖：mammoth / word-extractor / pdf-parse / xlsx
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');

let mammoth = null, wordExtractor = null, pdfParse = null, xlsxLib = null;
try { mammoth = require('mammoth'); } catch (e) { /* optional */ }
try { wordExtractor = require('word-extractor'); } catch (e) { /* optional */ }
try { pdfParse = require('pdf-parse'); } catch (e) { /* optional */ }
try { xlsxLib = require('xlsx'); } catch (e) { /* optional */ }

// 按扩展名提取文本
// D9 修复：提取上限 20MB，超出直接抛错（err.code='EXTRACT_TOO_LARGE'），避免大文件整读入内存导致 OOM
const MAX_EXTRACT_BYTES = 20 * 1024 * 1024;
async function extractFile(filePath, originalName = '') {
  const ext = path.extname(originalName || filePath).toLowerCase();
  const size = fs.statSync(filePath).size;
  if (size > MAX_EXTRACT_BYTES) {
    const e = new Error(`文件超过提取上限 ${MAX_EXTRACT_BYTES / 1024 / 1024}MB，跳过文本提取`);
    e.code = 'EXTRACT_TOO_LARGE';
    throw e;
  }
  const buf = fs.readFileSync(filePath);
  switch (ext) {
    case '.docx':
      if (!mammoth) throw new Error('mammoth 未安装，无法解析 .docx');
      return (await mammoth.extractRawText({ buffer: buf })).value || '';
    case '.doc':
      if (!wordExtractor) throw new Error('word-extractor 未安装，无法解析 .doc');
      const doc = await wordExtractor().extract(buf);
      return doc.getBody() || '';
    case '.pdf':
      if (!pdfParse) throw new Error('pdf-parse 未安装，无法解析 .pdf');
      const pdf = await pdfParse(buf);
      return pdf.text || '';
    case '.xlsx':
    case '.xls':
      if (!xlsxLib) throw new Error('xlsx 未安装，无法解析 Excel');
      const wb = xlsxLib.read(buf, { type: 'buffer' });
      const parts = [];
      for (const name of wb.SheetNames) {
        const rows = xlsxLib.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
        for (const row of rows) {
          if (Array.isArray(row)) parts.push(row.filter((c) => c !== null && c !== undefined).join(' '));
        }
      }
      return parts.join('\n');
    case '.txt':
    case '.csv':
      return buf.toString('utf8');
    case '.html':
    case '.htm':
      return buf.toString('utf8').replace(/<[^>]+>/g, ' ');
    default:
      return '';
  }
}

// 提取并更新 Document 记录（异步调用）
async function extractAndSave(document) {
  if (!document || !document.filePath) return;
  try {
    const filePath = path.resolve(__dirname, '../../uploads', document.filePath);
    if (!fs.existsSync(filePath)) {
      await document.update({ extractionStatus: 'failed', extractedText: '' });
      return;
    }
    const text = await extractFile(filePath, document.originalName);
    await document.update({ extractionStatus: 'done', extractedText: text });
    logger.info('[EXTRACT] 文件文本提取完成', { id: document.id, chars: text.length });
  } catch (e) {
    if (e.code === 'EXTRACT_TOO_LARGE') {
      // D9：超限文件不提取也不报失败，标记 skipped 供前端展示
      await document.update({ extractionStatus: 'skipped', extractedText: '' });
      return;
    }
    logger.error('[EXTRACT] 文件文本提取失败', { id: document.id, message: e.message });
    await document.update({ extractionStatus: 'failed', extractedText: '' });
  }
}

module.exports = { extractFile, extractAndSave };