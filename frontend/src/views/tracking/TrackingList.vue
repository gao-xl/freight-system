<template>
  <div class="page-card">
    <div class="table-topbar">
      <div class="left">
        <el-input v-model="query.keyword" placeholder="搜索地点/描述" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.stage" placeholder="阶段" clearable style="width:130px" @change="load(1)">
          <el-option v-for="(t,k) in TRACK_STAGE" :key="k" :label="t" :value="k" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
      </div>
      <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon>新增节点</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="订单" min-width="150">
        <template #default="{ row }"><el-link type="primary" @click="goOrder(row)">{{ row.order?.orderNo }}</el-link></template>
      </el-table-column>
      <el-table-column label="阶段" width="110">
        <template #default="{ row }"><el-tag :type="trackTag(row.stage)" size="small">{{ dictText(TRACK_STAGE, row.stage) }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="location" label="地点" width="140" />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ formatTime(row.eventTime) }}</template>
      </el-table-column>
      <el-table-column prop="operator" label="操作人" width="100" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑节点' : '新增运输节点'" width="520px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="关联订单">
          <el-select v-model="form.orderId" filterable style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.cargoDesc}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="阶段"><el-select v-model="form.stage" style="width:100%"><el-option v-for="(t,k) in TRACK_STAGE" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="地点"><el-input v-model="form.location" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" /></el-form-item>
        <el-form-item label="操作人"><el-input v-model="form.operator" /></el-form-item>
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
import { trackAPI, orderAPI } from '@/api';
import { TRACK_STAGE, dictText } from '@/utils/dicts';

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const orders = ref([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '', stage: '' });
const dialogVisible = ref(false);
const form = ref({});

const trackTag = (s) => ({ in_transit: 'warning', arrived: 'primary', cleared: 'success', delivered: 'success' }[s] || 'info');
const formatTime = (t) => (t ? String(t).replace('T', ' ').slice(0, 16) : '-');

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await trackAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function loadOptions() {
  const o = await orderAPI.list({ page: 1, pageSize: 200 });
  orders.value = o.list;
}

function openDialog(row) {
  form.value = row ? { ...row } : { stage: 'booked' };
  dialogVisible.value = true;
}

async function save() {
  if (!form.value.orderId) return ElMessage.warning('请选择关联订单');
  saving.value = true;
  try {
    if (form.value.id) await trackAPI.update(form.value.id, form.value);
    else await trackAPI.create(form.value);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function remove(row) {
  await ElMessageBox.confirm('确认删除该跟踪节点？', '提示', { type: 'warning' });
  await trackAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

function goOrder(row) { if (row.order?.id) router.push(`/orders/${row.order.id}`); }

onMounted(() => { load(1); loadOptions(); });
</script>

<style scoped>
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }

/* 窄屏适配：筛选区换行、搜索框占满、分页居中 */
@media (max-width: 768px) {
  .left { flex-wrap: wrap; width: 100%; }
  .left :deep(.el-input) { width: 100% !important; }
  .pager { justify-content: center; }
}
</style>