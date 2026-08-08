<template>
  <div>
    <!-- 页面标题 -->
    <div class="page-heading">
      <div class="title"><el-icon><User /></el-icon>客户管理</div>
      <span class="page-desc">维护客户档案、等级与信用额度</span>
    </div>

    <!-- 概览 -->
    <div class="stat-grid">
      <div v-for="(c, i) in topStats" :key="i" class="stat-card">
        <div class="label">{{ c.label }}</div>
        <div class="value" :style="{color:c.color}">{{ c.value }}</div>
        <div class="sub">{{ c.sub }}</div>
      </div>
    </div>

    <div class="page-card">
      <div class="table-topbar">
        <div class="left">
          <el-input v-model="query.keyword" placeholder="搜索客户名称/编码/联系人" clearable style="width:260px" @keyup.enter="load(1)" @clear="load(1)">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="query.type" placeholder="客户类型" clearable style="width:140px" @change="load(1)">
            <el-option v-for="(t, k) in CUSTOMER_TYPE" :key="k" :label="t" :value="k" />
          </el-select>
          <el-select v-model="query.status" placeholder="状态" clearable style="width:110px" @change="load(1)">
            <el-option label="启用" value="active" /><el-option label="停用" value="inactive" />
          </el-select>
          <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
        </div>
        <div class="right-btn">
          <template v-if="multiple.length">
            <el-button type="success" plain @click="batchStatus('active')">批量启用</el-button>
            <el-button type="warning" plain @click="batchStatus('inactive')">批量停用</el-button>
            <el-button type="danger" plain @click="batchRemove">批量删除</el-button>
            <el-divider direction="vertical" />
          </template>
          <el-button @click="importer.open()"><el-icon><Upload /></el-icon>批量导入</el-button>
          <el-button @click="load(1)"><el-icon><Refresh /></el-icon>刷新</el-button>
          <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon>新增客户</el-button>
        </div>
      </div>

      <el-table :data="list" v-loading="loading" stripe @selection-change="onSelect">
        <el-table-column type="selection" width="46" />
        <el-table-column prop="code" label="客户编码" width="150" />
        <el-table-column prop="name" label="客户名称" min-width="220" show-overflow-tooltip />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ dictText(CUSTOMER_TYPE, row.type) }}</template>
        </el-table-column>
        <el-table-column label="等级" width="70">
          <template #default="{ row }"><el-tag size="small" :type="levelTag(row.level)">{{ row.level }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/customers/${row.id}`)">详情</el-button>
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="warning" @click="toggleStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          background layout="total, prev, pager, next, sizes"
          :total="total" v-model:current-page="query.page"
          v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
          @current-change="load()" @size-change="load(1)"
        />
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑客户' : '新增客户'" width="640px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="客户名称" required><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="客户编码"><el-input v-model="form.code" :disabled="!!form.id" placeholder="留空自动生成" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="客户类型"><el-select v-model="form.type" style="width:100%"><el-option v-for="(t,k) in CUSTOMER_TYPE" :key="k" :label="t" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="客户等级"><el-select v-model="form.level" style="width:100%"><el-option v-for="l in ['A','B','C','D']" :key="l" :label="l + ' 级'" :value="l" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系电话"><el-input v-model="form.phone" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="信用额度"><el-input-number v-model="form.creditLimit" :min="0" :step="10000" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="税号"><el-input v-model="form.taxNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="业务范围"><el-input v-model="form.businessScope" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="地址"><el-input v-model="form.address" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入 -->
    <el-dialog v-model="importer.visible.value" title="批量导入客户" width="520px" @closed="importer.close()">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:14px">
        请先下载模板，按模板格式填写后上传 Excel 文件（.xlsx）。客户编码留空将自动生成。
      </el-alert>
      <div class="import-actions">
        <el-button @click="importer.downloadTemplate()"><el-icon><Download /></el-icon>下载导入模板</el-button>
        <el-upload :auto-upload="false" :limit="1" :on-change="(f) => importer.onFileChange(f.raw)" accept=".xlsx,.xls" :on-remove="() => importer.onFileChange(null)">
          <el-button type="primary" plain><el-icon><FolderOpened /></el-icon>选择 Excel 文件</el-button>
        </el-upload>
      </div>
      <div v-if="importer.file.value" class="import-file-tip">已选择：{{ importer.file.value.name }}</div>
      <div v-if="importer.result.value" class="import-result">
        <el-alert :type="importer.result.value.failed ? 'warning' : 'success'" :closable="false" show-icon
          :title="importer.result.value.msg" />
        <ul v-if="importer.result.value.errors && importer.result.value.errors.length" class="import-errors">
          <li v-for="(e, i) in importer.result.value.errors" :key="i">{{ e }}</li>
        </ul>
      </div>
      <template #footer>
        <el-button @click="importer.close()">关闭</el-button>
        <el-button type="primary" :loading="importer.uploading.value" @click="importer.submit()">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerAPI, customerStatsAPI, customerImportAPI, customerImportTemplateAPI } from '@/api';
