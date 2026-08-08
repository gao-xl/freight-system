<template>
  <div class="page-card">
    <div class="head">
      <h3>{{ form.id ? `编辑报价单 · ${form.quoteNo}` : '新建报价单' }}</h3>
      <el-button @click="$router.back()">返回</el-button>
    </div>

    <el-form :model="form" label-width="90px" class="main-form">
      <el-card shadow="never" class="sec">
        <template #header>基本信息</template>
        <el-row :gutter="16">
          <el-col :span="8"><el-form-item label="客户" required>
            <el-select v-model="form.customerId" filterable style="width:100%" placeholder="选择客户"><el-option v-for="c in customers" :key="c.id" :label="`${c.name}`" :value="c.id" /></el-select>
          </el-form-item></el-col>
          <el-col :span="8"><el-form-item label="贸易类型"><el-select v-model="form.type" style="width:100%"><el-option v-for="(v,k) in ORDER_TYPE" :key="k" :label="v" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="运输方式"><el-select v-model="form.mode" style="width:100%"><el-option v-for="(v,k) in MODE" :key="k" :label="v" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="服务类型"><el-select v-model="form.serviceType" style="width:100%"><el-option v-for="(v,k) in SERVICE_TYPE" :key="k" :label="v" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="币种"><el-select v-model="form.currency" style="width:100%"><el-option v-for="c in ['USD','CNY','EUR']" :key="c" :label="c" :value="c" /></el-select></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="有效期"><el-date-picker v-model="form.validUntil" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="起运港"><el-input v-model="form.originPort" placeholder="如 上海港" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="目的港"><el-input v-model="form.destPort" placeholder="如 鹿特丹" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="起运地"><el-input v-model="form.originPlace" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="目的地"><el-input v-model="form.destPlace" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="货物品名"><el-input v-model="form.cargoDesc" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="货重(kg)"><el-input-number v-model="form.cargoWeight" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="体积(CBM)"><el-input-number v-model="form.cargoVolume" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="件数"><el-input-number v-model="form.packageCount" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-card>

      <el-card shadow="never" class="sec">
        <template #header>
          <div class="sec-head">费用明细
            <el-button size="small" type="primary" plain @click="addItem('revenue')"><el-icon><Plus /></el-icon>收入项</el-button>
            <el-button size="small" type="danger" plain @click="addItem('cost')"><el-icon><Plus /></el-icon>成本项</el-button>
          </div>
        </template>
        <el-table :data="form.items" border size="small">
          <el-table-column label="费用名称" min-width="150">
            <template #default="{ row }"><el-input v-model="row.name" placeholder="费用名称" /></template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }"><el-select v-model="row.category" style="width:100%"><el-option v-for="(v,k) in QUO_ITEM_CATEGORY" :key="k" :label="v" :value="k" /></el-select></template>
          </el-table-column>
          <el-table-column label="收/支" width="90">
            <template #default="{ row }"><el-tag size="small" :type="row.direction==='revenue' ? 'danger' : 'success'">{{ QUO_ITEM_DIRECTION[row.direction] }}</el-tag></template>
          </el-table-column>
          <el-table-column label="单位" width="90"><template #default="{ row }"><el-input v-model="row.unit" placeholder="箱/吨" /></template></el-table-column>
          <el-table-column label="数量" width="110"><template #default="{ row }"><el-input-number v-model="row.quantity" :min="0" :precision="2" size="small" style="width:100%" /></template></el-table-column>
          <el-table-column label="单价" width="120"><template #default="{ row }"><el-input-number v-model="row.unitPrice" :min="0" :precision="2" size="small" style="width:100%" /></template></el-table-column>
          <el-table-column label="金额" width="120" align="right"><template #default="{ row }">{{ money(row.quantity * row.unitPrice) }}</template></el-table-column>
          <el-table-column label="成本价" width="120"><template #default="{ row }"><el-input-number v-model="row.costPrice" :min="0" :precision="2" size="small" style="width:100%" /></template></el-table-column>
          <el-table-column label="操作" width="70"><template #default="{ $index }"><el-button link type="danger" @click="form.items.splice($index,1)">删除</el-button></template></el-table-column>
        </el-table>

        <div class="summary">
          <div class="sum-box"><span class="lbl">报价总额</span><span class="val danger">{{ money(summary.total) }}</span></div>
          <div class="sum-box"><span class="lbl">预估成本</span><span class="val success">{{ money(summary.cost) }}</span></div>
          <div class="sum-box"><span class="lbl">预估毛利</span><span class="val">{{ money(summary.profit) }}</span></div>
          <div class="sum-box"><span class="lbl">毛利率</span><span class="val">{{ summary.rate }}%</span></div>
        </div>
      </el-card>
    </el-form>

    <div class="footer">
      <el-button @click="$router.back()">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save(false)">保存草稿</el-button>
      <el-button v-if="!form.id" type="success" :loading="saving" @click="save(true)">保存并发送</el-button>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useQuotationStore } from '@/stores/quotation';
