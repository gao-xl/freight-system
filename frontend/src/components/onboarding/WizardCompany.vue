<template>
  <div class="wizard-body">
    <el-form label-position="top" size="large">
      <el-form-item label="公司全称（必填）" :error="touched && !model.companyName.trim() ? '请填写公司全称' : ''">
        <el-input
          v-model="model.companyName"
          placeholder="如：青岛海通达国际货运代理有限公司"
          @blur="touched = true"
        />
      </el-form-item>
      <el-form-item label="联系人（选填）">
        <el-input v-model="model.contact" placeholder="如：张经理" />
      </el-form-item>
      <el-form-item label="联系电话（选填）">
        <el-input v-model="model.phone" placeholder="如：0532-88886666" />
      </el-form-item>
    </el-form>
    <p class="hint">公司全称会显示在报价单、对账单等单据上。</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
// 公司信息（仅公司全称必填，AC-03）
defineProps({ model: { type: Object, required: true } });
const touched = ref(false);
</script>

<style scoped>
.wizard-body { padding: 8px 4px; }
.hint { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; }
</style>
