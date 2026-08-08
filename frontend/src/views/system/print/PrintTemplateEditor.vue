<template>
  <div class="page-card editor">
    <!-- 顶部工具栏 -->
    <div class="topbar">
      <el-button size="small" @click="$emit('cancel')"><el-icon><ArrowLeft /></el-icon>返回列表</el-button>
      <el-select v-model="docType" size="small" style="width:118px" :disabled="!!editId" @change="onDocTypeChange">
        <el-option v-for="d in PRINT_DOC_TYPES" :key="d.value" :label="d.label" :value="d.value" />
      </el-select>
      <el-input v-model="doc.name" size="small" placeholder="模板名称" style="width:200px" />
      <span class="spacer" />
      <el-button size="small" :loading="saving" @click="preview"><el-icon><View /></el-icon>预览</el-button>
      <el-button size="small" type="primary" :loading="saving" @click="save"><el-icon><Check /></el-icon>保存模板</el-button>
    </div>

    <div class="cols">
      <!-- 左：字段库 -->
      <div class="panel lib">
        <div class="panel-title">字段库</div>
        <div class="scroll">
          <div v-if="!fieldGroups.length" class="empty-tip">该单据暂无可用字段</div>
          <div v-for="g in fieldGroups" :key="g.label" class="lib-group">
            <div class="group-label">{{ g.label }}</div>
            <div v-for="f in g.items" :key="f.key" class="field-item" :title="f.key" @click="addField(f)">
              <el-icon><Plus /></el-icon><span>{{ f.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 中：画布 -->
      <div class="panel canvas">
        <div class="panel-title">模板画布 <span class="tip">点击区块选中，右侧调整参数</span></div>
        <div class="scroll canvas-scroll">
          <div class="page">
            <div v-if="!tpl.blocks.length" class="empty-tip">点击左侧字段或下方按钮添加区块</div>
            <div v-for="(b, bi) in tpl.blocks" :key="bi" class="block" :class="{ active: sel === bi }" @click="sel = bi">
              <div class="block-head">
                <span class="b-title">{{ BLOCK_LABELS[b.type] || b.type }}</span>
                <div class="b-ops">
                  <el-button link size="small" :disabled="bi === 0" @click.stop="moveBlock(bi, -1)">上移</el-button>
                  <el-button link size="small" :disabled="bi === tpl.blocks.length - 1" @click.stop="moveBlock(bi, 1)">下移</el-button>
                  <el-button link size="small" type="danger" @click.stop="removeBlock(bi)">删除</el-button>
                </div>
              </div>
              <div v-if="b.type === 'header'" class="mini header" :style="{ textAlign: b.align, fontSize: b.fontSize + 'px', fontWeight: b.bold ? 'bold' : 'normal' }">{{ b.title }}</div>
              <div v-else-if="b.type === 'fields'" class="mini">
                <div v-for="(f, fi) in b.fields" :key="fi" class="mini-field" :class="{ off: !f.show }">
                  <span class="mf-label">{{ f.label }}：</span><span class="mf-val">{{ f.show ? '示例值' : '（隐藏）' }}</span>
                </div>
                <div v-if="!b.fields.length" class="mini-empty">未添加字段</div>
              </div>
              <div v-else-if="b.type === 'table'" class="mini tag-row">
                <el-tag size="small" type="info">表格</el-tag><span class="mini-key">{{ b.key }}</span>
              </div>
              <div v-else-if="b.type === 'sign'" class="mini tag-row">
                <span v-for="(c, ci) in b.columns" :key="ci" class="sign-item">{{ c }}：____</span>
              </div>
              <div v-else-if="b.type === 'logo'" class="mini tag-row">
                <el-tag size="small" type="info">Logo</el-tag><span class="mini-key">{{ b.url ? '已设置图片' : '未设置图片' }}</span>
              </div>
              <div v-else-if="b.type === 'footer'" class="mini footer">{{ b.text }}</div>
            </div>

            <div class="add-blocks">
              <el-button v-for="t in BLOCK_TYPES" :key="t.value" size="small" @click="addBlock(t.value)">
                <el-icon><component :is="t.icon" /></el-icon>{{ t.label }}
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右：属性面板 -->
      <div class="panel prop">
        <div class="panel-title">属性设置</div>
        <el-collapse v-model="openPanels" class="prop-collapse">
          <el-collapse-item title="文档设置" name="doc">
            <PrintDocPanel :doc="doc" />
          </el-collapse-item>
          <el-collapse-item title="区块参数" name="block" v-if="currentBlock">
            <PrintBlockPanel :block="currentBlock" :field-options="fields" />
          </el-collapse-item>
          <el-collapse-item title="字段变量说明" name="var">
            <div class="var-note">
              <p>字段使用「数据源.字段」点路径，如 <code>order.customer.name</code>，渲染时由后端按业务数据自动填充。</p>
              <div v-for="g in fieldGroups" :key="g.label" class="lib-group">
                <div class="group-label">{{ g.label }}</div>
                <div v-for="f in g.items" :key="f.key" class="var-item"><code>{{ f.key }}</code><span>{{ f.label }}</span></div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>

    <PrintPreviewDialog v-model="previewOpen" :template-id="editId" :doc-type="docType" ref="previewRef" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { printTemplateAPI } from '@/api';
import {
  PRINT_DOC_TYPES, BLOCK_LABELS,
  parseContent, defaultBlocks, loadFields, createBlock,
} from '@/composables/usePrintTemplate';
import PrintDocPanel from './PrintDocPanel.vue';
import PrintBlockPanel from './PrintBlockPanel.vue';
import PrintPreviewDialog from './PrintPreviewDialog.vue';

const props = defineProps({ template: { type: Object, default: null } });
const emit = defineEmits(['saved', 'cancel']);

const docType = ref(props.template?.docType || 'bl');
const editId = ref(props.template?.id || null);
const doc = reactive({
  name: props.template?.name || '',
  pageSize: props.template?.pageSize || 'A4',
  logoUrl: props.template?.logoUrl || '',
  header: props.template?.header || '',
  footer: props.template?.footer || '',
  remark: props.template?.remark || '',
});
const tpl = reactive({ blocks: parseContent(props.template?.content).blocks });
const sel = ref(null);
const fields = ref([]);
const saving = ref(false);
const previewOpen = ref(false);
const previewRef = ref(null);
const openPanels = ref(['doc']);

const BLOCK_TYPES = [
  { value: 'header', label: '标题', icon: 'Edit' },
  { value: 'fields', label: '字段区', icon: 'Collection' },
  { value: 'table', label: '表格', icon: 'Grid' },
  { value: 'sign', label: '签署栏', icon: 'EditPen' },
  { value: 'logo', label: 'Logo', icon: 'Picture' },
  { value: 'footer', label: '页脚', icon: 'Bottom' },
];

const currentBlock = computed(() => (sel.value !== null ? tpl.blocks[sel.value] : null));
const fieldGroups = computed(() => {
  const map = {};
  for (const f of fields.value) (map[f.group] = map[f.group] || []).push(f);
  return Object.entries(map).map(([label, items]) => ({ label, items }));
});

async function loadFieldLib() {
  fields.value = await loadFields(docType.value);
  if (!editId.value && !tpl.blocks.length) {
    tpl.blocks.push(...defaultBlocks(docType.value, fields.value));
    sel.value = null;
  }
}

function onDocTypeChange() {
  if (!editId.value) tpl.blocks.splice(0);
  loadFieldLib();
}

function addField(f) {
  let bi = tpl.blocks.findIndex((b) => b.type === 'fields');
  if (bi === -1) { tpl.blocks.push(createBlock('fields')); bi = tpl.blocks.length - 1; }
  if (!tpl.blocks[bi].fields.some((x) => x.key === f.key)) {
    tpl.blocks[bi].fields.push({ key: f.key, label: f.label, show: true, type: f.type });
  }
  sel.value = bi;
}

function addBlock(type) {
  tpl.blocks.push(createBlock(type));
  sel.value = tpl.blocks.length - 1;
}

function moveBlock(bi, dir) {
  const target = bi + dir;
  if (target < 0 || target >= tpl.blocks.length) return;
  [tpl.blocks[bi], tpl.blocks[target]] = [tpl.blocks[target], tpl.blocks[bi]];
  sel.value = target;
}

function removeBlock(bi) { tpl.blocks.splice(bi, 1); sel.value = null; }

function buildPayload() {
  return {
    name: doc.name,
    docType: docType.value,
    pageSize: doc.pageSize,
    logoUrl: doc.logoUrl || null,
    header: doc.header || null,
    footer: doc.footer || null,
    remark: doc.remark || null,
    content: JSON.stringify({ blocks: tpl.blocks }),
  };
}

async function persist() {
  if (!doc.name.trim()) throw new Error('请输入模板名称');
  const payload = buildPayload();
  if (editId.value) await printTemplateAPI.update(editId.value, payload);
  else { const created = await printTemplateAPI.create(payload); editId.value = created.id; }
}

async function save() {
  saving.value = true;
  try {
    await persist();
    ElMessage.success('模板已保存');
    emit('saved');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function preview() {
  saving.value = true;
  try {
    await persist();
    if (previewOpen.value) previewRef.value?.refresh();
    else previewOpen.value = true;
  } catch (e) {
    ElMessage.error(e.message || '预览失败');
  } finally {
    saving.value = false;
  }
}

// 实时预览：预览面板打开时，内容变更 1.2s 后自动保存并刷新
let previewTimer = null;
watch(
  () => JSON.stringify({ blocks: tpl.blocks, name: doc.name, pageSize: doc.pageSize, logoUrl: doc.logoUrl, header: doc.header, footer: doc.footer }),
  () => {
    if (!previewOpen.value) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(preview, 1200);
  }
);

// 选中区块时自动展开「区块参数」
watch(sel, (v) => {
  if (v !== null && !openPanels.value.includes('block')) openPanels.value.push('block');
});

onMounted(loadFieldLib);
</script>

<style scoped>
.editor { display: flex; flex-direction: column; height: calc(100vh - 120px); }
.topbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
.cols { display: flex; gap: 12px; flex: 1; min-height: 0; }
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.panel-title { font-weight: 600; margin-bottom: 10px; font-size: 14px; }
.panel-title .tip { color: var(--text-sub); font-size: 12px; font-weight: 400; margin-left: 8px; }
.lib { width: 210px; }
.prop { width: 280px; }
.canvas { flex: 1; background: var(--brand-bg); }
.scroll { flex: 1; overflow: auto; min-height: 0; }
.canvas-scroll { padding: 14px; }
.page {
  background: #fff;
  min-height: 560px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
  border-radius: 4px;
}
.empty-tip { text-align: center; color: var(--text-sub); padding: 30px 0; font-size: 13px; }
.group-label { color: var(--text-sub); font-size: 12px; margin: 8px 0 4px; }
.field-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.field-item:hover { background: var(--brand-bg); color: var(--brand); }
.block { border: 1px dashed var(--border); padding: 10px; margin-bottom: 10px; border-radius: 6px; cursor: pointer; }
.block.active { border-color: var(--brand); background: var(--brand-bg); }
.block-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.b-title { font-weight: 600; font-size: 13px; }
.mini { font-size: 13px; } .mini.header { padding: 6px 0; }
.mini.footer { color: var(--text-sub); font-size: 12px; padding-top: 6px; border-top: 1px solid var(--border); }
.mini-field { padding: 2px 0; } .mini-field.off { opacity: 0.45; }
.mf-label { color: var(--text-sub); } .mf-val { color: var(--text-main); }
.mini-empty { color: var(--text-sub); font-size: 12px; }
.tag-row { display: flex; align-items: center; gap: 8px; } .mini-key { color: var(--text-sub); font-size: 12px; } .sign-item { margin-right: 16px; }
.add-blocks { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); } .prop-collapse { border: none; }
.var-note p { color: var(--text-sub); font-size: 12px; line-height: 1.6; margin: 0 0 6px; }
.var-item { display: flex; gap: 8px; align-items: center; font-size: 12px; padding: 2px 0; }
.var-item code { background: var(--brand-bg); color: var(--brand-dark); padding: 1px 6px; border-radius: 4px; }
@media (max-width: 900px) {
  .cols { flex-direction: column; }
  .lib, .prop { width: 100%; }
}
</style>
