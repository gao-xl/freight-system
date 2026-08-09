import { defineConfig } from 'vitepress';

export default defineConfig({
  title: '货代系统 Freight System',
  description: '面向 OPC 与小团队的开源货代系统 — 开箱即用核心链路 + 干净代码基座 + 插件化二开体系',
  lang: 'zh-CN',
  lastUpdated: false,
  // 文档挂载在主系统 /docs 下，由后端 Express 统一输出，不再占用独立端口
  base: '/docs/',
  // 构建产物直接落到后端静态目录，后端启动即可对外输出，无需二次拷贝
  // outDir 相对 VitePress 根目录（docs/）解析，故用 ../../ 回到仓库根再进 backend
  outDir: '../../backend/public/docs',
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: '开发标准', link: '/dev/index' },
      { text: 'API 参考', link: '/reference/api' },
      { text: '部署运维', link: '/deploy/docker' },
    ],
    sidebar: [
      {
        text: '开发标准',
        collapsed: false,
        items: [
          { text: '标准总览', link: '/dev/index' },
          { text: '核心概念', link: '/guide/concepts' },
          { text: '二开哲学', link: '/dev/philosophy' },
        ],
      },
      {
        text: '开发流程',
        collapsed: false,
        items: [
          { text: '快速上手', link: '/dev/quickstart' },
          { text: 'Git 与分支规范', link: '/dev/git-workflow' },
          { text: '代码评审与 DoD', link: '/dev/code-review' },
        ],
      },
      {
        text: '编码规范',
        collapsed: false,
        items: [
          { text: '后端规范', link: '/dev/coding-backend' },
          { text: '前端规范', link: '/dev/coding-frontend' },
        ],
      },
      {
        text: '扩展点体系',
        collapsed: false,
        items: [
          {
            text: '配置化扩展（零代码）',
            collapsed: false,
            items: [
              { text: '自定义字段', link: '/dev/custom-fields' },
              { text: '业务规则', link: '/dev/business-rules' },
              { text: '流程配置', link: '/dev/workflow' },
              { text: '打印模板', link: '/dev/print-template' },
              { text: '报表', link: '/dev/reports' },
            ],
          },
          {
            text: '代码级扩展',
            collapsed: false,
            items: [
              { text: '新增业务模块', link: '/dev/crud-module' },
              { text: '事件订阅', link: '/dev/events' },
              { text: '外部对接适配器', link: '/dev/adapters' },
              { text: '插件协议', link: '/dev/plugins' },
            ],
          },
        ],
      },
      {
        text: '工程规范',
        collapsed: false,
        items: [
          { text: '权限与数据隔离', link: '/dev/permissions' },
          { text: '数据库迁移', link: '/dev/migration' },
          { text: '纪律与最佳实践', link: '/dev/best-practices' },
        ],
      },
      {
        text: '高可用与运维',
        collapsed: false,
        items: [
          { text: 'Docker 部署', link: '/deploy/docker' },
          { text: '备份恢复', link: '/deploy/backup' },
          { text: '升级迁移', link: '/deploy/upgrade' },
          { text: '可观测性', link: '/dev/observability' },
        ],
      },
      {
        text: '架构演进',
        collapsed: false,
        items: [
          { text: '架构与演进', link: '/dev/architecture' },
        ],
      },
      {
        text: '参考',
        collapsed: true,
        items: [
          { text: 'API 概览', link: '/reference/api' },
          { text: '数据模型', link: '/reference/models' },
          { text: '权限体系', link: '/reference/permissions' },
          { text: '事件总线', link: '/reference/events' },
          { text: '插件协议速查', link: '/plugins/overview' },
          { text: '官方示例', link: '/plugins/examples' },
        ],
      },
    ],
    footer: { message: 'MIT License', copyright: 'Freight System' },
    search: { provider: 'local' },
  },
});