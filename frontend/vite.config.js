import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 最小骨架：纯函数/工具逻辑用 node 环境；组件测试后续再引入 jsdom
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
  server: {
    port: 5173,
    proxy: {
      // 开发文档（VitePress 构建产物）由后端统一输出，开发时经 /docs 反代，不另起端口
      '/docs': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});