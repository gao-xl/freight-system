// 全批次回归验证脚本：node src/regression.js
// 覆盖 A/B/C 批次关键接口，输出通过/失败统计
const http = require('http');

const BASE = 'http://localhost:3000';
let token = '';
let pass = 0, fail = 0;
const fails = [];

function req(method, path, body, auth = true) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    const u = new URL(BASE + path);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: { code: buf } }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function check(name, r, expectStatus = [200]) {
  if (expectStatus.includes(r.status)) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; fails.push(name); console.log(`  FAIL  ${name}  状态=${r.status}  msg=${r.body && r.body.message || ''}`); }
}

async function main() {
  // 登录
  const login = await req('POST', '/api/auth/login', { username: 'admin', password: '123456' }, false);
  if (login.status !== 200) { console.log('登录失败，无法继续'); return; }
  token = login.body.data.token;
  console.log('登录成功，开始回归验证...\n');

  // ===== A 批次 =====
  console.log('【A 批次】');
  check('A1 经营指标', await req('GET', '/api/dashboard/metrics'));
  check('A1 应收账龄', await req('GET', '/api/dashboard/aging'));
  check('A1 业务员业绩', await req('GET', '/api/dashboard/sales-performance'));
  check('A2 待跟进客户', await req('GET', '/api/customers/pending-follows'));
  check('A3 登录入参校验(空密码400)', await req('POST', '/api/auth/login', {}, false), [400]);
  check('A4 订单时间线', await req('GET', '/api/orders/1/timeline'), [200, 404]);
  check('A5 单证状态机列表', await req('GET', '/api/documents'));
  check('A6 订单业务节点', await req('GET', '/api/orders/1/flow'), [200, 404]);

  // ===== B 批次 =====
  console.log('\n【B 批次】');
  check('B1 汇率查询', await req('GET', '/api/external/rate'));
  check('B1 运价查询', await req('GET', '/api/external/freight-rate'));
  check('B2 小组列表', await req('GET', '/api/groups'));
  check('B3 流程节点', await req('GET', '/api/flow-nodes'));
  check('B3 流程统计', await req('GET', '/api/flow-stats'));
  check('B4 自定义字段', await req('GET', '/api/custom-fields'));
  check('B5 全文搜索', await req('GET', '/api/documents/search?q=test'));
  check('B6 多币种汇总', await req('GET', '/api/finance/currency-summary'));
  check('B6 信用额度', await req('GET', '/api/finance/customers/1/credit'), [200, 404]);
  check('B8 放单列表', await req('GET', '/api/release'));

  // ===== C 批次 =====
  console.log('\n【C 批次】');
  check('C1 港口列表', await req('GET', '/api/ports'));
  check('C1 港口查询', await req('POST', '/api/ports/query', { port: 'qingdao', containerNo: 'TEST123' }));
  check('C2 EDI 报文列表', await req('GET', '/api/edi/messages'));
  check('C2 EDI 发送订舱', await req('POST', '/api/edi/send-booking', { orderId: 1, carrierId: 1 }), [200, 400]);
  check('C3 美元支付创建', await req('POST', '/api/payments', { amount: 100, currency: 'USD' }));
  check('C3 美元支付列表', await req('GET', '/api/payments'));
  check('C4 汇率实调', await req('GET', '/api/external/vessel/413123456'), [200, 404, 502]);
  check('C5 客户门户概览', await req('GET', '/api/portal/overview'), [200, 400]); // admin 未关联客户档案时预期 400
  check('C6 一单多箱列表', await req('GET', '/api/orders/1/containers'), [200, 404]);
  check('场站名录', await req('GET', '/api/yards'));

  // ===== 基础模块回归 =====
  console.log('\n【基础模块】');
  check('客户列表', await req('GET', '/api/customers'));
  check('供应商列表', await req('GET', '/api/suppliers'));
  check('订单列表', await req('GET', '/api/orders'));
  check('订舱列表', await req('GET', '/api/bookings'));
  check('报关列表', await req('GET', '/api/customs'));
  check('财务列表', await req('GET', '/api/finance'));
  check('运输跟踪', await req('GET', '/api/tracks'));
  check('报价列表', await req('GET', '/api/quotations'));
  check('青岛港看板', await req('GET', '/api/qingdao/nodes?orderId=1'), [200, 404]);
  check('预警中心', await req('GET', '/api/alerts'));
  check('打印模板', await req('GET', '/api/print-templates'));
  check('待办工作台', await req('GET', '/api/tasks/todo'));
  check('看板统计', await req('GET', '/api/dashboard'));
  check('对接配置', await req('GET', '/api/integrations'));
  check('对接注册表', await req('GET', '/api/integrations/registry'));

  console.log(`\n========== 结果 ==========`);
  console.log(`通过: ${pass}  失败: ${fail}`);
  if (fails.length) { console.log('失败项:'); fails.forEach((f) => console.log(`  - ${f}`)); }
  else console.log('全部通过 ✅');
}

main().catch((e) => { console.error('脚本异常:', e.message); process.exit(1); });