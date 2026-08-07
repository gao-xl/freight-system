// 统一事务服务层
// 封装跨模块操作的数据库事务，保证原子性（如 放单审批、报价转订单、订舱→财务）。
// 用法：
//   const { withTransaction } = require('../services/transaction');
//   const result = await withTransaction(async (t) => { ... return x; });
const { sequelize } = require('../models');

async function withTransaction(fn) {
  return sequelize.transaction(async (t) => fn(t));
}

module.exports = { withTransaction, tx: withTransaction };