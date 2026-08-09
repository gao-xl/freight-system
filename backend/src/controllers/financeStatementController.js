// P2.4 对账单控制器：按客户 + 月份聚合应收/应付
// GET /finance/statement?customerId=&month=YYYY-MM
// - 传 customerId：返回该客户当月明细 { customer, month, receivable, payable, balance, records }
// - 不传 customerId：按客户分组返回列表（每组含 customer/receivable/payable/balance）
// 归属规则：优先取记录所属订单的 customerId；无订单的应收记录用 counterpartyId 兜底（往来单位即客户）
const { FinanceRecord, Order, Customer } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const { Op } = require('sequelize');
const { scopedWhere } = require('../middleware/dataScope');

const statement = asyncHandler(async (req, res) => {
  const { customerId } = req.query;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return fail(res, 'month 参数格式应为 YYYY-MM', 1, 400);
  const monthNum = Number(month.slice(5, 7));
  if (monthNum < 1 || monthNum > 12) return fail(res, 'month 参数格式应为 YYYY-MM', 1, 400);
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const finalWhere = await scopedWhere(req, { createdAt: { [Op.gte]: start, [Op.lt]: end } });
  const rows = await FinanceRecord.findAll({
    where: finalWhere,
    include: [{
      model: Order, as: 'order', attributes: ['id', 'orderNo', 'customerId'],
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
    }],
    order: [['id', 'ASC']],
  });

  // 客户名映射（数据隔离范围内），用于无订单应收记录的 counterpartyId 兜底
  const custWhere = await scopedWhere(req, {});
  const customers = await Customer.findAll({ where: custWhere, attributes: ['id', 'name'] });
  const nameMap = new Map(customers.map((c) => [c.id, c.name]));

  const resolveCustomer = (r) => {
    const c = r.order?.customer;
    if (c) return { id: c.id, name: c.name };
    if (r.direction === 'receivable' && r.counterpartyId != null && nameMap.has(r.counterpartyId)) {
      return { id: r.counterpartyId, name: nameMap.get(r.counterpartyId) };
    }
    return { id: null, name: '未关联客户' };
  };

  const toRecord = (r) => ({
    id: r.id,
    direction: r.direction,
    amount: Number(r.amount),
    localAmount: r.localAmount != null ? Number(r.localAmount) : null,
    description: r.description,
    createdAt: r.createdAt,
  });

  const round2 = (n) => Number(n.toFixed(2));

  const customerIdNum = customerId ? Number(customerId) : null;
  if (customerIdNum) {
    const filtered = rows.filter((r) => resolveCustomer(r).id === customerIdNum);
    const customer = customers.find((c) => c.id === customerIdNum) || { id: customerIdNum, name: `客户#${customerIdNum}` };
    let receivable = 0, payable = 0;
    const records = filtered.map((r) => {
      const amt = Number(r.amount);
      if (r.direction === 'receivable') receivable += amt;
      else payable += amt;
      return toRecord(r);
    });
    return ok(res, { customer, month, receivable: round2(receivable), payable: round2(payable), balance: round2(receivable - payable), records });
  }

  // 未传 customerId：按客户分组
  const groups = new Map();
  for (const r of rows) {
    const c = resolveCustomer(r);
    const key = c.id == null ? '__unattached__' : String(c.id);
    const g = groups.get(key) || { customer: c, receivable: 0, payable: 0 };
    const amt = Number(r.amount);
    if (r.direction === 'receivable') g.receivable += amt;
    else g.payable += amt;
    groups.set(key, g);
  }
  const list = [...groups.values()].map((g) => ({ ...g, receivable: round2(g.receivable), payable: round2(g.payable), balance: round2(g.receivable - g.payable) }));
  ok(res, { month, list });
});

module.exports = { statement };
