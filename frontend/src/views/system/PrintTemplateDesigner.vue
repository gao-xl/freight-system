<template>
  <div class="page-card designer">
    <!-- 顶部工具栏 -->
    <div class="topbar">
      <el-select v-model="docType" size="small" style="width:130px" @change="loadFields">
        <el-option v-for="d in DOC_TYPES" :key="d.value" :label="d.label" :value="d.value" />
      </el-select>
      <el-input v-model="name" size="small" placeholder="模板名称" style="width:180px" />
      <el-button size="small" type="primary" @click="save">保存模板</el-button>
      <el-button size="small" @click="preview">预览</el-button>
      <el-button size="small" link type="primary" @click="back">返回</el-button>
    </div>

    <div class="cols">
      <!-- 左：字段库 -->
      <div class="field-lib">
        <div class="lib-title">字段库</div>
        <div class="lib-group" v-for="g in groups" :key="g.label">
          <div class="group-label">{{ g.label }}</div>
          <div class="field-item" v-for="f in g.items" :key="f.key" @click="addField(f)">
            <el-icon><Plus /></el-icon>
            <span>{{ f.label }}</span>
          </div>
        </div>
      </div>

      <!-- 中：画布 -->
      <div class="canvas" :class="{ selected }">
        <div class="canvas-page">
          <div v-if="tpl.blocks.length === 0" class="empty">点击左侧字段添加区块</div>
          <div v-for="(b, bi) in tpl.blocks" :key="bi" class="block" :class="{ active: selectedBlock === bi }" @click="selectedBlock = bi">
            <div class="block-head">
              <span class="b-title">{{ blockTitle(b) }}</span>
              <div class="b-ops">
                <el-button link size="small" @click.stop="moveBlock(bi, -1)">上移</el-button>
                <el-button link size="small" @click.stop="moveBlock(bi, 1)">下移</el-button>
                <el-button link size="small" type="danger" @click.stop="removeBlock(bi)">删除</el-button>
              </div>
            </div>
            <div v-if="b.type === 'fields'" class="block-fields">
              <div class="f-row" v-for="(f, fi) in b.fields" :key="fi">
                <el-checkbox v-model="f.show" size="small" @change="selectedBlock = bi" />
                <span class="f-label">{{ f.label }}</span>
                <span class="f-key">{{ f.key }}</span>
                <el-button link size="small" type="danger" @click.stop="removeField(b, fi)">移除</el-button>
              </div>
            </div>
            <div v-else-if="b.type === 'header'" class="block-preview">{{ b.title }}</div>
            <div v-else-if="b.type === 'footer'" class="block-preview footer">{{ b.text }}</div>
          </div>
        </div>
      </div>

      <!-- 右：属性面板 -->
      <div class="prop-panel">
        <div class="lib-title">属性面板</div>
        <template v-if="selectedBlock !== null && tpl.blocks[selectedBlock]">
          <el-form label-width="60px" size="small">
            <el-form-item label="区块">
              <el-select v-model="tpl.blocks[selectedBlock].type" :disabled="true" style="width:100%">
                <el-option label="头部" value="header" />
                <el-option label="字段区" value="fields" />
                <el-option label="页脚" value="footer" />
              </el-select>
            </el-form-item>
            <template v-if="tpl.blocks[selectedBlock].type === 'header'">
              <el-form-item label="标题"><el-input v-model="tpl.blocks[selectedBlock].title" /></el-form-item>
              <el-form-item label="字号"><el-input-number v-model="tpl.blocks[selectedBlock].fontSize" :min="10" :max="30" /></el-form-item>
              <el-form-item label="加粗"><el-switch v-model="tpl.blocks[selectedBlock].bold" /></el-form-item>
            </template>
            <template v-if="tpl.blocks[selectedBlock].type === 'fields'">
              <el-form-item label="列数"><el-input-number v-model="tpl.blocks[selectedBlock].columns" :min="1" :max="4" /></el-form-item>
            </template>
            <template v-if="tpl.blocks[selectedBlock].type === 'footer'">
              <el-form-item label="文本"><el-input v-model="tpl.blocks[selectedBlock].text" type="textarea" :rows="3" /></el-form-item>
            </template>
          </el-form>
        </template>
        <el-empty v-else description="选中画布中的区块进行编辑" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { printTemplateAPI } from '@/api';

