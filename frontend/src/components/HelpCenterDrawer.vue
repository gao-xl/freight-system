<template>
  <!-- 帮助中心（全局挂载，AC-16/17/18/27） -->
  <div>
    <!-- 右下角问号浮标 -->
    <button
      class="help-fab"
      type="button"
      aria-label="打开帮助中心"
      aria-expanded="visible"
      aria-controls="help-panel"
      @click="open()"
    >
      <el-icon :size="24"><QuestionFilled /></el-icon>
    </button>

    <el-drawer
      id="help-panel"
      v-model="visible"
      :size="drawerSize"
      direction="rtl"
      :with-header="false"
      :close-on-press-escape="true"
      class="help-drawer"
      @closed="onClosed"
    >
      <div class="help-wrap">
        <div class="help-head">
          <div class="help-title">帮助中心</div>
          <div class="help-context">
            <el-icon><Location /></el-icon>
            <span>当前模块：{{ moduleName }}</span>
          </div>
          <el-button link type="primary" @click="openNewTab">
            <el-icon class="help-btn-icon"><TopRight /></el-icon>新标签打开
          </el-button>
        </div>

        <div class="help-search">
          <el-input
            v-model="query"
            placeholder="搜索术语或教程，如：订舱"
            clearable
            :prefix-icon="Search"
            @input="searchChanged"
          />
        </div>

        <!-- 离线兜底提示（AC-18） -->
        <el-alert v-if="offline" type="warning" :closable="false" show-icon title="文档站暂不可达。以下为内置术语词典，可离线查看。" class="help-offline" />

        <!-- 文档 iframe（同源复用 DocsView 模式） -->
        <div v-if="!offline" class="help-frame-wrap">
          <iframe
            ref="frameRef"
            class="help-frame"
            :src="frameSrc"
            title="帮助文档"
            loading="lazy"
            @load="onFrameLoad"
          />
        </div>

        <!-- 术语词典（搜索命中优先展示） -->
        <div class="help-glossary">
          <div class="glossary-head">货代术语词典——用大白话解释业务术语</div>
          <div v-if="!searchHits.length" class="glossary-empty">没有找到相关的内容。试试其他关键词，或查看完整教程。</div>
          <div v-else class="glossary-list">
            <div v-for="g in searchHits" :key="g.code" class="glossary-item" :id="`glossary-${g.code}`">
              <div class="glossary-label">
                {{ g.label }}
                <el-tag size="small" effect="plain" class="glossary-code">{{ g.code }}</el-tag>
              </div>
              <div class="glossary-def">{{ g.definition }}</div>
              <el-link v-if="g.docLink" type="primary" :underline="false" @click="frameSrc = `/docs/${g.docLink}`">
                查看教程<el-icon class="help-btn-icon"><Right /></el-icon>
              </el-link>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { QuestionFilled, Search, Location, TopRight, Right } from '@element-plus/icons-vue';
import glossary from '@/assets/glossary.json';
import { useHelpCenter } from '@/composables/useHelpCenter';
import { track } from '@/utils/track';

const route = useRoute();
const help = useHelpCenter();
const visible = help.visible;

const query = ref('');
const offline = ref(false);
const frameRef = ref(null);
let frameTimer = null;
let lastFocus = null;

// 模块 → 文档页映射（docs-site/guide 扩充后更新；当前仅 concepts/getting-started 已发布）
const MODULE_GUIDE = {
  orders: 'concepts.md',
  customers: 'concepts.md',
  suppliers: 'concepts.md',
  quotations: 'concepts.md',
  finance: 'concepts.md',
  bookings: 'concepts.md',
  customs: 'concepts.md',
  documents: 'concepts.md',
  tracking: 'concepts.md',
  dashboard: 'concepts.md',
  system: 'getting-started.md',
  import: 'getting-started.md',
  alerts: 'concepts.md',
  default: 'getting-started.md',
};
const MODULE_NAME = {
  orders: '订单管理', customers: '客户管理', suppliers: '供应商', quotations: '报价询价',
  finance: '财务管理', bookings: '订舱管理', customs: '报关管理', documents: '单证管理',
  tracking: '运输跟踪', dashboard: '经营看板', system: '系统设置', import: '数据导入',
  alerts: '预警中心', default: '快速开始',
};

