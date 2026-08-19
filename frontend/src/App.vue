<template>
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup>
// 按需引入方案下，全局中文 locale 经 el-config-provider 提供（替代原 app.use(ElementPlus,{locale})）
import zhCn from 'element-plus/es/locale/lang/zh-cn';
</script>
