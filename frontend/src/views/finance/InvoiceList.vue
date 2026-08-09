<template>
  <div>
    <div class="page-heading">
      <div class="title"><el-icon><Ticket /></el-icon>发票管理</div>
      <span class="page-desc">开票 · 勾稽 · 打印（N2）</span>
    </div>

    <div class="page-card toolbar-card">
      <div class="filter-bar">
        <el-select v-model="query.invoiceType" placeholder="类型" clearable style="width:130px">
          <el-option label="应收发票" value="receivable" /><el-option label="应付发票" value="payable" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态" clearable style="width:140px">
          <el-option v-for="(v, k) in INV_STATUS" :key="k" :label="v.text" :value="k" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="发票号/订单号" clearable style="width:220px" @keyup.enter="load(1)" @clear="load(1)" />
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
        <el-button v-permission="'finance:create'" type="success" plain @click="openFromFees"><el-icon><DocumentAdd /></el-icon>从费用生成发票</el-button>
        <el-button v-permission="'finance:update'" type="primary" plain :disabled="!selectedRows.length" @click="doBatchIssue"><el-icon><Check /></el-icon>批量开具<span v-if="selectedRows.length"> ({{ selectedRows.length }})</span></el-button>
        <el-button v-permission="'finance:read'" type="warning" plain :disabled="!selectedRows.length" @click="openDigitalTax"><el-icon><Download /></el-icon>导出数电票<span v-if="selectedRows.length"> ({{ selectedRows.length }})</span></el-button>
      </div>
    </div>

    <div class="page-card">
      <el-table :data="list" v-loading="loading" stripe @selection-change="onSelectionChange">
        <el-table-column type="selection" width="40" />
        <el-table-column prop="invoiceNo" label="发票号" min-width="170" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.invoiceType === 'receivable' ? 'danger' : 'success'" size="small">{{ row.invoiceType === 'receivable' ? '应收' : '应付' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="客户/供应商" min-width="160">
          <template #default="{ row }">{{ row.customer?.name || row.supplier?.name || '-' }}</template>
        </el-table-column>
        <el-table-column label="订单" width="150">
          <template #default="{ row }">{{ row.order?.orderNo || '-' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ row.currency }} {{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="税额" width="100" align="right"><template #default="{ row }">{{ money(row.taxAmount) }}</template></el-table-column>
        <el-table-column label="含税" width="110" align="right"><template #default="{ row }"><b>{{ money(row.totalAmount) }}</b></template></el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="INV_STATUS[row.status]?.type || 'info'" size="small">{{ INV_STATUS[row.status]?.text || row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="开票日期" width="110">
          <template #default="{ row }">{{ row.issuedAt ? String(row.issuedAt).slice(0, 10) : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'draft'" v-permission="'finance:update'" link type="primary" @click="doIssue(row)">开具</el-button>
            <el-button v-if="row.status !== 'cancelled' && row.status !== 'paid'" v-permission="'finance:update'" link type="danger" @click="doCancel(row)">作废</el-button>
            <el-button v-permission="'print:read'" link type="primary" @click="printInv(row)">打印</el-button>
            <el-button link type="info" @click="openDetail(row)">明细</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total" :page-size="query.pageSize" :current-page="query.page" @current-change="(p) => load(p)" />
      </div>
    </div>

    <!-- 从费用生成发票 -->
    <el-dialog v-model="fromFeesVisible" title="从费用生成发票" width="720px">
      <div class="ff-filters">
        <el-select v-model="ffOrderId" filterable remote :remote-method="searchOrder" :loading="orderLoading" placeholder="选择订单（自动带出未开票应收费用）" style="width:340px">
          <el-option v-for="o in orderOptions" :key="o.id" :label="`${o.orderNo} · ${o.customer?.name || ''}`" :value="o.id" />
        </el-select>
        <el-input-number v-model="ffTaxRate" :min="0" :max="100" :precision="2" placeholder="税率%" style="width:120px" />
        <span class="ff-hint">税率(%)，0=不开税</span>
      </div>
      <div class="ff-filters" style="margin-top:8px">
        <span class="ff-hint">仅列出未开票的应收费用（可勾选部分开票）</span>
      </div>
      <el-table :data="ffFees" size="small" stripe max-height="260" @selection-change="onFeesSelect">
        <el-table-column type="selection" width="40" />
        <el-table-column prop="description" label="费用说明" min-width="150" />
        <el-table-column label="类别" width="110"><template #default="{ row }">{{ dictText(FIN_CATEGORY, row.category) }}</template></el-table-column>
        <el-table-column label="金额" width="110" align="right"><template #default="{ row }">{{ row.currency }} {{ row.amount }}</template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }">{{ FIN_STATUS[row.status]?.text || row.status }}</template></el-table-column>
      </el-table>
      <div v-if="ffSelected.length" class="ff-sum">已选 <b>{{ ffSelected.length }}</b> 项，合计 <b>{{ ffCurrency }} {{ money(ffTotal) }}</b></div>
      <template #footer>
        <el-button @click="fromFeesVisible = false">取消</el-button>
        <el-button type="primary" :loading="ffSaving" @click="doFromFees">生成发票</el-button>
      </template>
    </el-dialog>

    <!-- 发票明细 -->
    <el-dialog v-model="detailVisible" title="发票明细" width="640px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="发票号">{{ detail.invoiceNo }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ detail.invoiceType === 'receivable' ? '应收' : '应付' }}</el-descriptions-item>
          <el-descriptions-item label="客户/供应商">{{ detail.customer?.name || detail.supplier?.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="订单">{{ detail.order?.orderNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="金额">{{ detail.currency }} {{ money(detail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="税率/税额">{{ detail.taxRate }}% / {{ money(detail.taxAmount) }}</el-descriptions-item>
          <el-descriptions-item label="含税总额" :span="2"><b>{{ money(detail.totalAmount) }}</b></el-descriptions-item>
        </el-descriptions>
        <div class="ff-sum" style="margin:10px 0">开票明细行（来自费用）</div>
        <el-table :data="detailItems" size="small" border max-height="220">
          <el-table-column prop="description" label="费用说明" min-width="180" />
          <el-table-column label="金额" width="130" align="right"><template #default="{ row }">{{ row.currency }} {{ money(row.amount) }}</template></el-table-column>
        </el-table>
      </template>
    </el-dialog>

    <!-- 数电票导出对话框 -->
    <DigitalTaxExportDialog v-model="dtaxVisible" :invoice-ids="dtaxIds" />
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { invoiceAPI, financeAPI, orderAPI } from '@/api';
import { FIN_CATEGORY, FIN_STATUS, dictText, money } from '@/utils/dicts';
import DigitalTaxExportDialog from './DigitalTaxExportDialog.vue';

const INV_STATUS = {
  draft: { text: '草稿', type: 'info' }, issued: { text: '已开票', type: 'success' },
  paid: { text: '已核销', type: 'primary' }, cancelled: { text: '已作废', type: 'danger' },
};

const query = reactive({ page: 1, pageSize: 10, invoiceType: null, status: null, keyword: '' });
const list = ref([]);
const total = ref(0);
const loading = ref(false);

// 数电票导出
const selectedRows = ref([]);
const dtaxVisible = ref(false);
const dtaxIds = ref([]);

async function load(page) {
  query.page = page || 1;
  loading.value = true;
  try {
    const d = await invoiceAPI.list({
      page: query.page, pageSize: query.pageSize,
      invoiceType: query.invoiceType || undefined, status: query.status || undefined,
      keyword: query.keyword || undefined,
    });
    list.value = (d.list || []).map((r) => ({ ...r, items: parseItems(r.items) }));
    total.value = d.total || 0;
  } catch { /* 拦截器 */ }
  finally { loading.value = false; }
}

function parseItems(items) {
  try { return typeof items === 'string' ? JSON.parse(items) : (items || []); } catch { return []; }
}

async function doIssue(row) {
  try {
    await ElMessageBox.confirm(`确认开具发票「${row.invoiceNo}」？`, '开具确认', { type: 'warning' });
    await invoiceAPI.issue(row.id);
    ElMessage.success('已开票');
    load(query.page);
  } catch { /* 取消 */ }
}
async function doBatchIssue() {
  const draftRows = selectedRows.value.filter((r) => r.status === 'draft');
  if (!draftRows.length) { ElMessage.warning('所选发票均非草稿状态，无法开具'); return; }
  try {
    await ElMessageBox.confirm(`确认批量开具 ${draftRows.length} 张草稿发票？非草稿发票将被跳过。`, '批量开具确认', { type: 'warning' });
    const res = await invoiceAPI.batchIssue(draftRows.map((r) => r.id));
    ElMessage.success(`批量开具完成：成功 ${res.succeeded?.length || 0} 张${res.failed?.length ? `，失败 ${res.failed.length} 张：${res.failed.map((f) => f.reason).join('; ')}` : ''}`);
    load(query.page);
  } catch { /* 取消 */ }
}
async function doCancel(row) {
  try {
    await ElMessageBox.confirm(`确认作废发票「${row.invoiceNo}」？作废后不可恢复。`, '作废确认', { type: 'warning' });
    await invoiceAPI.cancel(row.id);
    ElMessage.success('已作废');
    load(query.page);
  } catch { /* 取消 */ }
}
function printInv(row) { window.open(`/api/print/invoice/${row.id}`, '_blank'); }

function onSelectionChange(rows) { selectedRows.value = rows; }
function openDigitalTax() {
  if (!selectedRows.value.length) return;
  dtaxIds.value = selectedRows.value.map((r) => r.id);
  dtaxVisible.value = true;
}

const detailVisible = ref(false);
const detail = ref(null);
const detailItems = ref([]);
function openDetail(row) {
  detail.value = row;
  detailItems.value = parseItems(row.items);
  detailVisible.value = true;
}

// 从费用生成发票
const fromFeesVisible = ref(false);
const orderLoading = ref(false);
const orderOptions = ref([]);
const ffOrderId = ref(null);
const ffTaxRate = ref(0);
const ffFees = ref([]);
const ffSelected = ref([]);
const ffSaving = ref(false);
const ffTotal = ref(0);
const ffCurrency = ref('USD');

function openFromFees() {
  ffOrderId.value = null;
  ffFees.value = [];
  ffSelected.value = [];
  ffTotal.value = 0;
  fromFeesVisible.value = true;
  searchOrder('');
}
async function searchOrder(keyword) {
  orderLoading.value = true;
  try {
    const d = await orderAPI.list({ pageSize: 50, keyword: keyword || undefined });
    orderOptions.value = d.list || [];
  } catch { orderOptions.value = []; }
  finally { orderLoading.value = false; }
}
async function onOrderChange(id) {
  ffFees.value = [];
  ffSelected.value = [];
  ffTotal.value = 0;
  if (!id) return;
  try {
    const d = await financeAPI.list({ orderId: id, pageSize: 200 });
    // 未开票的应收费用（invoiceNo 为空）
    ffFees.value = (d.list || []).filter((f) => f.direction === 'receivable' && !f.invoiceNo && Number(f.amount) > 0);
    if (!ffFees.value.length) ElMessage.info('该订单没有未开票的应收费用');
  } catch { /* 拦截器 */ }
}
function onFeesSelect(rows) {
  ffSelected.value = rows;
  ffTotal.value = rows.reduce((s, r) => s + Number(r.amount), 0);
  ffCurrency.value = rows.length ? rows[0].currency : 'USD';
}
async function doFromFees() {
  if (!ffOrderId.value) { ElMessage.warning('请先选择订单'); return; }
  if (!ffSelected.value.length) { ElMessage.warning('请勾选要开票的费用'); return; }
  ffSaving.value = true;
  try {
    const res = await invoiceAPI.fromFees({
      orderId: ffOrderId.value,
      feeIds: ffSelected.value.map((f) => f.id),
      invoiceType: 'receivable',
      taxRate: ffTaxRate.value || 0,
    });
    ElMessage.success(res.msg || `已生成 ${res.count} 张发票`);
    fromFeesVisible.value = false;
    load(1);
  } catch (e) { /* 拦截器 */ }
  finally { ffSaving.value = false; }
}

onMounted(() => load(1));
</script>

<style scoped>
.page-heading { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.page-desc { font-size: 13px; color: var(--text-muted); }
.filter-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.ff-filters { display: flex; gap: 10px; align-items: center; }
.ff-hint { font-size: 12px; color: var(--text-muted); }
.ff-sum { font-size: 13px; color: var(--text-strong, #333); margin-top: 8px; }
</style>