const moduleKey = computed(() => {
  const p = route.path;
  if (p.startsWith('/orders')) return 'orders';
  if (p.startsWith('/customers') || p.startsWith('/suppliers')) return 'customers';
  if (p.startsWith('/quotations')) return 'quotations';
  if (p.startsWith('/finance')) return 'finance';
  if (p.startsWith('/bookings')) return 'bookings';
  if (p.startsWith('/customs')) return 'customs';
  if (p.startsWith('/documents')) return 'documents';
  if (p.startsWith('/tracking')) return 'tracking';
  if (p.startsWith('/system') || p.startsWith('/import')) return p.startsWith('/import') ? 'import' : 'system';
  if (p.startsWith('/alerts')) return 'alerts';
  if (p.startsWith('/dashboard')) return 'dashboard';
  return 'default';
});
const moduleName = computed(() => MODULE_NAME[moduleKey.value] || MODULE_NAME.default);
const frameSrc = ref(`/docs/guide/${MODULE_GUIDE.default}`);

const drawerSize = ref(window.innerWidth < 768 ? '100%' : 'var(--help-panel-width)');

// 词典搜索：label/definition/code 命中优先（AC-17）
const searchHits = computed(() => {
  const q = query.value.trim().toLowerCase();
  const entries = Object.values(glossary);
  if (!q) return entries;
  return entries.filter((g) =>
    g.label.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q) || g.code.toLowerCase().includes(q)
  );
});
function searchChanged() { track('help_search', { q: query.value }); }

function open() {
  lastFocus = document.activeElement;
  drawerSize.value = window.innerWidth < 768 ? '100%' : 'var(--help-panel-width)';
  frameSrc.value = `/docs/guide/${MODULE_GUIDE[moduleKey.value]}`;
  help.open();
  offline.value = false;
  resetFrameTimer();
}
function openNewTab() {
  track('help_open_newtab', { page: frameSrc.value });
  window.open(frameSrc.value, '_blank', 'noopener');
}
function onFrameLoad() { clearTimeout(frameTimer); frameTimer = null; }
function resetFrameTimer() {
  clearTimeout(frameTimer);
  frameTimer = setTimeout(() => { if (visible.value && !frameTimerCleared) offline.value = true; }, 2500);
}
let frameTimerCleared = false;
function onClosed() {
  // AC-27：关闭后焦点归位
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
  clearTimeout(frameTimer);
}

function onKeydown(e) {
  // AC-16：F1 唤起（浏览器默认 F1 帮助拦截失败时，Shift+? 兜底）
  if (e.key === 'F1') { e.preventDefault(); visible.value ? help.close() : open(); }
  else if (e.key === '?' && e.shiftKey) { e.preventDefault(); open(); }
}

watch(visible, (v) => {
  if (v) {
    offline.value = false;
    frameTimerCleared = false;
    resetFrameTimer();
  } else {
    frameTimerCleared = true;
    clearTimeout(frameTimer);
  }
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); clearTimeout(frameTimer); });
</script>

<style scoped>
.help-fab {
  position: fixed; right: 20px; bottom: 20px; z-index: 1999;
  width: 48px; height: 48px; border-radius: 50%;
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: var(--brand); color: #fff;
  box-shadow: var(--shadow-md);
  transition: transform var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard);
}
.help-fab:hover { background: var(--brand-hover); transform: translateY(-2px); }
.help-fab:focus-visible { outline: 2px solid var(--brand-dark); outline-offset: 2px; }

.help-wrap { height: 100%; display: flex; flex-direction: column; background: var(--help-bg); padding: 4px 8px; }
.help-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
}
.help-title { font-size: 16px; font-weight: 600; color: var(--text-main); }
.help-context { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-sub); }
.help-context .el-icon { color: var(--brand); }
.help-head .el-button { margin-left: auto; }
.help-btn-icon { margin-left: 2px; }

.help-search { padding: 12px; }
.help-offline { margin: 0 12px 12px; }

.help-frame-wrap { flex: 1; min-height: 0; margin: 0 12px; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.help-frame { display: block; width: 100%; height: 100%; border: 0; background: #fff; }

.help-glossary { padding: 12px; overflow-y: auto; max-height: 45%; border-top: 1px solid var(--border); margin-top: 12px; }
.glossary-head { font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 10px; }
.glossary-empty { font-size: 13px; color: var(--text-muted); padding: 16px 4px; }
.glossary-list { display: flex; flex-direction: column; gap: 10px; }
.glossary-item {
  padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-card);
}
.glossary-label { font-size: 14px; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 6px; }
.glossary-code { font-size: 11px; }
.glossary-def { font-size: 13px; color: var(--text-sub); line-height: 1.7; margin-top: 4px; }

@media (max-width: 768px) {
  .help-fab { right: 12px; bottom: 12px; width: 44px; height: 44px; }
  .help-glossary { max-height: 40%; }
}
</style>
