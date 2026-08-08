<template>
  <el-dialog
    :model-value="modelValue"
    :title="`打印预览 - ${docTypeLabel(docType)}`"
    width="780px"
    top="6vh"
    destroy-on-close
    class="print-preview-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="load"
  >
    <div class="preview-body" v-loading="loading">
      <iframe v-if="html" :srcdoc="html" class="preview-frame" title="模板预览" />
      <el-empty v-else description="暂无预览内容" :image-size="80" />
    </div>
    <template #footer>
      <el-button @click="openNewWindow">在新窗口打开</el-button>
      <el-button type="primary" :loading="loading" @click="refresh">刷新预览</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue';
import { printTemplateAPI } from '@/api';
import { docTypeLabel, sampleData } from '@/composables/usePrintTemplate';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  templateId: { type: [Number, String], default: null },
  docType: { type: String, default: '' },
});

defineEmits(['update:modelValue']);

const html = ref('');
const loading = ref(false);

async function load() {
  if (!props.templateId) return;
  loading.value = true;
  try {
    const data = await printTemplateAPI.preview(props.templateId, { data: sampleData() });
    html.value = data.html || '';
  } catch (e) {
    html.value = '';
  } finally {
    loading.value = false;
  }
}

function refresh() { return load(); }

function openNewWindow() {
  const w = window.open('', '_blank');
  if (w) { w.document.write(html.value); w.document.close(); }
}

defineExpose({ refresh });
</script>

<style scoped>
.preview-body {
  height: 64vh;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--brand-bg);
  overflow: auto;
}
.preview-frame {
  width: 100%;
  height: 100%;
  min-height: 520px;
  border: none;
  background: #fff;
}
</style>
