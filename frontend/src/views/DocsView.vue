<template>
  <div class="docs-wrap">
    <iframe
      class="docs-frame"
      :src="docsBase"
      title="开发文档"
      loading="lazy"
    />
  </div>
</template>

<script setup>
// 开发文档（VitePress）由后端在 /docs 统一输出。
// 这里用 iframe 把文档嵌进主界面内容区，保留系统顶部栏与侧边栏，不再新开标签页。
// 开发环境经 Vite 代理、生产环境经 Nginx 反代，均指向后端 /docs。
const docsBase = '/docs/';
</script>

<style scoped>
/* 用负 margin 抵消 .content 的 20px 内边距，让文档铺满整个内容区（顶部栏高 60px） */
.docs-wrap {
  margin: -20px;
  height: calc(100vh - 60px);
  overflow: hidden;
  background: #fff;
}
.docs-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>