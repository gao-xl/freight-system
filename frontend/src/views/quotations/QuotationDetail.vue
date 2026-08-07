<template>
  <div class="page-card">
    <div class="head">
      <h3>报价单详情 · {{ detail?.quoteNo }}</h3>
      <div>
        <el-button @click="$router.push('/quotations')">返回列表</el-button>
        <el-button v-if="detail && detail.status==='draft'" type="primary" @click="goEdit">编辑</el-button>
        <el-button v-if="detail && detail.status==='draft'" type="warning" @click="action('send')">发送</el-button>
        <el-button v-if="detail && detail.status==='sent'" type="success" @click="action('confirm')">客户确认</el-button>
        <el-button v-if="detail && detail.status==='confirmed'" type="success" @click="convert">转订单</el-button>
      </div>
    </div>

    <el-card shadow="never" class="sec" v-loading="loading">
      <template #header>
        <div class="sec-head">
          基本信息
          <el-tag v-if="detail" :type="statusOf(QUOTATION_STATUS, detail.status).type" size="small">{{ statusOf(QUOTATION_STATUS, detail.status).text }}</el-tag>
        </div>
      </template>
      <el-descriptions v-if="detail" :column="3" border>
        <el-descriptions-item label="客户">{{ detail.customer?.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="贸易类型">{{ ORDER_TYPE[detail.type] }}</el-descriptions-item>
        <el-descriptions-item label="运输方式">{{ MODE[detail.mode] }} · {{ SERVICE_TYPE[detail.serviceType] }}</el-descriptions-item>
        <el-descriptions-item label="起运港">{{ detail.originPort || '-' }}</el-descriptions-item>
        <el-descriptions-item label="目的港">{{ detail.destPort || '-' }}</el-descriptions-item>
        <el-descriptions-item label="币种">{{ detail.currency }}</el-descriptions-item>
        <el-descriptions-item label="货物品名">{{ detail.cargoDesc || '-' }}</el-descriptions-item>
        <el-descriptions-item label="货重/体积">{{ detail.cargoWeight }}kg / {{ detail.cargoVolume }}CBM</el-descriptions-item>
        <el-descriptions-item label="报价有效期">{{ detail.validUntil || '-' }}</el-descriptions-item>
        <el-descriptions-item label="报价总额"><b>{{ money(detail.totalAmount, detail.currency) }}</b></el-descriptions-item>
        <el-descriptions-item label="预估成本">{{ money(detail.costAmount, detail.currency) }}</el-descriptions-item>
        <el-descriptions-item label="预估毛利 / 毛利率">{{ money(detail.profitAmount, detail.currency) }} / {{ detail.profitRate }}%</el-descriptions-item>
        <el-descriptions-item label="备注" :span="3">{{ detail.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" class="sec">
      <template #header>费用明细</template>
      <el-table :data="detail?.items || []" border size="small">
        <el-table-column prop="name" label="费用名称" min-width="150" />
        <el-table-column label="类型" width="120"><template #default="{row}">{{ QUO_ITEM_CATEGORY[row.category] || row.category }}</template></el-table-column>
        <el-table-column label="收/支" width="90">
          <template #default="{row}"><el-tag size="small" :type="row.direction==='revenue'?'danger':'success'">{{ QUO_ITEM_DIRECTION[row.direction] }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="90" />
        <el-table-column prop="unitPrice" label="单价" width="120" />
        <el-table-column prop="amount" label="金额" width="120" align="right" />
        <el-table-column label="成本来源" min-width="140"><template #default="{row}">{{ row.supplier?.name || '-' }}</template></el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useQuotationStore } from '@/stores/quotation';
import { MODE, SERVICE_TYPE, ORDER_TYPE, QUOTATION_STATUS, QUO_ITEM_CATEGORY, QUO_ITEM_DIRECTION, statusOf, money } from '@/utils/dicts';

const route = useRoute();
const router = useRouter();
const store = useQuotationStore();
const detail = ref(null);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    detail.value = await store.fetchDetail(route.params.id);
  } finally { loading.value = false; }
}

async function action(type) {
  if (type === 'send') await store.send(detail.value.id);
  else await store.confirm(detail.value.id);
  ElMessage.success(type === 'send' ? '已发送' : '客户已确认');
  load();
}

async function convert() {
  await ElMessageBox.confirm('确认将本报价单转化为订单？将生成订单及财务应收应付。', '提示', { type: 'warning' });
  const res = await store.convertOrder(detail.value.id, {});
  ElMessage.success(`已生成订单 ${res.order.orderNo}`);
  router.push(`/orders/${res.order.id}`);
}

function goEdit() { router.push(`/quotations/edit/${detail.value.id}`); }

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.head h3 { margin: 0; }
.sec { margin-bottom: 16px; }
.sec-head { display: flex; align-items: center; gap: 10px; }
</style>