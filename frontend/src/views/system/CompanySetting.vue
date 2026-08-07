<template>
  <div class="page-card">
    <el-tabs v-model="tab">
      <!-- 公司信息 -->
      <el-tab-pane label="公司信息" name="profile">
        <el-form :model="profile" label-width="120px" style="max-width: 720px">
          <el-row :gutter="20">
            <el-col :span="12"><el-form-item label="公司全称"><el-input v-model="profile.companyName" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="公司简称"><el-input v-model="profile.shortName" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="英文名称"><el-input v-model="profile.enName" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="法定代表人"><el-input v-model="profile.legalPerson" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="统一信用代码"><el-input v-model="profile.taxNo" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="联系电话"><el-input v-model="profile.phone" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="传真"><el-input v-model="profile.fax" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="邮箱"><el-input v-model="profile.email" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="官网"><el-input v-model="profile.website" /></el-form-item></el-col>
            <el-col :span="24"><el-form-item label="注册地址"><el-input v-model="profile.address" /></el-form-item></el-col>
            <el-col :span="24"><el-form-item label="公司简介"><el-input v-model="profile.description" type="textarea" :rows="3" /></el-form-item></el-col>
          </el-row>
          <el-form-item>
            <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存公司信息</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- 部门 -->
      <el-tab-pane label="部门管理" name="department">
        <div class="section-head">
          <el-button v-permission="'system:company'" type="primary" @click="openDepartment()"><el-icon><Plus /></el-icon>新增部门</el-button>
        </div>
        <el-table :data="departments" v-loading="loadingDept" stripe>
          <el-table-column prop="name" label="部门名称" min-width="140" />
          <el-table-column prop="code" label="编码" width="120" />
          <el-table-column label="上级部门" width="140">
            <template #default="{ row }">{{ parentName(row.parentId) }}</template>
          </el-table-column>
          <el-table-column prop="leaderName" label="负责人" width="120">
            <template #default="{ row }">{{ row.leaderName || '-' }}</template>
          </el-table-column>
          <el-table-column prop="sort" label="排序" width="80" />
          <el-table-column label="状态" width="90">
            <template #default="{row}"><el-tag :type="row.status==='active'?'success':'danger'" size="small">{{ row.status==='active'?'启用':'停用' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDepartment(row)">编辑</el-button>
              <el-button link type="danger" @click="removeDepartment(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 银行账号 -->
      <el-tab-pane label="银行账号" name="account">
        <div class="section-head">
          <el-button v-permission="'system:company'" type="primary" @click="openAccount()"><el-icon><Plus /></el-icon>新增账号</el-button>
        </div>
        <el-table :data="accounts" v-loading="loadingAccount" stripe>
          <el-table-column prop="accountName" label="户名" min-width="150" />
          <el-table-column prop="accountNo" label="账号" min-width="160" />
          <el-table-column prop="bankName" label="银行" min-width="140" />
          <el-table-column prop="bankBranch" label="开户支行" min-width="160" />
          <el-table-column label="币种" width="80"><template #default="{row}">{{ row.currency }}</template></el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{row}">{{ {receive:'收款',pay:'付款',both:'收付'}[row.accountType] }}</template>
          </el-table-column>
          <el-table-column label="默认" width="80"><template #default="{row}"><el-tag v-if="row.isDefault" size="small" type="success">默认</el-tag></template></el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{row}"><el-tag :type="row.status==='active'?'success':'danger'" size="small">{{ row.status==='active'?'启用':'停用' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openAccount(row)">编辑</el-button>
              <el-button link type="danger" @click="removeAccount(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 开票抬头 -->
      <el-tab-pane label="开票抬头" name="title">
        <div class="section-head">
          <el-button v-permission="'system:company'" type="primary" @click="openTitle()"><el-icon><Plus /></el-icon>新增抬头</el-button>
        </div>
        <el-alert type="info" :closable="false" show-icon title="抬头用于发票与单证套打的抬头信息，可配置多个（如不同主体/分公司），默认抬头将优先用于开票与单证打印。" style="margin-bottom:14px" />
        <el-table :data="titles" v-loading="loadingTitle" stripe>
          <el-table-column prop="titleName" label="抬头名称" min-width="180" />
          <el-table-column prop="taxNo" label="税号" min-width="150" />
          <el-table-column prop="bankName" label="开户行" min-width="140" />
          <el-table-column prop="accountNo" label="银行账号" min-width="150" />
          <el-table-column prop="address" label="地址" min-width="180" />
          <el-table-column label="默认" width="80"><template #default="{row}"><el-tag v-if="row.isDefault" size="small" type="success">默认</el-tag></template></el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{row}"><el-tag :type="row.status==='active'?'success':'danger'" size="small">{{ row.status==='active'?'启用':'停用' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openTitle(row)">编辑</el-button>
              <el-button link type="danger" @click="removeTitle(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 部门表单 -->
    <el-dialog v-model="deptDlg" :title="deptForm.id ? '编辑部门' : '新增部门'" width="460px">
      <el-form :model="deptForm" label-width="90px">
        <el-form-item label="部门名称"><el-input v-model="deptForm.name" /></el-form-item>
        <el-form-item label="部门编码"><el-input v-model="deptForm.code" /></el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="deptForm.parentId" clearable style="width:100%" placeholder="无（顶层）">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" :disabled="d.id===deptForm.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="deptForm.leaderId" clearable filterable style="width:100%" placeholder="选择负责人">
            <el-option v-for="u in users" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="deptForm.sort" :min="0" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="deptForm.status"><el-radio value="active">启用</el-radio><el-radio value="disabled">停用</el-radio></el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deptDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDepartment">保存</el-button>
      </template>
    </el-dialog>

    <!-- 账号表单 -->
    <el-dialog v-model="accountDlg" :title="accountForm.id ? '编辑账号' : '新增账号'" width="520px">
      <el-form :model="accountForm" label-width="90px">
        <el-form-item label="户名"><el-input v-model="accountForm.accountName" /></el-form-item>
        <el-form-item label="账号"><el-input v-model="accountForm.accountNo" /></el-form-item>
        <el-form-item label="银行名称"><el-input v-model="accountForm.bankName" /></el-form-item>
        <el-form-item label="开户支行"><el-input v-model="accountForm.bankBranch" /></el-form-item>
        <el-form-item label="币种">
          <el-select v-model="accountForm.currency" style="width:100%">
            <el-option v-for="c in ['CNY','USD','EUR','HKD','JPY','OTHER']" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="accountForm.accountType">
            <el-radio value="receive">收款</el-radio><el-radio value="pay">付款</el-radio><el-radio value="both">收付</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="默认账号"><el-switch v-model="accountForm.isDefault" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="accountForm.status"><el-radio value="active">启用</el-radio><el-radio value="disabled">停用</el-radio></el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="accountForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="accountDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAccount">保存</el-button>
      </template>
    </el-dialog>

    <!-- 抬头表单 -->
    <el-dialog v-model="titleDlg" :title="titleForm.id ? '编辑抬头' : '新增抬头'" width="520px">
      <el-form :model="titleForm" label-width="90px">
        <el-form-item label="抬头名称"><el-input v-model="titleForm.titleName" /></el-form-item>
        <el-form-item label="税号"><el-input v-model="titleForm.taxNo" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="titleForm.address" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="titleForm.phone" /></el-form-item>
        <el-form-item label="开户行"><el-input v-model="titleForm.bankName" /></el-form-item>
        <el-form-item label="银行账号"><el-input v-model="titleForm.accountNo" /></el-form-item>
        <el-form-item label="默认抬头"><el-switch v-model="titleForm.isDefault" /></el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="titleForm.status"><el-radio value="active">启用</el-radio><el-radio value="disabled">停用</el-radio></el-radio-group>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="titleForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="titleDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTitle">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { companyAPI, userAPI } from '@/api';

