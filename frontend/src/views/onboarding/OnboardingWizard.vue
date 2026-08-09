<template>
  <div class="wizard-page">
    <div class="wizard-box">
      <div class="wizard-head">
        <div class="wizard-logo"><img src="/icons/icon-192.svg" alt="货代管理系统" /></div>
        <h2>{{ page === 0 ? '配置你的货代系统' : currentStep.title }}</h2>
        <p class="wizard-sub">{{ page === 0 ? '从建客户到开票，一个系统跑通全部业务。约 3 分钟完成初始化。' : currentStep.desc }}</p>
      </div>

      <!-- 步骤条（欢迎页不显示） -->
      <el-steps v-if="page > 0" :active="page - 1" align-center finish-status="success" class="wizard-steps">
        <el-step v-for="s in steps" :key="s.id" :title="s.label" />
      </el-steps>

      <!-- 欢迎页 -->
      <div v-if="page === 0" class="wizard-body welcome-body">
        <div class="welcome-feature"><el-icon><Ship /></el-icon><span>客户 → 报价 → 订单 → 订舱 → 报关，一条链路跑通</span></div>
        <div class="welcome-feature"><el-icon><CircleCheck /></el-icon><span>所有步骤可跳过，随时进入系统自己探索</span></div>
        <div class="welcome-feature"><el-icon><MagicStick /></el-icon><span>支持一键生成示例数据，零风险体验完整流程</span></div>
      </div>

      <WizardPassword v-else-if="currentStep.id === 'password'" :model="pwd" />
      <WizardCompany v-else-if="currentStep.id === 'company'" :model="company" />
      <WizardCurrency v-else-if="currentStep.id === 'currency'" :model="currency" />
      <WizardUsage v-else-if="currentStep.id === 'usage'" v-model="usage" />
      <WizardData v-else-if="currentStep.id === 'data'" v-model="prepare" :loading="demoLoading" @choose="choosePrepare" />

      <!-- 底部操作 -->
      <div class="wizard-foot">
        <el-button v-if="page > 1" text @click="prev">上一步</el-button>
        <div class="wizard-foot-right">
          <template v-if="page === 0">
            <el-button text type="info" @click="finish(true)">直接进入系统</el-button>
            <el-button type="primary" @click="page = 1">开始配置</el-button>
          </template>
          <template v-else>
            <el-button text type="info" @click="skip">跳过</el-button>
            <el-button v-if="currentStep.id !== 'data'" type="primary" :loading="saving" :disabled="!canProceed" @click="goNext">
              {{ currentStep.id === 'password' || currentStep.id === 'company' ? '保存并继续' : '下一步' }}
            </el-button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Ship, CircleCheck, MagicStick } from '@element-plus/icons-vue';
import WizardPassword from '@/components/onboarding/WizardPassword.vue';
import WizardCompany from '@/components/onboarding/WizardCompany.vue';
import WizardCurrency from '@/components/onboarding/WizardCurrency.vue';
import WizardUsage from '@/components/onboarding/WizardUsage.vue';
import WizardData from '@/components/onboarding/WizardData.vue';
import { companyProfileAPI, changePasswordAPI, loginAPI } from '@/api';
import { getSystemDefaults, saveSystemDefaults, generateDemoData, markWizardDone } from '@/api/onboarding';
import { useAuthStore } from '@/stores/auth';
import { useOnboardingStore } from '@/stores/onboarding';
import { track } from '@/utils/track';

const router = useRouter();
const auth = useAuthStore();
const onboarding = useOnboardingStore();

const DRAFT_KEY = 'onboarding.draft';
const page = ref(0);
const saving = ref(false);
const demoLoading = ref(false);
const pwd = reactive({ oldPassword: '', newPassword: '', confirm: '' });
const company = reactive({ companyName: '', contact: '', phone: '' });
const currency = reactive({ defaultCurrency: 'CNY' });
const usage = ref('personal');
const prepare = ref('manual');

const steps = computed(() => {
  const list = [];
  if (auth.user?.mustChangePassword) list.push({ id: 'password', label: '改密', title: '设置管理员密码', desc: '系统默认管理员账号已初始化，请设置新密码后继续。' });
  list.push(
    { id: 'company', label: '公司', title: '公司信息', desc: '公司全称会显示在报价单、对账单等单据上。' },
    { id: 'currency', label: '币种', title: '默认币种', desc: '单据金额将按默认币种显示，可后续在设置中修改。' },
    { id: 'usage', label: '使用方式', title: '你的使用方式', desc: '选择个人使用，或与同事一起协作。' },
    { id: 'data', label: '数据准备', title: '准备好开始了吗？', desc: '空系统也可以直接开始；或先生成示例数据看看系统跑起来的样子。' }
  );
  return list;
});
const currentStep = computed(() => steps.value[page.value - 1] || {});

const canProceed = computed(() => {
  const id = currentStep.value.id;
  if (id === 'password') {
    return pwd.newPassword.length >= 8 && /[a-zA-Z]/.test(pwd.newPassword) && /\d/.test(pwd.newPassword) && pwd.confirm === pwd.newPassword && !!pwd.oldPassword;
  }
  if (id === 'company') return !!company.companyName.trim(); // AC-03：全称为空禁用下一步
  return true;
});

