<template>
  <div class="wrap">
    <div class="page-head">
      <span class="page-title">预算管理</span>
      <div class="head-filters">
        <el-select v-model="filters.year" placeholder="年度" clearable style="width:110px" @change="load">
          <el-option v-for="y in yearOptions" :key="y" :label="y" :value="y" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width:110px" @change="load">
          <el-option label="草稿" value="draft" />
          <el-option label="已生效" value="approved" />
          <el-option label="已归档" value="closed" />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建预算</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="name" label="预算名称" min-width="180" />
      <el-table-column prop="period" label="期间" width="110" />
      <el-table-column label="方向" width="90">
        <template #default="{ row }">{{ row.direction === 'revenue' ? '收入' : '成本' }}</template>
      </el-table-column>
      <el-table-column prop="department" label="部门" width="120">
        <template #default="{ row }">{{ row.department || '-' }}</template>
      </el-table-column>
      <el-table-column label="预算总额" width="130" align="right">
        <template #default="{ row }">{{ money(row.plannedTotal) }}</template>
      </el-table-column>
      <el-table-column prop="lineCount" label="科目数" width="80" align="center" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="版本" prop="version" width="70" align="center" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
          <el-button v-if="row.status === 'draft'" link type="success" @click="transition(row.id, 'approved', row.name)">生效</el-button>
          <el-button v-if="row.status === 'approved'" link type="warning" @click="transition(row.id, 'closed', row.name)">归档</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建预算 -->
    <el-dialog v-model="createVisible" title="新建预算" width="720px" top="6vh">
      <el-form ref="createForm" :model="form" label-width="90px">
        <div class="grid2">
          <el-form-item label="预算名称" required><el-input v-model="form.name" placeholder="如：2026年度收入预算" /></el-form-item>
          <el-form-item label="年度" required><el-input-number v-model="form.year" :min="2024" :max="2035" style="width:100%" /></el-form-item>
          <el-form-item label="期间类型" required>
            <el-select v-model="form.periodType" @change="onPeriodType" style="width:100%">
              <el-option label="年度" value="year" /><el-option label="季度" value="quarter" /><el-option label="月度" value="month" />
            </el-select>
          </el-form-item>
          <el-form-item label="期间" required>
            <el-select v-model="form.period" filterable style="width:100%">
              <el-option v-for="p in periodOptions" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="预算方向"><el-radio-group v-model="form.direction"><el-radio value="revenue">收入</el-radio><el-radio value="cost">成本</el-radio></el-radio-group></el-form-item>
          <el-form-item label="部门">
            <el-select v-model="form.departmentId" clearable placeholder="不限" style="width:100%">
              <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="备注"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
        <el-divider content-position="left">预算科目</el-divider>
        <div v-for="(ln, i) in form.lines" :key="i" class="line-row">
          <el-select v-model="ln.category" placeholder="费用类别" style="width:160px">
            <el-option v-for="c in BUDGET_CATEGORIES" :key="c.key" :label="c.label" :value="c.key" />
          </el-select>
          <el-input-number v-model="ln.amount" :min="0" :precision="2" :controls="false" placeholder="金额" style="width:160px" />
          <el-button link type="danger" :icon="Delete" @click="form.lines.splice(i, 1)" />
        </div>
        <el-button link type="primary" :icon="Plus" @click="form.lines.push({ category: 'ocean_freight', amount: 0 })">添加科目</el-button>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" size="78%" :title="detail ? detail.name : ''">
      <div v-if="detail" class="detail">
        <div class="detail-head">
          <el-tag :type="statusType(detail.status)" size="small">{{ statusText(detail.status) }}</el-tag>
          <span class="dl">{{ detail.period }} · {{ detail.direction === 'revenue' ? '收入' : '成本' }}预算 · V{{ detail.version }}</span>
          <span class="dl" v-if="detail.department">部门：{{ detail.department }}</span>
          <div class="spacer" />
          <el-button v-if="detail.status === 'approved'" type="warning" size="small" @click="openAdjust">发起调整</el-button>
        </div>

        <div class="stat-row">
          <div class="stat"><div class="v">{{ money(detail.summary.plannedTotal) }}</div><div class="k">预算总额</div></div>
          <div class="stat"><div class="v">{{ money(detail.summary.actualTotal) }}</div><div class="k">实际执行</div></div>
          <div class="stat"><div class="v" :class="{ bad: detail.summary.overallRate > 100 }">{{ detail.summary.overallRate }}%</div><div class="k">执行率</div></div>
          <div class="stat"><div class="v" :class="{ bad: detail.summary.actualTotal > detail.summary.plannedTotal }">{{ money(detail.summary.plannedTotal - detail.summary.actualTotal) }}</div><div class="k">结余/缺口</div></div>
        </div>

        <el-tabs v-model="tab">
          <el-tab-pane label="明细与执行" name="exec">
            <el-table :data="detail.lines" border size="small">
              <el-table-column label="科目"><template #default="{ row }">{{ row.categoryLabel }}</template></el-table-column>
              <el-table-column label="方向" width="80"><template #default="{ row }">{{ row.direction === 'revenue' ? '收入' : '成本' }}</template></el-table-column>
              <el-table-column label="预算额" align="right"><template #default="{ row }">{{ money(row.planned) }}</template></el-table-column>
              <el-table-column label="实际" align="right"><template #default="{ row }">{{ money(row.actual) }}</template></el-table-column>
              <el-table-column label="执行率" width="140">
                <template #default="{ row }">
                  <el-progress :percentage="Math.min(row.execRate, 100)" :status="row.overBudget ? 'exception' : ''" :stroke-width="12" />
                  <span class="rate" :class="{ bad: row.overBudget }">{{ row.execRate }}%</span>
                </template>
              </el-table-column>
              <el-table-column label="差异" align="right"><template #default="{ row }">{{ money(row.variance) }}</template></el-table-column>
              <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.overBudget ? 'danger' : 'success'" size="small">{{ row.overBudget ? '超预算' : '正常' }}</el-tag></template></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="`调整(${detail.adjustments.length})`" name="adj">
            <el-table :data="detail.adjustments" border size="small">
              <el-table-column label="科目"><template #default="{ row }">{{ budgetCategoryLabel(row.category) }}</template></el-table-column>
              <el-table-column label="调整额" align="right"><template #default="{ row }">{{ money(row.amount) }}</template></el-table-column>
              <el-table-column prop="reason" label="原因" min-width="160" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }"><el-tag :type="adjType(row.status)" size="small">{{ adjText(row.status) }}</el-tag></template>
              </el-table-column>
              <el-table-column label="操作" width="150" v-if="hasBudgetPower">
                <template #default="{ row }">
                  <template v-if="row.status === 'pending'">
                    <el-button link type="success" size="small" @click="review(row, true)">批准</el-button>
                    <el-button link type="danger" size="small" @click="review(row, false)">驳回</el-button>
                  </template>
                  <span v-else>-</span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>

    <!-- 调整弹窗 -->
    <el-dialog v-model="adjVisible" title="发起预算调整" width="460px" top="20vh">
      <el-form label-width="80px">
        <el-form-item label="科目"><el-select v-model="adjForm.category"><el-option v-for="c in BUDGET_CATEGORIES" :key="c.key" :label="c.label" :value="c.key" /></el-select></el-form-item>
        <el-form-item label="方向"><el-radio-group v-model="adjForm.direction"><el-radio value="revenue">收入</el-radio><el-radio value="cost">成本</el-radio></el-radio-group></el-form-item>
        <el-form-item label="调整额"><el-input-number v-model="adjForm.amount" style="width:100%" :controls="false" /></el-form-item>
        <el-form-item label="原因" required><el-input v-model="adjForm.reason" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="adjVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitAdjust">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import { budgetAPI, BUDGET_CATEGORIES, budgetCategoryLabel } from '@/api/budget';
