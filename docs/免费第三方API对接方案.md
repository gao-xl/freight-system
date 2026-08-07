# 免费第三方 API 对接方案

> 版本：v1.0
> 所属项目：《项目设计方案.md》阶段二（跟踪/汇率）
> 目标：盘点并落地货代行业可免费/低成本对接的第三方 API（船舶追踪、船期、汇率、运价、气象等），低成本增强系统能力

---

## 1. 目标与原则

### 1.1 目标
在不增加成本的前提下，通过接入免费/低成本第三方 API，快速补齐系统能力：
- 运输跟踪可视化（AIS 船舶追踪）
- 订舱/报价参考（船期、运价）
- 多币种结算基础（汇率）
- 风浪预警（气象）

### 1.2 对接原则
1. **复用现有适配器模式**：统一 `IntegrationConfig` + `adapters`，不侵入主流程。
2. **免费额度缓存**：免费 API 有次数/频率限制，必须本地缓存 + 定时批量拉取。
3. **可降级**：第三方不可用时，不影响核心业务（结果缓存兜底）。
4. **数据质量评估**：免费数据覆盖有限，生产按需升级付费。

---

## 2. 免费第三方 API 清单

### 2.1 船舶动态 / AIS 追踪
| API/服务 | 说明 | 免费程度 |
|----------|------|----------|
| **AISHub** | 免费 AIS 数据共享，JSON/XML 实时船位 | ✅ 免费 |
| **ShipFinder** | 免费卫星 AIS 追踪 + 历史轨迹 | ✅ 免费 |
| **Veracity(船队在线)** | 船舶登记、船级社、船公司信息 | ✅ 免费查询 |
| **船顺/船讯网** | 国内 AIS 追踪平台 | 免费查询 |

### 2.2 船期 / 运价
| 平台 | 能力 | 免费程度 |
|------|------|----------|
| **SeaRates** | 船期、航程时间、港口（有 API） | 部分免费 |
| **搜航网 sofreight** | 海运/空运/铁路运价、船期、订舱 | 注册免费 |
| **国际海运网** | 海运费、船东船期、整/拼箱船期 | 免费 |
| **运去哪/海管家** | 船期、运价、在线订舱 | 注册免费 |

### 2.3 汇率 / 气象
| 类型 | API 示例 | 免费程度 |
|------|----------|----------|
| 汇率 | exchangerate-api 等 | ✅ 免费 |
| 气象 | OpenWeatherMap 等 | ✅ 免费层级 |

### 2.4 物流轨迹
| 平台 | 说明 | 免费程度 |
|------|------|----------|
| 快递鸟 | 海陆空轨迹聚合 | 部分免费 |

---

## 3. 接入优先级

| 优先级 | 接入项 | 适配器 code | 阶段 | 价值 |
|--------|--------|-------------|------|------|
| 🔴 高 | AIS 船舶追踪 | `ais_tracking` | 阶段二 | 运输跟踪可视化 |
| 🔴 高 | 船期查询 | `ship_schedule` | 阶段二 | 订舱/报价参考 |
| 🟡 中 | 汇率 | `exchange_rate` | 阶段三 | 多币种换算 |
| 🟡 中 | 运价查询 | `freight_rate` | 阶段二 | 报价参考 |
| 🟢 低 | 气象 | `weather` | 阶段三 | 风浪预警 |

---

## 4. 适配器实现

### 4.1 AIS 船舶追踪（`src/integrations/adapters/aisTracking.js`）
```js
// AIS 船舶追踪对接（AISHub 免费服务）
const axios = require('axios');
const code = 'ais_tracking';

async function query(cfg, payload) {
  const url = cfg.baseUrl || 'https://data.aishub.net/ws/1.1/getdata.php';
  const resp = await axios.get(url, {
    params: { username: cfg.apiKey, format: 1, mmsi: payload.mmsi },
    timeout: 8000,
  });
  return resp.data;
}

async function send(cfg, payload) {
  throw new Error('AIS 只支持查询');
}

module.exports = { code, name: 'AIS 船舶追踪', send, query };
```

### 4.2 船期查询（`src/integrations/adapters/shipSchedule.js`）
```js
// 船期查询（SeaRates/搜航网等）
const axios = require('axios');
const code = 'ship_schedule';

async function query(cfg, payload) {
  const url = `${cfg.baseUrl || ''}/api/schedule`;
  const resp = await axios.post(url, payload, {
    headers: { 'X-API-Key': cfg.apiKey },
    timeout: 8000,
  });
  return resp.data;
}

module.exports = { code, name: '船期查询', send: query, query };
```

