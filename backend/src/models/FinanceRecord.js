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
  currency: { type: DataTypes.STRING(10), defaultValue: null }, // 默认币种在 beforeCreate 钩子中按系统配置解析
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
  version: { type: DataTypes.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
  isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // Onboarding 演示数据标记（可一键清空）
  // P0.1 红字冲销
  reverseRef: { type: DataTypes.INTEGER, allowNull: true }, // 被冲销的原记录 ID（冲销记录指向原记录）
  reverseType: { type: DataTypes.ENUM('full', 'partial'), allowNull: true }, // 冲销类型：全额/部分
  reversedAt: { type: DataTypes.DATE, allowNull: true }, // 冲销时间
  reversedBy: { type: DataTypes.INTEGER, allowNull: true }, // 冲销操作人
  reversedReason: { type: DataTypes.STRING(255), allowNull: true }, // 冲销原因
}, { timestamps: true, indexes: [{ fields: ['settleMonth'] }, { fields: ['reverseRef'] }] });

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

// 默认币种：如果未明确设置，则从系统配置读取（CompanyProfile.defaultCurrency）
async function resolveDefaultCurrency(instance) {
  if (!instance.currency) {
    try {
      const { CompanyProfile } = require('../services/dataAccess');
      const profile = await CompanyProfile.findByPk(1, { attributes: ['defaultCurrency'] });
      if (profile && profile.defaultCurrency) {
        instance.currency = profile.defaultCurrency;
      }
    } catch {
      // 静默失败，保持模型默认值
    }
  }
}

// P0.2 账期自动计算：根据客户账期天数自动推导到期日
async function resolveDueDate(instance) {
  // 仅当设置了 counterpartyId 且未传入 dueDate 时自动计算
  if (instance.counterpartyId && !instance.dueDate) {
    try {
      const { Customer } = require('../services/dataAccess');
      const customer = await Customer.findByPk(instance.counterpartyId, { attributes: ['paymentTerms'] });
      if (customer && customer.paymentTerms) {
        const days = Number(customer.paymentTerms) || 30;
        const created = instance.createdAt || new Date();
        const due = new Date(created);
        due.setDate(due.getDate() + days);
        instance.dueDate = due.toISOString().slice(0, 10);
      }
    } catch {
      // 静默失败，不影响创建流程
    }
  }
}

FinanceRecord.beforeCreate(async (instance) => {
  await resolveDefaultCurrency(instance);
  await resolveLocalAmount(instance);
  await resolveDueDate(instance);
});

FinanceRecord.beforeUpdate(async (instance) => {
  // 仅当金额/币种/汇率任一变化时重算，避免覆盖历史本币金额
  if (instance.changed('amount') || instance.changed('currency') || instance.changed('exchangeRate')) {
    await resolveLocalAmount(instance);
  }
});

module.exports = FinanceRecord;
