'use strict';

// printService 安全回归测试（tailtest）
// 覆盖风险：存储型 XSS（打印模板渲染未转义业务字段/用户配置值）、javascript: URL 注入。
// 全部为纯函数测试，无 DB / 无网络 / 无真实时钟依赖，hermetic 且确定性。
// 命名风险：E2 安全铁律 —— 任何进入打印 HTML 的业务字段与模板配置值必须转义。

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeHtml, safeUrl, formatValue, getByPath, resolveFields, renderHTML,
} = require('../src/services/printService');

// ---------------------------------------------------------------------------
// 风险 1：escapeHtml 必须转义全部 HTML 特殊字符，阻断 <script> 注入
// ---------------------------------------------------------------------------
test('escapeHtml: 空值返回空串，不抛错', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml: 转义 & < > " \' 五种危险字符', () => {
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('>'), '&gt;');
  assert.equal(escapeHtml('"'), '&quot;');
  assert.equal(escapeHtml("'"), '&#39;');
});

test('escapeHtml: 恶意脚本被完整转义，结果不含可执行标签', () => {
  const evil = `<script>alert(1)</script><img src=x onerror=alert(2)>`;
  const out = escapeHtml(evil);
  assert.ok(!out.includes('<script>'), '不应残留 <script>');
  assert.ok(!out.includes('<img'), '不应残留 <img');
  // 五个危险字符全部转义；onerror= 中的 = 无害，但 < 已转义故不再成标签
  assert.ok(!out.includes('<', 0) || out.includes('&lt;'), '尖括号应被转义');
  // 结果中不出现任何原始可执行标签起始
  assert.ok(!/<[a-z]/i.test(out), '输出不应包含任何 HTML 标签起始');
});

test('escapeHtml: 数字与普通文本保持不变', () => {
  assert.equal(escapeHtml(18500), '18500');
  assert.equal(escapeHtml('青岛海诚国际物流'), '青岛海诚国际物流');
});

// ---------------------------------------------------------------------------
// 风险 2：safeUrl 必须阻断 javascript:/data: 等危险协议，仅放行 http(s)/相对路径
// ---------------------------------------------------------------------------
test('safeUrl: 允许 http/https 绝对 URL', () => {
  assert.equal(safeUrl('https://example.com/logo.png'), 'https://example.com/logo.png');
  assert.equal(safeUrl('http://cdn.example.com/x.jpg'), 'http://cdn.example.com/x.jpg');
});

test('safeUrl: 允许协议相对与普通相对路径', () => {
  assert.equal(safeUrl('//cdn.example.com/a.png'), '//cdn.example.com/a.png');
  assert.equal(safeUrl('/uploads/logo.png'), '/uploads/logo.png');
  assert.equal(safeUrl('logo.png'), 'logo.png');
});

test('safeUrl: 阻断 javascript:、data: 等危险协议，返回空串', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('JaVaScRiPt:alert(1)'), ''); // 大小写不可绕过
  assert.equal(safeUrl('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(safeUrl('vbscript:msgbox(1)'), '');
});

test('safeUrl: 空值返回空串', () => {
  assert.equal(safeUrl(null), '');
  assert.equal(safeUrl(undefined), '');
});

test('safeUrl: 危险协议被阻断后不会产生可注入属性值', () => {
  const out = safeUrl('javascript:alert(1)" onerror="alert(2)');
  assert.equal(out, '');
});

// ---------------------------------------------------------------------------
// 风险 3：formatValue 金额/日期格式化正确，且不引入注入面
// ---------------------------------------------------------------------------
test('formatValue: 空值返回占位符', () => {
  assert.equal(formatValue(null, 'money'), '-');
  assert.equal(formatValue(undefined, 'money'), '-');
  assert.equal(formatValue('', 'money'), '-');
});

test('formatValue: 金额保留两位小数，千分位分组', () => {
  assert.equal(formatValue(18500, 'money'), '18,500.00');
  assert.equal(formatValue(300, 'money'), '300.00');
});

test('formatValue: 非法金额回显原始值', () => {
  assert.equal(formatValue('NaN-bad', 'money'), 'NaN-bad');
});

test('formatValue: 日期格式化为 YYYY-MM-DD', () => {
  assert.equal(formatValue('2026-08-09T00:00:00.000Z', 'date'), '2026-08-09');
});

test('formatValue: 普通文本原样返回', () => {
  assert.equal(formatValue('青岛港', 'text'), '青岛港');
});

// ---------------------------------------------------------------------------
// 风险 4：getByPath 点路径取值，缺失不抛错
// ---------------------------------------------------------------------------
test('getByPath: 取嵌套对象字段', () => {
  const obj = { order: { customer: { name: '海诚' } } };
  assert.equal(getByPath(obj, 'order.customer.name'), '海诚');
});

