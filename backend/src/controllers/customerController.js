const { Customer, Order, FinanceRecord, CustomerFollow, User, Invoice, Quotation, Contact, sequelize } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler, genCode } = require('../utils/response');
const { Op } = require('sequelize');
const { scopedWhere, scopedFindOne, attachOwnership } = require('../middleware/dataScope');
const { parseExcel, buildTemplate, cleanStr } = require('../services/importService');

const base = crudController({
  name: 'customer',
  model: Customer,
  searchFields: ['code', 'name', 'shortName', 'contact', 'phone'],
  codePrefix: 'CUS',
  codeField: 'code',
  order: [['id', 'DESC']],
  scoped: true,
});

// 客户统计概览（订单数、应收余额）
const stats = asyncHandler(async (req, res) => {
  const baseWhere = { status: 'active' };
  const finalWhere = await scopedWhere(req, baseWhere);
  const customers = await Customer.findAll({ where: finalWhere });
  const result = [];
  for (const c of customers) {
    const orderIds = (await Order.findAll({ where: { customerId: c.id }, attributes: ['id'] })).map(o => o.id);
    const orderCount = await Order.count({ where: { customerId: c.id, status: { [Op.ne]: 'cancelled' } } });
    let receivable = 0;
    if (orderIds.length) {
      const records = await FinanceRecord.findAll({
        where: { direction: 'receivable', orderId: { [Op.in]: orderIds } },
        attributes: ['amount', 'paidAmount'],
      });
      receivable = records.reduce((s, r) => s + (Number(r.amount) - Number(r.paidAmount)), 0);
    }
    result.push({ id: c.id, code: c.code, name: c.name, level: c.level, orderCount, receivable });
  }
  ok(res, result);
});

// N4 客户360°聚合：订单/财务/发票/报价/信用/跟进 一屏概览
const overview = asyncHandler(async (req, res) => {
  const cid = Number(req.params.id);
  const customer = await scopedFindOne(req, Customer, { id: cid });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  const orderIds = (await Order.findAll({ where: { customerId: cid }, attributes: ['id'] })).map((o) => o.id);
  const orderStats = {
    total: orderIds.length,
    inProgress: await Order.count({ where: { customerId: cid, status: { [Op.in]: ['confirmed', 'in_progress'] } } }),
    completed: await Order.count({ where: { customerId: cid, status: 'completed' } }),
    cancelled: await Order.count({ where: { customerId: cid, status: 'cancelled' } }),
  };
  let receivable = 0, received = 0, receivableBalance = 0;
  const finance = orderIds.length
    ? await FinanceRecord.findAll({ where: { direction: 'receivable', orderId: { [Op.in]: orderIds } } })
    : [];
  for (const f of finance) {
    const amt = Number(f.amount), paid = Number(f.paidAmount);
    receivable += amt; received += paid; receivableBalance += amt - paid;
  }
  const limit = Number(customer.creditLimit) || 0;
  const credit = {
    limit, used: Number(receivableBalance.toFixed(2)),
    remaining: Math.max(0, Number((limit - receivableBalance).toFixed(2))),
    overLimit: limit > 0 && receivableBalance > limit + 0.001,
  };
  const invoices = await Invoice.findAll({
    where: { customerId: cid }, order: [['id', 'DESC']], limit: 5,
    attributes: ['id', 'invoiceNo', 'amount', 'currency', 'totalAmount', 'status', 'issuedAt', 'createdAt'],
  });
  const quotes = await Quotation.findAll({
    where: { customerId: cid }, order: [['id', 'DESC']], limit: 5,
    attributes: ['id', 'quoteNo', 'totalAmount', 'currency', 'status', 'createdAt'],
  });
  const followCount = await CustomerFollow.count({ where: { customerId: cid } });
  ok(res, {
    customer, orderStats,
    finance: { receivable, received, receivableBalance: Number(receivableBalance.toFixed(2)) },
    credit, invoices, quotes, followCount,
  });
});

// 查询客户跟进记录（含下次跟进、跟进人）
const listFollows = asyncHandler(async (req, res) => {
  const customerId = req.params.id;
  const customer = await scopedFindOne(req, Customer, { id: customerId });
  if (!customer) return fail(res, '客户不存在', 1, 404);
  const rows = await CustomerFollow.findAll({
    where: { customerId },
    include: [{ model: User, as: 'operator', attributes: ['id', 'name', 'username'] }],
    order: [['createdAt', 'DESC']],
  });
  ok(res, rows);
});

