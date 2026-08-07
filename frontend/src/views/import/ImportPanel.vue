<template>
  <div class="import-panel">
    <el-alert v-if="tip" type="info" :closable="false" show-icon class="panel-tip">
      {{ tip }}
    </el-alert>

    <div class="panel-actions">
      <el-button :loading="downloading" @click="downloadTemplate">
        <el-icon><Download /></el-icon>下载导入模板
      </el-button>
      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="onFileChange"
        :on-remove="onFileRemove"
        :on-exceed="onExceed"
      >
        <el-button plain><el-icon><FolderOpened /></el-icon>选择 Excel 文件</el-button>
      </el-upload>
      <el-button type="primary" :loading="uploading" :disabled="!selected" @click="submit">
        <el-icon><Upload /></el-icon>开始导入
      </el-button>
      <span v-if="selected" class="file-tip">已选择：{{ selected.name }}</span>
    </div>

    <div v-if="result" class="result-area">
      <el-alert :type="result.failed > 0 ? 'warning' : 'success'" :closable="false" show-icon class="result-alert">
        <template #title>
          共 {{ result.total }} 条数据：成功 <b>{{ result.success }}</b> 条，失败 <b>{{ result.failed }}</b> 条
        </template>
      </el-alert>
      <el-table
        v-if="result.errors && result.errors.length"
        :data="result.errors"
        size="small"
        border
        class="error-table"
      >
        <el-table-column prop="row" label="Excel 行号" width="140" />
        <el-table-column prop="message" label="失败原因" min-width="280" show-overflow-tooltip />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { importTemplateAPI, importFileAPI } from '@/api';

const props = defineProps({
  biz: { type: String, required: true },
  fileName: { type: String, required: true },
  tip: { type: String, default: '' },
});

const uploadRef = ref();
const downloading = ref(false);
const uploading = ref(false);
const selected = ref(null);
const result = ref(null);

function onFileChange(file) {
  selected.value = file.raw;
  result.value = null;
}
function onFileRemove() {
  selected.value = null;
  result.value = null;
}
function onExceed() {
  ElMessage.warning('每次仅支持选择一个 Excel 文件');
}

async function downloadTemplate() {
  downloading.value = true;
  try {
    const resp = await importTemplateAPI(props.biz);
    const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.fileName}导入模板.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error('模板下载失败');
  } finally {
    downloading.value = false;
  }
}

async function submit() {
  if (!selected.value) return ElMessage.warning('请先选择 Excel 文件');
  const fd = new FormData();
  fd.append('file', selected.value);
  uploading.value = true;
  try {
    const data = await importFileAPI(props.biz, fd);
    result.value = data;
    selected.value = null;
    uploadRef.value?.clearFiles();
    ElMessage.success(`导入完成：成功 ${data.success} 条，失败 ${data.failed} 条`);
  } catch (e) {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.panel-tip { margin-bottom: 14px; }
.panel-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.file-tip { font-size: 13px; color: var(--success); }
.result-area { margin-top: 16px; }
.result-alert { margin-bottom: 12px; }
.error-table { max-width: 720px; }
</style>
