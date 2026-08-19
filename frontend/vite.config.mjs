import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import Components from 'unplugin-vue-components/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  plugins: [
    vue(),
    // 按需引入 Element Plus 组件（模板中直接使用 el-xxx 时自动按需导入组件与样式）
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 构建优化：vendor 三巨头独立分包（长缓存）+ 提高 chunk 告警阈值
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          echarts: ['echarts'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
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