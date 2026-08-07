'use strict';

// OpenAPI 端点定义（components 之外的 paths 部分）
//
// 覆盖范围：核心端点，不是全量 212 个路由。
// 其余路由按需在路由文件里写 @openapi JSDoc 注释即可被 swagger-jsdoc 自动抓取合并，
// POST /api/auth/login 就是这么来的（见 src/routes/index.js 认证段落），不必集中堆在本文件。

// 复用的响应片段
const okResponse = (schemaRef, description = '成功') => ({
  description,
  content: {
    'application/json': {
      schema: {
        allOf: [
          { $ref: '#/components/schemas/ApiResponse' },
          { type: 'object', properties: { data: schemaRef } },
        ],
      },
    },
  },
});

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
});

const UNAUTHORIZED = errorResponse('未登录、凭证无效或 API Key 无效');
const FORBIDDEN = errorResponse('已认证但无权限执行该操作');
const NOT_FOUND = errorResponse('资源不存在');

// 自定义字段路由的业务实体段，与 src/routes/index.js 中注册的四类保持一致
const BIZ_ENUM = ['orders', 'customers', 'bookings', 'finance'];

module.exports = {
  '/api/orders': {
    get: {
      tags: ['订单'],
      summary: '订单分页列表',
      description: '按数据隔离范围返回当前用户可见的订单。范围由角色 dataScope 决定（all / group / self）。',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1, minimum: 1 }, description: '页码' },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, minimum: 1, maximum: 200 }, description: '每页条数，上限 200' },
        { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '关键字模糊搜索（订单号等）' },
        { name: 'status', in: 'query', schema: { type: 'string' }, description: '按订单状态过滤' },
      ],
      responses: {
        200: okResponse({ $ref: '#/components/schemas/OrderListData' }, '订单列表'),
        401: UNAUTHORIZED,
        403: FORBIDDEN,
      },
    },
  },

  '/api/finance': {
    post: {
      tags: ['财务'],
      summary: '新建财务记录（应收/应付）',
      description: '创建成功后发射 finance.created 事件，预警与自动化引擎会订阅该事件。',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/FinanceRecordCreate' } } },
      },
      responses: {
        200: okResponse({ $ref: '#/components/schemas/FinanceRecord' }, '创建成功'),
        400: errorResponse('参数校验失败'),
        401: UNAUTHORIZED,
        403: FORBIDDEN,
      },
    },
  },

  '/api/automation/run': {
    post: {
      tags: ['自动化'],
      summary: '手动触发一次自动化扫描',
      description:
        '与定时任务执行同一批动作（推进节点、生成应收等）。动作全部幂等：' +
        '连续调用第二次，advanced 与 financeCreated 应为 0。仅管理员可调用。',
      responses: {
        200: okResponse({ $ref: '#/components/schemas/AutomationRunData' }, '执行结果统计'),
        401: UNAUTHORIZED,
        403: FORBIDDEN,
      },
    },
  },

  '/api/{biz}/{id}/custom-fields': {
    parameters: [
      {
        name: 'biz',
        in: 'path',
        required: true,
        schema: { type: 'string', enum: BIZ_ENUM },
        description: '业务实体段：orders / customers / bookings / finance',
      },
      { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: '业务记录主键' },
    ],
    get: {
      tags: ['自定义字段'],
      summary: '读取某条记录的自定义字段（定义 + 取值）',
      description: '返回该业务类型下所有启用的字段定义，并带上当前记录的取值；未填写的字段 value 为空字符串。',
      responses: {
        200: okResponse({ type: 'array', items: { $ref: '#/components/schemas/CustomFieldValue' } }, '字段定义与取值'),
        401: UNAUTHORIZED,
        404: NOT_FOUND,
      },
    },
    put: {
      tags: ['自定义字段'],
      summary: '写入某条记录的自定义字段',
      description:
        '请求体为 { fieldKey: value } 平铺对象。服务端只接受已在 CustomField 中定义且启用的 fieldKey，' +
        '未定义的键会被静默丢弃，防止前端写入脏数据。',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: true,
              example: { custom_agent: 'ABC Logistics', custom_free_days: 14 },
            },
          },
        },
      },
      responses: {
        200: okResponse({ type: 'object' }, '更新后的记录'),
        401: UNAUTHORIZED,
        404: NOT_FOUND,
      },
    },
  },

  '/api/api-keys': {
    get: {
      tags: ['接口密钥'],
      summary: '接口密钥列表',
      description: '只返回元信息，不含明文密钥。需要 system:apikey 权限。',
      responses: {
        200: okResponse({ type: 'array', items: { $ref: '#/components/schemas/ApiKey' } }, '密钥列表'),
        401: UNAUTHORIZED,
        403: FORBIDDEN,
      },
    },
    post: {
      tags: ['接口密钥'],
      summary: '创建接口密钥',
      description:
        '返回体中的 key 是明文，仅此一次可见，请立即保存。服务端只存 SHA-256 摘要，无法找回。' +
        '调用方后续用 X-API-Key 请求头访问接口。需要 system:apikey 权限。',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiKeyCreateRequest' } } },
      },
      responses: {
        200: okResponse({ $ref: '#/components/schemas/ApiKeyCreated' }, '创建成功，明文密钥仅返回一次'),
        400: errorResponse('参数校验失败'),
        401: UNAUTHORIZED,
        403: FORBIDDEN,
      },
    },
  },

  '/api/api-keys/{id}': {
    delete: {
      tags: ['接口密钥'],
      summary: '撤销接口密钥',
      description: '撤销后该密钥立即失效（active=false），已签发的调用方会收到 401。需要 system:apikey 权限。',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: okResponse({ nullable: true }, '已撤销'),
        401: UNAUTHORIZED,
        403: FORBIDDEN,
        404: NOT_FOUND,
      },
    },
  },
};
