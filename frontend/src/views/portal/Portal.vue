<template>
  <div class="portal">
    <header class="portal-header">
      <div class="brand">
        <img src="/icons/icon-192.svg" class="logo" alt="货代管理" />
        <div>
          <div class="brand-name">货代客户自助门户</div>
          <div class="brand-sub">{{ overview.customer?.name || '客户' }} · 您好</div>
        </div>
      </div>
      <div class="head-right">
        <el-button link @click="logout">退出登录</el-button>
      </div>
    </header>

    <div class="portal-body">
      <div class="stat-grid">
        <div class="stat-card"><div class="label">订单总数</div><div class="value">{{ overview.stats?.total || 0 }}</div></div>
        <div class="stat-card" style="border-color:var(--warning)"><div class="label">进行中</div><div class="value" style="color:var(--warning)">{{ overview.stats?.inProgress || 0 }}</div></div>
        <div class="stat-card" style="border-color:var(--success)"><div class="label">已完成</div><div class="value" style="color:var(--success)">{{ overview.stats?.completed || 0 }}</div></div>
        <div class="stat-card" style="border-color:var(--danger)"><div class="label">未收应收</div><div class="value" style="color:var(--danger)">{{ money(overview.stats?.receivableBalance) }}</div></div>
      </div>

      <el-tabs v-model="tab" class="portal-tabs">
        <el-tab-pane label="我的订单" name="orders">
          <div class="page-card">
            <div class="table-topbar">
              <div class="left">
                <el-input v-model="query.keyword" placeholder="搜索订单号/箱号/货描" clearable style="width:240px" @keyup.enter="loadOrders(1)" @clear="loadOrders(1)" />
                <el-select v-model="query.status" placeholder="状态" clearable style="width:120px" @change="loadOrders(1)">
                  <el-option v-for="(v,k) in ORDER_STATUS" :key="k" :label="v.text" :value="k" />
                </el-select>
                <el-button type="primary" @click="loadOrders(1)">查询</el-button>
              </div>
            </div>
            <el-table :data="orders" v-loading="loading" stripe>
              <el-table-column prop="orderNo" label="订单号" min-width="150" />
              <el-table-column label="类型" width="90"><template #default="{ row }">{{ dictText(ORDER_TYPE, row.type) }}</template></el-table-column>
              <el-table-column label="运输方式" width="90"><template #default="{ row }">{{ dictText(MODE, row.mode) }}</template></el-table-column>
              <el-table-column prop="originPort" label="起运港" width="110" />
              <el-table-column prop="destPort" label="目的港" width="110" />
              <el-table-column prop="containerNo" label="箱号" min-width="130" />
              <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="statusOf(ORDER_STATUS, row.status).type" size="small">{{ statusOf(ORDER_STATUS, row.status).text }}</el-tag></template></el-table-column>
              <el-table-column label="操作" min-width="270" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
                  <el-button link type="primary" :icon="Download" @click="downloadOrderInvoice(row.id)">下载账单</el-button>
                  <el-button link type="primary" :icon="Document" @click="downloadOrderBl(row.id)">下载提单</el-button>
                  <el-button link type="primary" :icon="EditPen" @click="openSi(row)">补料</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="pager"><el-pagination background layout="total, prev, pager, next" :total="total" v-model:current-page="query.page" :page-size="query.pageSize" @current-change="loadOrders()" /></div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="我的账单" name="bills">
          <div class="page-card">
            <el-table :data="bills" v-loading="loading" stripe>
              <el-table-column label="订单" min-width="140"><template #default="{ row }">{{ row.order?.orderNo || '-' }}</template></el-table-column>
              <el-table-column label="类别" width="130"><template #default="{ row }">{{ dictText(FIN_CATEGORY, row.category) }}</template></el-table-column>
              <el-table-column prop="description" label="说明" min-width="160" />
              <el-table-column label="金额" width="120" align="right"><template #default="{ row }">{{ row.amount }} {{ row.currency }}</template></el-table-column>
              <el-table-column label="已收" width="100" align="right"><template #default="{ row }">{{ row.paidAmount }}</template></el-table-column>
              <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="statusOf(FIN_STATUS, row.status).type" size="small">{{ statusOf(FIN_STATUS, row.status).text }}</el-tag></template></el-table-column>
              <el-table-column label="操作" width="110" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" :icon="Download" @click="downloadBill(row)">下载</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="pager"><el-pagination background layout="total, prev, pager, next" :total="billTotal" v-model:current-page="billQuery.page" :page-size="billQuery.pageSize" @current-change="loadBills()" /></div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="运价查询" name="rates">
          <PortalRates />
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="detailVisible" title="订单详情" width="min(760px, 92vw)" v-if="orderDetail">
      <div class="detail-toolbar">
        <el-button type="primary" plain size="small" :icon="Document" @click="downloadDetailBl">下载提单</el-button>
        <el-button type="primary" plain size="small" :icon="EditPen" @click="openSi(orderDetail.order)">在线补料(SI)</el-button>
      </div>
      <el-descriptions :column="detailCols" border size="small">
        <el-descriptions-item label="订单号">{{ orderDetail.order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ dictText(ORDER_TYPE, orderDetail.order.type) }}</el-descriptions-item>
        <el-descriptions-item label="运输方式">{{ dictText(MODE, orderDetail.order.mode) }}</el-descriptions-item>
        <el-descriptions-item label="起运港">{{ orderDetail.order.originPort }}</el-descriptions-item>
        <el-descriptions-item label="目的港">{{ orderDetail.order.destPort }}</el-descriptions-item>
        <el-descriptions-item label="箱号">{{ orderDetail.order.containerNo }}</el-descriptions-item>
        <el-descriptions-item label="货描" :span="3">{{ orderDetail.order.cargoDesc }}</el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">运输跟踪</el-divider>
      <el-timeline>
        <el-timeline-item v-for="(t,i) in orderDetail.tracks" :key="i" :timestamp="formatTime(t.eventTime)">
          <b>{{ dictText(TRACK_STAGE, t.stage) }}</b> · {{ t.description }}
        </el-timeline-item>
      </el-timeline>
      <el-empty v-if="!orderDetail.tracks.length" description="暂无跟踪信息" />
      <el-divider content-position="left">费用</el-divider>
      <el-table :data="orderDetail.finance" size="small" stripe>
        <el-table-column label="类别" width="130"><template #default="{ row }">{{ dictText(FIN_CATEGORY, row.category) }}</template></el-table-column>
        <el-table-column prop="description" label="说明" min-width="140" />
        <el-table-column label="金额" width="110" align="right"><template #default="{ row }">{{ row.amount }} {{ row.currency }}</template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }">{{ statusOf(FIN_STATUS, row.status).text }}</template></el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Download" @click="downloadInvoice(row)">下载</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <PortalSiDialog v-model="siVisible" :order-id="siOrder?.id" :order-no="siOrder?.orderNo" />
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { Download, Document, EditPen } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { portalAPI } from '@/api';
import { downloadBlob } from '@/utils/download';
import PortalRates from './PortalRates.vue';
import PortalSiDialog from './PortalSiDialog.vue';
import { ORDER_STATUS, ORDER_TYPE, MODE, TRACK_STAGE, FIN_CATEGORY, FIN_STATUS, dictText, statusOf, money } from '@/utils/dicts';

