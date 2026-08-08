<template>
  <!-- 字段旁小问号：就地解释，不跳转不丢上下文（AC-19） -->
  <el-popover placement="top-start" :width="280" trigger="hover" :show-arrow="true" class="field-help">
    <template #reference>
      <span class="field-help-ref" :aria-label="`关于${label}`" tabindex="0">
        <el-icon :size="16"><QuestionFilled /></el-icon>
      </span>
    </template>
    <div class="fh-body">
      <div class="fh-label">{{ label }}</div>
      <div class="fh-def">{{ definition }}</div>
      <el-link v-if="docLink" type="primary" :underline="false" @click="openGlossary">
        查看完整词典<el-icon class="fh-icon"><Right /></el-icon>
      </el-link>
    </div>
  </el-popover>
</template>

<script setup>
import { computed } from 'vue';
import { QuestionFilled, Right } from '@element-plus/icons-vue';
import glossary from '@/assets/glossary.json';
import { useHelpCenter } from '@/composables/useHelpCenter';

const props = defineProps({
  // glossary.json 中的 code（如 'etd'、'writeoff'）；不传则用 label/definition 原文
  term: { type: String, default: '' },
  label: { type: String, default: '' },
  definition: { type: String, default: '' },
  docLink: { type: String, default: '' },
});

const help = useHelpCenter();
const entry = computed(() => (props.term && glossary[props.term]) || null);
const label = computed(() => entry.value?.label || props.label);
const definition = computed(() => entry.value?.definition || props.definition || '（暂无解释，可在帮助中心查看完整词典）');
const docLink = computed(() => entry.value?.docLink || props.docLink);

function openGlossary() {
  help.open();
}
</script>

<style scoped>
.field-help-ref {
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-muted); cursor: help; margin-left: 2px;
  vertical-align: middle;
}
.field-help-ref:hover { color: var(--brand); }
.field-help-ref:focus-visible { outline: 2px solid var(--brand); border-radius: 4px; }
.fh-body { line-height: 1.6; }
.fh-label { font-weight: 600; color: var(--text-main); margin-bottom: 4px; }
.fh-def { font-size: 13px; color: var(--text-sub); }
.fh-icon { margin-left: 2px; }
</style>
