// 入参校验 schema 集中定义（joi）
// 约定：createSchema 校验必填；updateSchema 全部可选但校验类型/枚举
// 均 .unknown(true) 允许额外字段，避免误伤扩展字段
const Joi = require('joi');

const id = Joi.number().integer().positive();
const str = (max) => Joi.string().trim().max(max).allow('', null);
const text = Joi.string().allow('', null);
const dec = Joi.number().allow(null);
const date = Joi.date().allow(null);
const dateOnly = Joi.alternatives().try(Joi.date(), Joi.date().iso()).allow(null, '');
const enumVal = (vals) => Joi.string().valid(...vals).allow('', null);

// 认证
const login = Joi.object({
  username: Joi.string().trim().max(50).required(),
  password: Joi.string().max(255).required(),
}).unknown(true);

const changePassword = Joi.object({
  oldPassword: Joi.string().max(255).required(),
  newPassword: Joi.string().min(6).max(255).required(),
}).unknown(true);

// 客户
const customerBase = Joi.object({
  code: str(30),
  name: str(100),
  shortName: str(50),
  type: enumVal(['shipper', 'consignee', 'forwarder', 'importer', 'exporter', 'other']),
  level: enumVal(['A', 'B', 'C', 'D']),
  contact: str(50),
  phone: str(30),
  email: Joi.string().email().max(100).allow('', null),
  address: str(255),
  creditLimit: dec,
  businessScope: str(255),
  taxNo: str(50),
  remark: text,
  status: enumVal(['active', 'inactive']),
  lastFollowAt: date,
  nextFollowAt: date,
});
const customerCreate = customerBase.keys({ name: Joi.string().trim().max(100).required() });
const customerUpdate = customerBase;

// 供应商
const supplierBase = Joi.object({
  code: str(30),
  name: str(100),
  category: enumVal(['carrier', 'airline', 'customs_broker', 'truck', 'warehouse', 'other']),
  contact: str(50),
  phone: str(30),
  email: Joi.string().email().max(100).allow('', null),
  address: str(255),
  ports: str(255),
  contractNo: str(50),
  paymentTerms: str(100),
  remark: text,
  status: enumVal(['active', 'inactive']),
});
const supplierCreate = supplierBase.keys({ name: Joi.string().trim().max(100).required() });
const supplierUpdate = supplierBase;

// 订单
const orderBase = Joi.object({
  orderNo: str(40),
  customerId: id,
  type: enumVal(['import', 'export', 'transit']),
  mode: enumVal(['sea', 'air', 'land', 'rail']),
  serviceType: enumVal(['fcl', 'lcl', 'charter', 'express']),
  status: enumVal(['draft', 'confirmed', 'in_progress', 'completed', 'cancelled']),
  originPort: str(50),
  destPort: str(50),
  originPlace: str(100),
  destPlace: str(100),
  cargoDesc: str(255),
  cargoWeight: Joi.number().min(0).allow(null),
  cargoVolume: Joi.number().min(0).allow(null),
  packageCount: Joi.number().integer().min(0).allow(null),
  containerNo: str(50),
  etd: dateOnly,
  eta: dateOnly,
  terminal: str(20),
  openTime: date,
  cutoffTime: date,
  currency: str(10),
  totalAmount: dec,
  quotationId: id,
  salesId: id,
  releaseStatus: enumVal(['none', 'pending', 'approved', 'delivered']),
  remark: text,
});
const orderCreate = orderBase.keys({ customerId: id.required() });
const orderUpdate = orderBase;

// 订舱
const bookingBase = Joi.object({
  bookingNo: str(40),
  orderId: id,
  supplierId: id,
  vesselName: str(80),
  voyageNo: str(40),
  flightNo: str(40),
  containerType: str(20),
  containerQty: Joi.number().integer().min(0).allow(null),
  teu: dec,
  status: enumVal(['new', 'confirmed', 'loading', 'shipped', 'cancelled']),
  bookingDate: dateOnly,
  etd: dateOnly,
  eta: dateOnly,
  freightCharge: dec,
  remark: text,
});
const bookingCreate = bookingBase.keys({ orderId: id.required() });
const bookingUpdate = bookingBase;

