<template>
  <div class="page-card">
    <div class="toolbar">
      <el-button v-permission="'system:group'" type="primary" @click="openGroup()"><el-icon><Plus /></el-icon>新增小组</el-button>
      <el-alert class="tip" type="info" :closable="false" show-icon
        title="小组用于数据权限隔离：角色 dataScope 设为“本组”时，仅能查看本人/本组订单；订单创建时自动归属到当前用户所在组。" />
    </div>

    <el-table :data="groups" v-loading="loading" stripe>
      <el-table-column prop="name" label="小组名称" width="150" />
      <el-table-column prop="code" label="编码" width="120" />
      <el-table-column prop="description" label="描述" min-width="180" />
      <el-table-column prop="ownerName" label="组长" width="110" />
      <el-table-column prop="memberCount" label="成员数" width="90" />
      <el-table-column label="状态" width="90">
        <template #default="{row}"><el-tag :type="row.status==='active'?'success':'danger'" size="small">{{ row.status==='active'?'启用':'禁用' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openMembers(row)">成员</el-button>
          <el-button link type="primary" @click="openGroup(row)">编辑</el-button>
          <el-button link type="danger" @click="removeGroup(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 小组表单 -->
    <el-dialog v-model="groupDlg" :title="groupForm.id ? '编辑小组' : '新增小组'" width="480px">
      <el-form :model="groupForm" label-width="90px">
        <el-form-item label="小组名称"><el-input v-model="groupForm.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="groupForm.code" :disabled="!!groupForm.id" placeholder="如 chukou-1" /></el-form-item>
        <el-form-item label="组长">
          <el-select v-model="groupForm.ownerId" clearable filterable style="width:100%">
            <el-option v-for="u in users" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="groupForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="groupForm.status"><el-radio value="active">启用</el-radio><el-radio value="disabled">禁用</el-radio></el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>

    <!-- 成员管理 -->
    <el-dialog v-model="memberDlg" :title="`成员管理 - ${curGroup?.name}`" width="560px">
      <div class="member-add">
        <el-select v-model="newMemberId" filterable placeholder="选择用户添加到小组" style="flex:1">
          <el-option v-for="u in users" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id" />
        </el-select>
        <el-button type="primary" @click="addMember">添加</el-button>
      </div>
      <el-table :data="curGroup?.userMembers || []" size="small" stripe>
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeMember(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { groupAPI, userAPI } from '@/api';

const groups = ref([]);
const users = ref([]);
const loading = ref(false);
const saving = ref(false);

const groupDlg = ref(false);
const groupForm = ref({});
function openGroup(row) {
  groupForm.value = row ? { ...row } : { status: 'active' };
  groupDlg.value = true;
}
async function saveGroup() {
  if (!groupForm.value.name) return ElMessage.warning('请填写小组名称');
  saving.value = true;
  try {
    if (groupForm.value.id) await groupAPI.update(groupForm.value.id, groupForm.value);
    else await groupAPI.create(groupForm.value);
    ElMessage.success('保存成功');
    groupDlg.value = false;
    loadGroups();
  } finally { saving.value = false; }
}
async function removeGroup(row) {
  await ElMessageBox.confirm(`确认删除小组「${row.name}」？`, '提示', { type: 'warning' });
  await groupAPI.remove(row.id);
  ElMessage.success('已删除');
  loadGroups();
}

// 成员管理
const memberDlg = ref(false);
const curGroup = ref(null);
const newMemberId = ref(null);
async function openMembers(row) {
  curGroup.value = await groupAPI.get(row.id);
  newMemberId.value = null;
  memberDlg.value = true;
}
async function addMember() {
  if (!newMemberId.value) return ElMessage.warning('请选择用户');
  await groupAPI.addMember(curGroup.value.id, newMemberId.value);
  ElMessage.success('已添加');
  curGroup.value = await groupAPI.get(curGroup.value.id);
  loadGroups();
}
async function removeMember(m) {
  await groupAPI.removeMember(curGroup.value.id, m.id);
  ElMessage.success('已移除');
  curGroup.value = await groupAPI.get(curGroup.value.id);
  loadGroups();
}

async function loadGroups() {
  loading.value = true;
  try { groups.value = await groupAPI.list(); } finally { loading.value = false; }
}

onMounted(async () => {
  loadGroups();
  users.value = await userAPI.list();
});
</script>

<style scoped>
.toolbar { margin-bottom: 14px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.tip { flex: 1; min-width: 200px; }
.member-add { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
</style>