const router = useRouter();
const DOC_TYPES = [
  { value: 'bl', label: '提单' },
  { value: 'invoice', label: '发票' },
  { value: 'packing_list', label: '装箱单' },
  { value: 'quotation', label: '报价单' },
  { value: 'customs', label: '报关单' },
  { value: 'statement', label: '对账单' },
  { value: 'order', label: '订单操作单' },
  { value: 'settlement', label: '结算单' },
];
const docType = ref('bl');
const name = ref('默认提单模板');
const tpl = ref({ blocks: [] });
const selectedBlock = ref(null);
const fields = ref([]);
const editId = ref(null);

const groups = computed(() => {
  const map = {};
  for (const f of fields.value) {
    (map[f.group] = map[f.group] || []).push(f);
  }
  return Object.entries(map).map(([label, items]) => ({ label, items }));
});

const blockTitle = (b) => ({ header: '头部标题', fields: '字段区', footer: '页脚' }[b.type] || b.type);

function addField(f) {
  // 添加到第一个 fields 区块，若无则新建
  let bi = tpl.value.blocks.findIndex((b) => b.type === 'fields');
  if (bi === -1) {
    tpl.value.blocks.push({ type: 'fields', label: '字段区', columns: 2, fields: [] });
    bi = tpl.value.blocks.length - 1;
  }
  tpl.value.blocks[bi].fields.push({ key: f.key, label: f.label, show: true, type: f.type });
  selectedBlock.value = bi;
}

function removeField(b, fi) { b.fields.splice(fi, 1); }
function moveBlock(bi, dir) {
  const target = bi + dir;
  if (target < 0 || target >= tpl.value.blocks.length) return;
  const arr = tpl.value.blocks;
  [arr[bi], arr[target]] = [arr[target], arr[bi]];
  selectedBlock.value = target;
}
function removeBlock(bi) {
  tpl.value.blocks.splice(bi, 1);
  selectedBlock.value = null;
}

async function loadFields() {
  fields.value = await printTemplateAPI.fields(docType.value);
  // 初始化默认模板
  const list = await printTemplateAPI.list({ docType: docType.value });
  if (list.length) {
    const d = list.find((t) => t.isDefault) || list[0];
    editId.value = d.id;
    name.value = d.name;
    tpl.value.blocks = JSON.parse(d.content).blocks || [];
  } else {
    editId.value = null;
    tpl.value.blocks = [
      { type: 'header', title: '货运单据', align: 'center', fontSize: 18, bold: true },
      { type: 'fields', label: '字段区', columns: 2, fields: fields.value.slice(0, 8).map((f) => ({ key: f.key, label: f.label, show: true, type: f.type })) },
      { type: 'footer', text: '本单由货代管理系统生成' },
    ];
  }
}

async function save() {
  if (!name.value) return ElMessage.warning('请输入模板名称');
  const payload = {
    name: name.value,
    docType: docType.value,
    content: JSON.stringify({ blocks: tpl.value.blocks }),
  };
  if (editId.value) {
    await printTemplateAPI.update(editId.value, payload);
  } else {
    const created = await printTemplateAPI.create(payload);
    editId.value = created.id;
  }
  ElMessage.success('模板已保存');
}

async function preview() {
  if (!editId.value) { await save(); }
  const data = await printTemplateAPI.preview(editId.value, {});
  window.open('', '_blank').document.write(data.html);
}

function back() { router.push('/system'); }

onMounted(() => loadFields());
</script>

<style scoped>
.designer { display: flex; flex-direction: column; height: calc(100vh - 120px); }
.topbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.cols { display: flex; gap: 12px; flex: 1; min-height: 0; }
.field-lib { width: 220px; border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; background: #fff; }
.lib-title { font-weight: 600; margin-bottom: 10px; }
.group-label { color: var(--text-sub); font-size: 12px; margin: 8px 0 4px; }
.field-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.field-item:hover { background: var(--brand-light); }
.canvas { flex: 1; border: 1px solid var(--border); border-radius: 8px; overflow: auto; background: #eef1f5; padding: 16px; }
.canvas-page { background: #fff; min-height: 600px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.empty { text-align: center; color: #aaa; padding: 60px 0; }
.block { border: 1px dashed #ddd; padding: 10px; margin-bottom: 10px; border-radius: 6px; cursor: pointer; }
.block.active { border-color: var(--brand); background: var(--brand-light); }
.block-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.b-title { font-weight: 600; font-size: 13px; }
.f-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.f-label { font-weight: 500; }
.f-key { color: #999; font-size: 12px; flex: 1; }
.block-preview { text-align: center; font-size: 18px; font-weight: 700; padding: 8px; }
.block-preview.footer { font-size: 12px; font-weight: 400; color: #888; }
.prop-panel { width: 250px; border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; background: #fff; }
</style>