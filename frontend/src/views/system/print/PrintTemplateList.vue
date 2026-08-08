<template>
  <div class="page-card">
    <el-tabs v-model="docType" class="type-tabs" @tab-change="load">
      <el-tab-pane v-for="d in PRINT_DOC_TYPES" :key="d.value" :label="d.label" :name="d.value" />
    </el-tabs>

    <div class="table-topbar">
      <span class="hint">每类单据可维护多个模板，业务打印默认使用「默认」模板</span>
      <el-button v-permission="'print:write'" type="primary" @click="$emit('edit', { docType: docType })">
        <el-icon><Plus /></el-icon>新建模板
      </el-button>
    </div>

    <el-table :data="templates" v-loading="loading" stripe>
      <el-table-column prop="name" label="模板名称" min-width="180" show-overflow-tooltip />
      <el-table-column label="默认" width="70" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.isDefault" type="success" size="small" effect="dark">默认</el-tag>
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="pageSize" label="纸张" width="70" align="center" />
      <el-table-column label="区块" width="70" align="center">
        <template #default="{ row }">{{ blockCount(row) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ fmtTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$emit('edit', row)">编辑</el-button>
          <el-button link @click="preview(row)">预览</el-button>
          <el-button v-permission="'print:write'" link @click="doCopy(row)">复制</el-button>
          <el-button v-if="!row.isDefault" v-permission="'print:write'" link type="warning" @click="doDefault(row)">设默认</el-button>
          <el-button v-permission="'print:write'" link type="danger" @click="doRemove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <PrintPreviewDialog v-model="previewOpen" :template-id="previewId" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { printTemplateAPI } from '@/api';
import { PRINT_DOC_TYPES, parseContent } from '@/composables/usePrintTemplate';
import PrintPreviewDialog from './PrintPreviewDialog.vue';

const props = defineProps({
  initialDocType: { type: String, default: 'bl' },
});
defineEmits(['edit']);

const docType = ref(props.initialDocType || 'bl');
const templates = ref([]);
const loading = ref(false);
const previewOpen = ref(false);
const previewId = ref(null);

const blockCount = (row) => parseContent(row.content).blocks.length;
const fmtTime = (t) => (t ? String(t).replace('T', ' ').slice(0, 16) : '-');

async function load() {
  loading.value = true;
  try {
    templates.value = await printTemplateAPI.list({ docType: docType.value });
  } finally {
    loading.value = false;
  }
}

function preview(row) {
  previewId.value = row.id;
  previewOpen.value = true;
}

async function doCopy(row) {
  await printTemplateAPI.copy(row.id);
  ElMessage.success('已复制为新模板');
  load();
}

async function doDefault(row) {
  await printTemplateAPI.setDefault(row.id);
  ElMessage.success('已设为默认模板');
  load();
}

async function doRemove(row) {
  await ElMessageBox.confirm(`确认删除模板「${row.name}」？删除后不可恢复。`, '删除确认', { type: 'warning' });
  await printTemplateAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.type-tabs { margin-bottom: 4px; }
.table-topbar { margin-bottom: 14px; }
.hint { color: var(--text-sub); font-size: 13px; }
.muted { color: var(--text-sub); }
</style>