const router = useRouter();
const tab = ref('orders');
const loading = ref(false);
const overview = ref({});
const orders = ref([]);
const total = ref(0);
const bills = ref([]);
const billTotal = ref(0);
const detailVisible = ref(false);
const orderDetail = ref(null);
const siVisible = ref(false);
const siOrder = ref(null);
const query = reactive({ page: 1, pageSize: 8, keyword: '', status: '' });
const billQuery = reactive({ page: 1, pageSize: 8 });

const detailCols = computed(() => (window.innerWidth < 768 ? 1 : 3));
function onResize() { /* 响应式依赖于 computed 惰性求值，无需主动刷新 */ }
function initResize() {
  window.addEventListener('resize', onResize);
}

const formatTime = (t) => (t ? String(t).replace('T', ' ').slice(0, 16) : '-');

async function loadOverview() {
  try { overview.value = await portalAPI.overview(); } catch (e) { overview.value = {}; }
}
async function loadOrders(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const d = await portalAPI.orders(query);
    orders.value = d.list; total.value = d.total;
  } finally { loading.value = false; }
}
async function loadBills(page) {
  if (page) billQuery.page = page;
  loading.value = true;
  try {
    const d = await portalAPI.bills(billQuery);
    bills.value = d.list; billTotal.value = d.total;
  } finally { loading.value = false; }
}
async function openDetail(id) {
  orderDetail.value = await portalAPI.orderDetail(id);
  detailVisible.value = true;
}
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  router.push('/login');
}