### 4.3 汇率（`src/integrations/adapters/exchangeRate.js`）
```js
// 汇率查询（免费汇率 API）
const axios = require('axios');
const code = 'exchange_rate';

async function query(cfg, payload) {
  const url = `https://open.er-api.com/v6/latest/${payload.base || 'USD'}`;
  const resp = await axios.get(url, { timeout: 8000 });
  return resp.data;
}

module.exports = { code, name: '汇率查询', send: query, query };
```

---

## 5. 缓存与调度策略

### 5.1 必要性
免费 API 有次数/频率限制，直接实时调用会耗尽额度。

### 5.2 缓存策略
| 数据 | 缓存周期 | 说明 |
|------|----------|------|
| 汇率 | 每日 1 次 | 写入本地汇率表，定时刷新 |
| 船期 | 每日 1-2 次 | 按航线缓存 |
| AIS 船位 | 实时+缓存 | 在途订单按需查询，缓存 10 分钟 |
| 运价 | 每日 | 按起运-目的港缓存 |

### 5.3 实现
```js
// 缓存中间件示例（简单内存缓存）
const cache = new Map();
async function withCache(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  const data = await fn();
  cache.set(key, { data, ts: Date.now() });
  return data;
}
```

> 多实例部署时改用 Redis 缓存（见《控制性设计手册》）。

### 5.4 定时任务
接入《控制性设计手册》定时任务，每日批量拉取汇率/船期并落库。

---

## 6. 数据模型（可选新增）

### 6.1 汇率表（ExchangeRate）
```js
const ExchangeRate = sequelize.define('ExchangeRate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  baseCurrency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  targetCurrency: { type: DataTypes.STRING(10) },
  rate: { type: DataTypes.DECIMAL(20, 6) },
  rateDate: { type: DataTypes.DATEONLY },
}, { indexes: [{ unique: true, fields: ['baseCurrency', 'targetCurrency', 'rateDate'] }] });
```

### 6.2 航程/船期快照（可复用 ShipmentTrack 或新建）
- 船期数据缓存到表，供订舱/报价下拉引用。

---

## 7. 接口设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /external/vessel/:mmsi | 查询船舶实时位置 |
| GET | /external/schedule | 查询船期 |
| GET | /external/rate | 查询汇率（含缓存） |
| GET | /external/freight-rate | 查询运价 |

> 这些接口仅对已登录且具 `read` 权限用户开放，内部走适配器 + 缓存。

---

## 8. 配置示例（IntegrationConfig seed）
```js
{ code: 'ais_tracking', name: 'AIS 船舶追踪', enabled: false, remark: '实时船位' },
{ code: 'ship_schedule', name: '船期查询', enabled: false, remark: '订舱/报价参考船期' },
{ code: 'exchange_rate', name: '汇率查询', enabled: false, remark: '多币种换算' },
{ code: 'freight_rate', name: '运价查询', enabled: false, remark: '报价参考' },
```

---

## 9. 风险与注意事项

| 风险 | 应对 |
|------|------|
| 免费额度耗尽 | 缓存 + 批量拉取 + 降级兜底 |
| 数据质量/实时性差 | 生产评估按需升级付费 |
| 第三方接口变更 | 适配器隔离，改动集中 |
| 网络/区域限制 | 重试 + 超时 + 告警 |
| 合规 | 遵循各平台条款，不滥用 |

---

## 10. 落地步骤

1. 新增 `ais_tracking`、`ship_schedule`、`exchange_rate` 等适配器。
2. `seed.js` 增加对应 IntegrationConfig。
3. 新增汇率表（ExchangeRate）与缓存。
4. 新增 `/external/*` 查询接口。
5. 接入定时任务批量拉取。
6. 前端运输跟踪页接入 AIS 可视化。

---

## 11. 验收标准

- [ ] AIS 船舶位置可查询（免费 API）
- [ ] 船期可查询并按航线缓存
- [ ] 汇率每日刷新并落库
- [ ] 免费额度不超限（缓存生效）
- [ ] 第三方不可用时降级不报错
- [ ] 权限控制生效

---

> 附：本文档为免费 API 对接设计，沿用现有适配器模式。具体 API 参数以各平台官方文档为准，接入时注册账号获取 key。