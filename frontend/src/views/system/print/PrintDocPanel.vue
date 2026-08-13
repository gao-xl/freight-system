<template>
  <el-form label-width="72px" size="small">
    <el-form-item label="模板名"><el-input v-model="d.name" placeholder="模板名称" /></el-form-item>
    <el-form-item label="纸张">
      <el-select v-model="d.pageSize" style="width:100%">
        <el-option v-for="p in PAGE_SIZES" :key="p" :label="p" :value="p" />
      </el-select>
    </el-form-item>
    <el-form-item label="Logo 地址"><el-input v-model="d.logoUrl" placeholder="公司 Logo 图片地址" /></el-form-item>
    <el-form-item label="自定义页眉"><el-input v-model="d.header" placeholder="打印页顶部文字" /></el-form-item>
    <el-form-item label="自定义页脚"><el-input v-model="d.footer" type="textarea" :rows="2" placeholder="打印页底部文字" /></el-form-item>
    <el-form-item label="备注"><el-input v-model="d.remark" type="textarea" :rows="2" /></el-form-item>
  </el-form>
</template>

<script setup>
import { computed } from 'vue';
import { PAGE_SIZES } from '@/composables/usePrintTemplate';

const props = defineProps({ doc: { type: Object, required: true } });
// 通过 computed 代理读写 doc 对象属性，避免直接修改 prop（vue/no-mutating-props）
const d = computed(() => props.doc);
</script>
