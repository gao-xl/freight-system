<template>
  <div class="page-card">
    <div class="topbar">
      <div class="left">
        <el-input v-model="query.keyword" placeholder="搜索报价单号/品名/港" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.status" placeholder="状态" clearable style="width:130px" @change="load(1)">
          <el-option v-for="(v,k) in QUOTATION_STATUS" :key="k" :label="v.text" :value="k" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
      </div>
      <el-button type="primary" @click="$router.push('/quotations/edit')"><el-icon><Plus /></el-icon>新建报价</el-button>
    </div>

    <el-row :gutter="12" class="stat-bar">
      <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ stats?.total ?? '-' }}</div><div class="stat-label">报价总数</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ money(stats?.totalAmount) }}</div><div class="stat-label">报价总额</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ money(stats?.costAmount) }}</div><div class="stat-label">预估成本</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ stats?.conversionRate ?? '-' }}%</div><div class="stat-label">转化率</div></el-card></el-col>
    </el-row>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="quoteNo" label="报价单号" width="150" />
      <el-table-column label="客户" min-width="170">
        <template #default="{ row }">{{ row.customer?.name || '-' }}</template>
      </el-table-column>
      <el-table-column label="航线" min-width="150">
        <template #default="{ row }">{{ row.originPort }} → {{ row.destPort }}</template>
      </el-table-column>
      <el-table-column prop="cargoDesc" label="品名" min-width="120" show-overflow-tooltip />
      <el-table-column label="运输方式" width="90"><template #default="{row}">{{ MODE[row.mode] }} · {{ SERVICE_TYPE[row.serviceType] }}</template></el-table-column>
      <el-table-column label="报价总额" width="120" align="right"><template #default="{row}">{{ money(row.totalAmount, row.currency) }}</template></el-table-column>
      <el-table-column label="毛利率" width="90" align="right"><template #default="{row}">{{ row.profitRate }}%</template></el-table-column>
      <el-table-column label="有效期" width="110"><template #default="{row}">{{ row.validUntil }}</template></el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }"><el-tag :type="statusOf(QUOTATION_STATUS, row.status).type" size="small">{{ statusOf(QUOTATION_STATUS, row.status).text }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/quotations/${row.id}`)">详情</el-button>
          <el-button v-if="row.status==='draft'" link type="primary" @click="$router.push(`/quotations/edit/${row.id}`)">编辑</el-button>
          <el-button v-if="row.status==='draft'" link type="warning" @click="send(row)">发送</el-button>
          <el-button v-if="row.status==='sent'" link type="success" @click="confirm(row)">确认</el-button>
          <el-button v-if="row.status==='confirmed'" link type="success" @click="convert(row)">转订单</el-button>
          <el-button v-if="row.status==='draft'||row.status==='cancelled'" link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useQuotationStore } from '@/stores/quotation';
import { QUOTATION_STATUS, MODE, SERVICE_TYPE, statusOf, money } from '@/utils/dicts';

const router = useRouter();
const store = useQuotationStore();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const stats = ref(null);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: '' });

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await store.fetchList(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function send(row) {
  await store.send(row.id);
  ElMessage.success('已发送');
  load();
}
async function confirm(row) {
  await store.confirm(row.id);
  ElMessage.success('客户已确认');
  load();
}
async function convert(row) {
  await ElMessageBox.confirm(`确认将报价单「${row.quoteNo}」转化为订单？将同时生成订单及财务应收应付。`, '提示', { type: 'warning' });
  const res = await store.convertOrder(row.id, {});
  ElMessage.success(`已生成订单 ${res.order.orderNo}`);
  load();
}
async function remove(row) {
  await ElMessageBox.confirm(`确认删除报价单「${row.quoteNo}」？`, '提示', { type: 'warning' });
  await store.remove(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(async () => {
  load(1);
  stats.value = await store.fetchStats();
});
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.stat-bar { margin-bottom: 16px; }
.stat-card { text-align: center; border-radius: 10px; }
.stat-num { font-size: 22px; font-weight: 700; color: var(--brand); }
.stat-label { font-size: 12px; color: var(--text-sub); margin-top: 4px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>