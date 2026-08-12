<template>
  <div class="guide-wrap">
    <iframe
      class="guide-frame"
      :src="guideBase"
      title="用户使用教程"
      loading="lazy"
    />
  </div>
</template>

<script setup>
// 用户使用教程：由前端静态资源（public/guide/）提供，这里用 iframe 嵌入主界面内容区，
// 保留系统顶部栏与侧边栏，用户无需离开系统即可随时查阅操作手册。
const guideBase = '/guide/freight-user-guide.html';
</script>

<style scoped>
/* 用负 margin 抵消 .content 的 20px 内边距，让教程铺满整个内容区（顶部栏高 60px） */
.guide-wrap {
  margin: -20px;
  height: calc(100vh - 60px);
  overflow: hidden;
  background: #fff;
}
.guide-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>