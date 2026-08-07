<template>
  <div class="page-card">
    <el-alert type="info" :closable="false" show-icon class="import-alert">
      支持批量导入客户、供应商与订单数据。请先下载对应模板，按模板表头填写后上传 Excel 文件（.xlsx，≤10MB）；
      单行错误不阻断其余数据写入，导入结果会逐条列出失败原因。
    </el-alert>

    <el-tabs v-model="activeBiz">
      <el-tab-pane v-for="t in tabs" :key="t.biz" :name="t.biz" lazy>
        <template #label>
          <span class="tab-label">
            <el-icon class="tab-icon"><component :is="t.icon" /></el-icon>{{ t.label }}
          </span>
        </template>
        <ImportPanel :biz="t.biz" :file-name="t.fileName" :tip="t.tip" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import ImportPanel from './ImportPanel.vue';

const activeBiz = ref('customer');
const tabs = [
  {
    biz: 'customer',
    label: '客户',
    icon: 'User',
    fileName: '客户',
    tip: '客户名称为必填且不可重复；客户编码留空将自动生成（CUS 前缀）。',
  },
  {
    biz: 'supplier',
    label: '供应商',
    icon: 'OfficeBuilding',
    fileName: '供应商',
    tip: '供应商名称为必填且不可重复；供应商编码留空将自动生成（SUP 前缀）。',
  },
  {
    biz: 'order',
    label: '订单',
    icon: 'Document',
    fileName: '订单',
    tip: '订单号必填且不可重复；「客户名称」需与系统中已有客户完全一致，预计发运/到港日期格式为 YYYY-MM-DD。',
  },
];
</script>

<style scoped>
.import-alert { margin-bottom: 8px; }
.tab-label { display: inline-flex; align-items: center; gap: 6px; }
.tab-icon { font-size: 15px; }
</style>
