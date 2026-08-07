'use strict';

// OpenAPI 3.0 规范装配
//
// 规范由两部分合并而成：
//   1. 本文件的 definition —— 全局信息、安全方案、数据模型、核心端点（src/config/openapi/*）
//   2. swagger-jsdoc 从源码里抓取的 @openapi 注释块 —— 端点声明与代码同处一个文件，不易失配
// 两者路径同名时以注释块为准，便于在具体路由旁就地补充细节。
//
// 访问方式：
//   交互式文档  GET /api-docs
//   原始规范    GET /openapi.json（可直接喂给 Apifox / Postman / 代码生成器）

const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./index');
const schemas = require('./openapi/schemas');
const paths = require('./openapi/paths');

const definition = {
  openapi: '3.0.0',
  info: {
    title: '货运代理管理系统 API',
    version: '1.0.0',
    description: [
      '开源货代管理系统的后端接口。面向个人货代与 3-4 人小团队，支持二次开发。',
      '',
      '### 统一响应结构',
      '所有业务接口返回 `{ code, message, data }`，`code=0` 表示成功，非 0 为业务错误码。',
      'HTTP 状态码同时生效：401 未认证、403 无权限、404 资源不存在、429 触发限流、500 服务端异常。',
      '',
      '### 两种认证方式',
      '- **bearerAuth**：`POST /api/auth/login` 拿到 JWT，放进 `Authorization: Bearer <token>`，有效期 12 小时。适合前端会话。',
      '- **apiKeyAuth**：管理员在 `POST /api/api-keys` 生成密钥，放进 `X-API-Key: <key>` 请求头。适合脚本、定时任务、第三方系统对接。',
      '',
      '两者同时存在时以 `Authorization` 为准。',
      '',
      '### 数据隔离',
      '业务列表接口按调用者角色的 dataScope（all / group / self）自动过滤，接口层无需额外传参。',
    ].join('\n'),
    license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  },
  servers: [
    { url: `http://localhost:${config.port}`, description: '本地开发环境' },
  ],
  tags: [
    { name: '认证', description: '登录与身份信息' },
    { name: '订单', description: '订单主流程' },
    { name: '财务', description: '应收应付与开票' },
    { name: '自动化', description: '规则引擎与自动动作' },
    { name: '自定义字段', description: '不改代码扩展业务字段' },
    { name: '接口密钥', description: '面向脚本与第三方系统的 API Key 管理' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '登录接口返回的 JWT，放在 Authorization 请求头',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: '管理员签发的接口密钥，明文仅在创建时返回一次',
      },
    },
    schemas,
  },
  // 全局默认要求认证；公开端点（如登录）在自身定义里用 security: [] 覆盖
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  paths,
};

// glob 把反斜杠当转义符，Windows 下的绝对路径必须转成正斜杠，否则一个文件都匹配不到
const globPath = (rel) => path.resolve(__dirname, rel).replace(/\\/g, '/');

const swaggerSpec = swaggerJsdoc({
  definition,
  // 从这些文件里抓取 @openapi 注释块
  apis: [
    globPath('../routes/*.js'),
    globPath('../controllers/*.js'),
  ],
});

module.exports = { swaggerSpec, definition };