import { CUSTOMER_TYPE, dictText, money } from '@/utils/dicts';
import { useImport } from '@/composables/useImport';

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, keyword: '', type: '', status: '' });
const dialogVisible = ref(false);
const form = ref({});
const multiple = ref([]);

const importer = useImport({
  importAPI: customerImportAPI,
  templateAPI: customerImportTemplateAPI,
  refresh: () => load(1),
  fileName: '客户',
});

function onSelect(rows) { multiple.value = rows; }
const selectedIds = () => multiple.value.map((r) => r.id);

async function batchStatus(status) {
  await ElMessageBox.confirm(`确认将选中的 ${selectedIds().length} 位客户${status === 'active' ? '启用' : '停用'}？`, '批量操作', { type: 'warning' });
  await customerAPI.batchUpdate(selectedIds(), { status });
  ElMessage.success(status === 'active' ? '已批量启用' : '已批量停用');
  multiple.value = [];
  load(); loadStats();
}

async function batchRemove() {
  await ElMessageBox.confirm(`确认删除选中的 ${selectedIds().length} 位客户？删除后不可恢复。`, '批量删除', { type: 'warning' });
  await customerAPI.batchRemove(selectedIds());
  ElMessage.success('已批量删除');
  multiple.value = [];
  load(); loadStats();
}

const topStats = ref([]);
const levelTag = (l) => ({ A: 'danger', B: 'warning', C: 'primary', D: 'info' }[l] || 'info');

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await customerAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function loadStats() {
  const rows = await customerStatsAPI();
  const totalCus = rows.length;
  const levelA = rows.filter((r) => r.level === 'A').length;
  const totalOrders = rows.reduce((s, r) => s + r.orderCount, 0);
  const totalRecv = rows.reduce((s, r) => s + r.receivable, 0);
  topStats.value = [
    { label: '客户总数', value: totalCus, color: 'var(--brand)', sub: '活跃客户' },
    { label: 'A 级客户', value: levelA, color: 'var(--danger)', sub: '重点客户' },
    { label: '关联订单', value: totalOrders, color: 'var(--warning)', sub: '全部订单' },
    { label: '应收余额', value: money(totalRecv), color: '#7c3aed', sub: '未收金额' },
  ];
}

function openDialog(row) {
  form.value = row ? { ...row } : { type: 'shipper', level: 'B', status: 'active', creditLimit: 0 };
  dialogVisible.value = true;
}

async function save() {
  if (!form.value.name) return ElMessage.warning('请填写客户名称');
  saving.value = true;
  try {
    if (form.value.id) await customerAPI.update(form.value.id, form.value);
    else await customerAPI.create(form.value);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load(); loadStats();
  } finally { saving.value = false; }
}

async function toggleStatus(row) {
  await customerAPI.update(row.id, { ...row, status: row.status === 'active' ? 'inactive' : 'active' });
  ElMessage.success('状态已更新');
  load(); loadStats();
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除客户「${row.name}」？`, '提示', { type: 'warning' });
  await customerAPI.remove(row.id);
  ElMessage.success('已删除');
  load(); loadStats();
}

onMounted(() => { load(1); loadStats(); });
</script>

<style scoped>
.page-desc { font-size: 13px; color: var(--text-muted); }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.right-btn { display: flex; gap: 8px; align-items: center; }
.import-actions { display: flex; gap: 16px; align-items: center; margin-bottom: 12px; }
.import-file-tip { font-size: 13px; color: var(--success); margin-bottom: 10px; }
.import-errors { margin: 10px 0 0; padding-left: 18px; max-height: 160px; overflow: auto; }
.import-errors li { font-size: 12px; color: var(--danger); line-height: 1.7; }
</style>