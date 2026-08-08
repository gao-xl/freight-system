<template>
  <div class="page-card">
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="按规则名称搜索" clearable style="width:220px" @keyup.enter="load" @clear="load" />
      <el-select v-model="enabledFilter" placeholder="启用状态" clearable style="width:130px" @change="load">
        <el-option label="启用" value="true" />
        <el-option label="停用" value="false" />
      </el-select>
      <el-button type="primary" @click="openRule()"><el-icon><Plus /></el-icon>新增规则</el-button>
      <el-button @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      <el-alert class="tip" type="info" :closable="false" show-icon
        title="业务规则引擎：把预警/自动化规则配置化，无需改代码。支持内置规则类型与表达式规则（字段白名单 + 运算符白名单，禁止 eval）。" />
    </div>

    <el-table :data="rules" v-loading="loading" stripe>
      <el-table-column prop="name" label="规则名称" min-width="200" show-overflow-tooltip />
      <el-table-column label="业务" width="90">
        <template #default="{row}">
          <el-tag size="small" :type="bizTag[row.bizType] || 'info'">{{ bizName[row.bizType] || row.bizType }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="规则类型" width="140">
        <template #default="{row}">
          <el-tag size="small" :type="row.ruleType === 'expr' ? 'warning' : 'primary'">
            {{ row.ruleType === 'expr' ? '表达式' : (ruleTypeName[row.ruleType] || row.ruleType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="触发" width="140">
        <template #default="{row}">
          <el-tag size="small" effect="plain">{{ triggerName[row.trigger] || row.trigger }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="条件/参数" min-width="180" show-overflow-tooltip>
        <template #default="{row}">{{ condText(row) }}</template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{row}">
          <el-switch :model-value="row.enabled" @change="(v) => toggle(row, v)" />
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="70" />
      <el-table-column label="操作" width="170" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="testRule(row)">测试</el-button>
          <el-button link type="primary" @click="openRule(row)">编辑</el-button>
          <el-button link type="danger" @click="removeRule(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" background layout="total, prev, pager, next" :total="total" :page-size="pageSize"
      v-model:current-page="page" @current-change="load" />

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editing.id ? '编辑规则' : '新增规则'" width="640px" destroy-on-close>
      <el-form :model="form" label-width="110px">
        <el-form-item label="规则名称" required>
          <el-input v-model="form.name" placeholder="如：订单金额超过 10 万预警" maxlength="100" />
        </el-form-item>
        <el-form-item label="业务类型" required>
          <el-select v-model="form.bizType" style="width:100%" @change="onBizChange">
            <el-option v-for="(v,k) in bizName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="规则类型" required>
          <el-radio-group v-model="form.ruleType" @change="onTypeChange">
            <el-radio label="expr">表达式</el-radio>
            <el-radio v-for="(v,k) in ruleTypeName" :key="k" :label="k">{{ v }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="触发方式">
          <el-select v-model="form.trigger" style="width:100%">
            <el-option v-for="t in meta.triggers" :key="t" :label="triggerName[t] || t" :value="t" />
          </el-select>
        </el-form-item>

        <!-- 表达式规则：条件编辑 -->
        <template v-if="form.ruleType === 'expr'">
          <el-form-item label="条件字段">
            <el-select v-model="cond.field" placeholder="选择字段" style="width:100%" filterable>
              <el-option v-for="f in (meta.fieldWhitelist[form.bizType] || [])" :key="f" :label="f" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="运算符">
            <el-select v-model="cond.op" style="width:100%">
              <el-option v-for="(v,k) in ops" :key="k" :label="v" :value="k" />
            </el-select>
          </el-form-item>
          <el-form-item label="值">
            <el-input v-model="cond.value" placeholder="与字段匹配（between 用逗号分隔两个日期，in 用逗号分隔多个值）" />
          </el-form-item>
        </template>

        <!-- 内置执行器规则：参数 -->
        <template v-else>
          <el-form-item label="参数(JSON)">
            <el-input v-model="form.paramsText" type="textarea" :rows="2" placeholder='如内置"订单金额超限"规则：{"threshold":100000}' />
          </el-form-item>
        </template>

        <el-form-item label="动作(JSON)">
          <el-input v-model="form.actionText" type="textarea" :rows="3"
            placeholder='{"level":"warning","title":"自定义标题","message":"订单 {orderNo} 触发规则"}' />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" />
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { businessRuleAPI } from '@/api';

const rules = ref([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref('');
const enabledFilter = ref('');
const dialogVisible = ref(false);
const saving = ref(false);
const editing = ref({});
const meta = ref({ triggers: ['cron'], fieldWhitelist: {}, bizTypes: [] });
const bizName = { order: '订单', finance: '财务', booking: '订舱', customs: '报关', customer: '客户' };
const bizTag = { order: 'primary', finance: 'success', booking: 'warning', customs: 'danger', customer: 'info' };
const ruleTypeName = {
  order_amount_over: '订单金额超限',
  eta_soon: 'ETA 临近',
  overdue_receivable: '超期应收',
};
const triggerName = {
  cron: '定时扫描',
  'order.created': '事件:订单创建',
  'order.updated': '事件:订单更新',
  'finance.created': '事件:财务新增',
  'finance.updated': '事件:财务更新',
  'booking.shipped': '事件:订舱装船',
};
const ops = {
  eq: '等于', ne: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于',
  contains: '包含', in: '在列表中', isNull: '为空', between: '在区间',
};

const form = reactive({ name: '', bizType: 'order', ruleType: 'expr', trigger: 'cron', paramsText: '', actionText: '', sortOrder: 0, remark: '' });
const cond = reactive({ field: '', op: 'gt', value: '' });

async function load() {
  loading.value = true;
  try {
    const data = await businessRuleAPI.list({ page: page.value, pageSize, keyword: keyword.value, enabled: enabledFilter.value });
    rules.value = data.list || [];
    total.value = data.total || 0;
  } finally { loading.value = false; }
}

function condText(row) {
  if (row.ruleType === 'expr') {
    try { const c = JSON.parse(row.condition); return `${c.field} ${c.op} ${JSON.stringify(c.value)}`; } catch { return row.condition; }
  }
  try { return row.params ? JSON.stringify(JSON.parse(row.params)) : '-'; } catch { return row.params || '-'; }
}

function onBizChange() { cond.field = ''; }
function onTypeChange() {}

function openRule(row) {
  editing.value = row || {};
  Object.assign(form, {
    name: row?.name || '', bizType: row?.bizType || 'order', ruleType: row?.ruleType || 'expr',
    trigger: row?.trigger || 'cron', sortOrder: row?.sortOrder || 0, remark: row?.remark || '',
  });
  if (row?.ruleType === 'expr' && row.condition) {
    try { Object.assign(cond, JSON.parse(row.condition)); } catch { Object.assign(cond, { field: '', op: 'gt', value: '' }); }
  } else {
    Object.assign(cond, { field: '', op: 'gt', value: '' });
  }
  form.paramsText = row?.params ? (typeof row.params === 'string' ? row.params : JSON.stringify(row.params)) : '';
  form.actionText = row?.action ? (typeof row.action === 'string' ? row.action : JSON.stringify(row.action)) : '';
  dialogVisible.value = true;
}

async function save() {
  if (!form.name.trim()) return ElMessage.warning('请填写规则名称');
  const payload = {
    name: form.name, bizType: form.bizType, ruleType: form.ruleType, trigger: form.trigger,
    sortOrder: form.sortOrder, remark: form.remark,
  };
  if (form.ruleType === 'expr') {
    if (!cond.field || !cond.op) return ElMessage.warning('请选择条件字段与运算符');
    payload.condition = JSON.stringify({ field: cond.field, op: cond.op, value: cond.value });
  } else {
    if (form.paramsText && form.paramsText.trim()) {
      try { JSON.parse(form.paramsText); } catch { return ElMessage.warning('参数不是合法 JSON'); }
      payload.params = form.paramsText;
    }
  }
  if (form.actionText && form.actionText.trim()) {
    try { JSON.parse(form.actionText); } catch { return ElMessage.warning('动作不是合法 JSON'); }
    payload.action = form.actionText;
  }
  saving.value = true;
  try {
    if (editing.value.id) await businessRuleAPI.update(editing.value.id, payload);
    else await businessRuleAPI.create(payload);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function toggle(row, val) {
  try {
    await businessRuleAPI.update(row.id, { ...row, enabled: val });
    row.enabled = val;
    ElMessage.success(val ? '已启用' : '已停用');
  } catch { load(); }
}

async function testRule(row) {
  await businessRuleAPI.test(row.id);
  ElMessage.success('执行完成，请到预警中心查看结果');
}

async function removeRule(row) {
  await ElMessageBox.confirm(`确认删除规则「${row.name}」？`, '提示', { type: 'warning' });
  await businessRuleAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(async () => {
  meta.value = await businessRuleAPI.meta();
  load();
});
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.tip { flex: 1 1 100%; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
