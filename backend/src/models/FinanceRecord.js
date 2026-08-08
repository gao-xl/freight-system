const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 费用/财务流水（应收/应付）
const FinanceRecord = sequelize.define('FinanceRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  direction: { type: DataTypes.ENUM('receivable', 'payable'), allowNull: false },
  category: { type: DataTypes.ENUM('ocean_freight', 'air_freight', 'local_charge', 'customs_fee', 'document_fee', 'warehouse_fee', 'transport_fee', 'other'), defaultValue: 'other' },
  description: { type: DataTypes.STRING(255) },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  rate: { type: DataTypes.DECIMAL(10, 4), defaultValue: 1 }, // [DEPRECATED] 历史遗留汇率字段；统一使用 exchangeRate，本字段仅作兼容别名
  exchangeRate: { type: DataTypes.FLOAT, allowNull: true },   // 本币折算汇率（P2.4，唯一汇率入口）
  localAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true }, // 本币折算金额（P2.4）
  status: { type: DataTypes.ENUM('unpaid', 'partial', 'paid', 'waived'), defaultValue: 'unpaid' },
  counterpartyId: { type: DataTypes.INTEGER }, // 客户或供应商
  invoiceNo: { type: DataTypes.STRING(50) },
  paidAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  dueDate: { type: DataTypes.DATEONLY },
  paidAt: { type: DataTypes.DATE },
  settleMonth: { type: DataTypes.DATEONLY }, // 结算归属月份（账期），为空则按 createdAt 归属
  remark: { type: DataTypes.TEXT },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
  customFields: { type: DataTypes.TEXT },   // B4 自定义字段扩展（JSON 字符串）
}, { timestamps: true, indexes: [{ fields: ['settleMonth'] }] });

// P2.4 本币折算金额：localAmount = amount * exchangeRate
// 规则：exchangeRate 优先（新 API 唯一入口）；兼容历史 API 传 rate（≠1 时降级为别名）；
//      否则按币种查汇率（ExchangeRate 表 → 适配器 → 兜底 7.2），查不到或币种为本币（CNY）时按 1:1 处理（默认本币为人民币）。
// 放在模型钩子统一处理，保证 API / 自动化 / 报价转单等所有创建路径一致。
async function resolveLocalAmount(instance) {
  const amount = Number(instance.amount) || 0;
  // 兼容别名：rate 为历史遗留字段，仅当 exchangeRate 未提供且 rate ≠ 1 时兜底使用
  const legacyRate = instance.rate != null && Number(instance.rate) !== 1 ? Number(instance.rate) : null;
  const effRate = instance.exchangeRate != null && instance.exchangeRate !== '' ? instance.exchangeRate : legacyRate;
  if (effRate != null && effRate !== '') {
    instance.exchangeRate = Number(effRate);
    instance.localAmount = Number((amount * instance.exchangeRate).toFixed(2));
    return;
  }
  const currency = String(instance.currency || 'CNY').toUpperCase();
  if (!currency || currency === 'CNY') {
    instance.exchangeRate = 1;
    instance.localAmount = amount;
    return;
  }
  try {
    // 延迟 require：避免模型加载阶段与 services/externalService 循环依赖
    const { getRate } = require('../services/externalService');
    const rate = await getRate(currency, 'CNY');
    if (rate != null) {
      instance.exchangeRate = Number(rate);
      instance.localAmount = Number((amount * rate).toFixed(2));
    } else {
      instance.exchangeRate = 1;
      instance.localAmount = amount;
    }
  } catch {
    instance.exchangeRate = 1;
    instance.localAmount = amount;
  }
}

FinanceRecord.beforeCreate(async (instance) => {
  await resolveLocalAmount(instance);
});

FinanceRecord.beforeUpdate(async (instance) => {
  // 仅当金额/币种/汇率任一变化时重算，避免覆盖历史本币金额
  if (instance.changed('amount') || instance.changed('currency') || instance.changed('exchangeRate')) {
    await resolveLocalAmount(instance);
  }
});

module.exports = FinanceRecord;
