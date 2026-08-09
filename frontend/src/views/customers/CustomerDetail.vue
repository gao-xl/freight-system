<template>
  <div v-if="detail">
    <div class="page-card header-card">
      <div class="head-left">
        <el-button link @click="$router.back()"><el-icon><ArrowLeft /></el-icon></el-button>
        <div>
          <h2 class="hd-title">{{ detail.name }}</h2>
          <span class="hd-sub">{{ detail.code }} · {{ dictText(CUSTOMER_TYPE, detail.type) }} · {{ detail.contact || '无联系人' }} {{ detail.phone || '' }}</span>
        </div>
      </div>
      <div class="head-right">
        <el-tag :type="levelTag(detail.level)" size="large">{{ detail.level }} 级</el-tag>
        <el-tag :type="detail.status === 'active' ? 'success' : 'info'">{{ detail.status === 'active' ? '启用' : '停用' }}</el-tag>
        <el-button type="primary" @click="openFollowDialog()"><el-icon><Plus /></el-icon>新增跟进</el-button>
      </div>
    </div>

    <!-- N4 客户360° 经营概览 -->
    <div class="page-card" v-if="ov" style="margin-bottom:16px">
      <div class="ov-title">经营概览（实时聚合）</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">订单总数</div><div class="value">{{ ov.orderStats.total }}</div><div class="sub">在途 {{ ov.orderStats.inProgress }} · 完成 {{ ov.orderStats.completed }}</div></div>
        <div class="stat-card" style="border-color:var(--danger)"><div class="label">应收未收</div><div class="value" style="color:var(--danger)">{{ money(ov.finance.receivableBalance) }}</div><div class="sub">应收 {{ money(ov.finance.receivable) }} · 已收 {{ money(ov.finance.received) }}</div></div>
        <div class="stat-card" :style="{ borderColor: ov.credit.overLimit ? 'var(--danger)' : 'var(--success)' }">
          <div class="label">信用额度使用</div>
          <div class="value" :style="{ color: ov.credit.overLimit ? 'var(--danger)' : 'var(--success)' }">{{ money(ov.credit.used) }} / {{ money(ov.credit.limit) }}</div>
          <div class="sub">{{ ov.credit.overLimit ? `已超限 ${money(ov.credit.used - ov.credit.limit)}` : `剩余额度 ${money(ov.credit.remaining)}` }}</div>
        </div>
        <div class="stat-card"><div class="label">跟进记录</div><div class="value">{{ ov.followCount }}</div><div class="sub">报价 {{ ov.quotes.length }} 条 · 发票 {{ ov.invoices.length }} 条</div></div>
      </div>
      <el-row :gutter="12" style="margin-top:12px">
        <el-col :span="12">
          <div class="ov-sub">最近发票</div>
          <el-table :data="ov.invoices" size="small" max-height="180">
            <el-table-column prop="invoiceNo" label="发票号" min-width="140" />
            <el-table-column label="金额" width="120" align="right"><template #default="{ row }">{{ row.currency }} {{ money(row.totalAmount) }}</template></el-table-column>
            <el-table-column label="状态" width="90"><template #default="{ row }">{{ INV_STATUS[row.status]?.text || row.status }}</template></el-table-column>
          </el-table>
        </el-col>
        <el-col :span="12">
          <div class="ov-sub">最近报价</div>
          <el-table :data="ov.quotes" size="small" max-height="180">
            <el-table-column prop="quoteNo" label="报价单号" min-width="140" />
            <el-table-column label="金额" width="120" align="right"><template #default="{ row }">{{ row.currency }} {{ money(row.totalAmount) }}</template></el-table-column>
            <el-table-column label="状态" width="90"><template #default="{ row }">{{ dictText(QUOTATION_STATUS, row.status) }}</template></el-table-column>
          </el-table>
        </el-col>
      </el-row>
    </div>

    <el-tabs v-model="tab" class="detail-tabs">
      <el-tab-pane label="客户信息" name="info">
        <el-descriptions :column="cols" border class="page-card">
          <el-descriptions-item label="客户编码">{{ detail.code }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ detail.name }}</el-descriptions-item>
          <el-descriptions-item label="简称">{{ detail.shortName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="客户类型">{{ dictText(CUSTOMER_TYPE, detail.type) }}</el-descriptions-item>
          <el-descriptions-item label="客户等级">{{ detail.level }} 级</el-descriptions-item>
          <el-descriptions-item label="信用额度">{{ detail.creditLimit || 0 }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ detail.contact || '-' }}</el-descriptions-item>
          <el-descriptions-item label="电话">{{ detail.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ detail.email || '-' }}</el-descriptions-item>
          <el-descriptions-item label="税号">{{ detail.taxNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最近跟进">{{ detail.lastFollowAt ? formatDate(detail.lastFollowAt) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="下次跟进">
            <span :class="{ overdue: isOverdue(detail.nextFollowAt) }">{{ detail.nextFollowAt ? formatDate(detail.nextFollowAt) : '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="业务范围" :span="3">{{ detail.businessScope || '-' }}</el-descriptions-item>
          <el-descriptions-item label="地址" :span="3">{{ detail.address || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <el-tab-pane :label="`跟进记录(${follows.length})`" name="follow">
        <div class="page-card">
          <div class="table-topbar">
            <el-button type="primary" size="small" @click="openFollowDialog()"><el-icon><Plus /></el-icon>新增跟进</el-button>
            <el-button size="small" @click="loadFollows"><el-icon><Refresh /></el-icon>刷新</el-button>
          </div>
          <el-timeline>
            <el-timeline-item v-for="f in follows" :key="f.id"
              :timestamp="formatDate(f.createdAt) + (f.operator ? ' · ' + f.operator.name : '')"
              placement="top" :type="followType(f.type)">
              <el-card shadow="never" class="follow-card">
                <div class="follow-head">
                  <el-tag size="small" :type="followType(f.type)">{{ dictText(FOLLOW_TYPE, f.type) }}</el-tag>
                  <el-tag size="small" :type="f.status === 'open' ? 'warning' : 'success'">{{ f.status === 'open' ? '待跟进' : '已闭环' }}</el-tag>
                  <span v-if="f.nextFollowAt" class="next">下次跟进：<span :class="{ overdue: isOverdue(f.nextFollowAt) }">{{ formatDate(f.nextFollowAt) }}</span></span>
                  <div class="follow-ops">
                    <el-button link type="primary" size="small" @click="openFollowDialog(f)">编辑</el-button>
                    <el-button link type="danger" size="small" @click="removeFollow(f)">删除</el-button>
                  </div>
                </div>
                <div class="follow-content">{{ f.content }}</div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-if="!follows.length" description="暂无跟进记录" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增/编辑跟进弹窗 -->
    <el-dialog v-model="followDialogVisible" :title="followForm.id ? '编辑跟进' : '新增跟进'" width="560px" destroy-on-close>
      <el-form :model="followForm" label-width="90px">
        <el-form-item label="跟进方式">
          <el-select v-model="followForm.type" style="width:100%">
            <el-option v-for="(t, k) in FOLLOW_TYPE" :key="k" :label="t" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进内容" required>
          <el-input v-model="followForm.content" type="textarea" :rows="4" placeholder="记录本次沟通内容、客户需求、反馈等" />
        </el-form-item>
        <el-form-item label="下次跟进">
          <el-date-picker v-model="followForm.nextFollowAt" type="datetime" placeholder="选择下次跟进时间" style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
        <el-form-item label="跟进状态">
          <el-radio-group v-model="followForm.status">
            <el-radio value="done">已闭环</el-radio>
            <el-radio value="open">待跟进</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="followDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveFollow">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerAPI, customerOverviewAPI, customerFollowsAPI, createCustomerFollowAPI, updateCustomerFollowAPI, deleteCustomerFollowAPI } from '@/api';
import { CUSTOMER_TYPE, QUOTATION_STATUS, dictText, money } from '@/utils/dicts';
import { useResponsiveColumns } from '@/composables/useResponsive';

// N4 客户360° 经营概览
const ov = ref(null);
const INV_STATUS = {
  draft: { text: '草稿', type: 'info' }, issued: { text: '已开票', type: 'success' },
  paid: { text: '已核销', type: 'primary' }, cancelled: { text: '已作废', type: 'danger' },
};
async function loadOverview() {
  try { ov.value = await customerOverviewAPI(route.params.id); } catch { ov.value = null; }
}

const cols = useResponsiveColumns(3, 1);

const FOLLOW_TYPE = { call: '电话', visit: '拜访', email: '邮件', wechat: '微信', quotation: '报价', order: '订单', meeting: '会议', other: '其他' };

const route = useRoute();
const detail = ref(null);
const follows = ref([]);
const tab = ref('info');
const saving = ref(false);
const followDialogVisible = ref(false);
const followForm = ref({});

const levelTag = (l) => ({ A: 'danger', B: 'warning', C: 'primary', D: 'info' }[l] || 'info');
const followType = (t) => ({ call: 'primary', visit: 'success', email: 'info', wechat: 'warning', quotation: 'danger', order: 'danger', meeting: 'primary', other: 'info' }[t] || 'info');
const formatDate = (d) => (d ? String(d).replace('T', ' ').slice(0, 16) : '-');
const isOverdue = (d) => d && new Date(d).getTime() < Date.now();

async function load() {
  detail.value = await customerAPI.get(route.params.id);
  await loadFollows();
}
async function loadFollows() {
  follows.value = await customerFollowsAPI(route.params.id);
}
function openFollowDialog(row) {
  followForm.value = row
    ? { ...row, nextFollowAt: row.nextFollowAt ? String(row.nextFollowAt).replace('T', ' ').slice(0, 19) : null }
    : { type: 'call', status: 'done', nextFollowAt: null, content: '' };
  followDialogVisible.value = true;
}
async function saveFollow() {
  if (!followForm.value.content) return ElMessage.warning('请填写跟进内容');
  saving.value = true;
  try {
    if (followForm.value.id) await updateCustomerFollowAPI(followForm.value.id, followForm.value);
    else await createCustomerFollowAPI(route.params.id, followForm.value);
    ElMessage.success('保存成功');
    followDialogVisible.value = false;
    await load();
  } finally { saving.value = false; }
}
async function removeFollow(row) {
  await ElMessageBox.confirm('确认删除该跟进记录？', '提示', { type: 'warning' });
  await deleteCustomerFollowAPI(row.id);
  ElMessage.success('已删除');
  await load();
}

onMounted(() => { load(); loadOverview(); });
</script>

<style scoped>
.header-card { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.head-left > div { min-width: 0; }
.hd-title { margin: 0; font-size: 20px; overflow-wrap: break-word; }
.hd-sub { color: var(--text-sub); font-size: 13px; display: block; }
.head-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.detail-tabs { background: #fff; border-radius: var(--radius); padding: 8px 20px 20px; box-shadow: var(--shadow-sm); }
.follow-card { border: 1px solid var(--el-border-color-light); }
.follow-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.follow-content { color: var(--el-text-color-regular); white-space: pre-wrap; }
.follow-ops { margin-left: auto; }
.next { font-size: 12px; color: var(--el-text-color-secondary); }
.overdue { color: var(--el-color-danger); font-weight: 600; }
.ov-title { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.ov-sub { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--el-text-color-primary); }
.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.stat-card { background: var(--el-fill-color-blank); border: 1px solid var(--el-border-color-light); border-left: 3px solid var(--el-color-primary); border-radius: 6px; padding: 10px 12px; }
.stat-card .label { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px; }
.stat-card .value { font-size: 18px; font-weight: 700; }
.stat-card .sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }

/* 窄屏适配：头部堆叠、尾随操作换行 */
@media (max-width: 768px) {
  .header-card { flex-direction: column; align-items: flex-start; gap: 10px; }
  .head-right { width: 100%; justify-content: space-between; }
  .detail-tabs { padding: 8px 12px 12px; }
  .follow-head { gap: 6px; }
  .follow-ops { margin-left: 0; width: 100%; display: flex; justify-content: flex-end; }
}
</style>