test('getByPath: 路径缺失返回 undefined 不抛错', () => {
  assert.equal(getByPath({}, 'order.customer.name'), undefined);
  assert.equal(getByPath(null, 'a.b'), undefined);
});

// ---------------------------------------------------------------------------
// 风险 5：resolveFields 用业务数据填充字段（值经 formatValue 归一）
// ---------------------------------------------------------------------------
test('resolveFields: 可见字段用业务数据填充', () => {
  const blocks = [{ type: 'fields', fields: [{ key: 'order.orderNo', show: true, type: 'text' }] }];
  resolveFields(blocks, { order: { orderNo: 'DEMO-O-1' } });
  assert.equal(blocks[0].fields[0].value, 'DEMO-O-1');
});

test('resolveFields: 隐藏字段强制置空', () => {
  const blocks = [{ type: 'fields', fields: [{ key: 'order.orderNo', show: false, type: 'text' }] }];
  resolveFields(blocks, { order: { orderNo: 'DEMO-O-1' } });
  assert.equal(blocks[0].fields[0].value, '');
});

// ---------------------------------------------------------------------------
// 风险 6：renderHTML 端到端 —— 恶意业务数据在最终 HTML 中已被转义
// ---------------------------------------------------------------------------
test('renderHTML: 恶意标题被转义，不产生可执行脚本', () => {
  const blocks = [{
    type: 'header',
    title: 'SEA <script>document.body.innerHTML="x"</script> NOTE',
    align: 'center',
    fontSize: 18,
    bold: false,
  }];
  const html = renderHTML({}, blocks, '', '');
  assert.ok(!html.includes('<script>'), '最终 HTML 不应含 <script>');
  assert.ok(html.includes('&lt;script&gt;'), '应包含转义后的脚本文本');
});

test('renderHTML: header bold=false 时不误加粗，值为空白时兜底 center/18', () => {
  // 回归：escapeHtml(false) 会得到真值字符串 "false"，旧实现致 bold:false 仍加粗
  const normal = renderHTML({}, [{ type: 'header', title: 'T', bold: false }], '', '');
  assert.ok(normal.includes('font-weight:normal'), 'bold=false 应渲染 normal 字重');
  assert.ok(!normal.includes('font-weight:bold'), 'bold=false 不应渲染 bold 字重');

  // 缺省字段兜底：align 空→center、fontSize 空→18
  const fallback = renderHTML({}, [{ type: 'header', title: 'T' }], '', '');
  assert.ok(fallback.includes('text-align:center'), '对齐缺省应兜底 center');
  assert.ok(fallback.includes('font-size:18px'), '字号缺省应兜底 18px');
});

test('renderHTML: fields 区块的 label 与 value 均被转义', () => {
  const blocks = [{
    type: 'fields',
    columns: 1,
    fields: [
      { label: '收货人 <b>', value: '<img src=x onerror=alert(1)>', show: true },
    ],
  }];
  const html = renderHTML({}, blocks, '', '');
  // 业务字段原始可执行标签必须被转义，不能以可执行形式出现
  assert.ok(!html.includes('<img'), 'img 不应以可执行标签出现');
  assert.ok(!html.includes('<b>'), 'label 不应以可执行标签出现');
  assert.ok(html.includes('&lt;img'), 'img 应被转义');
  assert.ok(html.includes('&lt;b&gt;'), 'label 尖括号应被转义');
});

test('renderHTML: 危险 logo URL 被 safeUrl 阻断，不渲染 img 标签', () => {
  const blocks = [{ type: 'logo', url: 'javascript:alert(1)' }];
  const html = renderHTML({}, blocks, '', '');
  assert.ok(!html.includes('<img'), '危险 URL 不应渲染 img');
  assert.ok(!html.includes('javascript:'), '不应泄漏 javascript:');
});

test('renderHTML: 正常 logo URL 正常渲染', () => {
  const blocks = [{ type: 'logo', url: 'https://example.com/logo.png', width: 160 }];
  const html = renderHTML({}, blocks, '', '');
  assert.ok(html.includes('<img src="https://example.com/logo.png"'), '正常 URL 应渲染 img');
});

test('renderHTML: table 单元格数据被转义', () => {
  const blocks = [{
    type: 'table',
    columns: [{ key: 'name', label: '名称' }],
    data: [{ name: '<script>alert(3)</script>' }],
  }];
  const html = renderHTML({}, blocks, '', '');
  assert.ok(!html.includes('<script>'), '表格数据不应含可执行脚本');
  assert.ok(html.includes('&lt;script&gt;'), '表格数据应被转义');
});