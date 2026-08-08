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
      <div class="card-title">账期管理（结账 / 扎帐 / 锁帐）</div>
      <div class="period-toolbar">
        <el-select v-model="periodYear" style="width:130px" @change="loadPeriods">
          <el-option v-for="y in periodYears" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-button @click="ensurePeriods" :loading="ensuring"><el-icon><Refresh /></el-icon>补齐账期</el-button>
        <el-button @click="loadPeriods" :loading="periodLoading"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <el-table :data="periods" size="small" v-loading="periodLoading" empty-text="暂无账期">
        <el-table-column prop="periodCode" label="账期" width="90" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="PERIOD_STATUS[row.status]?.type || 'info'" size="small">{{ PERIOD_STATUS[row.status]?.text || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="应收" align="right" width="110"><template #default="{ row }">{{ money(row.receivable) }}</template></el-table-column>
        <el-table-column label="应付" align="right" width="110"><template #default="{ row }">{{ money(row.payable) }}</template></el-table-column>
        <el-table-column label="余额" align="right" width="110"><template #default="{ row }">{{ money(row.balance) }}</template></el-table-column>
        <el-table-column label="毛利" align="right" width="110"><template #default="{ row }">{{ money(row.profit) }}</template></el-table-column>
        <el-table-column label="结账信息" min-width="150">
          <template #default="{ row }">
            <span v-if="row.closedAt" class="period-meta">{{ row.closedBy ? '#' + row.closedBy : '' }} {{ fmtTime(row.closedAt) }}</span>
            <span v-else class="period-meta">未结账</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status !== 'locked'" link type="primary" @click="openClose(row)">结账</el-button>
            <el-button v-if="row.status === 'open'" link type="warning" @click="openLock(row)">锁帐</el-button>
            <el-button v-if="row.status === 'locked'" link type="danger" @click="openUnlock(row)">解锁</el-button>
            <el-button link type="info" @click="viewStatement(row)">结账单</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 结账原因 -->
    <el-dialog v-model="closeDialog" title="结账 / 扎帐" width="440px">
      <el-form label-width="80px">
        <el-form-item label="账期"><b>{{ closeTarget?.periodCode }}</b></el-form-item>
        <el-form-item label="备注"><el-input v-model="closeMsg" type="textarea" :rows="3" placeholder="结账备注（可选）" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog = false">取消</el-button>
        <el-button type="primary" :loading="periodActing" @click="doClose">确认结账</el-button>
      </template>
    </el-dialog>

    <!-- 锁帐原因 -->
    <el-dialog v-model="lockDialog" title="锁帐" width="440px">
      <div class="batch-tip">锁帐后该账期内的费用记录将禁止新增、编辑、删除与核销，请谨慎操作。</div>
      <el-form label-width="80px">
        <el-form-item label="账期"><b>{{ lockTarget?.periodCode }}</b></el-form-item>
        <el-form-item label="备注"><el-input v-model="lockMsg" type="textarea" :rows="3" placeholder="锁帐备注（可选）" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lockDialog = false">取消</el-button>
        <el-button type="warning" :loading="periodActing" @click="doLock">确认锁帐</el-button>
      </template>
    </el-dialog>

    <!-- 解锁原因（必填） -->
    <el-dialog v-model="unlockDialog" title="解锁" width="440px">
      <el-form label-width="80px">
        <el-form-item label="账期"><b>{{ unlockTarget?.periodCode }}</b></el-form-item>
        <el-form-item label="原因" required><el-input v-model="unlockMsg" type="textarea" :rows="3" placeholder="解锁必须填写原因" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="unlockDialog = false">取消</el-button>
        <el-button type="danger" :loading="periodActing" @click="doUnlock">确认解锁</el-button>
      </template>
    </el-dialog>

    <!-- 结账单 -->
    <el-dialog v-model="stmtDialog" title="结账单" width="640px">
      <template v-if="stmt">
        <div class="stmt-head">
          <div class="stmt-title">账期 {{ stmt.period.periodCode }} 结账单</div>
          <div class="stmt-status">
            <el-tag :type="PERIOD_STATUS[stmt.period.status]?.type || 'info'" size="small">{{ PERIOD_STATUS[stmt.period.status]?.text || stmt.period.status }}</el-tag>
          </div>
        </div>
        <div class="stmt-grid">
          <div class="stmt-cell"><span>应收</span><b>{{ money(stmt.summary.receivable) }}</b></div>
          <div class="stmt-cell"><span>已收</span><b>{{ money(stmt.summary.received) }}</b></div>
          <div class="stmt-cell"><span>应付</span><b>{{ money(stmt.summary.payable) }}</b></div>
          <div class="stmt-cell"><span>已付</span><b>{{ money(stmt.summary.paid) }}</b></div>
          <div class="stmt-cell"><span>余额</span><b>{{ money(stmt.summary.balance) }}</b></div>
          <div class="stmt-cell"><span>毛利</span><b>{{ money(stmt.summary.profit) }}</b></div>
        </div>
        <el-table :data="stmt.items" size="small" max-height="320">
          <el-table-column label="方向" width="70"><template #default="{ row }">{{ FIN_DIRECTION[row.direction]?.text }}</template></el-table-column>
          <el-table-column prop="description" label="说明" min-width="150" show-overflow-tooltip />
          <el-table-column label="金额" width="110" align="right"><template #default="{ row }">{{ row.amount }} {{ row.currency }}</template></el-table-column>
          <el-table-column label="已收付" width="100" align="right"><template #default="{ row }">{{ row.paidAmount }}</template></el-table-column>
        </el-table>
      </template>
      <template #footer><el-button @click="stmtDialog = false">关闭</el-button></template>
    </el-dialog>


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
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-tooltip v-if="recordLocked(row)" content="该记录所属账期已锁帐，禁止修改" placement="top">
              <span>
                <el-button link type="primary" disabled>编辑</el-button>
                <el-button v-if="row.status !== 'paid'" link type="success" disabled>记为已收付</el-button>
                <el-button link type="danger" disabled>删除</el-button>
              </span>
            </el-tooltip>
            <template v-else>
              <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
              <el-button v-if="row.status !== 'paid'" link type="success" @click="markPaid(row)">记为已收付</el-button>
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
import { financeAPI, financeSummaryAPI, financeTrendAPI, orderAPI, financeExportAPI, financeBatchWriteoffAPI,
  financePeriodsAPI, financeEnsurePeriodsAPI, financeClosePeriodAPI, financeLockPeriodAPI, financeUnlockPeriodAPI, financePeriodStatementAPI } from '@/api';
import { FIN_DIRECTION, FIN_CATEGORY, FIN_STATUS, dictText, statusOf, money } from '@/utils/dicts';

const PERIOD_STATUS = {
  open: { text: '未结账', type: 'success' },
  closed: { text: '已结账', type: 'warning' },
  locked: { text: '已锁帐', type: 'danger' },
};

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

// ===== 账期管理（结账/扎帐/锁帐）=====
const periods = ref([]);
const periodLoading = ref(false);
const ensuring = ref(false);
const periodYear = ref(new Date().getFullYear());
const periodYears = ref([new Date().getFullYear()]);
const closeDialog = ref(false);
const closeTarget = ref(null);
const closeMsg = ref('');
const lockDialog = ref(false);
const lockTarget = ref(null);
const lockMsg = ref('');
const unlockDialog = ref(false);
const unlockTarget = ref(null);
const unlockMsg = ref('');
const periodActing = ref(false);
const stmtDialog = ref(false);
const stmt = ref(null);
const lockedPeriods = ref(new Set());

function fmtTime(t) { return t ? new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }

async function loadPeriods() {
  periodLoading.value = true;
  try {
    const rows = await financePeriodsAPI(periodYear.value);
    periods.value = rows;
    const yrs = new Set(periodYears.value);
    for (const r of rows) yrs.add(r.year);
    periodYears.value = [...yrs].sort((a, b) => b - a);
    lockedPeriods.value = new Set(rows.filter((r) => r.status === 'locked').map((r) => r.periodCode));
  } finally { periodLoading.value = false; }
}

async function ensurePeriods() {
  ensuring.value = true;
  try {
    const data = await financeEnsurePeriodsAPI();
    ElMessage.success(data.msg || '账期已补齐');
    loadPeriods();
  } finally { ensuring.value = false; }
}

function openClose(row) { closeTarget.value = row; closeMsg.value = ''; closeDialog.value = true; }
async function doClose() {
  periodActing.value = true;
  try {
    await financeClosePeriodAPI(closeTarget.value.periodCode, { note: closeMsg.value || undefined });
    ElMessage.success('结账完成');
    closeDialog.value = false;
    loadPeriods(); loadSummary();
  } finally { periodActing.value = false; }
}

function openLock(row) { lockTarget.value = row; lockMsg.value = ''; lockDialog.value = true; }
async function doLock() {
  periodActing.value = true;
  try {
    await financeLockPeriodAPI(lockTarget.value.periodCode, { note: lockMsg.value || undefined });
    ElMessage.success('已锁帐');
    lockDialog.value = false;
    loadPeriods();
  } finally { periodActing.value = false; }
}

function openUnlock(row) { unlockTarget.value = row; unlockMsg.value = ''; unlockDialog.value = true; }
async function doUnlock() {
  if (!unlockMsg.value.trim()) return ElMessage.warning('解锁必须填写原因');
  periodActing.value = true;
  try {
    await financeUnlockPeriodAPI(unlockTarget.value.periodCode, { reason: unlockMsg.value.trim() });
    ElMessage.success('已解锁，账期回到未结账状态');
    unlockDialog.value = false;
    loadPeriods();
  } finally { periodActing.value = false; }
}

async function viewStatement(row) {
  const data = await financePeriodStatementAPI(row.periodCode);
  stmt.value = data;
  stmtDialog.value = true;
}

// 判定某条费用记录所属账期是否已锁帐（据此禁用改动按钮）
function recordLocked(row) {
  const d = row.settleMonth || row.createdAt;
  if (!d) return false;
  const dt = new Date(d);
  const code = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return lockedPeriods.value.has(code);
}

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

onMounted(() => { load(1); loadOptions(); loadSummary(); loadCurrency(); loadPeriods(); window.addEventListener('resize', resize); });
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
.period-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.period-meta { font-size: 12px; color: var(--text-muted); }
.stmt-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.stmt-title { font-size: 15px; font-weight: 600; }
.stmt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.stmt-cell { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 10px; }
.stmt-cell span { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.stmt-cell b { font-size: 16px; }
</style>