// 新增跟进记录（同时更新客户 lastFollowAt/nextFollowAt）
const createFollow = asyncHandler(async (req, res) => {
  const customerId = req.params.id;
  const customer = await scopedFindOne(req, Customer, { id: customerId });
  if (!customer) return fail(res, '客户不存在', 1, 404);
  const { type, content, nextFollowAt, status } = req.body;
  if (!content) return fail(res, '请填写跟进内容', 1, 400);
  const operatorId = req.user.id;
  const follow = await CustomerFollow.create({
    customerId, operatorId, type, content,
    nextFollowAt: nextFollowAt || null,
    status: status || 'done',
  });
  // 同步客户跟进时间
  const update = { lastFollowAt: new Date() };
  if (nextFollowAt) update.nextFollowAt = nextFollowAt;
  else if (status === 'done') update.nextFollowAt = null;
  await customer.update(update);
  ok(res, follow, '跟进已记录');
});

// 更新跟进记录
const updateFollow = asyncHandler(async (req, res) => {
  const follow = await CustomerFollow.findByPk(req.params.followId);
  if (!follow) return fail(res, '跟进记录不存在', 1, 404);
  const customer = await scopedFindOne(req, Customer, { id: follow.customerId });
  if (!customer) return fail(res, '客户不存在', 1, 404);
  const { type, content, nextFollowAt, status } = req.body;
  await follow.update({ type, content, nextFollowAt, status });
  // 同步客户下次跟进时间
  if (customer) {
    const update = {};
    if (nextFollowAt) update.nextFollowAt = nextFollowAt;
    else if (status === 'done') update.nextFollowAt = null;
    await customer.update(update);
  }
  ok(res, follow, '已更新');
});

// 删除跟进记录
const removeFollow = asyncHandler(async (req, res) => {
  const follow = await CustomerFollow.findByPk(req.params.followId);
  if (!follow) return fail(res, '跟进记录不存在', 1, 404);
  const customer = await scopedFindOne(req, Customer, { id: follow.customerId });
  if (!customer) return fail(res, '客户不存在', 1, 404);
  await follow.destroy();
  ok(res, null, '已删除');
});

// 待跟进客户（超期未跟进 / 到了下次跟进时间）
const pendingFollows = asyncHandler(async (req, res) => {
  const now = new Date();
  // B2 数据隔离：仅列出当前用户可见范围内的客户跟进（admin=all 不受限）
  const custWhere = await scopedWhere(req, {});
  const visible = await Customer.findAll({ where: custWhere, attributes: ['id'] });
  const customerIds = visible.map((c) => c.id);
  const rows = await CustomerFollow.findAll({
    where: {
      customerId: { [Op.in]: customerIds },
      nextFollowAt: { [Op.ne]: null, [Op.lte]: now },
    },
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'code', 'name', 'level', 'contact'] },
      { model: User, as: 'operator', attributes: ['id', 'name', 'username'] },
    ],
    order: [['nextFollowAt', 'ASC']],
  });
  // 仅保留最近一条待跟进（同客户去重）
  const seen = new Set();
  const list = rows.filter((r) => (seen.has(r.customerId) ? false : (seen.add(r.customerId), true)));
  ok(res, list);
});

// Excel 批量导入客户：POST /customers/import（multipart，字段 file）
const CUSTOMER_HEADERS = [
  { key: 'name', header: '客户名称', required: true },
  { key: 'code', header: '客户编码（留空自动生成）', required: false },
  { key: 'shortName', header: '简称', required: false },
  { key: 'type', header: '类型(shipper/consignee/forwarder/other)', required: false },
  { key: 'level', header: '等级(A/B/C/D)', required: false },
  { key: 'contact', header: '联系人', required: false },
  { key: 'phone', header: '电话', required: false },
  { key: 'email', header: '邮箱', required: false },
  { key: 'address', header: '地址', required: false },
  { key: 'creditLimit', header: '信用额度', required: false },
  { key: 'businessScope', header: '业务范围', required: false },
  { key: 'taxNo', header: '税号', required: false },
  { key: 'remark', header: '备注', required: false },
];

