<template>
  <div>
    <div class="page-heading">
      <div class="title"><el-icon><Tickets /></el-icon>{{ pageTitle }}</div>
      <span class="total-hint">共 {{ total }} 张订单</span>
    </div>
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
        <el-checkbox v-model="query.deleted" @change="load(1)">包含已删除</el-checkbox>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
      </div>
      <div class="right-btn">
        <template v-if="multiple.length && !trashView">
          <el-button type="success" plain @click="advanceDialog = true">批量推进</el-button>
          <el-button type="primary" plain @click="statusDialog = true">批量完成/取消</el-button>
          <el-button type="danger" plain @click="batchRemove">批量删除</el-button>
          <el-divider direction="vertical" />
        </template>
        <el-button @click="exportExcel"><el-icon><Download /></el-icon>导出Excel</el-button>
        <el-button type="primary" data-highlight-step="order" @click="openDialog()"><el-icon><Plus /></el-icon>新建订单</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe @selection-change="onSelect">
      <template #empty>
        <!-- Onboarding 空状态：资源为空 → 引导卡（含上游感知）；筛选无结果 → 仅提示重置（AC-09/10） -->
        <EmptyGuide
          v-if="!loading"
          :mode="isFiltered ? 'filtered' : 'guide'"
          title="还没有订单"
          hint="订单是业务核心。可以从报价一键转换，也可以直接新建一笔订单。"
          action-text="新建第一笔订单"
          :pre-step-hint="upstreamHint"
          :pre-step-action-text="upstreamHint ? '去录报价' : ''"
          @action="openDialog()"
          @pre-step="router.push('/quotations/edit')"
          @reset="resetFilters"
        />
      </template>
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
        <template #default="{ row }">
          <el-tag v-if="row.deletedAt" type="info" size="small">已删除</el-tag>
          <el-tag v-else :type="statusOf(ORDER_STATUS, row.status).type" size="small">{{ statusOf(ORDER_STATUS, row.status).text }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.deletedAt" link type="primary" @click="restoreOrder(row)">恢复</el-button>
          <template v-else>
            <el-button link type="primary" @click="goDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'draft'" link type="warning" @click="confirmOrder(row)">确认</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>

    <el-dialog v-model="dialogVisible" title="新建订单" width="720px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户" prop="customerId" required>
              <el-select v-model="form.customerId" filterable remote :remote-method="searchCustomer" :loading="customerLoading"
                :reserve-keyword="false" clearable style="width:100%" placeholder="输入名称/编码搜索客户">
                <el-option v-for="c in customers" :key="c.id" :label="`${c.name} (${c.code})`" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="订单类型" prop="type"><el-select v-model="form.type" style="width:100%"><el-option label="出口" value="export" /><el-option label="进口" value="import" /><el-option label="中转" value="transit" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="运输方式" prop="mode"><el-select v-model="form.mode" style="width:100%"><el-option v-for="(t,k) in MODE" :key="k" :label="t" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="服务类型"><el-select v-model="form.serviceType" style="width:100%"><el-option v-for="(t,k) in SERVICE_TYPE" :key="k" :label="t" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="起运港" prop="originPort"><el-input v-model="form.originPort" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="目的港" prop="destPort"><el-input v-model="form.destPort" /></el-form-item></el-col>
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

    <!-- 批量完成/取消（U3+U8：状态是派生的，仅提供业务终态操作；中间态走节点推进） -->
    <el-dialog v-model="statusDialog" title="批量完成/取消订单" width="460px">
      <div class="batch-tip">已选 <b>{{ multiple.length }}</b> 张订单。订单状态由业务节点派生，中间状态请使用「批量推进」操作。</div>
      <el-form label-width="90px">
        <el-form-item label="操作" required>
          <el-select v-model="targetStatus" style="width:100%">
            <el-option label="标记完成（要求业务节点到齐）" value="completed" />
            <el-option label="取消订单（业务取消）" value="cancelled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="statusDialog = false">取消</el-button>
        <el-button type="primary" :loading="updatingStatus" @click="batchStatus">执行</el-button>
      </template>
    </el-dialog>

    <!-- 批量操作结果明细（U4：部分失败时列出订单号与原因） -->
    <el-dialog v-model="resultDialog" title="批量操作结果" width="560px">
      <el-alert v-if="!batchResult.failed" type="success" :closable="false" show-icon title="全部成功" class="result-alert" />
      <template v-else>
        <el-alert type="warning" :closable="false" show-icon
          :title="`成功 ${batchResult.ok} 张，失败 ${batchResult.failed} 张`" class="result-alert" />
        <el-table :data="batchResult.failedList" size="small" max-height="320" border>
          <el-table-column label="订单号" width="170">
            <template #default="{ row }">
              <el-link type="primary" @click="goDetailById(row.id)">{{ row.orderNo || orderNoOf(row.id) }}</el-link>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="失败原因" min-width="220" />
        </el-table>
      </template>
    </el-dialog>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { orderAPI, customerAPI, orderExportAPI, customFieldAPI, orderBatchAdvanceAPI, orderBatchStatusAPI } from '@/api';
import { ORDER_STATUS, MODE, SERVICE_TYPE, dictText, statusOf, money } from '@/utils/dicts';
import EmptyGuide from '@/components/EmptyGuide.vue';
import { useOnboardingHint } from '@/composables/useOnboardingHint';
import { getOnboardingStatus } from '@/api/onboarding';

const { showHint } = useOnboardingHint();

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const customers = ref([]);
const customerLoading = ref(false);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: '', mode: '', type: '', deleted: '' });
const dialogVisible = ref(false);

