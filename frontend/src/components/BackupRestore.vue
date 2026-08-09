<template>
  <!-- 备份与恢复（系统设置：AC-22 二次确认 + fail-open） -->
  <div class="backup-card page-card">
    <div class="backup-head">
      <div class="backup-title">
        <el-icon class="backup-title-icon"><Coin /></el-icon>
        备份与恢复
      </div>
      <div class="backup-sub">一键打包数据库、上传文件与配置；支持全量恢复与按业务模块的部分恢复还原。恢复前自动生成当前状态快照，可随时退回。</div>
    </div>

    <!-- fail-open：端点未就绪（后端开发中） -->
    <el-alert v-if="!ready" type="info" :closable="false" show-icon class="backup-alert">
      <template #title>
        备份服务初始化中（后端接口开发中）。就绪后点击
        <el-link type="primary" :underline="false" @click="retry">重新检查</el-link>。
      </template>
    </el-alert>

    <!-- ============ 一键备份 ============ -->
    <div class="backup-section">
      <div class="section-title">一键备份</div>
      <div class="section-body">
        <el-button type="primary" :loading="backing" :disabled="!ready" data-highlight-step="backup" @click="doBackup(true)">
          <el-icon class="b-icon"><Download /></el-icon>生成备份并下载
        </el-button>
        <el-button plain :loading="backing" :disabled="!ready" @click="doBackup(false)">
          <el-icon class="b-icon"><FolderAdd /></el-icon>仅生成备份
        </el-button>
        <span v-if="lastLog" class="backup-status">上次备份：{{ lastLog.time }}</span>
      </div>
      <div class="section-tip">生成后保留在服务器（最近 7 份），可随时下载、全量恢复或部分恢复。</div>
    </div>

    <el-divider />

    <!-- ============ 服务器备份管理 ============ -->
    <div class="backup-section">
      <div class="section-title">
        服务器备份
        <el-button link type="primary" :disabled="!ready" @click="loadList"><el-icon class="b-icon"><Refresh /></el-icon>刷新</el-button>
      </div>
      <el-table :data="serverBackups" v-loading="loadingList" size="small" stripe :empty-text="ready ? '暂无服务器备份，先点击上方「生成备份」' : '备份服务初始化中'">
        <el-table-column label="类型" width="90">
          <template #default="{row}">
            <el-tag size="small" :type="row.kind==='prerestore' ? 'info' : 'success'">{{ row.kind==='prerestore' ? '恢复前快照' : '备份' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="filename" label="文件名" min-width="230" show-overflow-tooltip>
          <template #default="{row}"><code class="fname">{{ row.filename }}</code></template>
        </el-table-column>
        <el-table-column prop="sizeText" label="大小" width="90" />
        <el-table-column label="生成时间" width="160">
          <template #default="{row}">{{ fmtTime(row.mtime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{row}">
            <el-button link type="primary" :disabled="!ready || row.kind==='prerestore'" @click="openRestore(row, false)">全量恢复</el-button>
            <el-button link type="primary" :disabled="!ready || row.kind==='prerestore'" @click="openRestore(row, true)">部分恢复</el-button>
            <el-button link :disabled="!ready" @click="download(row.filename)">下载</el-button>
            <el-button link type="danger" :disabled="!ready" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-divider />

    <!-- ============ 上传备份并恢复 ============ -->
    <div class="backup-section">
      <div class="section-title">上传备份并恢复</div>
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
        <el-button type="primary" plain :disabled="!ready || !uploadFile" @click="openRestore(null, false)">
          <el-icon class="b-icon"><Upload /></el-icon>全量恢复
        </el-button>
        <el-button type="warning" plain :disabled="!ready || !uploadFile" @click="openRestore(null, true)">
          <el-icon class="b-icon"><Collection /></el-icon>部分恢复
        </el-button>
      </div>
      <div v-if="uploadFile" class="backup-file-tip">已选择：{{ uploadFile.name }}（{{ humanSize(uploadFile.size) }}）</div>
    </div>

    <!-- ============ 恢复对话框 ============ -->
    <el-dialog v-model="restoreDlg" :title="restoreScope==='partial' ? '部分恢复还原' : '全量恢复'" width="640px" align-center :close-on-click-modal="false">
      <template v-if="restoreScope==='partial'">
        <el-alert type="warning" :closable="false" show-icon class="restore-alert"
          title="部分恢复将按所选业务模块清空并还原对应数据表（会联动清空依赖这些表的数据），请确认选择完整。" />
        <div v-if="inspecting" class="inspect-loading">正在解析备份内容…</div>
        <template v-else-if="inspectResult">
          <div class="inspect-meta">
            <span>备份时间：{{ fmtTime(inspectResult.createdAt) }}</span>
            <span v-if="inspectResult.hasDbDump">数据库：{{ inspectResult.tables.known || 0 }} 张业务表</span>
            <span v-else class="warn-text">该备份不含数据库转储</span>
            <span v-if="inspectResult.uploadFiles">上传文件：{{ inspectResult.uploadFiles }}</span>
          </div>
          <div v-if="inspectResult.hasDbDump" class="module-picker">
            <div class="module-check-all">
              <el-checkbox :indeterminate="partialIndeterminate" v-model="partialAll" @change="toggleAllModules">全选业务模块</el-checkbox>
            </div>
            <el-checkbox-group v-model="checkedModules" class="module-group">
              <div v-for="m in inspectModules" :key="m.key" class="module-item">
                <el-checkbox :value="m.key" :label="m.label">
                  <span>{{ m.label }}</span>
                  <span class="module-count">（{{ m.tables.length }} 表）</span>
                </el-checkbox>
              </div>
            </el-checkbox-group>
          </div>
          <div v-else class="no-db-tip">该备份没有可选的数据库表，仅能还原上传文件。</div>
          <div class="file-toggle">
            <el-checkbox v-model="includeUploads">同时还原上传附件</el-checkbox>
          </div>
        </template>
        <div v-else class="inspect-err">备份内容解析失败或所选备份不含可检查内容。</div>
      </template>

      <template v-else>
        <div class="restore-confirm">
          <el-icon class="restore-warn-icon"><WarningFilled /></el-icon>
          <div>
            <p class="restore-confirm-title">将用「{{ sourceLabel }}」覆盖当前系统数据。</p>
            <p class="restore-confirm-text">全量恢复会清空并重建业务库（含订单、财务、客户等全部数据）并覆盖上传文件。恢复前系统会自动生成当前状态快照，操作不可撤销，确认继续？</p>
          </div>
        </div>
      </template>

      <template #footer>
        <el-button @click="restoreDlg=false">取消</el-button>
        <el-button type="danger" :loading="restoring" :disabled="restoreScope==='partial' && inspecting" @click="executeRestore">
          {{ restoreScope==='partial' ? '确认部分恢复' : '确认恢复' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Upload, FolderOpened, FolderAdd, Coin, WarningFilled, Refresh, Collection } from '@element-plus/icons-vue';
import { createBackup, downloadBackup, restoreBackup, listBackups, deleteBackup, inspectBackup } from '@/api/backup';
import { track } from '@/utils/track';

const LOG_KEY = 'system.backup.log';

// fail-open：默认可用；端点未就绪 → 真实调用 404 后禁用 + 提示
const ready = ref(true);
const backing = ref(false);
const restoring = ref(false);

const serverBackups = ref([]);
const loadingList = ref(false);
const uploadFile = ref(null);
const lastLog = ref(loadLog());

// 恢复对话框状态
const restoreDlg = ref(false);
const restoreScope = ref('full'); // 'full' | 'partial'
const restoreSource = ref(null);  // { type:'server', filename } | { type:'upload', file }
const inspecting = ref(false);
const inspectResult = ref(null);
const checkedModules = ref([]);
const includeUploads = ref(true);

function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || 'null'); } catch { return null; }
}
function humanSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function onFileChange(f) {
  uploadFile.value = f ? (f.raw || f) : null;
}
function retry() {
  ready.value = true;
  loadList();
  track('backup_retry');
}
function saveLog() {
  lastLog.value = { time: new Date().toLocaleString('zh-CN', { hour12: false }) };
  localStorage.setItem(LOG_KEY, JSON.stringify(lastLog.value));
}
function handleUnready(error) {
  if (error?.response?.status === 404) {
    ready.value = false;
    ElMessage.info('备份服务初始化中，请稍后再试。');
    return true;
  }
  return false;
}