// 报关
const customsBase = Joi.object({
  declNo: str(40),
  orderId: id,
  supplierId: id,
  type: enumVal(['export_clearance', 'import_clearance', 'inspection']),
  status: enumVal(['prepared', 'submitted', 'inspecting', 'released', 'rejected', 'closed']),
  customsNo: str(50),
  hsCode: str(20),
  customsValue: dec,
  taxAmount: dec,
  inspectionResult: str(255),
  submitDate: dateOnly,
  releaseDate: dateOnly,
  remark: text,
});
const customsCreate = customsBase.keys({ orderId: id.required() });
const customsUpdate = customsBase;

// 单证
const documentBase = Joi.object({
  docType: enumVal(['bl', 'packing_list', 'invoice', 'certificate_of_origin', 'insurance', 'other']),
  docNo: str(50),
  orderId: id,
  title: str(100),
  status: enumVal(['draft', 'issued', 'sent', 'received', 'archived']),
  issuedBy: str(50),
  issueDate: dateOnly,
  remark: text,
});
const documentCreate = documentBase;
const documentUpdate = documentBase;

// 财务流水
const financeBase = Joi.object({
  orderId: id,
  direction: enumVal(['receivable', 'payable']),
  category: enumVal(['ocean_freight', 'air_freight', 'local_charge', 'customs_fee', 'document_fee', 'warehouse_fee', 'transport_fee', 'other']),
  description: str(255),
  amount: dec,
  currency: str(10),
  rate: dec,
  exchangeRate: dec, // P2.4 本币折算汇率（可空；不传时由服务端按币种查询）
  status: enumVal(['unpaid', 'partial', 'paid', 'waived']),
  counterpartyId: id,
  invoiceNo: str(50),
  paidAmount: dec,
  dueDate: dateOnly,
  remark: text,
});
const financeCreate = financeBase.keys({ direction: Joi.string().valid('receivable', 'payable').required() });
const financeUpdate = financeBase;

// 客户跟进
const followBase = Joi.object({
  type: enumVal(['call', 'visit', 'email', 'wechat', 'quotation', 'order', 'meeting', 'other']),
  content: text,
  nextFollowAt: date,
  status: enumVal(['open', 'done']),
});
const followCreate = followBase.keys({ content: Joi.string().trim().min(1).max(2000).required() });
const followUpdate = followBase;

// 用户
const userCreate = Joi.object({
  username: Joi.string().trim().min(2).max(50).required(),
  name: Joi.string().trim().max(50).required(),
  password: Joi.string().min(6).max(255).required(),
  role: enumVal(['admin', 'manager', 'operator', 'finance', 'viewer']),
  email: Joi.string().email().max(100).allow('', null),
  phone: str(30),
  roleIds: Joi.array().items(id),
}).unknown(true);
const userUpdate = Joi.object({
  name: str(50),
  role: enumVal(['admin', 'manager', 'operator', 'finance', 'viewer']),
  email: Joi.string().email().max(100).allow('', null),
  phone: str(30),
  status: enumVal(['active', 'disabled']),
  password: Joi.string().min(6).max(255).allow(''),
  roleIds: Joi.array().items(id),
}).unknown(true);

// 角色
const roleCreate = Joi.object({
  name: Joi.string().trim().max(50).required(),
  code: Joi.string().trim().max(50).required(),
  description: str(200),
  permissionIds: Joi.array().items(id),
}).unknown(true);
const assignPermissions = Joi.object({
  permissionIds: Joi.array().items(id).required(),
}).unknown(true);
const assignRoles = Joi.object({
  roleIds: Joi.array().items(id).required(),
}).unknown(true);

module.exports = {
  login, changePassword,
  customerCreate, customerUpdate,
  supplierCreate, supplierUpdate,
  orderCreate, orderUpdate,
  bookingCreate, bookingUpdate,
  customsCreate, customsUpdate,
  documentCreate, documentUpdate,
  financeCreate, financeUpdate,
  followCreate, followUpdate,
  userCreate, userUpdate,
  roleCreate, assignPermissions, assignRoles,
};