// 筛选无结果 vs 资源为空（AC-09）
const isFiltered = computed(() => !!(query.keyword || query.status || query.mode || query.type));
function resetFilters() {
  query.keyword = ''; query.status = ''; query.mode = ''; query.type = ''; query.deleted = '';
  load(1);
}
// learning by doing：Checklist 跳转 /orders?new=1 → 自动打开新建弹窗
watch(() => route.query.new, (v) => { if (v === '1') openDialog(); }, { immediate: true });

// AC-10 上游感知：报价为空时订单空态提示"先去录报价"
const upstreamHint = ref('');
async function loadUpstreamHint() {
  try {
    const status = await getOnboardingStatus();
    if (status && Number(status.quotations || 0) === 0) {
      upstreamHint.value = '还没有报价时，先录一份报价，报价可一键转订单。';
    } else {
      upstreamHint.value = '';
    }
  } catch { upstreamHint.value = ''; }
}
const form = ref({});
const formRef = ref(null);
const customFields = ref([]);
const multiple = ref([]);
const advanceDialog = ref(false);
const statusDialog = ref(false);
const advancing = ref(false);
const updatingStatus = ref(false);
const advanceNode = ref('');
const targetStatus = ref('');
const resultDialog = ref(false);
const batchResult = ref({ ok: 0, failed: 0, failedList: [] });
const orderNoMap = ref({});

// U6：新建订单表单校验（镜像后端必填）
const formRules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  type: [{ required: true, message: '请选择订单类型', trigger: 'change' }],
  mode: [{ required: true, message: '请选择运输方式', trigger: 'change' }],
  originPort: [{ required: true, message: '请输入起运港', trigger: 'blur' }],
  destPort: [{ required: true, message: '请输入目的港', trigger: 'blur' }],
};

// 回收站视图（U5：包含已删除）
const trashView = computed(() => query.deleted === '1');

const pageTitle = computed(() => ({
  export: '出口操作',
  import: '进口操作',
  transit: '中转操作',
}[route.query.type] || '订单管理'));

const ORDER_NODE_OPTIONS = {
  booked: '订舱', gate_in: '进港', customs: '报关', loaded: '装船',
  arrived: '到港', cleared: '清关', delivered: '送达',
};

function onSelect(rows) { multiple.value = rows; }
const selectedIds = () => multiple.value.map((r) => r.id);
const orderNoOf = (id) => orderNoMap.value[id] || `#${id}`;

async function batchAdvance() {
  if (!advanceNode.value) return ElMessage.warning('请选择要推进到的节点');
  if (!selectedIds().length) return ElMessage.warning('请先选择订单');
  advancing.value = true;
  try {
    const data = await orderBatchAdvanceAPI(selectedIds(), advanceNode.value);
    // U4：部分失败时弹出明细，列出失败订单与原因
    if (data.failed > 0) {
      batchResult.value = { ok: data.ok, failed: data.failed, failedList: data.failedList || [] };
      resultDialog.value = true;
    } else {
      ElMessage.success(data.msg || '批量推进完成');
    }
    advanceDialog.value = false;
    advanceNode.value = '';
    multiple.value = [];
    load();
  } finally { advancing.value = false; }
}