import { companyAPI } from '@/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const hasBudgetPower = auth.hasPermission('budget:update') || auth.hasPermission('budget:approve');

const loading = ref(false);
const list = ref([]);
const departments = ref([]);
const filters = reactive({ year: new Date().getFullYear(), status: '' });

const yearOptions = [];
for (let y = new Date().getFullYear(); y >= 2024; y -= 1) yearOptions.push(y);

const money = (n) => Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

const statusText = (s) => ({ draft: '草稿', approved: '已生效', closed: '已归档' }[s] || s);
const statusType = (s) => ({ draft: 'info', approved: 'success', closed: 'warning' }[s] || '');
const adjText = (s) => ({ pending: '待审批', approved: '已批准', rejected: '已驳回' }[s] || s);
const adjType = (s) => ({ pending: 'warning', approved: 'success', rejected: 'info' }[s] || '');

async function load() {
  loading.value = true;
  try { list.value = await budgetAPI.list(filters); }
  catch (e) { ElMessage.error(e?.response?.data?.message || '加载失败'); }
  finally { loading.value = false; }
}

function onPeriodType() {
  const y = form.year || new Date().getFullYear();
  if (form.periodType === 'year') { form.period = String(y); periodOptionsBy(y); }
  else if (form.periodType === 'quarter') { form.period = `${y}-Q1`; periodOptionsBy(y); }
  else { form.period = `${y}-01`; periodOptionsBy(y); }
}
let periodOptions = ref([]);
function periodOptionsBy(y) {
  const arr = [];
  if (form.periodType === 'year') arr.push(String(y));
  else if (form.periodType === 'quarter') for (let q = 1; q <= 4; q += 1) arr.push(`${y}-Q${q}`);
  else for (let m = 1; m <= 12; m += 1) arr.push(`${y}-${String(m).padStart(2, '0')}`);
  periodOptions.value = arr;
}

