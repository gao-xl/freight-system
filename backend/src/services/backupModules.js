// 备份/恢复：业务模块 → 数据库表 映射
// 用于"部分恢复"时前端按业务模块勾选、后端把勾选表白名单化后执行部分还原。
// 表名必须与本系统 Sequelize 模型映射到的实际表名一致（见 migrations 与 models/index.js）。
// 安全：部分恢复只接受本映射内的表名，杜绝任意表名注入到 SQL/pg_restore。

const BACKUP_MODULES = {
  auth: { label: '认证与系统', tables: ['Users', 'Sessions', 'ApiKeys', 'AuditLogs', 'DemoDataLogs'] },
  rbac: { label: '角色权限与小组', tables: ['Roles', 'Permissions', 'UserRoles', 'RolePermissions', 'Groups', 'UserGroups'] },
  customer: { label: '客户', tables: ['Customers', 'CustomerFollows'] },
  supplier: { label: '供应商', tables: ['Suppliers'] },
  order: { label: '订单', tables: ['Orders', 'OrderContainers', 'OrderNodes', 'Documents', 'ShipmentTracks', 'ReleaseRecords', 'QingdaoNodes', 'EdiMessages', 'PaymentTransactions', 'FlowNodes'] },
  booking: { label: '订舱', tables: ['Bookings'] },
  customs: { label: '报关', tables: ['CustomsDeclarations'] },
  finance: { label: '财务', tables: ['FinanceRecords', 'Invoices', 'PaymentRecords', 'AccountingPeriods', 'FeeTemplates', 'ExchangeRates'] },
  quotation: { label: '报价与运价', tables: ['Quotations', 'QuotationItems', 'FreightRates'] },
  alert: { label: '预警与业务规则', tables: ['AlertRecords', 'BusinessRules', 'WorkflowConfigs'] },
  report: { label: '报表定义', tables: ['ReportDefinitions'] },
  yard: { label: '场站', tables: ['YardRecords', 'YardMetas'] },
  company: { label: '公司设置', tables: ['CompanyProfiles', 'Departments', 'CompanyAccounts', 'InvoiceTitles'] },
  integration: { label: '外部对接', tables: ['IntegrationConfigs'] },
  print: { label: '打印模板', tables: ['PrintTemplates'] },
  custom: { label: '自定义字段', tables: ['CustomFields'] },
  notification: { label: '通知记录', tables: ['NotificationRecords'] },
};

// 反向索引：表名 → 模块 key
const TABLE_TO_MODULE = {};
for (const [key, mod] of Object.entries(BACKUP_MODULES)) {
  for (const t of mod.tables) TABLE_TO_MODULE[t] = key;
}

// 返回所有已知表名的集合（白名单）
function allowedTables() {
  return new Set(Object.keys(TABLE_TO_MODULE));
}

// 校验并规范化用户提交的表名：只保留白名单内的表，返回 { valid, invalid }
function normalizeTables(input) {
  if (!Array.isArray(input)) return { valid: [], invalid: [] };
  const allowed = allowedTables();
  const valid = [];
  const invalid = [];
  for (const t of input) {
    const name = String(t || '').trim();
    if (allowed.has(name)) valid.push(name);
    else if (name) invalid.push(name);
  }
  return { valid: [...new Set(valid)], invalid: [...new Set(invalid)] };
}

// 把表名列表按模块聚类，返回 [{ key, label, tables }]，仅含出现过的模块
function groupTablesByModule(tableNames) {
  const byKey = {};
  for (const t of tableNames) {
    const key = TABLE_TO_MODULE[t];
    if (!key) continue;
    (byKey[key] = byKey[key] || []).push(t);
  }
  return Object.entries(byKey).map(([key, tables]) => ({
    key,
    label: BACKUP_MODULES[key].label,
    tables,
  }));
}

module.exports = {
  BACKUP_MODULES,
  TABLE_TO_MODULE,
  allowedTables,
  normalizeTables,
  groupTablesByModule,
};