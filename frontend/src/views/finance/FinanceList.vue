<template>
  <div>
    <!-- 页面标题 -->
    <div class="page-heading">
      <div class="title"><el-icon><Money /></el-icon>财务管理</div>
      <span class="page-desc">应收应付流水 · 对账 · 毛利</span>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">应收总额</div><div class="value" style="color:var(--danger)">{{ money(summary.receivable) }}</div>
        <div class="sub">已收 {{ money(summary.received) }}</div>
      </div>
      <div class="stat-card" style="border-color:var(--warning)">
        <div class="label">未收余额</div><div class="value" style="color:var(--warning)">{{ money(summary.receivableBalance) }}</div>
        <div class="sub">应收 - 已收</div>
      </div>
      <div class="stat-card" style="border-color:var(--success)">
        <div class="label">应付总额</div><div class="value" style="color:var(--success)">{{ money(summary.payable) }}</div>
        <div class="sub">已付 {{ money(summary.paid) }}</div>
      </div>
      <div class="stat-card" style="border-color:#059669">
        <div class="label">未付余额</div><div class="value" style="color:#059669">{{ money(summary.payableBalance) }}</div>
        <div class="sub">应付 - 已付</div>
      </div>
      <div class="stat-card" style="border-color:#7c3aed">
        <div class="label">毛利</div><div class="value" style="color:#7c3aed">{{ money(summary.profit) }}</div>
        <div class="sub">应收 - 应付</div>
      </div>
    </div>

    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">
        多币种汇总（基准 USD）
        <el-button link type="primary" style="float:right" @click="loadCurrency"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <el-table :data="currency.list" size="small" v-loading="curLoading">
        <el-table-column prop="currency" label="币种" width="90" />
        <el-table-column label="应收" width="130" align="right"><template #default="{ row }">{{ money(row.receivable) }}</template></el-table-column>
        <el-table-column label="已收" width="130" align="right"><template #default="{ row }">{{ money(row.received) }}</template></el-table-column>
        <el-table-column label="应付" width="130" align="right"><template #default="{ row }">{{ money(row.payable) }}</template></el-table-column>
        <el-table-column label="已付" width="130" align="right"><template #default="{ row }">{{ money(row.paid) }}</template></el-table-column>
        <el-table-column label="折合USD应收" width="140" align="right"><template #default="{ row }">{{ row.receivableBase == null ? '-' : money(row.receivableBase) }}</template></el-table-column>
      </el-table>
      <div v-if="currency.total" class="currency-total">
        折合基准合计：应收 {{ money(currency.total.receivable) }} · 已收 {{ money(currency.total.received) }} · 应付 {{ money(currency.total.payable) }} · 已付 {{ money(currency.total.paid) }} USD
      </div>
    </div>

    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">月度应收/应付趋势（按流水创建时间）</div>
      <div ref="trendRef" class="trend-chart"></div>
    </div>

    <div class="page-card">
      <div class="table-topbar">
        <div class="left">
          <el-input v-model="query.keyword" placeholder="搜索说明/发票号" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="query.direction" placeholder="方向" clearable style="width:110px" @change="load(1)">
            <el-option label="应收" value="receivable" /><el-option label="应付" value="payable" />
          </el-select>
          <el-select v-model="query.status" placeholder="状态" clearable style="width:120px" @change="load(1)">
            <el-option v-for="(v,k) in FIN_STATUS" :key="k" :label="v.text" :value="k" />
          </el-select>
          <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
        </div>
      <div class="right-btn">
        <template v-if="multiple.length">
          <el-button type="success" plain @click="openBatchWriteoff">批量记为已收付</el-button>
          <el-button type="danger" plain @click="batchRemove">批量删除</el-button>
          <el-divider direction="vertical" />
        </template>
        <el-button @click="exportExcel"><el-icon><Download /></el-icon>导出Excel</el-button>
        <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon>新增费用</el-button>
      </div>
    </div>

      <el-table :data="list" v-loading="loading" stripe @selection-change="onSelect">
        <el-table-column type="selection" width="46" />
        <el-table-column label="方向" width="80">
          <template #default="{ row }"><el-tag :type="FIN_DIRECTION[row.direction].type" size="small">{{ FIN_DIRECTION[row.direction].text }}</el-tag></template>
        </el-table-column>
        <el-table-column label="类别" width="120">
          <template #default="{ row }">{{ dictText(FIN_CATEGORY, row.category) }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="170" show-overflow-tooltip />
        <el-table-column label="订单" min-width="130">
          <template #default="{ row }"><el-link v-if="row.order" type="primary" @click="goOrder(row)">{{ row.order.orderNo }}</el-link><span v-else>-</span></template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ row.amount }} {{ row.currency }}</template>
        </el-table-column>
        <el-table-column label="已收付" width="110" align="right">
          <template #default="{ row }">{{ row.paidAmount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="statusOf(FIN_STATUS, row.status).type" size="small">{{ statusOf(FIN_STATUS, row.status).text }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button v-if="row.status !== 'paid'" link type="success" @click="markPaid(row)">记为已收付</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
          @current-change="load()" @size-change="load(1)" />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑费用' : '新增费用'" width="600px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="方向"><el-radio-group v-model="form.direction"><el-radio value="receivable">应收</el-radio><el-radio value="payable">应付</el-radio></el-radio-group></el-form-item>
        <el-form-item label="关联订单">
          <el-select v-model="form.orderId" filterable clearable style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.cargoDesc}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类别"><el-select v-model="form.category" style="width:100%"><el-option v-for="(t,k) in FIN_CATEGORY" :key="k" :label="t" :value="k" /></el-select></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="金额"><el-input-number v-model="form.amount" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="币种"><el-input v-model="form.currency" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option v-for="(v,k) in FIN_STATUS" :key="k" :label="v.text" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="发票号"><el-input v-model="form.invoiceNo" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量核销 -->
    <el-dialog v-model="writeoffDialog" title="批量记为已收付" width="460px">
      <div class="batch-tip">共 <b>{{ selectedIds().length }}</b> 条费用记录，将批量核销。金额留空表示全额收/付完成。</div>
      <el-form label-width="90px">
        <el-form-item label="核销金额">
          <el-input-number v-model="writeoffAmount" :min="0" :precision="2" style="width:100%" placeholder="留空=全额" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="writeoffDialog = false">取消</el-button>
        <el-button type="primary" :loading="writingoff" @click="batchWriteoff">执行核销</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as echarts from 'echarts';