import { customerAPI } from '@/api';
import { MODE, SERVICE_TYPE, ORDER_TYPE, QUO_ITEM_CATEGORY, QUO_ITEM_DIRECTION, money } from '@/utils/dicts';
import { useOnboardingHint } from '@/composables/useOnboardingHint';

const { showHint } = useOnboardingHint();

const route = useRoute();
const router = useRouter();
const store = useQuotationStore();
const saving = ref(false);
const customers = ref([]);
const form = reactive({
  customerId: null, type: 'export', mode: 'sea', serviceType: 'fcl', currency: 'USD',
  originPort: '', destPort: '', originPlace: '', destPlace: '', cargoDesc: '',
  cargoWeight: 0, cargoVolume: 0, packageCount: 0, validUntil: '', remark: '', items: [],
});

const summary = computed(() => {
  let total = 0, cost = 0;
  for (const it of form.items) {
    const amt = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    if (it.direction === 'revenue') total += amt;
    else if (it.direction === 'cost') cost += amt;
  }
  const profit = total - cost;
  const rate = total > 0 ? ((profit / total) * 100).toFixed(2) : 0;
  return { total: total.toFixed(2), cost: cost.toFixed(2), profit: profit.toFixed(2), rate };
});

function addItem(direction) {
  form.items.push({ name: '', category: 'other', direction, unit: '', quantity: 1, unitPrice: 0, costPrice: 0, supplierId: null });
}

async function loadDetail(id) {
  const d = await store.fetchDetail(id);
  Object.keys(form).forEach((k) => {
    if (k === 'items') return;
    form[k] = d[k] ?? form[k];
  });
  form.items = (d.items || []).map((it) => ({ ...it }));
}

async function save(andSend) {
  if (!form.customerId) return ElMessage.warning('请选择客户');
  if (!form.items.length) return ElMessage.warning('请至少添加一项费用明细');
  saving.value = true;
  try {
    const payload = { ...form, items: form.items.map(({ id, ...rest }) => rest) };
    let r;
    if (form.id) {
      r = await store.update(form.id, payload);
      if (andSend) await store.send(form.id);
    } else {
      r = await store.create(payload);
      if (andSend) await store.send(r.id);
    }
    ElMessage.success(andSend ? '已保存并发送' : '已保存');
    // Onboarding 上下文提醒：下一步转订单
    if (!form.id) showHint('quotation_saved');
    router.push(`/quotations/${r.id}`);
  } finally { saving.value = false; }
}

onMounted(async () => {
  const c = await customerAPI.list({ page: 1, pageSize: 200 });
  customers.value = c.list;
  if (route.params.id) {
    const id = Number(route.params.id);
    form.id = id;
    await loadDetail(id);
  }
});
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.head h3 { margin: 0; }
.sec { margin-bottom: 16px; }
.sec-head { display: flex; align-items: center; gap: 10px; }
.main-form :deep(.el-select), .main-form :deep(.el-input-number) { width: 100%; }
.summary { display: flex; gap: 24px; margin-top: 16px; justify-content: flex-end; }
.sum-box { text-align: right; }
.sum-box .lbl { display: block; font-size: 12px; color: var(--text-sub); }
.sum-box .val { font-size: 20px; font-weight: 700; }
.sum-box .val.danger { color: #f56c6c; }
.sum-box .val.success { color: #67c23a; }
.footer { display: flex; justify-content: flex-end; gap: 10px; }
</style>