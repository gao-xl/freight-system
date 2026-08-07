'use strict';

// customer 模块 —— 模块注册协议的样板实现
//
// 这个文件是给二开者看的「照着抄」范本：一个模块目录长什么样、导出哪些字段、
// 各字段分别被 ModuleRegistry 怎么用。协议定义见 src/core/moduleRegistry.js。
//
// 关于本模块的现状（重要，别照抄这一点）：
//   客户管理是存量功能，它的 models / 控制器 / 路由早于模块协议存在，实现分别在
//     模型      src/models/Customer.js、src/models/CustomerFollow.js
//     控制器    src/controllers/customerController.js
//     路由声明  src/routes/index.js（客户段落，与全部 212 个存量端点在一起）
//     路由描述  src/modules/customer.js（本文件即复用它，避免两处各写一份）
//   所以这里 autoMount 设为 false：路由已由 routes/index.js 注册，注册表不得再挂一次，
//   否则同一路径会被重复绑定。
//   你新写的模块不需要这样 —— 直接在本文件里定义 routes 并让它默认挂载即可。
//
// 新模块的标准写法：
//   backend/src/modules/<name>/index.js
//   module.exports = {
//     name: 'invoice',
//     title: '发票管理',
//     dependencies: ['customer'],
//     models: [Invoice],
//     routes(router, mw) { router.get('/invoices', guard('invoice', 'read'), ctrl.list); },
//     services: { invoiceService },
//     seed: async () => { ... },
//     menu: { path: '/invoices', icon: 'Tickets', permission: 'invoice:read' },
//     events: ['invoice.created'],
//   };

// 显式带 .js 后缀引用同级扁平文件，避免与本目录同名造成解析歧义
const legacyCustomerModule = require('../customer.js');

module.exports = {
  // 模块唯一标识，与目录名保持一致
  name: 'customer',
  // 中文名，出现在启动日志与菜单
  title: '客户管理',
  // 前置模块；客户是基础主数据，不依赖其他模块
  dependencies: [],
  // 本模块拥有的 Sequelize 模型：Customer（客户档案）、CustomerFollow（跟进记录）
  models: legacyCustomerModule.models,
  // 路由声明函数，签名 (router, mw) => void；此处复用存量声明，保持单一事实来源
  routes: legacyCustomerModule.routes,
  // 对外暴露的服务；客户模块的业务逻辑目前收敛在 customerController 内，暂无独立 service
  services: {},
  // 初始化数据钩子；客户演示数据由 src/seed.js 统一灌入，此处不重复
  seed: undefined,
  // 前端菜单元信息，permission 与 RBAC 权限点对应
  menu: { path: '/customers', icon: 'User', permission: 'customer:read' },
  // 本模块发射的事件名，二开可用 eventBus.onAsync 订阅，清单见 src/services/eventBus.js
  events: ['customer.created', 'customer.updated', 'customer.deleted', 'customer.followed'],
  // 路由已在 src/routes/index.js 注册，禁止注册表重复挂载
  autoMount: false,
};