import { financeAPI, financeSummaryAPI, financeTrendAPI, orderAPI, financeExportAPI, financeBatchWriteoffAPI } from '@/api';
import { FIN_DIRECTION, FIN_CATEGORY, FIN_STATUS, dictText, statusOf, money } from '@/utils/dicts';

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const curLoading = ref(false);
const currency = ref({ list: [], total: null });
const multiple = ref([]);
const writeoffDialog = ref(false);
const writingoff = ref(false);
const writeoffAmount = ref(null);

function onSelect(rows) { multiple.value = rows; }
const selectedIds = () => multiple.value.map((r) => r.id);

function openBatchWriteoff() {
  writeoffAmount.value = null;
  writeoffDialog.value = true;
}

async function batchWriteoff() {
  if (!selectedIds().length) return ElMessage.warning('请先选择费用记录');
  writingoff.value = true;
  try {
    const data = await financeBatchWriteoffAPI(selectedIds(), writeoffAmount.value || undefined);
    ElMessage.success(data.msg || '批量核销完成');
    writeoffDialog.value = false;
    multiple.value = [];
    load(); loadSummary();
  } finally { writingoff.value = false; }
}

async function batchRemove() {
  await ElMessageBox.confirm(`确认删除选中的 ${selectedIds().length} 条费用记录？删除后不可恢复。`, '批量删除', { type: 'warning' });
  await financeAPI.batchRemove(selectedIds());
  ElMessage.success('已批量删除');
  multiple.value = [];
  load(); loadSummary();
}

async function exportExcel() {
  const resp = await financeExportAPI();
  const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `财务流水_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
const total = ref(0);
const summary = ref({});
const orders = ref([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '', direction: '', status: '' });
const dialogVisible = ref(false);
const form = ref({});
const trendRef = ref();
let trendChart;

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await financeAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function loadSummary() {
  summary.value = await financeSummaryAPI();
  const trend = await financeTrendAPI(new Date().getFullYear());
  trendChart = echarts.init(trendRef.value);
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['应收', '应付'], bottom: 0 },
    grid: { left: 10, right: 10, top: 30, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: trend.map((t) => `${t.month}月`) },
    yAxis: { type: 'value' },
    series: [
      { name: '应收', type: 'bar', data: trend.map((t) => t.receivable), itemStyle: { color: '#dc2626' }, barMaxWidth: 22 },
      { name: '应付', type: 'bar', data: trend.map((t) => t.payable), itemStyle: { color: '#16a34a' }, barMaxWidth: 22 },
    ],
  });
}

async function loadOptions() {
  const o = await orderAPI.list({ page: 1, pageSize: 200 });
  orders.value = o.list;
}

async function loadCurrency() {
  curLoading.value = true;
  try {
    const data = await financeAPI.currencySummary({ base: 'USD' });
    currency.value = { list: data.list, total: data.total };
  } finally { curLoading.value = false; }
}

function openDialog(row) {
  form.value = row ? { ...row } : { direction: 'receivable', category: 'ocean_freight', status: 'unpaid', currency: 'USD', amount: 0, paidAmount: 0 };
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (form.value.id) await financeAPI.update(form.value.id, form.value);
    else await financeAPI.create(form.value);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load(); loadSummary();
  } finally { saving.value = false; }
}

async function markPaid(row) {
  await financeAPI.update(row.id, { ...row, status: 'paid', paidAmount: row.amount, paidAt: new Date().toISOString() });
  ElMessage.success('已标记为收付完成');
  load(); loadSummary();
}

async function remove(row) {
  await ElMessageBox.confirm('确认删除该费用记录？', '提示', { type: 'warning' });
  await financeAPI.remove(row.id);
  ElMessage.success('已删除');
  load(); loadSummary();
}

function goOrder(row) { if (row.order?.id) router.push(`/orders/${row.order.id}`); }

function resize() { trendChart?.resize(); }

onMounted(() => { load(1); loadOptions(); loadSummary(); loadCurrency(); window.addEventListener('resize', resize); });
onBeforeUnmount(() => { window.removeEventListener('resize', resize); trendChart?.dispose(); });
</script>

<style scoped>
.page-desc { font-size: 13px; color: var(--text-muted); }
.card-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
.trend-chart { height: 280px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.right-btn { display: flex; gap: 8px; align-items: center; }
.batch-tip { margin-bottom: 14px; font-size: 13px; color: var(--text-muted); }
.currency-total { margin-top: 10px; font-size: 13px; color: var(--text-muted); border-top: 1px dashed var(--border); padding-top: 10px; }
</style>