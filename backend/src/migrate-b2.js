// B2 数据权限增量迁移：node src/migrate-b2.js
// 在既有数据库上补充新列与权限，不删除数据（sync 会自动加列，此处补充权限/角色数据）
const { sequelize, Permission, Role, RolePermission, UserRole } = require('./models');

async function migrate() {
  await sequelize.sync(); // 自动为 Order/User/Role 新增列（groupId/ownerId/dataScope）

  // 1. 补建 system:group 权限
  let p = await Permission.findOne({ where: { code: 'system:group' } });
  if (!p) {
    p = await Permission.create({ module: 'system', action: 'group', name: '小组管理', code: 'system:group' });
    console.log('[B2] 已创建权限 system:group');
  }
  // 补建 system:custom 权限（B4 自定义字段）
  let pc = await Permission.findOne({ where: { code: 'system:custom' } });
  if (!pc) {
    pc = await Permission.create({ module: 'system', action: 'custom', name: '自定义字段管理', code: 'system:custom' });
    console.log('[B4] 已创建权限 system:custom');
  }

  // 2. 给 admin 角色授予 system:group（admin 走通配，但为完整性补授）
  const adminRole = await Role.findOne({ where: { code: 'admin' } });
  if (adminRole) {
    const exists = await RolePermission.findOne({ where: { roleId: adminRole.id, permissionId: p.id } });
    if (!exists) await RolePermission.create({ roleId: adminRole.id, permissionId: p.id });
    const existsC = await RolePermission.findOne({ where: { roleId: adminRole.id, permissionId: pc.id } });
    if (!existsC) await RolePermission.create({ roleId: adminRole.id, permissionId: pc.id });
  }

  // 3. 为内置角色补齐 dataScope 默认值（若为 NULL）
  const scopeMap = { admin: 'all', manager: 'all', operator: 'group', finance: 'all', viewer: 'group' };
  for (const [code, scope] of Object.entries(scopeMap)) {
    const r = await Role.findOne({ where: { code } });
    if (r && (r.dataScope === null || r.dataScope === undefined)) {
      await r.update({ dataScope: scope });
      console.log(`[B2] 角色 ${code} 设置 dataScope=${scope}`);
    }
  }

  console.log('[B2] 数据权限迁移完成');
}

migrate().then(() => process.exit(0)).catch((e) => { console.error('迁移失败:', e); process.exit(1); });