const tab = ref('profile');
const saving = ref(false);
const savingProfile = ref(false);

// ===== 公司信息 =====
const profile = ref({});
async function loadProfile() { profile.value = await companyAPI.profile(); }
async function saveProfile() {
  savingProfile.value = true;
  try {
    await companyAPI.saveProfile(profile.value);
    ElMessage.success('保存成功');
  } finally { savingProfile.value = false; }
}

// ===== 部门 =====
const departments = ref([]);
const loadingDept = ref(false);
const deptDlg = ref(false);
const deptForm = ref({});
const users = ref([]);
const parentName = (id) => departments.value.find((d) => d.id === id)?.name || (id ? '未知' : '-');

function openDepartment(row) {
  deptForm.value = row ? { ...row } : { parentId: 0, sort: 0, status: 'active' };
  deptDlg.value = true;
}
async function saveDepartment() {
  if (!deptForm.value.name) return ElMessage.warning('请填写部门名称');
  saving.value = true;
  try {
    if (deptForm.value.id) await companyAPI.updateDepartment(deptForm.value.id, deptForm.value);
    else await companyAPI.createDepartment(deptForm.value);
    ElMessage.success('保存成功');
    deptDlg.value = false;
    loadDepartments();
  } finally { saving.value = false; }
}
async function removeDepartment(row) {
  await ElMessageBox.confirm(`确认删除部门「${row.name}」？`, '提示', { type: 'warning' });
  await companyAPI.removeDepartment(row.id);
  ElMessage.success('已删除');
  loadDepartments();
}
async function loadDepartments() {
  loadingDept.value = true;
  try { departments.value = await companyAPI.departments(); } finally { loadingDept.value = false; }
}

