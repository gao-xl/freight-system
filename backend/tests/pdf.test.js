// D1 回归测试：PDF 渲染（puppeteer-core + 系统浏览器）
// 无浏览器环境（如 CI runner 未装 chromium）时跳过，不 fail
const { test } = require('node:test');
const assert = require('node:assert');
const { htmlToPdf, findBrowser } = require('../src/services/pdfRenderer');

const HTML = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<style>
  body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',sans-serif;color:#222;}
  table{width:100%;border-collapse:collapse;margin-top:12px;}
  th,td{border:1px solid #333;padding:6px 8px;font-size:13px;}
  th{background:#f5f5f5;}
</style></head><body>
<h2>DEBIT NOTE / 费用通知单</h2>
<table>
  <tr><th>费用项</th><th>币种</th><th>金额</th></tr>
  <tr><td>海运费 OCEAN FREIGHT</td><td>USD</td><td>1,250.00</td></tr>
  <tr><td>文件费 DOCUMENT FEE</td><td>CNY</td><td>300.00</td></tr>
</table>
<div>合计 TOTAL: USD 1,250.00 + CNY 300.00</div>
</body></html>`;

test('D1-1: 浏览器探测（无浏览器则跳过）', (t) => {
  const exe = findBrowser();
  if (!exe) return t.skip('当前环境无 Edge/Chrome/Chromium，跳过 PDF 渲染测试');
  assert.ok(typeof exe === 'string' && exe.length > 0, '应返回浏览器路径');
});

test('D1-2: HTML→PDF 渲染中文+表格', async (t) => {
  const exe = findBrowser();
  if (!exe) return t.skip('当前环境无浏览器，跳过');
  const buf = await htmlToPdf(HTML, 'A4');
  assert.ok(buf && buf.length > 5000, `PDF 应非空且 >5KB，实际 ${buf ? buf.length : 'null'}`);
  // 中文字体嵌入特征（CIDFontType / ToUnicode 出现在 PDF 结构流中）
  const hasCid = buf.includes(Buffer.from('CIDFontType'));
  const hasUnicode = buf.includes(Buffer.from('ToUnicode'));
  assert.ok(hasCid || hasUnicode, 'PDF 应含中文字体嵌入特征（CIDFontType/ToUnicode）');
});