/* ---- 草稿：断网/刷新本地暂存（AC 离线） ---- */
function persistDraft() {
  if (page.value === 0) return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    page: page.value, company: { ...company }, defaultCurrency: currency.defaultCurrency, usage: usage.value,
  }));
}
watch([page, company, currency, usage], persistDraft, { deep: true });

/* ---- 步骤动作 ---- */
function prev() { if (page.value > 1) page.value -= 1; }
function skip() { // AC-02：任意步跳过 → 下一步；最后一步跳过直达系统
  if (page.value >= steps.value.length) return finish(true);
  page.value += 1;
}
async function goNext() {
  const id = currentStep.value.id;
  if (id === 'password') return savePassword();
  if (id === 'company') return saveCompany();
  if (id === 'currency') return saveCurrency();
  if (id === 'usage') { onboarding.setUsage(usage.value); page.value += 1; return; }
  page.value += 1;
}

async function savePassword() {
  saving.value = true;
  try {
    await changePasswordAPI({ oldPassword: pwd.oldPassword, newPassword: pwd.newPassword });
    // 改密成功 → token 失效 → 无缝重登续期
    const data = await loginAPI({ username: auth.user.username, password: pwd.newPassword });
    auth.token = data.token; auth.user = data.user;
    localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user));
    track('onboarding_password_changed');
    ElMessage.success('密码已更新');
    page.value += 1;
  } catch { /* 接口已弹错误 */ } finally { saving.value = false; }
}

async function saveCompany() {
  saving.value = true;
  try {
    await companyProfileAPI.save({ companyName: company.companyName.trim(), contact: company.contact, phone: company.phone });
    track('onboarding_company_saved');
    page.value += 1;
  } catch { /* 失败停留本步 */ } finally { saving.value = false; }
}

async function saveCurrency() {
  saving.value = true;
  try {
    await saveSystemDefaults({ defaultCurrency: currency.defaultCurrency });
    track('onboarding_currency_saved', { currency: currency.defaultCurrency });
  } catch { /* 接口未就绪：默认币种本地暂存，不阻塞 */ }
  finally {
    saving.value = false;
    page.value += 1;
  }
}

async function choosePrepare(mode) {
  if (mode === 'manual') { track('onboarding_prepare_manual'); return finish(false); }
  if (mode === 'import') { track('onboarding_prepare_import'); finish(false); router.push('/import'); return; }
  // demo：确认后生成（AC-11/13）
  try {
    await ElMessageBox.confirm('将创建 3 个客户、3 条报价、2 票订单、1 个订舱、1 条报关、1 份运价表。正式数据不受影响，可随时一键清空。', '生成示例数据？', { confirmButtonText: '生成', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  demoLoading.value = true;
  try {
    await generateDemoData();
    track('onboarding_demo_created');
    ElMessage.success('示例数据已生成，可到订单列表查看系统全貌。');
    finish(false);
  } catch { ElMessage.error('示例数据生成失败，请稍后重试。'); }
  finally { demoLoading.value = false; }
}

function finish(skipped) {
  if (skipped) onboarding.skipWizard();
  else onboarding.finishWizard();
  track(skipped ? 'onboarding_wizard_skipped' : 'onboarding_wizard_finish');
  markWizardDone();
  localStorage.removeItem(DRAFT_KEY);
  router.push('/dashboard');
}

onMounted(async () => {
  if (onboarding.flags.wizardFinished) return router.replace('/dashboard');
  // 恢复草稿
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.page > 0 && d.page <= steps.value.length) {
      page.value = d.page;
      Object.assign(company, d.company || {});
      currency.defaultCurrency = d.defaultCurrency || 'CNY';
      usage.value = d.usage || 'personal';
    }
  } catch { /* 草稿损坏忽略 */ }
  // 回填已有公司信息 / 默认币种
  try {
    const profile = await companyProfileAPI.get();
    if (profile?.companyName) Object.assign(company, { companyName: profile.companyName, contact: profile.contact || '', phone: profile.phone || '' });
  } catch { /* 未配置 */ }
  try {
    const defaults = await getSystemDefaults();
    if (defaults?.defaultCurrency) currency.defaultCurrency = defaults.defaultCurrency;
  } catch { /* 默认 CNY */ }
});
</script>

<style scoped>
.wizard-page {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-page); padding: 24px;
}
.wizard-box {
  width: 100%; max-width: 480px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 32px;
  box-shadow: var(--shadow-md);
}
.wizard-head { text-align: center; margin-bottom: 16px; }
.wizard-logo { margin-bottom: 12px; }
.wizard-logo img { width: 48px; height: 48px; }
.wizard-head h2 { font-size: 22px; font-weight: 600; margin: 0 0 6px; color: var(--text-main); letter-spacing: -0.01em; }
.wizard-sub { font-size: 13px; color: var(--text-sub); margin: 0; line-height: 1.7; }
.wizard-steps { margin: 20px 0 8px; }
.wizard-body { min-height: 200px; }
.welcome-body { display: flex; flex-direction: column; gap: 12px; padding-top: 20px; }
.welcome-feature { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text-main); }
.welcome-feature .el-icon { color: var(--brand); font-size: 18px; flex-shrink: 0; }
.wizard-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--border);
}
.wizard-foot-right { display: flex; gap: 10px; align-items: center; }
@media (max-width: 520px) {
  .wizard-box { padding: 24px 18px 20px; }
  .wizard-foot { flex-wrap: wrap; gap: 8px; }
}
</style>
