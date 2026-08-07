'use strict';

// OpenAPI 数据模型定义（components.schemas）
// 与 src/models/*.js 手工对齐；新增字段时记得同步这里，否则文档会误导调用方。

const ApiResponse = {
  type: 'object',
  description: '全局统一响应结构，业务成功恒为 code=0',
  properties: {
    code: { type: 'integer', example: 0, description: '0 表示成功，非 0 为业务错误码' },
    message: { type: 'string', example: 'ok' },
    data: { nullable: true, description: '业务数据，失败时为 null' },
  },
  required: ['code', 'message'],
};

const ErrorResponse = {
  type: 'object',
  properties: {
    code: { type: 'integer', example: 1 },
    message: { type: 'string', example: '用户名或密码错误' },
    data: { nullable: true, example: null },
  },
};

const LoginRequest = {
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: { type: 'string', example: 'admin' },
    password: { type: 'string', format: 'password', example: '123456' },
  },
};

const LoginData = {
  type: 'object',
  properties: {
    token: { type: 'string', description: 'JWT，有效期 12 小时，放在 Authorization: Bearer <token>' },
    user: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        username: { type: 'string', example: 'admin' },
        name: { type: 'string', example: '系统管理员' },
        role: { type: 'string', example: 'admin' },
        email: { type: 'string', nullable: true },
        permissions: {
          type: 'array',
          items: { type: 'string' },
          description: '权限点清单，格式 模块:动作；admin 为 ["*"]',
          example: ['*'],
        },
      },
    },
  },
};

const Order = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    orderNo: { type: 'string', example: 'SO20260807001' },
    customerId: { type: 'integer', nullable: true },
    businessType: { type: 'string', description: '进出口类型', example: 'export' },
    transportMode: { type: 'string', example: 'sea' },
    status: { type: 'string', description: '由子模块派生，不建议直接改写', example: 'booked' },
    portOfLoading: { type: 'string', nullable: true, example: 'CNQIN' },
    portOfDischarge: { type: 'string', nullable: true, example: 'USLAX' },
    etd: { type: 'string', format: 'date', nullable: true },
    eta: { type: 'string', format: 'date', nullable: true },
    groupId: { type: 'integer', nullable: true, description: '数据隔离：归属小组' },
    ownerId: { type: 'integer', nullable: true, description: '数据隔离：归属操作员' },
    customFields: { type: 'string', nullable: true, description: '自定义字段值，JSON 字符串' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const OrderListData = {
  type: 'object',
  properties: {
    list: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
    total: { type: 'integer', example: 128 },
    page: { type: 'integer', example: 1 },
    pageSize: { type: 'integer', example: 20 },
  },
};

const FinanceRecordCreate = {
  type: 'object',
  required: ['direction', 'category', 'amount'],
  properties: {
    orderId: { type: 'integer', nullable: true, example: 1 },
    direction: { type: 'string', enum: ['receivable', 'payable'], description: '应收 / 应付' },
    category: { type: 'string', description: '费用科目', example: 'ocean_freight' },
    amount: { type: 'number', format: 'double', example: 1000, description: '金额，服务端按 DECIMAL 存储' },
    currency: { type: 'string', example: 'USD' },
    dueDate: { type: 'string', format: 'date', nullable: true, example: '2026-09-30' },
    counterpartyId: { type: 'integer', nullable: true, description: '往来单位（客户或供应商）' },
    remark: { type: 'string', nullable: true },
  },
};

const FinanceRecord = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    orderId: { type: 'integer', nullable: true },
    direction: { type: 'string', enum: ['receivable', 'payable'] },
    category: { type: 'string' },
    amount: { type: 'string', description: 'DECIMAL 序列化为字符串，避免浮点精度丢失', example: '1000.00' },
    currency: { type: 'string', example: 'USD' },
    status: { type: 'string', example: 'unpaid' },
    paidAmount: { type: 'string', example: '0.00' },
    dueDate: { type: 'string', format: 'date', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const AutomationRunData = {
  type: 'object',
  description: '自动化执行结果；重复调用应返回 0，代表动作幂等未重复执行',
  properties: {
    advanced: { type: 'integer', example: 0, description: '本次自动推进的订单节点数' },
    financeCreated: { type: 'integer', example: 0, description: '本次自动生成的应收记录数' },
  },
};

const CustomFieldValue = {
  type: 'object',
  description: '自定义字段定义 + 当前记录上的取值',
  properties: {
    id: { type: 'integer', example: 3 },
    bizType: { type: 'string', enum: ['order', 'customer', 'booking', 'finance'] },
    fieldKey: { type: 'string', example: 'custom_agent' },
    label: { type: 'string', example: '目的港代理' },
    fieldType: { type: 'string', enum: ['string', 'number', 'date', 'enum', 'bool'] },
    options: { type: 'array', items: { type: 'string' }, description: 'fieldType=enum 时的可选项' },
    required: { type: 'boolean' },
    sort: { type: 'integer', example: 10 },
    value: { description: '当前记录上的取值，未填写时为空字符串', example: 'ABC Logistics' },
  },
};

const ApiKeyCreateRequest = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: '用途备注，便于日后识别与撤销', example: '对账机器人' },
    role: { type: 'string', description: '该 Key 的角色，决定权限范围', example: 'op' },
    userId: { type: 'integer', nullable: true, description: '绑定用户，省略则绑定当前调用者' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: '过期时间，省略表示长期有效' },
    groupId: { type: 'integer', nullable: true, description: '数据隔离：归属小组' },
    ownerId: { type: 'integer', nullable: true, description: '数据隔离：归属操作员' },
  },
};

const ApiKey = {
  type: 'object',
  description: '接口密钥；明文只在创建时返回一次，之后仅能看到掩码',
  properties: {
    id: { type: 'integer', example: 1 },
    name: { type: 'string', example: '对账机器人' },
    role: { type: 'string', example: 'op' },
    userId: { type: 'integer', nullable: true },
    active: { type: 'boolean', example: true },
    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    groupId: { type: 'integer', nullable: true },
    ownerId: { type: 'integer', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const ApiKeyCreated = {
  allOf: [
    { $ref: '#/components/schemas/ApiKey' },
    {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: '密钥明文，仅本次响应返回，服务端只存 SHA-256 摘要，丢失只能撤销重建',
          example: '9f2c1a...（48 位十六进制）',
        },
      },
    },
  ],
};

module.exports = {
  ApiResponse,
  ErrorResponse,
  LoginRequest,
  LoginData,
  Order,
  OrderListData,
  FinanceRecordCreate,
  FinanceRecord,
  AutomationRunData,
  CustomFieldValue,
  ApiKeyCreateRequest,
  ApiKey,
  ApiKeyCreated,
};