// ---------- 备份列表 ----------
async function loadList() {
  loadingList.value = true;
  try {
    const data = await listBackups();
    serverBackups.value = data.items || [];
  } catch (e) {
    if (!handleUnready(e)) {/* 拦截器提示 */}
  } finally {
    loadingList.value = false;
  }
}

// ---------- 一键备份 ----------
async function doBackup(download) {
  backing.value = true;
  try {
    const meta = await createBackup();
    if (download) {
      const { blob, filename } = await downloadBackup(meta.filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      ElMessage.success('备份已生成并开始下载。');
    } else {
      ElMessage.success('备份已生成到服务器。');
    }
    if (meta.warnings && meta.warnings.length) ElMessage.info(meta.warnings[0]);
    track('backup_created');
    saveLog();
    loadList();
  } catch (error) {
    if (!handleUnready(error)) ElMessage.error('备份生成失败，请稍后重试。');
  } finally { backing.value = false; }
}

async function download(filename) {
  try {
    const { blob, filename: name } = await downloadBackup(filename);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { /* 拦截器提示 */ }
}
async function remove(row) {
  await ElMessageBox.confirm(`确认删除备份「${row.filename}」？删除后不可恢复。`, '删除备份', { type: 'warning' });
  await deleteBackup(row.filename);
  ElMessage.success('备份已删除');
  loadList();
}

// ---------- 恢复 ----------
const sourceLabel = computed(() => {
  if (!restoreSource.value) return '';
  return restoreSource.value.type === 'server' ? restoreSource.value.filename : uploadFile.value?.name || '';
});
const inspectModules = computed(() => inspectResult.value?.tables?.modules || []);
const partialIndeterminate = computed(() => {
  const mods = inspectModules.value;
  return checkedModules.value.length > 0 && checkedModules.value.length < mods.length;
});
const partialAll = computed({
  get: () => inspectModules.value.length > 0 && checkedModules.value.length === inspectModules.value.length,
  set: (val) => toggleAllModules(val),
});

async function openRestore(row, partial) {
  restoreScope.value = partial ? 'partial' : 'full';
  restoreSource.value = row ? { type: 'server', filename: row.filename } : { type: 'upload', file: uploadFile.value };
  inspectResult.value = null;
  checkedModules.value = [];
  includeUploads.value = true;
  restoreDlg.value = true;

  if (partial) {
    inspecting.value = true;
    try {
      const payload = restoreSource.value.type === 'server'
        ? { filename: restoreSource.value.filename }
        : restoreSource.value.file;
      const data = await inspectBackup(payload);
      inspectResult.value = data.details || null;
      // 默认全选模块
      checkedModules.value = (inspectResult.value?.tables?.modules || []).map((m) => m.key);
    } catch (e) {
      if (!handleUnready(e)) {
        inspectResult.value = null;
        ElMessage.error('备份内容解析失败。');
      }
      restoreSource.value = null;
    } finally {
      inspecting.value = false;
    }
  }
}

function toggleAllModules(val) {
  checkedModules.value = val ? inspectModules.value.map((m) => m.key) : [];
}

async function executeRestore() {
  if (restoreScope.value === 'partial') {
    const mods = inspectModules.value.filter((m) => checkedModules.value.includes(m.key));
    if (!mods.length) return ElMessage.warning('请至少选择一个业务模块');
    const tables = mods.flatMap((m) => m.tables);
    await ElMessageBox.confirm(
      `将还原 ${mods.length} 个模块（${tables.length} 张表）${includeUploads.value ? '，并覆盖上传附件' : ''}。恢复前自动快照当前状态，确认继续？`,
      '确认部分恢复',
      { type: 'warning', confirmButtonText: '确认恢复' }
    );
    await runRestore({ scope: 'partial', tables, includeUploads: includeUploads.value });
  } else {
    await ElMessageBox.confirm(
      '全量恢复将清空并重建业务库并覆盖上传文件，操作不可撤销。系统会自动生成当前状态快照，确认继续？',
      '确认全量恢复',
      { type: 'error', confirmButtonText: '确认恢复' }
    );
    await runRestore({ scope: 'full' });
  }
}

async function runRestore(opts) {
  restoring.value = true;
  try {
    const payload = {
      scope: opts.scope,
      ...(restoreSource.value.type === 'server'
        ? { filename: restoreSource.value.filename }
        : { file: restoreSource.value.file }),
    };
    if (opts.scope === 'partial') {
      payload.tables = opts.tables;
      payload.includeUploads = opts.includeUploads;
    }
    const result = await restoreBackup(payload);
    track(opts.scope === 'partial' ? 'backup_partial_restored' : 'backup_restored');
    restoreDlg.value = false;
    uploadFile.value = null;
    ElMessage.success(result?.message || '恢复完成。请重启后端服务使数据生效。');
    loadList();
  } catch (error) {
    if (!handleUnready(error)) {
      ElMessage.error(error?.message || '恢复失败，请确认备份完整后重试。');
    }
    restoreDlg.value = false;
  } finally { restoring.value = false; }
}

onMounted(loadList);
</script>

<style scoped>
.backup-card { margin-bottom: 16px; }
.backup-head { margin-bottom: 14px; }
.backup-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: var(--text-main); }
.backup-title-icon { color: var(--brand); }
.backup-sub { font-size: 13px; color: var(--text-sub); margin-top: 6px; line-height: 1.7; }
.backup-alert { margin-bottom: 14px; }
.backup-section { margin-bottom: 4px; }
.section-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--text-main); margin-bottom: 10px; }
.section-body { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.section-tip { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.b-icon { margin-right: 4px; }
.fname { font-family: var(--font-num, monospace); font-size: 12px; }
.backup-status { font-size: 12px; color: var(--text-muted); font-family: var(--font-num); }
.backup-file-tip { font-size: 13px; color: var(--success); margin-top: 10px; }
.restore-alert { margin-bottom: 12px; }
.inspect-loading { padding: 24px 0; color: var(--text-sub); font-size: 13px; }
.inspect-meta { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--text-sub); margin-bottom: 12px; }
.warn-text { color: var(--warning); }
.module-picker { max-height: 300px; overflow: auto; border: 1px solid var(--border-color, #e4e7ed); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
.module-check-all { margin-bottom: 8px; }
.module-group { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.module-item { width: 220px; }
.module-count { color: var(--text-muted); font-size: 12px; }
.no-db-tip { font-size: 13px; color: var(--warning); margin-bottom: 12px; }
.inspect-err { padding: 16px 0; color: var(--danger); font-size: 13px; }
.file-toggle { margin-top: 4px; }
.restore-confirm { display: flex; gap: 12px; align-items: flex-start; }
.restore-warn-icon { font-size: 24px; color: var(--danger); flex-shrink: 0; margin-top: 2px; }
.restore-confirm-title { font-size: 14px; font-weight: 600; color: var(--text-main); margin: 0 0 6px; }
.restore-confirm-text { font-size: 13px; color: var(--text-sub); line-height: 1.7; margin: 0; }
@media (max-width: 768px) {
  .section-body { flex-direction: column; align-items: stretch; }
  .section-body .el-button, .section-body .el-upload { width: 100%; }
  .section-body .el-upload :deep(.el-button) { width: 100%; }
}
</style>