<template>
  <div class="wizard-body">
    <div class="usage-grid">
      <div
        v-for="u in usages"
        :key="u.value"
        class="usage-card"
        :class="{ active: model === u.value }"
        role="radio"
        :aria-checked="model === u.value"
        tabindex="0"
        @click="model = u.value"
        @keyup.enter="model = u.value"
      >
        <el-icon class="usage-icon"><component :is="u.icon" /></el-icon>
        <div class="usage-title">{{ u.label }}</div>
        <div class="usage-desc">{{ u.desc }}</div>
      </div>
    </div>
    <p v-if="model === 'team'" class="team-hint">
      <el-icon><InfoFilled /></el-icon>团队模式下，待办清单将增加「创建小组并分配权限」步骤
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { User, UserFilled, InfoFilled } from '@element-plus/icons-vue';
// 使用方式（个人 / 团队），通过 v-model 双向绑定（modelValue）
const props = defineProps({ modelValue: { type: String, default: 'personal' } });
const emit = defineEmits(['update:modelValue']);
// 通过 computed 读写代理，避免直接修改 prop（vue/no-mutating-props）
const model = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});
const usages = [
  { value: 'personal', label: '个人使用', desc: '一个人操作，所有数据自己可见', icon: User },
  { value: 'team', label: '团队协作', desc: '与同事一起协作，按小组隔离数据', icon: UserFilled },
];
</script>

<style scoped>
.wizard-body { padding: 8px 4px; }
.usage-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.usage-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 22px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard);
}
.usage-card:hover { border-color: var(--brand); }
.usage-card.active { border-color: var(--brand); background: var(--onboard-bg); box-shadow: 0 0 0 1px var(--brand) inset; }
.usage-card:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.usage-icon { font-size: 30px; color: var(--brand); }
.usage-title { font-size: 15px; font-weight: 600; color: var(--text-main); margin-top: 10px; }
.usage-desc { font-size: 12px; color: var(--text-sub); margin-top: 4px; line-height: 1.6; }
.team-hint {
  display: flex; align-items: center; gap: 6px;
  margin: 14px 0 0; font-size: 12px; color: var(--text-sub);
  background: var(--onboard-bg); border: 1px dashed var(--onboard-border);
  border-radius: var(--radius); padding: 8px 12px;
}
.team-hint .el-icon { color: var(--brand); }
@media (max-width: 520px) {
  .usage-grid { grid-template-columns: 1fr; }
}
</style>
