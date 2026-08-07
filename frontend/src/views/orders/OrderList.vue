<template>
  <div class="page-card">
    <div class="table-topbar">
      <div class="left">
        <el-input v-model="query.keyword" placeholder="搜索订单号/货名/箱号" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.status" placeholder="状态" clearable style="width:120px" @change="load(1)">
          <el-option v-for="(v,k) in ORDER_STATUS" :key="k" :label="v.text" :value="k" />
        </el-select>
        <el-select v-model="query.mode" placeholder="运输方式" clearable style="width:120px" @change="load(1)">
          <el-option v-for="(t,k) in MODE" :key="k" :label="t" :value="k" />
        </el-select>
        <el-select v-model="query.type" placeholder="进出口" clearable style="width:120px" @change="load(1)">
          <el-option label="出口" value="export" />
          <el-option label="进口" value="import" />
          <el-option label="中转" value="transit" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
      </div>
      <div class="right-btn">
        <template v-if="multiple.length">
          <el-button type="success" plain @click="advanceDialog = true">批量推进</el-button>
          <el-button type="primary" plain @click="statusDialog = true">批量改状态</el-button>
          <el-button type="danger" plain @click="batchRemove">批量删除</el-button>
          <el-divider direction="vertical" />
        </template>
        <el-button @click="exportExcel"><el-icon><Download /></el-icon>导出Excel</el-button>
        <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon>新建订单</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe @selection-change="onSelect">
      <el-table-column type="selection" width="46" />
      <el-table-column prop="orderNo" label="订单号" width="150">
        <template #default="{ row }"><el-link type="primary" @click="goDetail(row)">{{ row.orderNo }}</el-link></template>
      </el-table-column>
      <el-table-column label="类型" width="70">
        <template #default="{ row }"><el-tag :type="row.type==='import'?'warning':'success'" size="small">{{ {export:'出口',import:'进口',transit:'中转'}[row.type] || row.type }}</el-tag></template>
      </el-table-column>
      <el-table-column label="客户" min-width="170" show-overflow-tooltip>
        <template #default="{ row }">{{ row.customer?.name || '-' }}</template>
      </el-table-column>
      <el-table-column label="方式" width="80">
        <template #default="{ row }">{{ dictText(MODE, row.mode) }}</template>
      </el-table-column>
      <el-table-column prop="cargoDesc" label="货物描述" min-width="140" show-overflow-tooltip />
      <el-table-column label="航线" min-width="160">
        <template #default="{ row }">{{ row.originPort }} → {{ row.destPort }}</template>
      </el-table-column>
      <el-table-column label="重量(t)" width="90" align="right">
        <template #default="{ row }">{{ row.cargoWeight || 0 }}</template>
      </el-table-column>
      <el-table-column label="金额" width="110" align="right">
        <template #default="{ row }">{{ money(row.totalAmount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }"><el-tag :type="statusOf(ORDER_STATUS, row.status).type" size="small">{{ statusOf(ORDER_STATUS, row.status).text }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row)">详情</el-button>
          <el-button v-if="row.status === 'draft'" link type="warning" @click="confirmOrder(row)">确认</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>

    <el-dialog v-model="dialogVisible" title="新建订单" width="720px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户" required>
              <el-select v-model="form.customerId" filterable style="width:100%" placeholder="选择客户">
                <el-option v-for="c in customers" :key="c.id" :label="`${c.name} (${c.code})`" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="订单类型"><el-select v-model="form.type" style="width:100%"><el-option label="出口" value="export" /><el-option label="进口" value="import" /><el-option label="中转" value="transit" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="运输方式"><el-select v-model="form.mode" style="width:100%"><el-option v-for="(t,k) in MODE" :key="k" :label="t" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="服务类型"><el-select v-model="form.serviceType" style="width:100%"><el-option v-for="(t,k) in SERVICE_TYPE" :key="k" :label="t" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="起运港"><el-input v-model="form.originPort" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="目的港"><el-input v-model="form.destPort" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="起运地"><el-input v-model="form.originPlace" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="目的地"><el-input v-model="form.destPlace" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="货物描述"><el-input v-model="form.cargoDesc" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="重量(t)"><el-input-number v-model="form.cargoWeight" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="体积(m³)"><el-input-number v-model="form.cargoVolume" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="件数"><el-input-number v-model="form.packageCount" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="预计发运"><el-date-picker v-model="form.etd" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="预计到港"><el-date-picker v-model="form.eta" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="币种"><el-input v-model="form.currency" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="总金额"><el-input-number v-model="form.totalAmount" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
          <template v-if="customFields.length">
            <el-divider content-position="left">自定义字段</el-divider>
            <el-col v-for="f in customFields" :key="f.fieldKey" :span="12">
              <el-form-item :label="f.label" :required="f.required">
                <el-input v-if="f.fieldType==='string'" v-model="form.customFields[f.fieldKey]" />
                <el-input-number v-else-if="f.fieldType==='number'" v-model="form.customFields[f.fieldKey]" :precision="2" style="width:100%" />
                <el-date-picker v-else-if="f.fieldType==='date'" v-model="form.customFields[f.fieldKey]" type="date" value-format="YYYY-MM-DD" style="width:100%" />
                <el-select v-else-if="f.fieldType==='enum'" v-model="form.customFields[f.fieldKey]" clearable style="width:100%">
                  <el-option v-for="o in (f.options?JSON.parse(f.options):[])" :key="o" :label="o" :value="o" />
                </el-select>
                <el-switch v-else-if="f.fieldType==='bool'" v-model="form.customFields[f.fieldKey]" />
              </el-form-item>
            </el-col>
          </template>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">创建</el-button>
      </template>
    </el-dialog>

    <!-- 批量推进节点 -->
    <el-dialog v-model="advanceDialog" title="批量推进节点" width="440px">
      <div class="batch-tip">已选 <b>{{ multiple.length }}</b> 张订单，将统一推进到所选节点。</div>
      <el-form label-width="90px">
        <el-form-item label="推进节点" required>
          <el-select v-model="advanceNode" style="width:100%">
            <el-option v-for="(v,k) in ORDER_NODE_OPTIONS" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="advanceDialog = false">取消</el-button>
        <el-button type="primary" :loading="advancing" @click="batchAdvance">执行推进</el-button>
      </template>
    </el-dialog>

    <!-- 批量修改状态 -->
    <el-dialog v-model="statusDialog" title="批量修改订单状态" width="440px">
      <div class="batch-tip">已选 <b>{{ multiple.length }}</b> 张订单，将统一改为所选状态。</div>
      <el-form label-width="90px">
        <el-form-item label="目标状态" required>
          <el-select v-model="targetStatus" style="width:100%">
            <el-option v-for="(v,k) in ORDER_STATUS" :key="k" :label="v.text" :value="k" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="statusDialog = false">取消</el-button>
        <el-button type="primary" :loading="updatingStatus" @click="batchStatus">执行修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { orderAPI, customerAPI, orderExportAPI, customFieldAPI, orderBatchAdvanceAPI, orderBatchStatusAPI } from '@/api';
