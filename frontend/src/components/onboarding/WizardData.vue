<template>
  <div class="wizard-body">
    <div class="prepare-grid">
      <div
        v-for="p in prepares"
        :key="p.value"
        class="prepare-card"
        :class="{ active: model === p.value }"
        role="radio"
        :aria-checked="model === p.value"
        tabindex="0"
        @click="choose(p.value)"
        @keyup.enter="choose(p.value)"
      >
        <el-icon class="prepare-icon"><component :is="p.icon" /></el-icon>
        <div class="prepare-title">{{ p.label }}</div>
        <div class="prepare-desc">{{ p.desc }}</div>
      </div>
    </div>
    <p class="hint">空系统也可以直接开始；或先生成示例数据看看系统跑起来的样子。</p>
  </div>
</template>

<script setup>
import { EditPen, MagicStick, Upload } from '@element-plus/icons-vue';

defineProps({
  model: { type: String, default: 'manual' },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['choose']);

const prepares = [
  { value: 'manual', label: '稍后自己录入', desc: '进入系统后按引导一步步添加', icon: EditPen },
  { value: 'demo', label: '一键生成示例数据', desc: '生成客户/报价/订单演示数据，可随时清空', icon: MagicStick },
  { value: 'import', label: '去批量导入', desc: '用 Excel 模板批量导入客户 / 供应商', icon: Upload },
];

function choose(mode) {
  if (mode === 'demo' && !loading.value) emit('choose', 'demo');
  else if (mode !== 'demo') emit('choose', mode);
}
</script>

<style scoped>
.wizard-body { padding: 8px 4px; }
.prepare-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.prepare-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 22px 12px;
  text-align: center;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard);
}
.prepare-card:hover { border-color: var(--brand); }
.prepare-card.active { border-color: var(--brand); background: var(--onboard-bg); box-shadow: 0 0 0 1px var(--brand) inset; }
.prepare-card:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.prepare-icon { font-size: 28px; color: var(--brand); }
.prepare-title { font-size: 14px; font-weight: 600; color: var(--text-main); margin-top: 10px; }
.prepare-desc { font-size: 12px; color: var(--text-sub); margin-top: 4px; line-height: 1.6; }
.hint { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
@media (max-width: 520px) {
  .prepare-grid { grid-template-columns: 1fr; }
}
</style>
