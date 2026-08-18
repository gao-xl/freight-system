<template>
  <div>
    <div class="page-heading">
      <div class="title"><el-icon><DataAnalysis /></el-icon> 对账工作台</div>
      <span class="page-desc">应收/应付/单票三维对账，发票 ↔ 提单 ↔ 费用全链路核销</span>
    </div>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="应收对账" name="ar">
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">应收总额</div><div class="stat-value">{{ money(arData.totalReceivable) }}</div></div>
          <div class="stat-card"><div class="stat-label">已收款</div><div class="stat-value">{{ money(arData.totalPaid) }}</div></div>
          <div class="stat-card"><div class="stat-label">已开票</div><div class="stat-value">{{ money(arData.totalInvoiced) }}</div></div>
          <div class="stat-card accent"><div class="stat-label">待收余额</div><div class="stat-value">{{ money(arData.balance) }}</div></div>
          <div class="stat-card warn"><div class="stat-label">发票缺口</div><div class="stat-value">{{ money(arData.invoiceGap) }}</div></div>
          <div class="stat-card"><div class="stat-label">匹配率</div><div class="stat-value">{{ arData.matchedCount }}/{{ arData.items?.length || 0 }}</div></div>
        </div>

        <div class="page-card">
          <div class="card-title">应收对账明细</div>
          <el-table :data="arData.items" stripe v-loading="arLoading" row-key="orderId">
            <el-table-column prop="orderNo" label="订单号" width="140" />
            <el-table-column prop="customerName" label="客户" width="160" />
            <el-table-column label="应收金额" width="120" align="right">
              <template #default="{ row }">{{ money(row.receivable) }}</template>
            </el-table-column>
            <el-table-column label="已收款" width="120" align="right">
              <template #default="{ row }">{{ money(row.paid) }}</template>
            </el-table-column>
            <el-table-column label="已开票" width="120" align="right">
              <template #default="{ row }">{{ money(row.invoiced) }}</template>
            </el-table-column>
            <el-table-column label="余额" width="120" align="right">
              <template #default="{ row }">
                <span :style="{ color: row.balance > 0 ? '#e6a23c' : '#67c23a' }">{{ money(row.balance) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="发票缺口" width="120" align="right">
              <template #default="{ row }">
                <span :style="{ color: row.invoiceGap > 0 ? '#f56c6c' : '#67c23a' }">{{ money(row.invoiceGap) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="发票" width="60" align="center">
              <template #default="{ row }">{{ row.invoiceCount }}</template>
            </el-table-column>
            <el-table-column label="分单" width="60" align="center">
              <template #default="{ row }">{{ row.blCount }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.matched ? 'success' : 'warning'" size="small">{{ row.matched ? '已匹配' : '未匹配' }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="应付对账" name="ap">
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">应付总额</div><div class="stat-value">{{ money(apData.totalPayable) }}</div></div>
          <div class="stat-card"><div class="stat-label">已付款</div><div class="stat-value">{{ money(apData.totalPaid) }}</div></div>
          <div class="stat-card"><div class="stat-label">已借记</div><div class="stat-value">{{ money(apData.totalDebited) }}</div></div>
          <div class="stat-card accent"><div class="stat-label">待付余额</div><div class="stat-value">{{ money(apData.balance) }}</div></div>
          <div class="stat-card warn"><div class="stat-label">借记缺口</div><div class="stat-value">{{ money(apData.debitGap) }}</div></div>
          <div class="stat-card"><div class="stat-label">匹配率</div><div class="stat-value">{{ apData.matchedCount }}/{{ apData.items?.length || 0 }}</div></div>
        </div>

        <div class="page-card">
          <div class="card-title">应付对账明细</div>
          <el-table :data="apData.items" stripe v-loading="apLoading" row-key="supplierId">
            <el-table-column prop="supplierName" label="供应商" width="160" />
            <el-table-column label="应付金额" width="120" align="right">
              <template #default="{ row }">{{ money(row.payable) }}</template>
            </el-table-column>
            <el-table-column label="已付款" width="120" align="right">
              <template #default="{ row }">{{ money(row.paid) }}</template>
            </el-table-column>
            <el-table-column label="已借记" width="120" align="right">
              <template #default="{ row }">{{ money(row.debited) }}</template>
            </el-table-column>
            <el-table-column label="余额" width="120" align="right">
              <template #default="{ row }">
                <span :style="{ color: row.balance > 0 ? '#e6a23c' : '#67c23a' }">{{ money(row.balance) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="借记缺口" width="120" align="right">
              <template #default="{ row }">
                <span :style="{ color: row.debitGap > 0 ? '#f56c6c' : '#67c23a' }">{{ money(row.debitGap) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="借记单" width="70" align="center">
              <template #default="{ row }">{{ row.debitNoteCount }}</template>
            </el-table-column>
            <el-table-column label="主单" width="60" align="center">
              <template #default="{ row }">{{ row.mblCount }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.matched ? 'success' : 'warning'" size="small">{{ row.matched ? '已匹配' : '未匹配' }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="单票对账" name="shipment">
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">应收总额</div><div class="stat-value">{{ money(spData.totalReceivable) }}</div></div>
          <div class="stat-card"><div class="stat-label">应付总额</div><div class="stat-value">{{ money(spData.totalPayable) }}</div></div>
          <div class="stat-card accent"><div class="stat-label">毛利</div><div class="stat-value">{{ money(spData.totalMargin) }}</div></div>
          <div class="stat-card warn"><div class="stat-label">毛利率</div><div class="stat-value">{{ spData.overallMarginRate }}%</div></div>
          <div class="stat-card"><div class="stat-label">提单数</div><div class="stat-value">{{ spData.shipmentCount }}</div></div>
        </div>

        <div class="page-card">
          <div class="card-title">单票毛利明细</div>
          <el-table :data="spData.items" stripe v-loading="spLoading" row-key="orderId">
            <el-table-column prop="orderNo" label="订单号" width="140" />
            <el-table-column prop="customerName" label="客户" width="160" />
            <el-table-column label="应收" width="120" align="right">
              <template #default="{ row }">{{ money(row.receivable) }}</template>
            </el-table-column>
            <el-table-column label="应付" width="120" align="right">
              <template #default="{ row }">{{ money(row.payable) }}</template>
            </el-table-column>
            <el-table-column label="毛利" width="120" align="right">
              <template #default="{ row }">
                <span :style="{ color: row.margin >= 0 ? '#67c23a' : '#f56c6c', fontWeight: 'bold' }">{{ money(row.margin) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="毛利率" width="90" align="right">
              <template #default="{ row }">
                <el-tag :type="row.marginRate >= 0 ? 'success' : 'danger'" size="small">{{ row.marginRate }}%</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="主单" width="60" align="center">
              <template #default="{ row }">
                <el-icon v-if="row.hasMbl" color="#409eff"><Check /></el-icon>
                <span v-else style="color:#ccc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="分单" width="60" align="center">
              <template #default="{ row }">
                <el-icon v-if="row.hasHbl" color="#67c23a"><Check /></el-icon>
                <span v-else style="color:#ccc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="发票" width="60" align="center">
              <template #default="{ row }">
                <el-icon v-if="row.hasInvoice" color="#409eff"><Check /></el-icon>
                <span v-else style="color:#ccc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="借记单" width="70" align="center">
              <template #default="{ row }">
                <el-icon v-if="row.hasDebitNote" color="#e6a23c"><Check /></el-icon>
                <span v-else style="color:#ccc">-</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { reconciliationAPI } from '@/api/reconciliation';
import { money } from '@/utils/dicts';

const activeTab = ref('ar');
const arLoading = ref(false);
const apLoading = ref(false);
const spLoading = ref(false);

const arData = reactive({ totalReceivable: 0, totalPaid: 0, totalInvoiced: 0, balance: 0, invoiceGap: 0, matchedCount: 0, unmatchedCount: 0, items: [] });
const apData = reactive({ totalPayable: 0, totalPaid: 0, totalDebited: 0, balance: 0, debitGap: 0, matchedCount: 0, unmatchedCount: 0, items: [] });
const spData = reactive({ totalReceivable: 0, totalPayable: 0, totalMargin: 0, overallMarginRate: 0, shipmentCount: 0, items: [] });

async function loadAR() {
  arLoading.value = true;
  try {
    const d = await reconciliationAPI.receivable();
    Object.assign(arData, d);
  } finally { arLoading.value = false; }
}

async function loadAP() {
  apLoading.value = true;
  try {
    const d = await reconciliationAPI.payable();
    Object.assign(apData, d);
  } finally { apLoading.value = false; }
}

async function loadSP() {
  spLoading.value = true;
  try {
    const d = await reconciliationAPI.perShipment();
    Object.assign(spData, d);
  } finally { spLoading.value = false; }
}

function onTabChange(tab) {
  if (tab === 'ar' && arData.items.length === 0) loadAR();
  else if (tab === 'ap' && apData.items.length === 0) loadAP();
  else if (tab === 'shipment' && spData.items.length === 0) loadSP();
}

onMounted(() => loadAR());
</script>

<style scoped>
.stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 20px; }
.stat-card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.stat-card.accent { border-left: 3px solid #409eff; }
.stat-card.warn { border-left: 3px solid #e6a23c; }
.stat-label { font-size: 13px; color: #909399; margin-bottom: 6px; }
.stat-value { font-size: 22px; font-weight: 600; color: #303133; }
</style>