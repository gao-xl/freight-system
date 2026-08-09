const sequelize = require('../db');
const User = require('./User');
const Customer = require('./Customer');
const CustomerFollow = require('./CustomerFollow');
const Supplier = require('./Supplier');
const Order = require('./Order');
const Booking = require('./Booking');
const CustomsDeclaration = require('./CustomsDeclaration');
const Document = require('./Document');
const ShipmentTrack = require('./ShipmentTrack');
const FinanceRecord = require('./FinanceRecord');
const IntegrationConfig = require('./IntegrationConfig');
const Quotation = require('./Quotation');
const QuotationItem = require('./QuotationItem');
const Role = require('./Role');
const Permission = require('./Permission');
const UserRole = require('./UserRole');
const RolePermission = require('./RolePermission');
const QingdaoNode = require('./QingdaoNode');
const AlertRecord = require('./AlertRecord');
const AuditLog = require('./AuditLog');
const YardRecord = require('./YardRecord');
const YardMeta = require('./YardMeta');
const ExchangeRate = require('./ExchangeRate');
const PrintTemplate = require('./PrintTemplate');
const Invoice = require('./Invoice');
const ReleaseRecord = require('./ReleaseRecord');
const Group = require('./Group');
const UserGroup = require('./UserGroup');
const FlowNode = require('./FlowNode');
const OrderNode = require('./OrderNode');
const CustomField = require('./CustomField');
const OrderContainer = require('./OrderContainer');
const EdiMessage = require('./EdiMessage');
const PaymentTransaction = require('./PaymentTransaction');
const CompanyProfile = require('./CompanyProfile');
const Department = require('./Department');
const CompanyAccount = require('./CompanyAccount');
const InvoiceTitle = require('./InvoiceTitle');
const ApiKey = require('./ApiKey');
const FreightRate = require('./FreightRate');
const BusinessRule = require('./BusinessRule');
const WorkflowConfig = require('./WorkflowConfig');
const ReportDefinition = require('./ReportDefinition');
const AccountingPeriod = require('./AccountingPeriod');
const FeeTemplate = require('./FeeTemplate'); // N1 费用模板
const PaymentRecord = require('./PaymentRecord'); // N3 收款/付款单
const DemoDataLog = require('./DemoDataLog'); // Onboarding 示例数据批次
const NotificationRecord = require('./NotificationRecord'); // E2 通知推送记录
const Session = require('./Session'); // M3 登录会话（refresh token 哈希）

// 关联关系
Order.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
Customer.hasMany(Order, { foreignKey: 'customerId' });

// 客户跟进关联
CustomerFollow.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
Customer.hasMany(CustomerFollow, { as: 'follows', foreignKey: 'customerId' });
CustomerFollow.belongsTo(User, { as: 'operator', foreignKey: 'operatorId' });
User.hasMany(CustomerFollow, { as: 'follows', foreignKey: 'operatorId' });

Booking.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Booking.belongsTo(Supplier, { as: 'supplier', foreignKey: 'supplierId' });
Order.hasMany(Booking, { foreignKey: 'orderId' });

CustomsDeclaration.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
CustomsDeclaration.belongsTo(Supplier, { as: 'supplier', foreignKey: 'supplierId' });
Order.hasMany(CustomsDeclaration, { foreignKey: 'orderId' });

Document.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(Document, { foreignKey: 'orderId' });

ShipmentTrack.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(ShipmentTrack, { as: 'tracks', foreignKey: 'orderId' });

FinanceRecord.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(FinanceRecord, { foreignKey: 'orderId' });

// 报价关联
Quotation.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
Customer.hasMany(Quotation, { foreignKey: 'customerId' });
Quotation.hasMany(QuotationItem, { as: 'items', foreignKey: 'quotationId' });
QuotationItem.belongsTo(Quotation, { as: 'parent', foreignKey: 'quotationId' });
QuotationItem.belongsTo(Supplier, { as: 'supplier', foreignKey: 'supplierId' });