import { ORDER_STATUS, MODE, SERVICE_TYPE, dictText, statusOf, money } from '@/utils/dicts';

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const customers = ref([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: '', mode: '', type: '' });
const dialogVisible = ref(false);
const form = ref({});
const customFields = ref([]);
const multiple = ref([]);
const advanceDialog = ref(false);
const statusDialog = ref(false);
const advancing = ref(false);
const updatingStatus = ref(false);
const advanceNode = ref('');
const targetStatus = ref('');

const ORDER_NODE_OPTIONS = {
  booked: '订舱', gate_in: '进港', customs: '报关', loaded: '装船',
  arrived: '到港', cleared: '清关', delivered: '送达',
};

function onSelect(rows) { multiple.value = rows; }
const selectedIds = () => multiple.value.map((r) => r.id);

async function batchAdvance() {
  if (!advanceNode.value) return ElMessage.warning('请选择要推进到的节点');
  if (!selectedIds().length) return ElMessage.warning('请先选择订单');
  advancing.value = true;
  try {
    const data = await orderBatchAdvanceAPI(selectedIds(), advanceNode.value);
    ElMessage.success(data.msg || '批量推进完成');
    advanceDialog.value = false;
    advanceNode.value = '';
    multiple.value = [];
    load();
  } finally { advancing.value = false; }
}

async function batchStatus() {
  if (!targetStatus.value) return ElMessage.warning('请选择目标状态');
  if (!selectedIds().length) return ElMessage.warning('请先选择订单');
  await ElMessageBox.confirm(`确认将选中的 ${selectedIds().length} 张订单统一改为「${statusOf(ORDER_STATUS, targetStatus.value).text}」？`, '批量改状态', { type: 'warning' });
  updatingStatus.value = true;
  try {
    const data = await orderBatchStatusAPI(selectedIds(), targetStatus.value);
    ElMessage.success(data.msg || '批量改状态完成');
    statusDialog.value = false;
    targetStatus.value = '';
    multiple.value = [];
    load();
  } finally { updatingStatus.value = false; }
}

async function batchRemove() {
  await ElMessageBox.confirm(`确认删除选中的 ${selectedIds().length} 张订单？删除后不可恢复。`, '批量删除', { type: 'warning' });
  await orderAPI.batchRemove(selectedIds());
  ElMessage.success('已批量删除');
  multiple.value = [];
  load();
}

async function loadCustomFields() {
  try {
    const all = await customFieldAPI.list('order');
    customFields.value = all.filter((f) => f.enabled);
  } catch (e) { customFields.value = []; }
}

async function exportExcel() {
  const resp = await orderExportAPI();
  const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `订单列表_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await orderAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

function openDialog() {
  const cf = {};
  customFields.value.forEach((f) => { cf[f.fieldKey] = f.fieldType === 'bool' ? false : (f.fieldType === 'number' ? undefined : ''); });
  form.value = { type: 'export', mode: 'sea', serviceType: 'fcl', status: 'draft', currency: 'USD', totalAmount: 0, customFields: cf };
  dialogVisible.value = true;
}

async function save() {
  if (!form.value.customerId) return ElMessage.warning('请选择客户');
  saving.value = true;
  try {
    await orderAPI.create(form.value);
    ElMessage.success('订单创建成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function confirmOrder(row) {
  await orderAPI.update(row.id, { ...row, status: 'confirmed' });
  ElMessage.success('订单已确认');
  load();
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除订单「${row.orderNo}」？`, '提示', { type: 'warning' });
  await orderAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

function goDetail(row) { router.push(`/orders/${row.id}`); }

onMounted(async () => {
  if (route.query.type) query.type = route.query.type; // 进出口入口
  load(1);
  loadCustomFields();
  const c = await customerAPI.list({ page: 1, pageSize: 200, status: 'active' });
  customers.value = c.list;
});
</script>

<style scoped>
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.right-btn { display: flex; gap: 8px; align-items: center; }
.batch-tip { margin-bottom: 14px; font-size: 13px; color: var(--muted); }
</style>