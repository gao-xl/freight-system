<template>
  <!-- 备份与恢复（系统设置；AC-22 二次确认 + fail-open） -->
  <div class="backup-card page-card">
    <div class="backup-head">
      <div class="backup-title">
        <el-icon class="backup-title-icon"><Coin /></el-icon>
        备份与恢复
      </div>
      <div class="backup-sub">把数据库、上传文件与运行配置打包成单个 .tar.gz；恢复用备份文件还原系统。</div>
    </div>

    <!-- fail-open：端点未就绪（AC-22 后端开发中） -->
    <el-alert v-if="!ready" type="info" :closable="false" show-icon class="backup-alert">
      <template #title>
        备份服务初始化中（后端接口开发中）。就绪后点击
        <el-link type="primary" :underline="false" @click="retry">重新检查</el-link>。
      </template>
    </el-alert>

    <!-- 生成备份 -->
    <div class="backup-section">
      <div class="section-title">生成备份</div>
      <div class="section-body">
        <el-button type="primary" :loading="backing" :disabled="!ready" data-highlight-step="backup" @click="doBackup">
          <el-icon class="b-icon"><Download /></el-icon>生成备份并下载
        </el-button>
        <span v-if="lastLog" class="backup-status">上次备份：{{ lastLog.time }}</span>
      </div>
    </div>

    <el-divider />

    <!-- 恢复备份 -->
    <div class="backup-section">
      <div class="section-title">
        恢复备份
        <el-icon class="section-warn"><WarningFilled /></el-icon>
      </div>
      <div class="section-body">
        <el-upload
          :auto-upload="false"
          :limit="1"
          accept=".tar,.gz,.tgz"
          :on-change="onFileChange"
          :on-remove="() => onFileChange(null)"
          :disabled="!ready"
        >
          <el-button plain :disabled="!ready"><el-icon class="b-icon"><FolderOpened /></el-icon>选择备份文件</el-button>
        </el-upload>
        <el-button type="danger" plain :disabled="!ready || !file" :loading="restoring" @click="confirmVisible = true">
          <el-icon class="b-icon"><Upload /></el-icon>恢复备份
        </el-button>
      </div>
      <div v-if="file" class="backup-file-tip">已选择：{{ file.name }}（{{ humanSize(file.size) }}）</div>
    </div>

    <!-- 恢复二次确认（AC-22：恢复流程必须二次确认） -->
    <el-dialog v-model="confirmVisible" title="恢复备份？" width="480px" align-center>
      <div class="restore-confirm">
        <el-icon class="restore-warn-icon"><WarningFilled /></el-icon>
        <div>
          <p class="restore-confirm-title">将用「{{ file?.name }}」覆盖当前系统数据。</p>
          <p class="restore-confirm-text">恢复前建议先「生成备份」留存当前数据。此操作不可撤销，确认继续？</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button type="danger" :loading="restoring" @click="doRestore">确认恢复</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, Upload, FolderOpened, Coin, WarningFilled } from '@element-plus/icons-vue';
import { createBackup, downloadBackup, restoreBackup } from '@/api/backup';
import { track } from '@/utils/track';

const LOG_KEY = 'system.backup.log';

// fail-open：默认可用；端点未就绪（后端开发中）→ 真实调用 404 后禁用 + 提示，不弹错不阻塞
const ready = ref(true);
const backing = ref(false);
const restoring = ref(false);
const file = ref(null);
const confirmVisible = ref(false);
const lastLog = ref(loadLog());

function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || 'null'); } catch { return null; }
}
function humanSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function onFileChange(f) {
  file.value = f ? (f.raw || f) : null;
}
function saveLog() {
  lastLog.value = { time: new Date().toLocaleString('zh-CN', { hour12: false }) };
  localStorage.setItem(LOG_KEY, JSON.stringify(lastLog.value));
}
// 重新检查：后端就绪后重启用例（不经新接口探测，直接乐观恢复）
function retry() {
  ready.value = true;
  track('backup_retry');
}

async function doBackup() {
  backing.value = true;
  try {
    const meta = await createBackup();
    // 两段式：先生成拿文件名，再下载
    const { blob, filename } = await downloadBackup(meta.filename);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    track('backup_created');
    saveLog();
    ElMessage.success('备份已生成并开始下载。');
    if (meta.warnings && meta.warnings.length) ElMessage.info(meta.warnings[0]);
  } catch (error) {
    // fail-open：后端未就绪 → 禁用 + 提示，不弹错误
    if (error?.response?.status === 404) {
      ready.value = false;
      ElMessage.info('备份服务初始化中，请稍后再试。');
    } else {
      ElMessage.error('备份生成失败，请稍后重试。');
    }
  } finally { backing.value = false; }
}

async function doRestore() {
  restoring.value = true;
  try {
    await restoreBackup(file.value);
    track('backup_restored');
    confirmVisible.value = false;
    file.value = null;
    ElMessage.success('备份已恢复。请重启后端服务使数据生效。');
  } catch (error) {
    if (error?.response?.status === 404) {
      ready.value = false;
      confirmVisible.value = false;
      ElMessage.info('备份服务初始化中，请稍后再试。');
    } else {
      ElMessage.error('恢复失败，请确认备份文件完整后重试。');
    }
  } finally { restoring.value = false; }
}

</script>

<style scoped>
.backup-card { margin-bottom: 16px; }
.backup-head { margin-bottom: 14px; }
.backup-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: var(--text-main); }
.backup-title-icon { color: var(--brand); }
.backup-sub { font-size: 13px; color: var(--text-sub); margin-top: 6px; line-height: 1.7; }
.backup-alert { margin-bottom: 14px; }
.backup-section { margin-bottom: 4px; }
.section-title { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--text-main); margin-bottom: 10px; }
.section-warn { color: var(--warning); }
.section-body { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.b-icon { margin-right: 4px; }
.backup-status { font-size: 12px; color: var(--text-muted); font-family: var(--font-num); }
.backup-file-tip { font-size: 13px; color: var(--success); margin-top: 10px; }
.restore-confirm { display: flex; gap: 12px; align-items: flex-start; }
.restore-warn-icon { font-size: 24px; color: var(--danger); flex-shrink: 0; margin-top: 2px; }
.restore-confirm-title { font-size: 14px; font-weight: 600; color: var(--text-main); margin: 0 0 6px; }
.restore-confirm-text { font-size: 13px; color: var(--text-sub); line-height: 1.7; margin: 0; }
@media (max-width: 768px) {
  .section-body { flex-direction: column; align-items: stretch; }
  .section-body .el-button, .section-body .el-upload { width: 100%; }
  .section-body .el-upload :deep(.el-upload-dragger), .section-body .el-upload :deep(.el-button) { width: 100%; }
}
</style>