// ---- E3 下载（fail-open：404 → 轻提示，不弹错）----
function downloadError(e, okText, notReadyText) {
  if (e?.response?.status === 404) {
    ElMessage.warning(notReadyText || '该服务暂未开放，请联系操作员');
  } else {
    ElMessage.error(e?.response?.data?.message || '下载失败，请稍后重试');
  }
}

// 我的订单列表：下载账单（取订单首条应收费用作为账单）
async function downloadOrderInvoice(orderId) {
  try {
    let d = orderDetail.value;
    if (!d || d.order?.id !== orderId) d = await portalAPI.orderDetail(orderId);
    const fin = (d.finance || []).find((f) => f.direction === 'receivable') || d.finance?.[0];
    if (!fin) return ElMessage.info('该订单暂无账单');
    const resp = await portalAPI.invoiceDownload(orderId, fin.id);
    downloadBlob(resp, `账单-${d.order.orderNo || orderId}.pdf`);
  } catch (e) { downloadError(e, '', '账单下载暂未开放'); }
}

// 我的订单列表：下载提单（取订单 BL 单证）
async function downloadOrderBl(orderId) {
  try {
    let d = orderDetail.value;
    if (!d || d.order?.id !== orderId) d = await portalAPI.orderDetail(orderId);
    const bl = (d.documents || []).find((doc) => doc.docType === 'bl');
    if (!bl) return ElMessage.info('该订单暂无提单');
    const resp = await portalAPI.documentDownload(orderId, bl.id);
    downloadBlob(resp, `提单-${d.order.orderNo || orderId}.pdf`);
  } catch (e) { downloadError(e, '', '提单下载暂未开放'); }
}

// 我的账单：按费用行下载
async function downloadBill(row) {
  try {
    const resp = await portalAPI.invoiceDownload(row.order?.id, row.id);
    downloadBlob(resp, `账单-${row.order?.orderNo || row.id}.pdf`);
  } catch (e) { downloadError(e, '', '账单下载暂未开放'); }
}

// 订单详情：下载提单
async function downloadDetailBl() {
  const bl = (orderDetail.value?.documents || []).find((doc) => doc.docType === 'bl');
  if (!bl) return ElMessage.info('该订单暂无提单');
  try {
    const resp = await portalAPI.documentDownload(orderDetail.value.order.id, bl.id);
    downloadBlob(resp, `提单-${orderDetail.value.order.orderNo}.pdf`);
  } catch (e) { downloadError(e, '', '提单下载暂未开放'); }
}

// 订单详情：按费用行下载
async function downloadInvoice(row) {
  try {
    const resp = await portalAPI.invoiceDownload(orderDetail.value.order.id, row.id);
    downloadBlob(resp, `账单-${orderDetail.value.order.orderNo}-${row.id}.pdf`);
  } catch (e) { downloadError(e, '', '账单下载暂未开放'); }
}

// 在线补料(SI)
function openSi(row) {
  siOrder.value = row;
  siVisible.value = true;
}

onMounted(() => { initResize(); loadOverview(); loadOrders(1); loadBills(1); });
onUnmounted(() => window.removeEventListener('resize', onResize));
</script>

<style scoped>
.portal { min-height: 100vh; background: var(--bg-page); }
.portal-header { background: var(--sidebar-bg); color: var(--sidebar-text-active); padding: 18px 32px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.logo { width: 30px; height: 30px; }
.brand-name { font-size: 18px; font-weight: 700; }
.brand-sub { font-size: 13px; opacity: .8; }
.head-right a { color: var(--sidebar-text-active); }
.portal-body { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.stat-card { background: var(--bg-card); border: 1px solid var(--brand); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm); min-width: 0; }
.label { color: var(--text-sub); font-size: 13px; }
.value { font-size: 26px; font-weight: 700; margin-top: 6px; overflow-wrap: anywhere; }
.portal-tabs { background: var(--bg-card); border-radius: var(--radius); padding: 16px 24px; box-shadow: var(--shadow-sm); }
.table-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.left { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.detail-toolbar { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
@media (max-width: 768px) {
  .portal-header { padding: 14px 16px; }
  .stat-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .portal-tabs { padding: 12px 12px 16px; }
  .left > .el-input, .left > .el-select { width: 100% !important; flex: 1 1 100%; }
}
</style>
