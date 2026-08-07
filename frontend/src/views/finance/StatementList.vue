<template>
  <div>
    <div class="page-card toolbar-card">
      <div class="filter-bar">
        <el-date-picker
          v-model="query.month"
          type="month"
          value-format="YYYY-MM"
          placeholder="选择月份"
          :clearable="false"
          style="width: 160px"
        />
        <el-select
          v-model="query.customerId"
          placeholder="全部客户（按客户分组汇总）"
          filterable
          clearable
          style="width: 280px"
        >
          <el-option v-for="c in customers" :key="c.id" :label="`${c.name} (${c.code})`" :value="c.id" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>查询</el-button>
        <el-button v-if="query.customerId" @click="backToGroup"><el-icon><Back /></el-icon>返回分组视图</el-button>
      </div>
    </div>

    <!-- 已选客户：汇总卡片 + 当月明细 -->
    <template v-if="query.customerId && detail">
      <div class="stat-grid">
        <div class="stat-card" style="border-color: var(--danger)">
          <div class="label">应收</div>
          <div class="value" style="color: var(--danger)">{{ money(detail.receivable) }}</div>
          <div class="sub">{{ detail.month }} 当月应收</div>
        </div>
        <div class="stat-card" style="border-color: var(--success)">
          <div class="label">应付</div>
          <div class="value" style="color: var(--success)">{{ money(detail.payable) }}</div>
          <div class="sub">{{ detail.month }} 当月应付</div>
        </div>
        <div class="stat-card" :style="{ borderColor: balanceColor }">
          <div class="label">余额</div>
          <div class="value" :style="{ color: balanceColor }">{{ money(detail.balance) }}</div>
          <div class="sub">应收 - 应付{{ detail.balance >= 0 ? '（客户欠款）' : '（多付待退）' }}</div>
        </div>
      </div>

      <div class="page-card">
        <div class="table-topbar">
          <div class="left">
            <b>{{ detail.customer.name }}</b>
            <span class="muted">· {{ detail.month }} 对账单明细（{{ detail.records.length }} 条）</span>
          </div>
        </div>
        <el-table :data="detail.records" v-loading="loading" stripe size="small">
          <el-table-column label="日期" width="160">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="方向" width="100">
            <template #default="{ row }">
              <el-tag :type="dirOf(row.direction).type" size="small">{{ dirOf(row.direction).text }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="金额（原币）" width="150" align="right">
            <template #default="{ row }">{{ fmt(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="折合本币" width="150" align="right">
            <template #default="{ row }">{{ row.localAmount == null ? '-' : fmt(row.localAmount) }}</template>
          </el-table-column>
          <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        </el-table>
      </div>
    </template>

    <!-- 未选客户：按客户分组汇总 -->
    <div v-else class="page-card">
      <div class="table-topbar">
        <div class="left">
          <b>客户对账汇总</b>
          <span class="muted">· {{ group.month }}（共 {{ group.list.length }} 家客户）</span>
        </div>
        <div class="left">
          <el-button size="small" @click="search"><el-icon><Refresh /></el-icon>刷新</el-button>
        </div>
      </div>
      <el-table :data="group.list" v-loading="loading" stripe @row-click="openDetail">
        <el-table-column label="客户" min-width="220">
          <template #default="{ row }">{{ row.customer.name }}</template>
        </el-table-column>
        <el-table-column label="应收" width="170" align="right">
          <template #default="{ row }">{{ money(row.receivable) }}</template>
        </el-table-column>
        <el-table-column label="应付" width="170" align="right">
          <template #default="{ row }">{{ money(row.payable) }}</template>
        </el-table-column>
        <el-table-column label="余额" width="170" align="right">
          <template #default="{ row }">
            <span :class="row.balance >= 0 ? 'bal-pos' : 'bal-neg'">{{ money(row.balance) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button
              v-if="row.customer.id != null"
              link
              type="primary"
              @click.stop="openDetail(row)"
            >查看明细</el-button>
            <span v-else class="muted">无法查看明细</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { financeStatementAPI, customerAPI } from '@/api';
import { FIN_DIRECTION, money } from '@/utils/dicts';

const loading = ref(false);
const customers = ref([]);
const group = ref({ month: '', list: [] });
const detail = ref(null);

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const query = reactive({ month: currentMonth(), customerId: null });

const balanceColor = computed(() => ((detail.value?.balance ?? 0) >= 0 ? 'var(--danger)' : 'var(--success)'));

const dirOf = (d) => FIN_DIRECTION[d] || { text: d, type: 'info' };
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const formatDate = (v) => (v ? String(v).slice(0, 10) : '-');

async function search() {
  loading.value = true;
  try {
    if (query.customerId) {
      detail.value = await financeStatementAPI({ customerId: query.customerId, month: query.month });
    } else {
      group.value = await financeStatementAPI({ month: query.month });
      detail.value = null;
    }
  } finally {
    loading.value = false;
  }
}

function openDetail(row) {
  if (row.customer.id == null) {
    ElMessage.warning('该分组为未关联客户的费用记录，暂不支持查看明细');
    return;
  }
  query.customerId = row.customer.id;
  search();
}

function backToGroup() {
  query.customerId = null;
  search();
}

async function loadCustomers() {
  try {
    const data = await customerAPI.list({ page: 1, pageSize: 500, status: 'active' });
    customers.value = data.list;
  } catch (e) {
    customers.value = [];
  }
}

onMounted(() => {
  loadCustomers();
  search();
});
</script>

<style scoped>
.toolbar-card { margin-bottom: 16px; }
.filter-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.muted { color: var(--text-sub); font-weight: 400; }
.bal-pos { color: var(--danger); }
.bal-neg { color: var(--success); }
</style>
