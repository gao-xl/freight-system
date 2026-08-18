// 前端 API 领域拆包聚合层（架构解耦单 F4/E8）
//
// 说明：本文件仅做 re-export 聚合，存量 view 过渡期兼容（协议约定保留 3 个月后移除）。
// 新代码请按域直接 import：@/api/order、@/api/finance、@/api/customer ...
// 与后端模块对应关系见 docs/架构解耦重构方案 §8.4。

export * from './auth';
export * from './order';
export * from './finance';
export * from './customer';
export * from './supplier';
export * from './booking';
export * from './customs';
export * from './document';
export * from './tracking';
export * from './quotation';
export * from './dashboard';
export * from './system';
export * from './integration';
export * from './workflow';
export * from './alert';
export * from './message';
export * from './notification';
export * from './portal';
export * from './misc';
export * from './quotationTemplate';
export * from './hsCode';
export * from './backup';
export * from './batch';
export * from './debitNote';
export * from './billOfLading';
export * from './reconciliation';