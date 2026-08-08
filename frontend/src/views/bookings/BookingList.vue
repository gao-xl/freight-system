<template>
  <div class="page-card">
    <div class="table-topbar">
      <div class="left">
        <el-input v-model="query.keyword" placeholder="搜索订舱号/船名/航班" clearable style="width:240px" @keyup.enter="load(1)" @clear="load(1)">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.status" placeholder="状态" clearable style="width:120px" @change="load(1)">
          <el-option v-for="(v,k) in BOOKING_STATUS" :key="k" :label="v.text" :value="k" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
      </div>
      <el-button type="primary" @click="openDialog()"><el-icon><Plus /></el-icon>新增订舱</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <template #empty>
        <!-- Onboarding 空状态：资源为空 → 引导卡；筛选无结果 → 仅提示重置（AC-09） -->
        <EmptyGuide
          v-if="!loading"
          :mode="isFiltered ? 'filtered' : 'guide'"
          title="还没有订舱"
          hint="订舱是运输环节的起点。为订单发起订舱，安排船期与箱型。"
          action-text="发起订舱"
          @action="openDialog()"
          @reset="resetFilters"
        />
      </template>
      <el-table-column prop="bookingNo" label="订舱号" width="150" />
      <el-table-column label="订单" min-width="150">
        <template #default="{ row }"><el-link type="primary" @click="goOrder(row)">{{ row.order?.orderNo }}</el-link></template>
      </el-table-column>
      <el-table-column label="承运人" min-width="160">
        <template #default="{ row }">{{ row.supplier?.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="vesselName" label="船名/航班" min-width="150" show-overflow-tooltip />
      <el-table-column prop="containerType" label="箱型" width="90" />
      <el-table-column prop="containerQty" label="箱量" width="80" />
      <el-table-column label="ETD" width="100"><template #default="{row}">{{ row.etd }}</template></el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }"><el-tag :type="statusOf(BOOKING_STATUS, row.status).type" size="small">{{ statusOf(BOOKING_STATUS, row.status).text }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button v-if="row.status==='new'" link type="warning" @click="setStatus(row,'confirmed')">确认</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑订舱' : '新增订舱'" width="620px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item label="关联订单">
          <el-select v-model="form.orderId" filterable style="width:100%">
            <el-option v-for="o in orders" :key="o.id" :label="`${o.orderNo} - ${o.cargoDesc}`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="承运人">
          <el-select v-model="form.supplierId" filterable style="width:100%">
            <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="船名/航班"><el-input v-model="form.vesselName" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="航次"><el-input v-model="form.voyageNo" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="箱型"><el-select v-model="form.containerType" style="width:100%"><el-option v-for="t in ['20GP','40GP','40HQ','LCL','AIR']" :key="t" :label="t" :value="t" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="箱量"><el-input-number v-model="form.containerQty" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option v-for="(v,k) in BOOKING_STATUS" :key="k" :label="v.text" :value="k" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="运费"><el-input-number v-model="form.freightCharge" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="订舱日期"><el-date-picker v-model="form.bookingDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { bookingAPI, orderAPI, supplierAPI } from '@/api';
import { BOOKING_STATUS, statusOf } from '@/utils/dicts';
import EmptyGuide from '@/components/EmptyGuide.vue';
import { useOnboardingHint } from '@/composables/useOnboardingHint';

const { showHint } = useOnboardingHint();

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const orders = ref([]);
const suppliers = ref([]);
const query = reactive({ page: 1, pageSize: 10, keyword: '', status: '' });
const dialogVisible = ref(false);
const form = ref({});

// 筛选无结果 vs 资源为空（AC-09）
const isFiltered = computed(() => !!(query.keyword || query.status));
function resetFilters() {
  query.keyword = ''; query.status = '';
  load(1);
}

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await bookingAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function loadOptions() {
  const [o, s] = await Promise.all([
    orderAPI.list({ page: 1, pageSize: 200, status: ['confirmed', 'in_progress'] }),
    supplierAPI.list({ page: 1, pageSize: 200 }),
  ]);
  orders.value = o.list;
  suppliers.value = s.list;
}

function openDialog(row) {
  form.value = row ? { ...row } : { status: 'new', containerQty: 0, freightCharge: 0 };
  dialogVisible.value = true;
}

async function save() {
  if (!form.value.orderId) return ElMessage.warning('请选择关联订单');
  saving.value = true;
  try {
    if (form.value.id) await bookingAPI.update(form.value.id, form.value);
    else await bookingAPI.create(form.value);
    ElMessage.success('保存成功');
    // Onboarding 上下文提醒：下一步安排报关
    if (!form.value.id) showHint('booking_created');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function setStatus(row, status) {
  await bookingAPI.update(row.id, { ...row, status });
  ElMessage.success('状态已更新');
  load();
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除订舱「${row.bookingNo}」？`, '提示', { type: 'warning' });
  await bookingAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

function goOrder(row) { if (row.order?.id) router.push(`/orders/${row.order.id}`); }

onMounted(() => { load(1); loadOptions(); });
</script>

<style scoped>
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
</style>