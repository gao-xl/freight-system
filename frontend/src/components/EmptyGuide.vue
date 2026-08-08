<template>
  <!-- 三档场景严格区分（AC-08/09/10）：
       mode="guide"   —— 资源为空（onboarding/status count=0）→ 引导卡（AC-08）
       mode="filtered"—— 列表有数据但筛选无结果 → 仅提示重置，绝不用引导卡（AC-09）
       上游未就绪 → preStepHint 链路提示（AC-10） -->
  <div v-if="mode === 'filtered'" class="eg-filtered">
    <el-icon class="eg-filtered-icon"><Search /></el-icon>
    <div class="eg-filtered-title">{{ config.filtered.title }}</div>
    <div class="eg-filtered-hint">{{ config.filtered.hint }}</div>
    <el-button size="small" plain @click="emit('reset')">
      <el-icon class="eg-btn-icon"><RefreshLeft /></el-icon>{{ config.filtered.actionText }}
    </el-button>
  </div>

  <div v-else class="eg-guide">
    <div class="eg-icon" :class="{ compact }">
      <el-icon :size="compact ? 36 : 40"><component :is="resolvedIcon" /></el-icon>
    </div>

    <div class="eg-title">{{ title }}</div>
    <div v-if="hint" class="eg-hint">{{ hint }}</div>

    <!-- 上游感知：先去完成上一步（AC-10） -->
    <div v-if="preStepHint" class="eg-prestep">
      <el-icon class="eg-prestep-icon"><Connection /></el-icon>
      <span>{{ preStepHint }}</span>
      <el-button v-if="preStepActionText" link type="primary" @click="emit('preStep')">
        {{ preStepActionText }}<el-icon class="eg-btn-icon"><ArrowRight /></el-icon>
      </el-button>
    </div>

    <div class="eg-actions" :class="{ compact }">
      <!-- 主行动按钮（完整形态：核心页内嵌） -->
      <el-button
        v-if="mainActionText"
        type="primary"
        :size="compact ? 'small' : 'default'"
        @click="emit('action')"
      >
        <el-icon class="eg-btn-icon"><component :is="mainActionIcon" /></el-icon>{{ mainActionText }}
      </el-button>

      <!-- 通用次动作 -->
      <el-button v-if="demoAction" size="small" plain @click="emit('demo')">
        <el-icon class="eg-btn-icon"><MagicStick /></el-icon>{{ config.common.demoText }}
      </el-button>
      <el-button v-if="tutorialLink" link type="info" @click="emit('tutorial')">
        <el-icon class="eg-btn-icon"><Reading /></el-icon>{{ config.common.tutorialText }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { FolderOpened, Plus, Search, RefreshLeft, Connection, ArrowRight, MagicStick, Reading } from '@element-plus/icons-vue';
import { emptyStateConfig as config } from '@/config/emptyStateConfig';

const props = defineProps({
  // 图标（@element-plus/icons-vue 组件对象或全局注册的字符串名）
  icon: { type: [String, Object, Function], default: FolderOpened },
  title: { type: String, default: '' },
  hint: { type: String, default: '' },
  // 主行动按钮文案：字符串直接作为按钮文案；对象 { label, icon } 可自定义
  actionText: { type: String, default: '' },
  action: { type: [String, Object], default: '' },
  // 上游感知提示（AC-10）
  preStepHint: { type: String, default: '' },
  preStepActionText: { type: String, default: '' },
  // 通用次动作开关
  demoAction: { type: Boolean, default: false },
  tutorialLink: { type: [Boolean, String], default: false },
  // guide | filtered
  mode: { type: String, default: 'guide' },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['action', 'preStep', 'demo', 'tutorial', 'reset']);

// 兼容 action 对象形态 { label, icon }；优先 action，其次 actionText
const mainActionText = computed(() => {
  if (typeof props.action === 'string' && props.action) return props.action;
  if (props.action && typeof props.action === 'object') return props.action.label || '';
  return props.actionText;
});
const mainActionIcon = computed(() => {
  if (props.action && typeof props.action === 'object' && props.action.icon) return props.action.icon;
  return Plus;
});
const resolvedIcon = computed(() => props.icon);
</script>

<style scoped>
.eg-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
  max-width: 420px;
  margin: 0 auto;
}
.eg-icon {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: var(--onboard-bg);
  border: 1px solid var(--onboard-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--brand);
  margin-bottom: 20px;
}
.eg-icon.compact { width: 72px; height: 72px; margin-bottom: 16px; }
.eg-title { font-size: 15px; font-weight: 600; color: var(--text-main); line-height: 1.5; }
.eg-hint { font-size: 13px; color: var(--text-sub); margin-top: 8px; line-height: 1.7; max-width: 360px; }
.eg-prestep {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--onboard-bg);
  border: 1px dashed var(--onboard-border);
  font-size: 13px;
  color: var(--text-sub);
  flex-wrap: wrap;
  justify-content: center;
}
.eg-prestep-icon { color: var(--brand); }
.eg-actions { display: flex; align-items: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center; }
.eg-actions.compact { margin-top: 14px; }
.eg-btn-icon { margin-right: 4px; }

/* 筛选无结果：与引导卡严格两套视觉（AC-09） */
.eg-filtered {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--text-muted);
}
.eg-filtered-icon { font-size: 30px; color: var(--text-muted); margin-bottom: 12px; }
.eg-filtered-title { font-size: 14px; color: var(--text-sub); }
.eg-filtered-hint { font-size: 12px; color: var(--text-muted); margin: 6px 0 14px; }

@media (max-width: 768px) {
  .eg-guide { padding: 28px 16px; }
  .eg-actions { flex-direction: column; }
}
</style>