const importExcel = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, '请上传 Excel 文件', 1, 400);
  const rows = parseExcel(req.file.buffer);
  if (!rows.length) return fail(res, '文件中没有数据', 1, 400);
  const created = [], errors = [];
  // 归属：导入的客户统一归属到当前用户默认组/本人
  const me = await User.findByPk(req.user.id);
  const defaultGroupId = me?.groupId || null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = cleanStr(r['客户名称']);
    if (!name) { errors.push(`第 ${i + 2} 行：缺少客户名称`); continue; }
    const type = cleanStr(r['类型(shipper/consignee/forwarder/other)']);
    const level = cleanStr(r['等级(A/B/C/D)']);
    try {
      const c = await Customer.create({
        name,
        code: cleanStr(r['客户编码（留空自动生成）']) || genCode('CUS'),
        shortName: cleanStr(r['简称']),
        type: ['shipper', 'consignee', 'forwarder', 'other'].includes(type) ? type : 'shipper',
        level: ['A', 'B', 'C', 'D'].includes(level) ? level : 'B',
        contact: cleanStr(r['联系人']),
        phone: cleanStr(r['电话']),
        email: cleanStr(r['邮箱']),
        address: cleanStr(r['地址']),
        creditLimit: Number(r['信用额度']) || 0,
        businessScope: cleanStr(r['业务范围']),
        taxNo: cleanStr(r['税号']),
        remark: cleanStr(r['备注']),
        status: 'active',
        groupId: defaultGroupId,
        ownerId: req.user.id,
      });
      created.push(c.id);
    } catch (e) {
      errors.push(`第 ${i + 2} 行：${e.message}`);
    }
  }
  ok(res, { created: created.length, failed: errors.length, errors }, `成功导入 ${created.length} 条，失败 ${errors.length} 条`);
});

// 下载客户导入模板：GET /customers/import-template
const importTemplate = asyncHandler(async (req, res) => {
  const buf = buildTemplate(CUSTOMER_HEADERS, '客户导入');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="customer-import-template.xlsx"');
  res.send(Buffer.from(buf));
});

// ===== P1 客户多联系人 =====

// 列出客户联系人 GET /customers/:id/contacts
const listContacts = asyncHandler(async (req, res) => {
  const customer = await scopedFindOne(req, Customer, { id: req.params.id });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  const rows = await Contact.findAll({
    where: { customerId: customer.id },
    order: [['isPrimary', 'DESC'], ['id', 'ASC']],
  });
  ok(res, rows);
});

// 新增联系人 POST /customers/:id/contacts
const createContact = asyncHandler(async (req, res) => {
  const customer = await scopedFindOne(req, Customer, { id: req.params.id });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  const { name, position, department, phone, mobile, email, wechat, isPrimary, language, remark } = req.body;
  if (!name) return fail(res, '请填写联系人姓名', 1, 400);
  const t = await sequelize.transaction();
  try {
    if (isPrimary) {
      // 同一客户仅允许一个主联系人，先取消现有主联系人
      await Contact.update({ isPrimary: false }, { where: { customerId: customer.id, isPrimary: true }, transaction: t });
    }
    const contact = await Contact.create({
      customerId: customer.id, name, position, department, phone, mobile, email,
      wechat, isPrimary: !!isPrimary, language: language || 'cn', remark,
      groupId: customer.groupId, ownerId: customer.ownerId,
    }, { transaction: t });
    await t.commit();
    ok(res, contact, '联系人已添加');
  } catch (e) {
    await t.rollback();
    throw e;
  }
});

// 更新联系人 PUT /customers/contacts/:contactId
const updateContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) return fail(res, '联系人不存在', 1, 404);
  const customer = await scopedFindOne(req, Customer, { id: contact.customerId });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  const { name, position, department, phone, mobile, email, wechat, isPrimary, language, remark } = req.body;
  const t = await sequelize.transaction();
  try {
    if (isPrimary) {
      await Contact.update({ isPrimary: false }, { where: { customerId: customer.id, isPrimary: true, id: { [Op.ne]: contact.id } }, transaction: t });
    }
    await contact.update({ name, position, department, phone, mobile, email, wechat, isPrimary: !!isPrimary, language, remark }, { transaction: t });
    await t.commit();
    ok(res, contact, '联系人已更新');
  } catch (e) {
    await t.rollback();
    throw e;
  }
});

// 删除联系人 DELETE /customers/contacts/:contactId
const removeContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findByPk(req.params.contactId);
  if (!contact) return fail(res, '联系人不存在', 1, 404);
  const customer = await scopedFindOne(req, Customer, { id: contact.customerId });
  if (!customer) return fail(res, '客户不存在或无权访问', 1, 404);
  await contact.destroy();
  ok(res, null, '联系人已删除');
});

module.exports = {
  ...base,
  stats,
  overview, // N4 客户360°
  listFollows,
  createFollow,
  updateFollow,
  removeFollow,
  pendingFollows,
  importExcel,
  importTemplate,
  listContacts,
  createContact,
  updateContact,
  removeContact,
};