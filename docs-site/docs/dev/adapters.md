---
title: 外部对接适配器
prev: /dev/events
next: /dev/plugins
---

# 外部对接适配器

> 所有外部系统（船期/汇率/港口/报关/AIS/场站/美元支付…）都是 `backend/src/integrations/adapters/` 下的一个文件，**统一接口签名**。新增对接 = 丢一个文件进 `adapters/` 目录，**自动被发现，无需改注册清单**。

## 1. 注册 / 发现机制

`backend/src/integrations/index.js` 用 `fs.readdirSync(adapterDir)` 扫描 `adapters/` 下每个 `.js`，`require` 后若导出 `code` 则注册到 `adapters[code]`。**自动发现，无需手动登记。**

```js
const client = await IntegrationClient.get('port_qingdao'); // 从 IntegrationConfig 表读配置
await client.query(payload);   // 调 query
await client.send(payload);    // 调 send
```

- 适配器未注册 或 `IntegrationConfig.enabled` 为 false → 抛错
- `IntegrationClient.get(code)` 从 `IntegrationConfig.findOne({ where: { code } })` 加载配置

## 2. 适配器统一接口

每个适配器导出 `{ code, name, send(cfg, payload), query(cfg, payload) }`：

```js
// backend/src/integrations/adapters/myCarrier.js
const axios = require('axios');

const code = 'my_carrier';   // 与 IntegrationConfig 表中的 code 对应

async function query(cfg, payload) {
  // cfg：运行期从 IntegrationConfig 表读取（baseUrl/apiKey 等，无需改代码配置）
  const resp = await axios.get(cfg.baseUrl, {
    params: { key: cfg.apiKey, ...payload },
    timeout: 8000,
  });
  return resp.data;
}

async function send(cfg, payload) {
  // 只读类适配器直接抛错即可
  throw new Error('该适配器只支持查询');
}

module.exports = { code, name: '我的船司', send, query };
```

## 3. IntegrationConfig 表

`backend/src/models/IntegrationConfig.js`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | STRING(30) UNIQUE | 适配器编码（与适配器 `code` 对应） |
| `name` | STRING(50) | 名称 |
| `baseUrl` | STRING(255) | 基础地址 |
| `apiKey` | STRING(255) | 接口密钥 |
| `authType` | ENUM `none/api_key/basic/oauth2` | 认证方式 |
| `enabled` | BOOLEAN | 是否启用 |
| `config` | TEXT(JSON) | 扩展配置 |
| `lastSyncAt` | DATE | 最近同步时间 |

> **密钥永远走 `IntegrationConfig` 表或环境变量，禁止写死进代码。**

## 4. 真实范本：青岛港（含签名）

`portQingdao.js`（`code='port_qingdao'`）演示了更复杂的对接：

```js
function sign(cfg, payload) {
  const secret = cfg.secret || cfg.apiKey || 'demo-secret';
  const raw = JSON.stringify(payload) + secret;
  // HMAC-SHA256 生成签名
}

async function call(cfg, payload, action) {
  // POST ${cfg.baseUrl}/qingdao/api/${action}
  // headers: X-Enterprise / X-Sign / X-Timestamp / X-API-Key
  // timeout 15000
}
```

- `send` → action `'report'`；`query` → action `'query'`
- 未启用时返回 `mockResult`（demo 数据），便于联调

## 5. 现有适配器清单

```
aisTracking / customs / exchangeRate / finance / freightRate
port / portQingdao / portShanghai / portNingbo
shipSchedule / usdPay / yardQingdao
```

全部可作范本。**找最接近你场景的那个 copy 改写**。

## 6. 实操步骤

1. 在 `Integrations` 管理页新建一条配置（`code` 与适配器一致，填 baseUrl/apiKey）并启用
2. 新建 `backend/src/integrations/adapters/yourCode.js`，实现 `{ code, name, send, query }`
3. 重启后端，`registry` 自动返回新适配器
4. 在需要的地方 `IntegrationClient.get('your_code')` 调用

## 下一步

[插件协议](/dev/plugins) —— 把代码级扩展打包成可启停的独立模块。