const createVisible = ref(false);
const saving = ref(false);
const form = reactive({ name: '', year: new Date().getFullYear(), periodType: 'year', period: '', direction: 'revenue', departmentId: null, description: '', lines: [{ category: 'ocean_freight', amount: 0 }] });
function openCreate() {
  Object.assign(form, { name: '', year: new Date().getFullYear(), periodType: 'year', direction: 'revenue', departmentId: null, description: '', lines: [{ category: 'ocean_freight', amount: 0 }] });
  onPeriodType();
  createVisible.value = true;
}
async function submitCreate() {
  if (!form.name) return ElMessage.warning('请输入预算名称');
  saving.value = true;
  try {
    await budgetAPI.create({ ...form, lines: form.lines.filter((l) => l.amount > 0) });
    ElMessage.success('预算已创建');
    createVisible.value = false;
    load();
  } catch (e) { ElMessage.error(e?.response?.data?.message || '创建失败'); }
  finally { saving.value = false; }
}

const detailVisible = ref(false);
const detail = ref(null);
const tab = ref('exec');
async function openDetail(id) {
  detailVisible.value = true;
  tab.value = 'exec';
  detail.value = null;
  try { detail.value = await budgetAPI.detail(id); }
  catch (e) { ElMessage.error(e?.response?.data?.message || '加载详情失败'); detailVisible.value = false; }
}

async function transition(id, target, name) {
  await ElMessageBox.confirm(`确认将「${name}」${target === 'approved' ? '生效' : '归档'}？`, '提示', { type: 'warning' });
  try { await budgetAPI.transition(id, target); ElMessage.success('操作成功'); load(); openDetail(id); }
  catch (e) { ElMessage.error(e?.response?.data?.message || '操作失败'); }
}

const adjVisible = ref(false);
const adjForm = reactive({ category: 'ocean_freight', direction: 'revenue', amount: 0, reason: '' });
function openAdjust() {
  Object.assign(adjForm, { category: 'ocean_freight', direction: detail.value?.direction || 'revenue', amount: 0, reason: '' });
  adjVisible.value = true;
}
async function submitAdjust() {
  if (!adjForm.reason) return ElMessage.warning('请填写调整原因');
  saving.value = true;
  try { await budgetAPI.createAdjustment(detail.value.id, { ...adjForm }); ElMessage.success('调整单已提交'); adjVisible.value = false; openDetail(detail.value.id); }
  catch (e) { ElMessage.error(e?.response?.data?.message || '提交失败'); }
  finally { saving.value = false; }
}
async function review(row, approve) {
  if (!approve) {
    const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回调整', { inputValidator: (v) => !!v || '必填' });
    await budgetAPI.reviewAdjustment(row.id, false, value);
  } else {
    await budgetAPI.reviewAdjustment(row.id, true);
  }
  ElMessage.success(approve ? '已批准' : '已驳回');
  openDetail(detail.value.id);
}

onMounted(async () => {
  load();
  try { const deps = await companyAPI.departments(); departments.value = Array.isArray(deps) ? deps : []; }
  catch { /* 部门可选 */ }
});
</script>

<style scoped>
.wrap { padding: 4px; }
.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
.page-title { font-size: 18px; font-weight: 700; }
.head-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.line-row { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.detail { display: flex; flex-direction: column; gap: 16px; }
.detail-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.detail-head .dl { color: var(--text-sub); font-size: 13px; }
.spacer { flex: 1; }
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.stat { background: var(--fill); border-radius: var(--radius); padding: 14px 16px; text-align: center; }
.stat .v { font-size: 20px; font-weight: 700; }
.stat .v.bad { color: #f56c6c; }
.stat .k { color: var(--text-sub); font-size: 12px; margin-top: 4px; }
.rate.bad { color: #f56c6c; font-weight: 600; }
@media (max-width: 640px) {
  .grid2 { grid-template-columns: 1fr; }
  .stat-row { grid-template-columns: repeat(2, 1fr); }
}
</style>