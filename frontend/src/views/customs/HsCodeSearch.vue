<template>
  <div class="page-card">
    <div class="topbar">
      <div class="left">
        <el-input v-model="keyword" placeholder="搜索HS编码或商品名称" clearable style="width:320px" @keyup.enter="search" @clear="search">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>搜索</el-button>
      </div>
      <div class="ai-block">
        <el-input v-model="describe" placeholder="输入商品品名/描述，AI 智能推荐 HS 编码" clearable style="width:340px" @keyup.enter="classify">
          <template #prefix><el-icon><MagicStick /></el-icon></template>
        </el-input>
        <el-button type="success" :loading="classifying" @click="classify"><el-icon><MagicStick /></el-icon>智能归类</el-button>
        <el-tag v-if="classifySource" size="small" :type="classifySource === 'ai' ? 'success' : 'info'">{{ classifySource === 'ai' ? 'AI 推荐' : '本地知识库匹配' }}</el-tag>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="6">
        <el-card shadow="never" class="chapter-card">
          <template #header>章节浏览</template>
          <div class="chapter-list">
            <div v-for="ch in chapters" :key="ch.chapter" class="chapter-item"
              :class="{ active: activeChapter === ch.chapter }"
              @click="browseChapter(ch.chapter)">
              <span class="ch-code">{{ ch.chapter }}</span>
              <span class="ch-count">{{ ch.count }}条</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="18">
        <el-table :data="results" v-loading="loading" stripe>
          <template #empty>
            <EmptyGuide v-if="!loading" :mode="keyword || activeChapter ? 'filtered' : 'guide'"
              title="HS编码知识库" hint="通过搜索或章节浏览快速查找海关HS编码，支持查看税率、监管条件等关键信息。"
              @reset="resetAll" />
          </template>
          <el-table-column prop="code" label="HS编码" width="130" />
          <el-table-column prop="name" label="商品名称" min-width="220" show-overflow-tooltip />
          <el-table-column label="出口退税率" width="110" align="center">
            <template #default="{row}">{{ pct(row.exportRate) }}</template>
          </el-table-column>
          <el-table-column label="进口关税率" width="110" align="center">
            <template #default="{row}">{{ pct(row.importRate) }}</template>
          </el-table-column>
          <el-table-column label="增值税率" width="100" align="center">
            <template #default="{row}">{{ pct(row.vatRate) }}</template>
          </el-table-column>
          <el-table-column prop="unit" label="法定单位" width="90" align="center" />
          <el-table-column label="监管条件" width="100" align="center">
            <template #default="{row}">
              <el-tag v-if="row.supervision" size="small" type="warning">{{ row.supervision }}</el-tag>
              <span v-else class="text-sub">无</span>
            </template>
          </el-table-column>
          <el-table-column label="常用" width="70" align="center">
            <template #default="{row}">
              <el-icon v-if="row.isCommon" color="#67c23a"><CircleCheck /></el-icon>
              <span v-else class="text-sub">-</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="result-hint" v-if="results.length && !loading">
          共 {{ results.length }} 条结果，{{ results.length >= 50 ? '请缩小搜索范围' : '' }}
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { hsCodeAPI } from '@/api';
import { aiAPI } from '@/api/ai';
import EmptyGuide from '@/components/EmptyGuide.vue';

const loading = ref(false);
const keyword = ref('');
const results = ref([]);
const chapters = ref([]);
const activeChapter = ref('');
const describe = ref('');
const classifying = ref(false);
const classifySource = ref('');

async function classify() {
  const text = describe.value.trim();
  if (!text) return;
  classifying.value = true;
  classifySource.value = '';
  try {
    const data = await aiAPI.hsClassify({ text });
    classifySource.value = data.source;
    results.value = (data.items || []).map((it) => ({
      code: it.code, name: it.name, exportRate: it.exportRate, importRate: it.importRate,
      vatRate: it.vatRate, unit: '', supervision: it.supervision || '', isCommon: false,
    }));
  } catch (e) {
    // 智能归类的失败不应阻断用户继续搜索，提示后静默
  } finally { classifying.value = false; }
}

function pct(v) {
  if (v == null || v === 0) return '-';
  return (v * 100).toFixed(1) + '%';
}

function resetAll() {
  keyword.value = '';
  activeChapter.value = '';
  results.value = [];
}

async function search() {
  loading.value = true;
  try {
    const params = {};
    if (keyword.value) params.q = keyword.value;
    if (activeChapter.value) params.chapter = activeChapter.value;
    const data = await hsCodeAPI.search(params);
    results.value = data;
  } finally { loading.value = false; }
}

async function browseChapter(ch) {
  activeChapter.value = ch;
  keyword.value = '';
  loading.value = true;
  try {
    const data = await hsCodeAPI.search({ chapter: ch });
    results.value = data;
  } finally { loading.value = false; }
}

onMounted(async () => {
  try {
    chapters.value = await hsCodeAPI.chapters();
  } catch { /* 后端未就绪容错 */ }
  search();
});
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.chapter-card { max-height: calc(100vh - 200px); overflow-y: auto; }
.chapter-list { display: flex; flex-direction: column; gap: 2px; }
.chapter-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: background 0.15s; }
.chapter-item:hover { background: var(--fill); }
.chapter-item.active { background: var(--brand-light); color: var(--brand); font-weight: 600; }
.ch-code { font-family: monospace; font-size: 14px; }
.ch-count { font-size: 12px; color: var(--text-sub); }
.result-hint { text-align: center; margin-top: 12px; font-size: 12px; color: var(--text-sub); }
.text-sub { color: var(--text-sub); font-size: 12px; }
</style>