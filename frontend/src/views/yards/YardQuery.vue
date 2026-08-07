<template>
  <div class="page-card">
    <!-- 查询区 -->
    <div class="toolbar">
      <el-input v-model="query.containerNo" placeholder="箱号" clearable style="width:160px" @keyup.enter="doQuery">
        <template #prefix><el-icon><Box /></el-icon></template>
      </el-input>
      <el-input v-model="query.billNo" placeholder="提单号" clearable style="width:160px" @keyup.enter="doQuery">
        <template #prefix><el-icon><Tickets /></el-icon></template>
      </el-input>
      <el-select v-model="query.yardCode" placeholder="选择场站" filterable clearable style="width:180px">
        <el-option v-for="y in yards" :key="y.code" :label="`${y.name}（${y.code}）`" :value="y.code" />
      </el-select>
      <el-button type="primary" @click="doQuery"><el-icon><Search /></el-icon>查询</el-button>
      <el-button type="success" plain @click="manualVisible = true"><el-icon><EditPen /></el-icon>人工录入</el-button>
      <el-button @click="loadRecords"><el-icon><Refresh /></el-icon>刷新记录</el-button>
    </div>

    <!-- 查询结果 -->
    <el-card v-if="result" shadow="never" class="result-card">
      <div class="result-head">
        <span class="result-title">查询结果</span>
        <el-tag :type="result.ready ? 'success' : 'warning'">
          {{ result.ready ? '自动查询' : '待人工确认' }}
        </el-tag>
      </div>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="箱号">{{ result.containerNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="提单号">{{ result.billNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="场站">{{ result.yardName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="箱状态">
          <el-tag :type="statusTag(result.status)">{{ result.status || '在场' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="区位">{{ result.location || '-' }}</el-descriptions-item>
        <el-descriptions-item label="事件时间">{{ result.eventTime ? fmt(result.eventTime) : '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 历史记录表 -->
    <el-card shadow="never" class="records-card">
      <template #header>
        <div class="card-head">
          <span>历史查询记录</span>
          <div>
            <el-input v-model="recFilter.containerNo" placeholder="按箱号筛选" clearable size="small" style="width:150px" @change="loadRecords" />
            <el-input v-model="recFilter.billNo" placeholder="按提单号筛选" clearable size="small" style="width:150px;margin-left:8px" @change="loadRecords" />
          </div>
        </div>
      </template>
      <el-table :data="records" v-loading="loading" stripe>
        <el-table-column prop="containerNo" label="箱号" width="140" />
        <el-table-column prop="billNo" label="提单号" width="150" />
        <el-table-column prop="yardName" label="场站" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="location" label="区位" width="120" />
        <el-table-column label="来源" width="90">
          <template #default="{ row }">{{ sourceText(row.source) }}</template>
        </el-table-column>
        <el-table-column label="事件时间" width="160"><template #default="{ row }">{{ fmt(row.eventTime) }}</template></el-table-column>
        <el-table-column label="查询时间" min-width="160"><template #default="{ row }">{{ fmt(row.queryAt) }}</template></el-table-column>
      </el-table>
    </el-card>

    <!-- 人工录入对话框 -->
    <el-dialog v-model="manualVisible" title="人工录入场站状态" width="460px">
      <el-form :model="manual" label-width="80px">
        <el-form-item label="箱号"><el-input v-model="manual.containerNo" /></el-form-item>
        <el-form-item label="提单号"><el-input v-model="manual.billNo" /></el-form-item>
        <el-form-item label="场站">
          <el-select v-model="manual.yardCode" filterable placeholder="选择场站" style="width:100%">
            <el-option v-for="y in yards" :key="y.code" :label="y.name" :value="y.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="箱状态">
          <el-select v-model="manual.status" style="width:100%">
            <el-option v-for="s in STATUSES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="区位"><el-input v-model="manual.location" /></el-form-item>
        <el-form-item label="事件时间"><el-date-picker v-model="manual.eventTime" type="datetime" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualVisible = false">取消</el-button>
        <el-button type="primary" @click="submitManual">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { yardAPI } from '@/api';

const query = ref({ containerNo: '', billNo: '', yardCode: '' });
const yards = ref([]);
const result = ref(null);
const records = ref([]);
const loading = ref(false);
const recFilter = ref({ containerNo: '', billNo: '' });
const manualVisible = ref(false);
const manual = ref({ containerNo: '', billNo: '', yardCode: '', status: '在场', location: '', eventTime: new Date() });
const STATUSES = ['在场', '放行', '集港', '查验', '提取'];

const statusTag = (s) => ({ 在场: 'info', 放行: 'success', 集港: 'primary', 查验: 'warning', 提取: 'success' }[s] || 'info');
const sourceText = (s) => ({ api: '自动', scraper: '抓取', manual: '人工' }[s] || s);
const fmt = (d) => d ? new Date(d).toLocaleString('zh-CN', { hour12: false }) : '-';

async function loadYards() {
  yards.value = await yardAPI.list();
}

async function doQuery() {
  if (!query.value.containerNo && !query.value.billNo) return ElMessage.warning('请填写箱号或提单号');
  if (!query.value.yardCode) return ElMessage.warning('请选择场站');
  result.value = await yardAPI.status({
    containerNo: query.value.containerNo,
    billNo: query.value.billNo,
    yardCode: query.value.yardCode,
  });
  ElMessage.success('查询完成');
  loadRecords();
}

async function loadRecords() {
  loading.value = true;
  try {
    const data = await yardAPI.records({
      containerNo: recFilter.value.containerNo || undefined,
      billNo: recFilter.value.billNo || undefined,
    });
    records.value = data || [];
  } finally { loading.value = false; }
}

async function submitManual() {
  if (!manual.value.containerNo && !manual.value.billNo) return ElMessage.warning('请填写箱号或提单号');
  if (!manual.value.yardCode) return ElMessage.warning('请选择场站');
  await yardAPI.manualCreate(manual.value);
  ElMessage.success('已录入');
  manualVisible.value = false;
  manual.value = { containerNo: '', billNo: '', yardCode: '', status: '在场', location: '', eventTime: new Date() };
  loadRecords();
}

onMounted(() => { loadYards(); loadRecords(); });
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.result-card { margin-bottom: 16px; }
.result-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.result-title { font-weight: 600; font-size: 15px; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.records-card { margin-top: 8px; }
</style>