// ===== 银行账号 =====
const accounts = ref([]);
const loadingAccount = ref(false);
const accountDlg = ref(false);
const accountForm = ref({});
function openAccount(row) {
  accountForm.value = row ? { ...row } : { currency: 'CNY', accountType: 'receive', status: 'active', isDefault: false };
  accountDlg.value = true;
}
async function saveAccount() {
  if (!accountForm.value.accountName || !accountForm.value.accountNo) return ElMessage.warning('请填写户名与账号');
  saving.value = true;
  try {
    if (accountForm.value.id) await companyAPI.updateAccount(accountForm.value.id, accountForm.value);
    else await companyAPI.createAccount(accountForm.value);
    ElMessage.success('保存成功');
    accountDlg.value = false;
    loadAccounts();
  } finally { saving.value = false; }
}
async function removeAccount(row) {
  await ElMessageBox.confirm(`确认删除账号「${row.accountNo}」？`, '提示', { type: 'warning' });
  await companyAPI.removeAccount(row.id);
  ElMessage.success('已删除');
  loadAccounts();
}
async function loadAccounts() {
  loadingAccount.value = true;
  try { accounts.value = await companyAPI.accounts(); } finally { loadingAccount.value = false; }
}

// ===== 开票抬头 =====
const titles = ref([]);
const loadingTitle = ref(false);
const titleDlg = ref(false);
const titleForm = ref({});
function openTitle(row) {
  titleForm.value = row ? { ...row } : { status: 'active', isDefault: false };
  titleDlg.value = true;
}
async function saveTitle() {
  if (!titleForm.value.titleName) return ElMessage.warning('请填写抬头名称');
  saving.value = true;
  try {
    if (titleForm.value.id) await companyAPI.updateTitle(titleForm.value.id, titleForm.value);
    else await companyAPI.createTitle(titleForm.value);
    ElMessage.success('保存成功');
    titleDlg.value = false;
    loadTitles();
  } finally { saving.value = false; }
}
async function removeTitle(row) {
  await ElMessageBox.confirm(`确认删除抬头「${row.titleName}」？`, '提示', { type: 'warning' });
  await companyAPI.removeTitle(row.id);
  ElMessage.success('已删除');
  loadTitles();
}
async function loadTitles() {
  loadingTitle.value = true;
  try { titles.value = await companyAPI.titles(); } finally { loadingTitle.value = false; }
}

onMounted(async () => {
  loadProfile();
  loadDepartments();
  loadAccounts();
  loadTitles();
  users.value = await userAPI.list();
});
</script>

<style scoped>
.section-head { margin-bottom: 14px; }
</style>