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

    <el-tabs v-model="tab" class="detail-tabs">
      <el-tab-pane label="客户信息" name="info">
        <el-descriptions :column="3" border class="page-card">
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
import { customerAPI, customerFollowsAPI, createCustomerFollowAPI, updateCustomerFollowAPI, deleteCustomerFollowAPI } from '@/api';
import { CUSTOMER_TYPE, dictText } from '@/utils/dicts';

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

onMounted(load);
</script>

<style scoped>
.follow-card { border: 1px solid var(--el-border-color-light); }
.follow-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.follow-content { color: var(--el-text-color-regular); white-space: pre-wrap; }
.follow-ops { margin-left: auto; }
.next { font-size: 12px; color: var(--el-text-color-secondary); }
.overdue { color: var(--el-color-danger); font-weight: 600; }
</style>