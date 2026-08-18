// RBAC 种子数据（共享）：权限点 + 内置角色 + 角色权限映射
// 供三处复用：启动自检 bootstrap（空表时幂等预置）、init-db.js、seed.js（演示库重建）
// 与 seed.js 保持同源：任何权限点/角色变更都应改这里，避免多份定义漂移

const addPerms = (module, actions, nameFn) => {
  const PERMS = [];
  for (const a of actions) PERMS.push({ module, action: a, name: nameFn(a), code: `${module}:${a}` });
  return PERMS;
};

// 全量权限点（code = module:action）
function buildPermissions() {
  const PERMS = [];
  PERMS.push(...addPerms('auth', ['read'], () => '登录/认证'));
  PERMS.push(...addPerms('dashboard', ['read'], () => '查看看板'));
  PERMS.push(...addPerms('customer', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}客户`));
  PERMS.push(...addPerms('supplier', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}供应商`));
  PERMS.push(...addPerms('order', ['create', 'read', 'update', 'delete', 'approve'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除', approve: '审批' })[a]}订单`));
  PERMS.push(...addPerms('booking', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}订舱`));
  PERMS.push(...addPerms('customs', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}报关`));
  PERMS.push(...addPerms('document', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}单证`));
  PERMS.push(...addPerms('track', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}跟踪`));
  PERMS.push(...addPerms('finance', ['create', 'read', 'update', 'delete', 'approve', 'close', 'lock', 'unlock'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除', approve: '审批', close: '结账/扎帐', lock: '锁帐', unlock: '解锁' })[a]}财务`));
  // P3-2 预算管理权限
  PERMS.push(...addPerms('budget', ['create', 'read', 'update', 'delete', 'approve'], (a) => `${({ create: '编制', read: '查看', update: '维护', delete: '删除', approve: '审批调整' })[a]}预算`));
  PERMS.push(...addPerms('quotation', ['create', 'read', 'update', 'delete', 'approve', 'convert'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除', approve: '审批', convert: '转订单' })[a]}报价`));
  PERMS.push(...addPerms('integration', ['read', 'update', 'trigger'], (a) => `${({ read: '查看', update: '配置', trigger: '触发' })[a]}对接`));
  PERMS.push(...addPerms('ai', ['use'], (a) => '使用AI助手'));
  PERMS.push(...addPerms('qingdao', ['read', 'update'], (a) => `${({ read: '查看', update: '更新' })[a]}青岛港节点`));
  PERMS.push(...addPerms('alert', ['read', 'update'], (a) => `${({ read: '查看', update: '处理' })[a]}预警`));
  PERMS.push(...addPerms('yard', ['read', 'update'], (a) => `${({ read: '查看', update: '查询/维护' })[a]}场站信息`));
  PERMS.push(...addPerms('print', ['read', 'write'], (a) => `${({ read: '查看/打印', write: '设计模板' })[a]}`));
  PERMS.push(...addPerms('release', ['read', 'create', 'approve'], (a) => `${({ read: '查看', create: '申请', approve: '审批' })[a]}放单`));
  // L5 修复：补齐 system:apikey 权限点（接口密钥管理路由引用它，此前未定义导致配置不一致）
  PERMS.push(...addPerms('system', ['user', 'role', 'permission', 'audit', 'group', 'custom', 'company', 'finance', 'apikey'], (a) => `${({ user: '用户', role: '角色', permission: '权限', audit: '审计', group: '小组', custom: '自定义字段', company: '公司设置', finance: '发票号段', apikey: '接口密钥' })[a]}管理`));
  // 系统运维通配：备份/恢复、健康检查、自动化运行等 admin 专属接口统一走 system:*
  PERMS.push({ module: 'system', action: '*', name: '系统运维（备份/恢复/健康检查/自动化）', code: 'system:*' });
  return PERMS;
}

// 内置角色（isSystem 不可删除；dataScope 决定数据隔离范围）
function buildRoles() {
  return [
    { code: 'admin', name: '管理员', description: '系统管理 + 全部业务权限', isSystem: true, dataScope: 'all' },
    { code: 'manager', name: '经理', description: '全部业务 + 审批 + 转订单', isSystem: true, dataScope: 'all' },
    { code: 'operator', name: '操作员', description: '业务读写（无删除/审批/转订单）', isSystem: true, dataScope: 'group' },
    { code: 'finance', name: '财务', description: '财务读写 + 业务只读', isSystem: true, dataScope: 'all' },
    { code: 'viewer', name: '只读', description: '全部只读', isSystem: true, dataScope: 'group' },
  ];
}

// 角色权限映射（roleCode -> [permissionCode]），与 seed.js 同源
function buildRolePermissionMap(PERMS) {
  const actionGroup = (module, actions) => PERMS.filter((p) => p.module === module && actions.includes(p.action)).map((p) => p.code);
  const allBusiness = ['customer', 'supplier', 'order', 'booking', 'customs', 'document', 'track'];
  const rw = ['create', 'read', 'update'];
  const crud = ['create', 'read', 'update', 'delete'];
  const aiUse = () => actionGroup('ai', ['use']);
  return {
    admin: PERMS.map((p) => p.code),
    manager: [
      ...allBusiness.flatMap((m) => actionGroup(m, crud)),
      ...actionGroup('order', ['approve']),
      ...actionGroup('finance', crud).concat(actionGroup('finance', ['approve', 'close', 'lock', 'unlock'])),
      ...actionGroup('quotation', crud).concat(actionGroup('quotation', ['approve', 'convert'])),
      ...actionGroup('integration', ['read', 'update', 'trigger']),
      ...actionGroup('qingdao', ['read', 'update']),
      ...actionGroup('alert', ['read', 'update']),
      ...actionGroup('yard', ['read', 'update']),
      ...actionGroup('print', ['read', 'write']),
      ...actionGroup('release', ['read', 'create', 'approve']),
      ...aiUse(),
      ...actionGroup('budget', ['create', 'read', 'update', 'delete', 'approve']),
      ...actionGroup('dashboard', ['read']),
    ],
    operator: [
      ...allBusiness.flatMap((m) => actionGroup(m, rw)),
      ...actionGroup('finance', ['read']),
      ...actionGroup('quotation', rw),
      ...actionGroup('qingdao', ['read', 'update']),
      ...actionGroup('alert', ['read', 'update']),
      ...actionGroup('yard', ['read', 'update']),
      ...actionGroup('print', ['read']),
      ...actionGroup('release', ['read', 'create']), // 操作员可查看并申请放单；审批权保留给 manager
      ...aiUse(),
      ...actionGroup('budget', ['read']),
      ...actionGroup('dashboard', ['read']),
    ],
    finance: [
      ...allBusiness.flatMap((m) => actionGroup(m, ['read'])),
      ...actionGroup('finance', crud).concat(actionGroup('finance', ['approve', 'close', 'lock', 'unlock'])),
      ...actionGroup('quotation', ['read']),
      ...actionGroup('qingdao', ['read']),
      ...actionGroup('alert', ['read']),
      ...actionGroup('yard', ['read']),
      ...actionGroup('print', ['read']),
      ...actionGroup('release', ['read']),
      ...aiUse(),
      ...actionGroup('budget', ['create', 'read', 'update', 'approve']),
      ...actionGroup('dashboard', ['read']),
    ],
    viewer: [
      ...allBusiness.flatMap((m) => actionGroup(m, ['read'])),
      ...actionGroup('finance', ['read']),
      ...actionGroup('quotation', ['read']),
      ...actionGroup('qingdao', ['read']),
      ...actionGroup('alert', ['read']),
      ...actionGroup('yard', ['read']),
      ...actionGroup('release', ['read']),
      ...aiUse(),
      ...actionGroup('budget', ['read']),
      ...actionGroup('dashboard', ['read']),
    ],
  };
}

module.exports = { buildPermissions, buildRoles, buildRolePermissionMap };