// RBAC 关联
User.belongsToMany(Role, { through: UserRole, as: 'roles', foreignKey: 'userId' });
Role.belongsToMany(User, { through: UserRole, as: 'users', foreignKey: 'roleId' });
Role.belongsToMany(Permission, { through: RolePermission, as: 'permissions', foreignKey: 'roleId' });
Permission.belongsToMany(Role, { through: RolePermission, as: 'roles', foreignKey: 'permissionId' });

// 青岛港专项节点关联
QingdaoNode.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
QingdaoNode.belongsTo(Booking, { as: 'booking', foreignKey: 'bookingId' });
Order.hasMany(QingdaoNode, { as: 'qingdaoNodes', foreignKey: 'orderId' });

// 预警关联
AlertRecord.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(AlertRecord, { foreignKey: 'orderId' });

// 场站查询关联
YardRecord.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(YardRecord, { foreignKey: 'orderId' });

// 发票关联
Invoice.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Invoice.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
Invoice.belongsTo(Supplier, { as: 'supplier', foreignKey: 'supplierId' });
Order.hasMany(Invoice, { foreignKey: 'orderId' });

// N3 收款单关联
PaymentRecord.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
PaymentRecord.belongsTo(Supplier, { as: 'supplier', foreignKey: 'supplierId' });

// 放单关联
ReleaseRecord.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(ReleaseRecord, { as: 'releases', foreignKey: 'orderId' });

// B2 小组关联
Group.hasMany(User, { as: 'members', foreignKey: 'groupId' });
User.belongsTo(Group, { as: 'group', foreignKey: 'groupId' });
Group.belongsToMany(User, { through: UserGroup, as: 'userMembers', foreignKey: 'groupId' });
User.belongsToMany(Group, { through: UserGroup, as: 'extraGroups', foreignKey: 'userId' });

// B3 订单节点关联
OrderNode.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(OrderNode, { as: 'orderNodes', foreignKey: 'orderId' });

// C6 一单多箱关联
OrderContainer.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(OrderContainer, { as: 'containers', foreignKey: 'orderId' });

// C2 EDI 报文关联
EdiMessage.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(EdiMessage, { foreignKey: 'orderId' });

// C3 支付交易关联
PaymentTransaction.belongsTo(Order, { as: 'order', foreignKey: 'orderId' });
Order.hasMany(PaymentTransaction, { foreignKey: 'orderId' });

// 接口密钥关联：每把密钥绑定一个用户，权限与审计身份都取自该用户
ApiKey.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(ApiKey, { as: 'apiKeys', foreignKey: 'userId' });

// M3 登录会话关联：每个用户可有多端会话
Session.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(Session, { as: 'sessions', foreignKey: 'userId' });

module.exports = {
  sequelize,
  User,
  Customer,
  CustomerFollow,
  Supplier,
  Order,
  Booking,
  CustomsDeclaration,
  Document,
  ShipmentTrack,
  FinanceRecord,
  IntegrationConfig,
  Quotation,
  QuotationItem,
  Role,
  Permission,
  UserRole,
  RolePermission,
  QingdaoNode,
  AlertRecord,
  AuditLog,
  YardRecord,
  YardMeta,
  ExchangeRate,
  PrintTemplate,
  Invoice,
  ReleaseRecord,
  Group,
  UserGroup,
  FlowNode,
  OrderNode,
  CustomField,
  OrderContainer,
  EdiMessage,
  PaymentTransaction,
  CompanyProfile,
  Department,
  CompanyAccount,
  InvoiceTitle,
  ApiKey,
  FreightRate,
  BusinessRule,
  WorkflowConfig,
  ReportDefinition,
  AccountingPeriod,
  FeeTemplate,
  PaymentRecord,
  DemoDataLog,
  NotificationRecord,
  Session,
};