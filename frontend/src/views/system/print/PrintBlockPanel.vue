<template>
  <div class="block-panel">
    <el-form label-width="64px" size="small">
      <!-- 头部标题 -->
      <template v-if="b.type === 'header'">
        <el-form-item label="标题"><el-input v-model="b.title" placeholder="单据标题" /></el-form-item>
        <el-form-item label="对齐">
          <el-select v-model="b.align" style="width:100%">
            <el-option v-for="a in ALIGNS" :key="a.value" :label="a.label" :value="a.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="字号">
          <el-input-number v-model="b.fontSize" :min="10" :max="30" style="width:100%" />
        </el-form-item>
        <el-form-item label="加粗"><el-switch v-model="b.bold" /></el-form-item>
      </template>

      <!-- 公司 Logo -->
      <template v-if="b.type === 'logo'">
        <el-form-item label="图片地址"><el-input v-model="b.url" placeholder="https://…/logo.png" /></el-form-item>
        <el-form-item label="显示宽度">
          <el-input-number v-model="b.width" :min="60" :max="400" :step="10" style="width:100%" />
        </el-form-item>
      </template>

      <!-- 字段区 -->
      <template v-if="b.type === 'fields'">
        <el-form-item label="列数">
          <el-input-number v-model="b.columns" :min="1" :max="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="字段">
          <div class="field-list">
            <div v-for="(f, fi) in b.fields" :key="fi" class="field-row">
              <el-checkbox v-model="f.show" :title="f.show ? '显示' : '隐藏'" />
              <el-input v-model="f.label" size="small" class="f-label" :title="f.key" />
              <span class="f-key" :title="f.key">{{ f.key }}</span>
              <el-button link size="small" :disabled="fi === 0" @click="moveField(fi, -1)"><el-icon><Top /></el-icon></el-button>
              <el-button link size="small" :disabled="fi === b.fields.length - 1" @click="moveField(fi, 1)"><el-icon><Bottom /></el-icon></el-button>
              <el-button link size="small" type="danger" @click="b.fields.splice(fi, 1)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="添加">
          <el-select v-model="addKey" filterable placeholder="从字段库选择" size="small" style="width:100%" @change="addField">
            <el-option v-for="f in fieldOptions" :key="f.key" :label="`${f.label}（${f.key}）`" :value="f.key" />
          </el-select>
        </el-form-item>
      </template>

      <!-- 数据表格 -->
      <template v-if="b.type === 'table'">
        <el-form-item label="数据源">
          <el-select v-model="b.key" style="width:100%">
            <el-option v-for="s in TABLE_SOURCES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="列定义">
          <div class="field-list">
            <div v-for="(c, ci) in b.columns" :key="ci" class="field-row">
              <el-input v-model="c.label" size="small" class="f-label" placeholder="列名" />
              <el-input v-model="c.key" size="small" class="f-key" placeholder="字段" />
              <el-button link size="small" type="danger" @click="b.columns.splice(ci, 1)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="操作">
          <el-button size="small" @click="b.columns.push({ key: '', label: '新列' })">添加列</el-button>
        </el-form-item>
      </template>

      <!-- 签署栏 -->
      <template v-if="b.type === 'sign'">
        <el-form-item label="签署方">
          <div class="field-list">
            <div v-for="(c, ci) in b.columns" :key="ci" class="field-row">
              <el-input v-model="b.columns[ci]" size="small" class="f-label" placeholder="签署方名称" />
              <el-button link size="small" type="danger" @click="b.columns.splice(ci, 1)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="操作">
          <el-button size="small" @click="b.columns.push('')">添加签署方</el-button>
        </el-form-item>
      </template>

      <!-- 页脚 -->
      <template v-if="b.type === 'footer'">
        <el-form-item label="文本">
          <el-input v-model="b.text" type="textarea" :rows="3" placeholder="页脚说明文字" />
        </el-form-item>
        <el-form-item label="对齐">
          <el-select v-model="b.align" style="width:100%">
            <el-option v-for="a in ALIGNS" :key="a.value" :label="a.label" :value="a.value" />
          </el-select>
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { TABLE_SOURCES } from '@/composables/usePrintTemplate';

const props = defineProps({
  block: { type: Object, required: true },
  fieldOptions: { type: Array, default: () => [] },
});

// 通过 computed 代理读写 block 对象属性，避免直接修改 prop（vue/no-mutating-props）
const b = computed(() => props.block);

const ALIGNS = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
];

const addKey = ref('');

function moveField(fi, dir) {
  const list = b.value.fields;
  const target = fi + dir;
  if (target < 0 || target >= list.length) return;
  [list[fi], list[target]] = [list[target], list[fi]];
}

function addField(key) {
  const f = props.fieldOptions.find((o) => o.key === key);
  if (f) b.value.fields.push({ key: f.key, label: f.label, show: true, type: f.type });
  addKey.value = '';
}
</script>

<style scoped>
.field-list { width: 100%; }
.field-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  width: 100%;
}
.f-label { flex: 1; min-width: 60px; }
.f-key {
  flex: 0 0 96px;
  color: var(--text-sub);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
