<template>
  <div class="page-card">
    <el-tabs v-model="tab">
      <el-tab-pane label="用户管理" name="users">
        <div class="toolbar">
          <el-button type="primary" @click="openUser()"><el-icon><Plus /></el-icon>新增用户</el-button>
        </div>
        <el-table :data="users" v-loading="loadingUsers" stripe>
          <el-table-column prop="username" label="用户名" width="130" />
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column label="角色" min-width="140">
            <template #default="{ row }">
              <el-tag v-for="r in row.roles" :key="r.id" size="small" style="margin-right:4px">{{ r.name }}</el-tag>
              <span v-if="!row.roles?.length">-</span>
            </template>
          </el-table-column>
          <el-table-column label="主角色" width="100"><template #default="{row}">{{ roleMap[row.role] || row.role }}</template></el-table-column>
          <el-table-column prop="email" label="邮箱" min-width="160" />
          <el-table-column prop="phone" label="电话" width="130" />
          <el-table-column label="状态" width="90">
            <template #default="{row}"><el-tag :type="row.status==='active'?'success':'danger'" size="small">{{ row.status==='active'?'启用':'禁用' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openUser(row)">编辑</el-button>
              <el-button link type="warning" @click="openRoles(row)">分配角色</el-button>
              <el-button v-if="row.username!=='admin'" link type="danger" @click="removeUser(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="角色管理" name="roles">
        <div class="toolbar">
          <el-button v-permission="'system:role'" type="primary" @click="openRole()"><el-icon><Plus /></el-icon>新增角色</el-button>
        </div>
        <el-table :data="roles" v-loading="loadingRoles" stripe>
          <el-table-column prop="code" label="角色编码" width="130" />
          <el-table-column prop="name" label="角色名称" width="120" />
          <el-table-column prop="description" label="描述" min-width="200" />
          <el-table-column label="数据范围" width="100">
            <template #default="{row}">
              <el-tag size="small" :type="row.dataScope==='all'?'danger':(row.dataScope==='group'?'warning':'info')">{{ {all:'全部',group:'本组',self:'本人'}[row.dataScope] || '全部' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="内置" width="80"><template #default="{row}"><el-tag v-if="row.isSystem" size="small">系统</el-tag></template></el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openPermissions(row)">分配权限</el-button>
              <el-button link type="primary" @click="openRole(row)">编辑</el-button>
              <el-button v-if="!row.isSystem" link type="danger" @click="removeRole(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="打印设计" name="print">
        <div class="toolbar">
          <el-button v-permission="'print:write'" type="primary" @click="goPrintDesigner"><el-icon><Printer /></el-icon>进入打印模板设计器</el-button>
        </div>
        <el-alert type="info" :closable="false" show-icon title="可配置提单、发票、装箱单、报价单、报关单、对账单等单据的打印模板（字段、布局、Logo、页眉页脚），设计后各模块打印按钮将按默认模板渲染。" />
      </el-tab-pane>
      <el-tab-pane label="小组管理" name="group">
        <div class="toolbar">
          <el-button v-permission="'system:group'" type="primary" @click="goGroups"><el-icon><Connection /></el-icon>进入小组与数据权限管理</el-button>
        </div>
        <el-alert type="info" :closable="false" show-icon title="小组用于数据权限隔离：角色 dataScope 设为“本组”时，仅能查看本人/本组订单；订单创建时自动归属到当前用户所在组。角色 dataScope 可在“角色管理”中编辑。" />
      </el-tab-pane>
      <el-tab-pane label="公司设置" name="company">
        <div class="toolbar">
          <el-button v-permission="'system:company'" type="primary" @click="goCompany"><el-icon><OfficeBuilding /></el-icon>进入公司设置</el-button>
        </div>
        <el-alert type="info" :closable="false" show-icon title="维护公司基本信息、组织部门、银行账号与开票抬头，供单证套打与开票选用。" />
      </el-tab-pane>
      <el-tab-pane label="自定义字段" name="custom">
        <div class="toolbar">
          <el-button v-permission="'system:custom'" type="primary" @click="goCustomFields"><el-icon><EditPen /></el-icon>进入自定义字段管理</el-button>
        </div>
        <el-alert type="info" :closable="false" show-icon title="自定义字段：公司可给订单/客户等业务加字段（如指定货代、付款条款），无需改代码。新增后在对应业务表单中动态渲染。" />
      </el-tab-pane>
      <el-tab-pane label="审计日志" name="audit">        <div class="toolbar audit-filter">
          <el-input v-model="auditQuery.username" placeholder="操作人" clearable style="width:140px" @keyup.enter="loadAudit" />
          <el-select v-model="auditQuery.module" placeholder="模块" clearable style="width:160px" @change="loadAudit">
            <el-option v-for="m in moduleNames" :key="m" :label="moduleName[m] || m" :value="m" />
          </el-select>
          <el-select v-model="auditQuery.action" placeholder="动作" clearable style="width:120px" @change="loadAudit">
            <el-option label="创建" value="create" />
            <el-option label="修改" value="update" />
            <el-option label="删除" value="delete" />
          </el-select>
          <el-button type="primary" @click="loadAudit"><el-icon><Search /></el-icon>查询</el-button>
        </div>
        <el-table :data="audits" v-loading="loadingAudit" stripe size="small">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="username" label="操作人" width="110" />
          <el-table-column label="模块" width="110">
            <template #default="{row}">{{ moduleName[row.module] || row.module }}</template>
          </el-table-column>
          <el-table-column label="动作" width="90">
            <template #default="{row}"><el-tag :type="row.action==='delete'?'danger':(row.action==='create'?'success':'warning')" size="small">{{ {create:'创建',update:'修改',delete:'删除'}[row.action] || row.action }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="summary" label="摘要" min-width="220" />
          <el-table-column prop="ip" label="IP" width="130" />
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{row}">{{ String(row.createdAt||'').replace('T',' ').slice(0,19) }}</template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination layout="total, prev, pager, next" :total="auditTotal" :page-size="auditQuery.pageSize" :current-page="auditQuery.page" @current-change="(p)=>{auditQuery.page=p;loadAudit();}" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="示例数据" name="demo">
        <DemoDataManager />
      </el-tab-pane>
      <el-tab-pane label="备份与恢复" name="backup">
        <BackupRestore />
      </el-tab-pane>
    </el-tabs>

    <!-- 用户表单 -->
    <el-dialog v-model="userDlg" :title="userForm.id ? '编辑用户' : '新增用户'" width="520px">
      <el-form :model="userForm" label-width="90px">
        <el-form-item label="用户名"><el-input v-model="userForm.username" :disabled="!!userForm.id" /></el-form-item>
        <el-form-item label="姓名"><el-input v-model="userForm.name" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="userForm.password" type="password" show-password :placeholder="userForm.id ? '留空则不修改' : ''" /></el-form-item>
        <el-form-item label="主角色">
          <el-select v-model="userForm.role" style="width:100%"><el-option v-for="(v,k) in roleMap2" :key="k" :label="v" :value="k" /></el-select>
        </el-form-item>
        <el-form-item label="邮箱"><el-input v-model="userForm.email" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="userForm.phone" /></el-form-item>
        <el-form-item label="状态"><el-radio-group v-model="userForm.status"><el-radio value="active">启用</el-radio><el-radio value="disabled">禁用</el-radio></el-radio-group></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveUser">保存</el-button>
      </template>
    </el-dialog>

    <!-- 角色表单 -->
    <el-dialog v-model="roleDlg" :title="roleForm.id ? '编辑角色' : '新增角色'" width="460px">
      <el-form :model="roleForm" label-width="90px">
        <el-form-item label="角色编码"><el-input v-model="roleForm.code" :disabled="!!roleForm.id" /></el-form-item>
        <el-form-item label="角色名称"><el-input v-model="roleForm.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="roleForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="数据范围">
          <el-select v-model="roleForm.dataScope" style="width:100%">
            <el-option label="全部数据" value="all" />
            <el-option label="本组数据" value="group" />
            <el-option label="本人数据" value="self" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRole">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配用户角色 -->
    <el-dialog v-model="userRoleDlg" title="分配角色" width="460px">
      <el-checkbox-group v-model="userRoleForm.roleIds">
        <el-checkbox v-for="r in roles" :key="r.id" :value="r.id" :label="r.name" />
      </el-checkbox-group>
      <template #footer>
        <el-button @click="userRoleDlg=false">取消</el-button>
        <el-button type="primary" @click="saveUserRoles">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配权限 -->
    <el-dialog v-model="permDlg" :title="`分配权限 - ${permRole?.name}`" width="720px">
      <el-checkbox-group v-model="permForm.permissionIds" class="perm-group">
        <div v-for="g in permGroups" :key="g.module" class="perm-group-block">
          <div class="perm-group-title">{{ moduleName[g.module] || g.module }}</div>
          <el-checkbox v-for="p in g.perms" :key="p.id" :value="p.id" :label="p.name" class="perm-item" />
        </div>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="permDlg=false">取消</el-button>
        <el-button type="primary" @click="savePermissions">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userAPI, roleAPI, permissionAPI, auditLogAPI } from '@/api';
import DemoDataManager from '@/components/DemoDataManager.vue';
import BackupRestore from '@/components/BackupRestore.vue';

const router = useRouter();
const tab = ref('users');
const goPrintDesigner = () => router.push('/system/print-templates');
const goGroups = () => router.push('/system/groups');
const goCustomFields = () => router.push('/system/custom-fields');
const goCompany = () => router.push('/system/company');
const users = ref([]);
const roles = ref([]);
const permissions = ref([]);
const loadingUsers = ref(false);
const loadingRoles = ref(false);
const saving = ref(false);

const roleMap = { admin: '管理员', manager: '经理', operator: '操作员', finance: '财务', viewer: '只读' };
const roleMap2 = { ...roleMap };
const moduleName = {
  auth: '认证', dashboard: '看板', customer: '客户', supplier: '供应商', order: '订单',
  booking: '订舱', customs: '报关', document: '单证', track: '跟踪', finance: '财务',
  quotation: '报价', integration: '对接', system: '系统',
};
const moduleNames = Object.keys(moduleName);

// 审计日志
const auditQuery = ref({ page: 1, pageSize: 20, username: '', module: '', action: '' });
const audits = ref([]);
const auditTotal = ref(0);
const loadingAudit = ref(false);
async function loadAudit() {
  loadingAudit.value = true;
  try {
    const data = await auditLogAPI({ ...auditQuery.value, page: auditQuery.value.page, pageSize: auditQuery.value.pageSize });
    audits.value = data.list || [];
    auditTotal.value = data.total || 0;
  } catch (e) { /* 拦截器提示 */ }
  finally { loadingAudit.value = false; }
}

// 用户
const userDlg = ref(false);
const userForm = ref({});
function openUser(row) {
  userForm.value = row ? { ...row, password: '' } : { role: 'operator', status: 'active' };
  userDlg.value = true;
}
async function saveUser() {
  if (!userForm.value.username || !userForm.value.name) return ElMessage.warning('请填写用户名和姓名');
  if (!userForm.value.id && !userForm.value.password) return ElMessage.warning('请设置初始密码');
  saving.value = true;
  try {
    const payload = { ...userForm.value, roles: undefined };
    if (userForm.value.id) await userAPI.update(userForm.value.id, payload);
    else await userAPI.create(payload);
    ElMessage.success('保存成功');
    userDlg.value = false;
    loadUsers();
  } finally { saving.value = false; }
}
async function removeUser(row) {
  await ElMessageBox.confirm(`确认删除用户「${row.username}」？`, '提示', { type: 'warning' });
  await userAPI.remove(row.id);
  ElMessage.success('已删除');
  loadUsers();
}

// 用户-角色
const userRoleDlg = ref(false);
const userRoleForm = reactive({ userId: null, roleIds: [] });
function openRoles(row) {
  userRoleForm.userId = row.id;
  userRoleForm.roleIds = row.roles?.map((r) => r.id) || [];
  userRoleDlg.value = true;
}
async function saveUserRoles() {
  await userAPI.assignRoles(userRoleForm.userId, userRoleForm.roleIds);
  ElMessage.success('角色已分配');
  userRoleDlg.value = false;
  loadUsers();
}

// 角色
const roleDlg = ref(false);
const roleForm = ref({});
function openRole(row) {
  roleForm.value = row ? { ...row } : {};
  roleDlg.value = true;
}
async function saveRole() {
  if (!roleForm.value.code || !roleForm.value.name) return ElMessage.warning('请填写角色编码和名称');
  saving.value = true;
  try {
    if (roleForm.value.id) await roleAPI.update(roleForm.value.id, { name: roleForm.value.name, description: roleForm.value.description, dataScope: roleForm.value.dataScope });
    else await roleAPI.create(roleForm.value);
    ElMessage.success('保存成功');
    roleDlg.value = false;
    loadRoles();
  } finally { saving.value = false; }
}
async function removeRole(row) {
  await ElMessageBox.confirm(`确认删除角色「${row.name}」？`, '提示', { type: 'warning' });
  await roleAPI.remove(row.id);
  ElMessage.success('已删除');
  loadRoles();
}

// 角色-权限
const permDlg = ref(false);
const permRole = ref(null);
const permForm = reactive({ roleId: null, permissionIds: [] });
const permGroups = computed(() => {
  const map = {};
  for (const p of permissions.value) {
    (map[p.module] = map[p.module] || []).push(p);
  }
  return Object.entries(map).map(([module, perms]) => ({ module, perms }));
});
function openPermissions(row) {
  permRole.value = row;
  permForm.roleId = row.id;
  permForm.permissionIds = row.permissions?.map((p) => p.id) || [];
  permDlg.value = true;
}
async function savePermissions() {
  await roleAPI.assignPermissions(permForm.roleId, permForm.permissionIds);
  ElMessage.success('权限已更新');
  permDlg.value = false;
  loadRoles();
}

async function loadUsers() {
  loadingUsers.value = true;
  try { users.value = await userAPI.list(); } finally { loadingUsers.value = false; }
}
async function loadRoles() {
  loadingRoles.value = true;
  try { roles.value = await roleAPI.list(); } finally { loadingRoles.value = false; }
}

onMounted(async () => {
  loadUsers();
  loadRoles();
  permissions.value = await permissionAPI();
  loadAudit();
});
</script>

<style scoped>
.toolbar { margin-bottom: 14px; }
.audit-filter { display: flex; gap: 8px; flex-wrap: wrap; }
.pager { margin-top: 12px; display: flex; justify-content: flex-end; }
.perm-group { width: 100%; }
.perm-group-block { margin-bottom: 14px; }
.perm-group-title { font-weight: 600; color: var(--text-main); margin-bottom: 6px; }
.perm-item { margin-right: 16px; margin-bottom: 4px; width: 150px; }
</style>