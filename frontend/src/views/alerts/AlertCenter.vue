<template>
  <div class="page-card">
    <div class="table-topbar">
      <div class="left">
        <el-radio-group v-model="query.status" @change="load(1)">
          <el-radio-button value="active">未处理</el-radio-button>
          <el-radio-button value="resolved">已解决</el-radio-button>
          <el-radio-button value="ignored">已忽略</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
        </el-radio-group>
        <el-select v-model="query.level" placeholder="级别" clearable style="width:110px" @change="load(1)">
          <el-option label="提示" value="info" />
          <el-option label="警告" value="warning" />
          <el-option label="危险" value="danger" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="runScan"><el-icon><Refresh /></el-icon>立即扫描</el-button>
      </div>
      <div class="stats">
        <el-tag type="danger" size="large">危险 {{ dangerCount }}</el-tag>
        <el-tag type="warning" size="large">警告 {{ warningCount }}</el-tag>
        <el-tag type="info" size="large">提示 {{ infoCount }}</el-tag>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="级别" width="80">
        <template #default="{ row }"><el-tag :type="levelType(row.level)" size="small">{{ levelText(row.level) }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="title" label="类型" width="150" />
      <el-table-column prop="message" label="说明" min-width="320" show-overflow-tooltip />
      <el-table-column label="订单号" width="150">
        <template #default="{ row }">
          <el-link v-if="row.orderId" type="primary" @click="goOrder(row.orderId)">#{{ row.orderId }}</el-link>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="到期时间" width="160">
        <template #default="{ row }">{{ row.dueAt ? fmt(row.dueAt) : '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'warning' : row.status === 'resolved' ? 'success' : 'info'" size="small">
            {{ { active: '未处理', resolved: '已解决', ignored: '已忽略' }[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'active'">
            <el-button link type="success" @click="resolve(row)">解决</el-button>
            <el-button link type="info" @click="ignore(row)">忽略</el-button>
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
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { alertAPI } from '@/api';

const router = useRouter();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10, status: 'active', level: '' });

const dangerCount = computed(() => list.value.filter((r) => r.level === 'danger').length);
const warningCount = computed(() => list.value.filter((r) => r.level === 'warning').length);
const infoCount = computed(() => list.value.filter((r) => r.level === 'info').length);

function levelType(l) { return l === 'danger' ? 'danger' : l === 'warning' ? 'warning' : 'info'; }
function levelText(l) { return { danger: '危险', warning: '警告', info: '提示' }[l] || l; }
function fmt(v) { return v ? String(v).replace('T', ' ').slice(0, 16) : '-'; }

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await alertAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function runScan() {
  await alertAPI.run();
  ElMessage.success('扫描完成');
  load();
}

async function resolve(row) {
  await alertAPI.resolve(row.id);
  ElMessage.success('已标记解决');
  load();
}
async function ignore(row) {
  await alertAPI.ignore(row.id);
  ElMessage.success('已忽略');
  load();
}

function goOrder(id) { router.push(`/orders/${id}`); }

onMounted(() => load(1));
</script>

<style scoped>
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.stats { display: flex; gap: 8px; }
</style>