async function batchStatus() {
  if (!targetStatus.value) return ElMessage.warning('请选择操作类型');
  if (!selectedIds().length) return ElMessage.warning('请先选择订单');
  const opText = targetStatus.value === 'completed' ? '标记完成' : '取消';
  await ElMessageBox.confirm(
    targetStatus.value === 'completed'
      ? `确认将选中的 ${selectedIds().length} 张订单标记为完成？系统将校验业务节点是否到齐。`
      : `确认取消选中的 ${selectedIds().length} 张订单？取消后订单停止流转。`,
    `批量${opText}`,
    { type: 'warning' }
  );
  updatingStatus.value = true;
  try {
    const data = await orderBatchStatusAPI(selectedIds(), targetStatus.value);
    // U4：部分失败时弹出明细
    if (data.failed > 0) {
      batchResult.value = { ok: data.ok, failed: data.failed, failedList: data.failedList || [] };
      resultDialog.value = true;
    } else {
      ElMessage.success(data.msg || `批量${opText}完成`);
    }
    statusDialog.value = false;
    targetStatus.value = '';
    multiple.value = [];
    load();
  } finally { updatingStatus.value = false; }
}

async function batchRemove() {
  await ElMessageBox.confirm(`确认删除选中的 ${selectedIds().length} 张订单？删除后可在「包含已删除」中恢复。`, '批量删除', { type: 'warning' });
  await orderAPI.batchRemove(selectedIds());
  ElMessage.success('已批量删除（可恢复）');
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
  // U2：导出带当前筛选条件，导出=所见
  const params = { keyword: query.keyword, status: query.status, mode: query.mode, type: query.type };
  const resp = await orderExportAPI(params);
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
    const params = { ...query };
    if (!params.deleted) delete params.deleted; // 空筛选不传
    const data = await orderAPI.list(params);
    list.value = data.list;
    total.value = data.total;
    // 记录订单号映射，供批量失败明细展示（U4）
    const map = {};
    for (const r of data.list) map[r.id] = r.orderNo;
    orderNoMap.value = { ...orderNoMap.value, ...map };
  } finally { loading.value = false; }
}

function openDialog() {
  const cf = {};
  customFields.value.forEach((f) => { cf[f.fieldKey] = f.fieldType === 'bool' ? false : (f.fieldType === 'number' ? undefined : ''); });
  form.value = { type: 'export', mode: 'sea', serviceType: 'fcl', status: 'draft', currency: 'USD', totalAmount: 0, customFields: cf };
  dialogVisible.value = true;
  // U7：打开弹窗时预加载客户候选
  searchCustomer('');
}

async function save() {
  try {
    await formRef.value.validate(); // U6：前端表单校验，早于后端报错
  } catch { return; }
  saving.value = true;
  try {
    await orderAPI.create(form.value);
    ElMessage.success('订单创建成功');
    // Onboarding 上下文提醒：下一步发起订舱
    showHint('order_created');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

// U7：客户远程搜索（替代一次性加载 200 条）
async function searchCustomer(keyword) {
  customerLoading.value = true;
  try {
    const c = await customerAPI.list({ page: 1, pageSize: 20, status: 'active', keyword: keyword || undefined });
    customers.value = c.list;
  } catch { /* 静默：保留现有候选 */ }
  finally { customerLoading.value = false; }
}

// U10：确认订单只回传 status，避免整行对象（含嵌套 customer）回写
async function confirmOrder(row) {
  await orderAPI.update(row.id, { status: 'confirmed' });
  ElMessage.success('订单已确认');
  load();
}

async function remove(row) {
  // U5：提示与事实一致——软删除，可恢复
  await ElMessageBox.confirm(`确认删除订单「${row.orderNo}」？删除后可在「包含已删除」中恢复。`, '提示', { type: 'warning' });
  await orderAPI.remove(row.id);
  ElMessage.success('已删除（可恢复）');
  load();
}

async function restoreOrder(row) {
  await orderAPI.restore(row.id);
  ElMessage.success('订单已恢复');
  load();
}

function goDetail(row) { router.push(`/orders/${row.id}`); }
function goDetailById(id) {
  const row = list.value.find((r) => r.id === id);
  if (row) router.push(`/orders/${row.id}`);
}

onMounted(async () => {
  if (route.query.type) query.type = route.query.type; // 进出口入口
  load(1);
  loadCustomFields();
  loadUpstreamHint();
});
</script>

<style scoped>
.total-hint { font-size: 13px; color: var(--text-muted); }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.right-btn { display: flex; gap: 8px; align-items: center; }
.batch-tip { margin-bottom: 14px; font-size: 13px; color: var(--text-muted); }
.result-alert { margin-bottom: 12px; }
</style>