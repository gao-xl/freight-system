<template>
  <div class="page-card">
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="按报表名称搜索" clearable style="width:200px" @keyup.enter="load" @clear="load" />
      <el-button type="primary" @click="openDesigner()"><el-icon><Plus /></el-icon>新建报表</el-button>
      <el-button @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      <el-alert class="tip" type="info" :closable="false" show-icon
        title="自定义报表：选择数据源、分组字段与聚合指标，保存后一键执行。分组/聚合/过滤字段全部走白名单，禁止任意字段查询。" />
    </div>

    <el-table :data="reports" v-loading="loading" stripe>
      <el-table-column prop="name" label="报表名称" min-width="200" show-overflow-tooltip />
      <el-table-column label="数据源" width="100">
        <template #default="{row}">
          <el-tag size="small" :type="bizTag[row.bizType] || 'info'">{{ bizName[row.bizType] || row.bizType }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="分组" width="110">
        <template #default="{row}"><span v-if="row.groupBy">{{ row.groupBy }}</span><span v-else class="muted">-</span></template>
      </el-table-column>
      <el-table-column label="指标" min-width="160" show-overflow-tooltip>
        <template #default="{row}">{{ measuresText(row) }}</template>
      </el-table-column>
      <el-table-column label="图表" width="90">
        <template #default="{row}">
          <el-tag size="small" effect="plain">{{ chartName[row.chartType] || row.chartType }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{row}">
          <el-switch :model-value="row.enabled" @change="(v) => toggle(row, v)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="runReport(row)">执行</el-button>
          <el-button link type="primary" @click="openDesigner(row)">编辑</el-button>
          <el-button link type="danger" @click="removeReport(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" background layout="total, prev, pager, next" :total="total" :page-size="pageSize"
      v-model:current-page="page" @current-change="load" />

    <!-- 设计器 -->
    <el-dialog v-model="dialogVisible" :title="editing.id ? '编辑报表' : '新建报表'" width="720px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="报表名称" required>
          <el-input v-model="form.name" placeholder="如：按客户毛利报表" maxlength="100" />
        </el-form-item>
        <el-form-item label="数据源" required>
          <el-select v-model="form.bizType" style="width:100%" :disabled="!!editing.id" @change="resetFields">
            <el-option v-for="(v,k) in bizName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="分组字段">
          <el-select v-model="form.groupBy" style="width:100%" clearable placeholder="不分组（汇总）">
            <el-option v-for="f in fields" :key="f" :label="f" :value="f" />
          </el-select>
        </el-form-item>

        <el-form-item label="聚合指标" required>
          <div class="measures">
            <div v-for="(m,i) in form.measures" :key="i" class="measure-row">
              <el-select v-model="m.field" placeholder="字段" style="width:40%" filterable>
                <el-option v-for="f in fields" :key="f" :label="f" :value="f" />
              </el-select>
              <el-select v-model="m.agg" style="width:24%">
                <el-option v-for="a in meta.aggs" :key="a" :label="aggName[a] || a" :value="a" />
              </el-select>
              <el-input v-model="m.alias" placeholder="别名" style="width:24%" />
              <el-button link type="danger" :disabled="form.measures.length <= 1" @click="form.measures.splice(i,1)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button size="small" type="primary" plain @click="form.measures.push({ field:'', agg:'sum', alias:'' })">
              <el-icon><Plus /></el-icon>添加指标
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="过滤条件">
          <div class="filters">
            <div v-for="(f,i) in form.filters" :key="i" class="measure-row">
              <el-select v-model="f.field" placeholder="字段" style="width:32%" filterable>
                <el-option v-for="fl in fields" :key="fl" :label="fl" :value="fl" />
              </el-select>
              <el-select v-model="f.op" style="width:22%">
                <el-option v-for="(v,k) in ops" :key="k" :label="v" :value="k" />
              </el-select>
              <el-input v-model="f.value" placeholder="值" style="width:32%" />
              <el-button link type="danger" @click="form.filters.splice(i,1)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button size="small" type="primary" plain @click="form.filters.push({ field:'', op:'eq', value:'' })">
              <el-icon><Plus /></el-icon>添加条件
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="图表类型">
          <el-select v-model="form.chartType" style="width:100%">
            <el-option v-for="(v,k) in chartName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 执行结果 -->
    <el-dialog v-model="resultVisible" title="报表结果" width="720px">
      <div v-if="resultData">
        <el-radio-group v-model="resultMode" class="result-mode" size="small">
          <el-radio-button label="table">表格</el-radio-button>
          <el-radio-button label="chart">图表</el-radio-button>
        </el-radio-group>
        <el-table v-if="resultMode === 'table'" :data="resultData.rows" size="small" stripe max-height="400">
          <el-table-column prop="groupKey" label="分组" min-width="120" />
          <el-table-column v-for="c in resultData.measures" :key="c" :prop="c" :label="c" min-width="120" />
        </el-table>
        <div v-else-if="resultData.chartType !== 'table'" class="chart-box">
          <el-empty v-if="!resultData.rows.length" description="无数据" />
          <canvas v-show="resultData.rows.length" ref="chartCanvas" style="width:100%;height:300px"></canvas>
        </div>
        <el-empty v-else description="当前图表类型为表格" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, Delete } from '@element-plus/icons-vue';
import { reportAPI } from '@/api';

const reports = ref([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref('');
const dialogVisible = ref(false);
const resultVisible = ref(false);
const saving = ref(false);
const editing = ref({});
const meta = ref({ aggs: ['sum'], fieldWhitelist: {}, chartTypes: [] });
const resultData = ref(null);
const resultMode = ref('table');
const chartCanvas = ref(null);

const bizName = { order: '订单', finance: '财务', customer: '客户' };
const bizTag = { order: 'primary', finance: 'success', customer: 'warning' };
const chartName = { table: '表格', bar: '柱状图', pie: '饼图', line: '折线图' };
const aggName = { sum: '求和', count: '计数', avg: '平均', min: '最小', max: '最大' };
const ops = { eq: '等于', ne: '不等于', gt: '大于', gte: '≥', lt: '小于', lte: '≤', contains: '包含', in: '在列表', isNull: '为空' };

const form = reactive({
  name: '', bizType: 'order', groupBy: '', chartType: 'table', remark: '',
  measures: [{ field: 'totalAmount', agg: 'sum', alias: '金额合计' }],
  filters: [],
});

const fields = computed(() => meta.value.fieldWhitelist[form.bizType] || []);

function resetFields() {
  form.groupBy = '';
  form.measures = [{ field: fields.value[0] || '', agg: 'sum', alias: '' }];
  form.filters = [];
}

function measuresText(row) {
  try {
    const ms = typeof row.measures === 'string' ? JSON.parse(row.measures) : row.measures;
    return (ms || []).map((m) => `${m.agg}(${m.field})`).join(', ');
  } catch { return row.measures || ''; }
}

async function load() {
  loading.value = true;
  try {
    const data = await reportAPI.list({ page: page.value, pageSize, keyword: keyword.value });
    reports.value = data.list || [];
    total.value = data.total || 0;
  } finally { loading.value = false; }
}

function openDesigner(row) {
  editing.value = row || {};
  Object.assign(form, {
    name: row?.name || '', bizType: row?.bizType || 'order',
    groupBy: row?.groupBy || '', chartType: row?.chartType || 'table', remark: row?.remark || '',
  });
  if (row?.measures) { try { form.measures = JSON.parse(row.measures); } catch { form.measures = []; } }
  if (row?.filters) { try { form.filters = JSON.parse(row.filters); } catch { form.filters = []; } }
  else form.filters = [];
  if (!form.measures.length) form.measures = [{ field: fields.value[0] || '', agg: 'sum', alias: '' }];
  dialogVisible.value = true;
}

async function save() {
  if (!form.name.trim()) return ElMessage.warning('请填写报表名称');
  const payload = {
    name: form.name, bizType: form.bizType, groupBy: form.groupBy || null,
    measures: form.measures.filter((m) => m.field && m.agg),
    filters: form.filters.filter((f) => f.field && f.op),
    chartType: form.chartType, remark: form.remark,
  };
  if (!payload.measures.length) return ElMessage.warning('至少需要一个有效聚合指标');
  saving.value = true;
  try {
    if (editing.value.id) await reportAPI.update(editing.value.id, payload);
    else await reportAPI.create(payload);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function runReport(row) {
  resultData.value = await reportAPI.run(row.id);
  resultMode.value = 'table';
  resultVisible.value = true;
  // 图表模式
  if (resultData.value.chartType !== 'table') {
    setTimeout(() => drawChart(resultData.value), 200);
  }
}

function drawChart(data) {
  const canvas = chartCanvas.value;
  if (!canvas) return;
  const rows = data.rows || [];
  if (!rows.length) return;
  const labels = rows.map((r) => r.groupKey);
  const series = data.measures[0];
  const values = rows.map((r) => Number(r[series]) || 0);
  const ctx = canvas.getContext('2d');
  const W = canvas.width = 660, H = canvas.height = 300;
  ctx.clearRect(0, 0, W, H);
  const pad = { l: 60, r: 20, t: 30, b: 40 };
  const max = Math.max(...values, 1);
  const bw = (W - pad.l - pad.r) / Math.max(labels.length, 1);
  // 网格
  ctx.strokeStyle = '#e5e7eb'; ctx.fillStyle = '#6b7280'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ((H - pad.t - pad.b) * (1 - i / 4));
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillText(Math.round(max * i / 4), pad.l - 8, y + 4);
  }
  if (data.chartType === 'bar') {
    labels.forEach((lb, i) => {
      const h = (H - pad.t - pad.b) * (values[i] / max);
      const x = pad.l + bw * i + bw * 0.15;
      ctx.fillStyle = '#409eff';
      ctx.fillRect(x, H - pad.b - h, bw * 0.7, h);
      ctx.fillStyle = '#374151'; ctx.textAlign = 'center';
      ctx.fillText(lb, x + bw * 0.35, H - pad.b + 16);
      ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center';
      ctx.fillText(values[i], x + bw * 0.35, H - pad.b - h - 6);
    });
  } else if (data.chartType === 'line') {
    ctx.strokeStyle = '#409eff'; ctx.lineWidth = 2; ctx.beginPath();
    const stepX = (W - pad.l - pad.r) / Math.max(labels.length - 1, 1);
    labels.forEach((lb, i) => {
      const x = pad.l + stepX * i;
      const y = pad.t + (H - pad.t - pad.b) * (1 - values[i] / max);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      ctx.fillStyle = '#409eff'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.stroke();
    ctx.fillStyle = '#374151'; ctx.textAlign = 'center';
    labels.forEach((lb, i) => ctx.fillText(lb, pad.l + stepX * i, H - pad.b + 16));
  } else if (data.chartType === 'pie') {
    const cx = W / 2, cy = H / 2, R = 100;
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#9c27b0'];
    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      const a = (v / total) * Math.PI * 2;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, angle, angle + a); ctx.closePath(); ctx.fill();
      angle += a;
    });
    ctx.fillStyle = '#374151'; ctx.textAlign = 'left';
    labels.forEach((lb, i) => ctx.fillText(`${lb}: ${values[i]}`, W / 2 - R - 60, H - 10 + i * 14));
  }
}

async function toggle(row, val) {
  try {
    await reportAPI.update(row.id, { enabled: val });
    row.enabled = val;
    ElMessage.success(val ? '已启用' : '已停用');
  } catch { load(); }
}

async function removeReport(row) {
  await ElMessageBox.confirm(`确认删除报表「${row.name}」？`, '提示', { type: 'warning' });
  await reportAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

watch(resultMode, (m) => {
  if (m === 'chart' && resultData.value) setTimeout(() => drawChart(resultData.value), 150);
});

onMounted(async () => {
  meta.value = await reportAPI.meta();
  load();
});
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.tip { flex: 1 1 100%; }
.pager { margin-top: 12px; justify-content: flex-end; }
.muted { color: var(--el-text-color-secondary); }
.measures, .filters { width: 100%; }
.measure-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.result-mode { margin-bottom: 12px; }
</style>
