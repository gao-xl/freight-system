<template>
  <!-- 示例数据管理（系统设置内；生产环境隐藏入口 AC-14） -->
  <div class="demo-card page-card">
    <div class="demo-head">
      <div class="demo-title">
        <el-icon class="demo-title-icon"><MagicStick /></el-icon>
        示例数据
      </div>
      <div class="demo-sub">一键生成客户 / 报价 / 订单演示数据，快速体验完整业务流程（带演示标记，可随时清空）。</div>
    </div>

    <!-- 生产环境隐藏（AC-14） -->
    <el-alert v-if="isProduction" type="info" :closable="false" show-icon title="当前为生产环境，示例数据入口已隐藏。如需试用请在测试环境操作。" />

    <template v-else>
      <div class="demo-actions">
        <el-button type="primary" :loading="generating" @click="confirmGenerate">
          <el-icon class="demo-btn-icon"><MagicStick /></el-icon>一键生成示例数据
        </el-button>
        <el-button type="danger" plain :disabled="!lastLog" :loading="clearing" @click="confirmClear">
          <el-icon class="demo-btn-icon"><Delete /></el-icon>清空示例数据
        </el-button>
      </div>
      <div v-if="lastLog" class="demo-status">
        上次生成：{{ lastLog.time }}（批次 {{ lastLog.batchId }}）
      </div>
    </template>

    <!-- 生成确认 -->
    <el-dialog v-model="genVisible" title="生成示例数据？" width="480px" align-center>
      <p class="demo-confirm-text">将创建 3 个客户、3 条报价、2 票订单（含费用与发票）、1 个订舱、1 条报关、1 份运价表。正式数据不受影响，可随时一键清空。</p>
      <template #footer>
        <el-button @click="genVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="doGenerate">生成</el-button>
      </template>
    </el-dialog>

    <!-- 清空确认 -->
    <el-dialog v-model="clearVisible" title="清空示例数据？" width="480px" align-center>
      <p class="demo-confirm-text">将删除全部演示数据（名称前缀「演示」的记录），真实数据不受影响。</p>
      <template #footer>
        <el-button @click="clearVisible = false">取消</el-button>
        <el-button type="danger" :loading="clearing" @click="doClear">清空</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { MagicStick, Delete } from '@element-plus/icons-vue';
import { generateDemoData, clearDemoData } from '@/api/onboarding';
import { track } from '@/utils/track';

const LOG_KEY = 'onboarding.demo.log';
const isProduction = import.meta.env.PROD;

const genVisible = ref(false);
const clearVisible = ref(false);
const generating = ref(false);
const clearing = ref(false);
const lastLog = ref(loadLog());

function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || 'null'); } catch { return null; }
}
function saveLog(batchId) {
  lastLog.value = { batchId: batchId || 'b-' + Date.now().toString(36), time: new Date().toLocaleString('zh-CN', { hour12: false }) };
  localStorage.setItem(LOG_KEY, JSON.stringify(lastLog.value));
}

function confirmGenerate() { genVisible.value = true; }
async function doGenerate() {
  generating.value = true;
  try {
    const data = await generateDemoData();
    track('demo_generated');
    saveLog(data?.batchId);
    ElMessage.success('示例数据已生成，可到订单列表查看系统全貌。');
    genVisible.value = false;
  } catch {
    ElMessage.error('示例数据生成失败，请稍后重试。');
  } finally { generating.value = false; }
}

function confirmClear() { clearVisible.value = true; }
async function doClear() {
  clearing.value = true;
  try {
    await clearDemoData();
    track('demo_cleared');
    localStorage.removeItem(LOG_KEY);
    lastLog.value = null;
    ElMessage.success('示例数据已清空。');
    clearVisible.value = false;
  } catch {
    ElMessage.error('清空失败，请稍后重试。');
  } finally { clearing.value = false; }
}
</script>

<style scoped>
.demo-card { margin-bottom: 16px; }
.demo-head { margin-bottom: 14px; }
.demo-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: var(--text-main); }
.demo-title-icon { color: var(--brand); }
.demo-sub { font-size: 13px; color: var(--text-sub); margin-top: 6px; line-height: 1.7; }
.demo-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.demo-btn-icon { margin-right: 4px; }
.demo-status { font-size: 12px; color: var(--text-muted); margin-top: 10px; font-family: var(--font-num); }
.demo-confirm-text { font-size: 14px; color: var(--text-main); line-height: 1.8; margin: 4px 0 8px; }
@media (max-width: 768px) {
  .demo-actions { flex-direction: column; align-items: stretch; }
}
</style>
