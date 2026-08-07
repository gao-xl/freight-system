<template>
  <div class="page-card">
    <div class="table-topbar">
      <div class="left">
        <el-input v-model="query.keyword" placeholder="搜索报关单号/海关编号" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.status" placeholder="状态" clearable style="width:120px" @change="load(1)">
          <el-option v-for="(v,k) in CUSTOMS_STATUS" :key="k" :label="v.text" :value="k" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
      </div>
      <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon>新增报关</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="declNo" label="报关单号" width="150" />
      <el-table-column label="订单" min-width="150">
        <template #default="{ row }"><el-link type="primary" @click="goOrder(row)">{{ row.order?.orderNo }}</el-link></template>
      </el-table-column>
      <el-table-column label="报关行" min-width="150">
        <template #default="{ row }">{{ row.supplier?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="customsNo" label="海关编号" width="140" />
      <el-table-column prop="hsCode" label="HS编码" width="110" />
      <el-table-column label="申报值" width="110" align="right">
        <template #default="{ row }">{{ row.customsValue }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }"><el-tag :type="statusOf(CUSTOMS_STATUS, row.status).type" size="small">{{ statusOf(CUSTOMS_STATUS, row.status).text }}</el-tag></template>
      </el-table-column>
      <el-table-column label="放行日期" width="110">
        <template #default="{ row }">{{ row.releaseDate || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button v-if="['prepared','submitted','inspecting'].includes(row.status)" link type="warning" @click="release(row)">放行</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑报关' : '新增报关'" width="620px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="关联订单">
          <el-select v-model="form.orderId" filterable style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.cargoDesc}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="报关行">
          <el-select v-model="form.supplierId" filterable style="width:100%">
            <el-option v-for="s in brokers" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="类型"><el-select v-model="form.type" style="width:100%"><el-option label="出口清关" value="export_clearance" /><el-option label="进口清关" value="import_clearance" /><el-option label="查验" value="inspection" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option v-for="(v,k) in CUSTOMS_STATUS" :key="k" :label="v.text" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="海关编号"><el-input v-model="form.customsNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="HS编码"><el-input v-model="form.hsCode" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="申报值"><el-input-number v-model="form.customsValue" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="关税"><el-input-number v-model="form.taxAmount" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="申报日期"><el-date-picker v-model="form.submitDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="放行日期"><el-date-picker v-model="form.releaseDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customsAPI, orderAPI, supplierAPI } from '@/api';
import { CUSTOMS_STATUS, statusOf } from '@/utils/dicts';

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const orders = ref([]);
const brokers = ref([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: '' });
const dialogVisible = ref(false);
const form = ref({});

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await customsAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function loadOptions() {
  const [o, s] = await Promise.all([
    orderAPI.list({ page: 1, pageSize: 200 }),
    supplierAPI.list({ page: 1, pageSize: 200, category: 'customs_broker' }),
  ]);
  orders.value = o.list;
  brokers.value = s.list;
}

function openDialog(row) {
  form.value = row ? { ...row } : { type: 'export_clearance', status: 'prepared', customsValue: 0, taxAmount: 0 };
  dialogVisible.value = true;
}

async function save() {
  if (!form.value.orderId) return ElMessage.warning('请选择关联订单');
  saving.value = true;
  try {
    if (form.value.id) await customsAPI.update(form.value.id, form.value);
    else await customsAPI.create(form.value);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function release(row) {
  await customsAPI.update(row.id, { ...row, status: 'released', releaseDate: new Date().toISOString().slice(0, 10) });
  ElMessage.success('已放行');
  load();
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除报关单「${row.declNo}」？`, '提示', { type: 'warning' });
  await customsAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

function goOrder(row) { if (row.order?.id) router.push(`/orders/${row.order.id}`); }

onMounted(() => { load(1); loadOptions(); });
</script>

<style scoped>
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
</style>