# 报关与 EDI 对接方案

> 版本：v1.0
> 所属项目：《项目设计方案.md》阶段二（报关对接 / 阶段三 EDI）
> 目标：落地报关对接（中国单一窗口/电子口岸）与 EDI 数据交换（UN/EDIFACT），打通报关申报与船司/航司/海关的电子数据交换

---

## 1. 背景与目标

### 1.1 报关现状
- 系统已有 `CustomsDeclaration` 模型（[CustomsDeclaration.js](file:///c:/Users/im/Desktop/新建文件夹/freight-system/backend/src/models/CustomsDeclaration.js)）与基础 CRUD。
- 现有海关适配器（[customs.js](file:///c:/Users/im/Desktop/新建文件夹/freight-system/backend/src/integrations/adapters/customs.js)）为 HTTP 桩，未接真实海关系统。

### 1.2 目标
1. **报关对接**：对接**中国国际贸易单一窗口**（依托电子口岸平台），报关报文自动推送申报 + 实时拉取回执同步状态。
2. **EDI 数据交换**：与国际承运人（船司/航空公司）通过 **UN/EDIFACT** 标准交换订舱、提单、舱单等数据。

---

## 2. 报关对接方案

### 2.1 对接目标：中国单一窗口
- 单一窗口标准版依托**中国电子口岸平台**，一点接入、一次性提交标准化单证。
- 支持货物申报、舱单申报、原产地证、企业资质等。
- 关键能力：**报文自动推送申报 + 实时拉取回执**，自动同步申报/审核状态。

### 2.2 对接流程
```
系统报关单(prepared)
   │ 生成报关报文
   ▼
单一窗口/电子口岸
   │ 申报(request)
   ├─▶ 回执：已接收/审核中(检查中)
   ├─▶ 回执：放行(released)
   └─▶ 回执：退单/不通过(rejected)
   │ 拉取回执轮询
   ▼
同步 CustomsDeclaration.status
```

### 2.3 状态映射
| 单一窗口状态 | 系统 status |
|-------------|------------|
| 已接收 | submitted |
| 审核中/查验 | inspecting |
| 放行 | released |
| 退单/不通过 | rejected |
| 结关 | closed |

### 2.4 适配器扩展（`src/integrations/adapters/customs.js`）
```js
// 海关系统对接适配器（真实单一窗口/电子口岸）
// 负责报关报文推送申报、回执拉取、放行状态同步。
const axios = require('axios');
const crypto = require('crypto');

const code = 'customs';

function sign(cfg, payload) {
  // 电子口岸报文签名（按海关规范，示例：SM2/RSA 签名）
  const raw = JSON.stringify(payload) + (cfg.secret || '');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function call(cfg, payload, action) {
  const url = `${cfg.baseUrl || ''}/api/${action}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Enterprise': cfg.enterpriseCode,   // 企业备案号
    'X-Sign': sign(cfg, payload),
    'X-Timestamp': Date.now(),
  };
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  const resp = await axios.post(url, payload, { headers, timeout: 15000 });
  return resp.data;
}

async function send(cfg, payload) {
  return call(cfg, payload, 'declare');    // 推送申报报文
}

async function query(cfg, payload) {
  return call(cfg, payload, 'status');     // 拉取回执/放行状态
}

module.exports = { code, name: '海关系统（单一窗口）', send, query };
```

### 2.5 报文生成（`src/services/declarationService.js`）
- 把 `CustomsDeclaration` + 关联 `Order` 数据转换为单一窗口报文格式。
- 报文含：企业信息、申报类型、商品（HS code）、金额、运输信息等。
- 用事务保证：推送申报成功才更新 `status='submitted'`。

### 2.6 回执轮询（定时任务）
- 接入《控制性设计手册》定时任务：定时拉取在途报关单回执，更新状态。
- 放行/退单触发预警通知（在途/异常）。

---

## 3. EDI 数据交换方案

### 3.1 EDI 标准
- **UN/EDIFACT**：联合国"行政、商务和运输用电子数据交换"国际标准，国际货代主流。
- 报文类型：
  | 报文 | 用途 |
  |------|------|
  | **IFTMBF** | 订舱确认（Booking Firm） |
  | **IFTMIN** | 订舱指示（Instruction） |
  | **IFTMBC** | 订舱确认（Booking Confirmation） |
  | **IFTMCS** | 运输状态（Cargo Status） |
  | **IFTSTA** | 货运状态 |
  | **COARRI** | 集装箱装卸报告 |
  | **CUSCAR/CUSDEC** | 海关申报 |

### 3.2 传输协议
| 方式 | 说明 |
|------|------|
| OFTP2 | 欧洲货代常用，文件传输协议 |
| AS2 | 基于 HTTPS 的 EDI 传输 |
| SFTP | 文件交换 |
| WebService/API | 现代船司/平台提供 |

### 3.3 消息流程（示例：订舱）
```
系统 ──IFTMBF(订舱请求)──▶ 船司EDI
系统 ◀──IFTMBC(订舱确认)── 船司EDI
系统 ◀──IFTSTA/IFTMCS(状态)── 船司EDI
```

### 3.4 EDI 解析/生成层（`src/edi/`）
```
src/edi/
├── parser/          # EDIFACT 报文解析
│   ├── iftmbf.js
│   └── iftsta.js
├── builder/         # EDIFACT 报文生成
│   └── iftmbf.js
└── transport/       # 传输适配（OFTP2/AS2/SFTP）
    ├── as2.js
    └── sftp.js
```

示例：EDIFACT 段结构
```
UNH+1+IFTMIN:D:00B:UN:IFT01'   （消息头）
UNT+28+1'                       （消息尾）
```

### 3.5 适配器（`src/integrations/adapters/edi.js`）
```js
// EDI 数据交换适配器
// 负责与国际承运人交换订舱/提单/舱单等 EDIFACT 报文。
const code = 'edi';
module.exports = {
  code,
  name: 'EDI 数据交换',
  async send(cfg, payload) {
    // 生成 EDIFACT 报文并通过配置的传输通道发送
    return { sent: true, messageId: payload.messageId };
  },
  async query(cfg, payload) {
    // 从传输通道接收/解析对方报文
    return { messages: [] };
  },
};
```

---

## 4. 数据模型扩展

### 4.1 报关报文日志（可选）
在 `CustomsDeclaration` 增加报文/回执字段，或新建日志表：
```js
// 可新增字段
messageId: { type: DataTypes.STRING(64) },   // 单一窗口报文号
lastReceipt: { type: DataTypes.TEXT },        // 最近回执内容
```

### 4.2 EDI 消息日志（EdiMessage）
```js
const EdiMessage = sequelize.define('EdiMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  partner: { type: DataTypes.STRING(50) },        // 对端（船司/航司）
  messageType: { type: DataTypes.STRING(10) },    // IFTMBF/IFTMIN/IFTSTA ...
  direction: { type: DataTypes.ENUM('out', 'in') },
  status: { type: DataTypes.ENUM('draft', 'sent', 'received', 'parsed', 'failed'), defaultValue: 'draft' },
  raw: { type: DataTypes.TEXT },                  // 原始报文
  refOrderId: { type: DataTypes.INTEGER },        // 关联订单
}, { timestamps: true });
```

### 4.3 对接配置（IntegrationConfig seed）
```js
{ code: 'customs', name: '海关系统（单一窗口）', enabled: false, remark: '报关申报与放行状态查询' },
{ code: 'edi', name: 'EDI 数据交换', enabled: false, remark: '与承运人交换 EDIFACT 报文' },
```

---

## 5. 接口设计

### 5.1 报关增强接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /customs/:id/declare | 推送报关单到单一窗口 |
| GET | /customs/:id/receipt | 拉取/查看回执 |
| POST | /customs/:id/sync | 手动同步状态 |

### 5.2 EDI 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /edi/messages | 发送 EDI 报文 |
| GET | /edi/messages | 报文列表 |
| GET | /edi/messages/:id | 报文详情（含解析结果） |
| POST | /edi/receive | 接收/解析对端报文 |

---

## 6. 安全与合规要点

| 项 | 要求 |
|----|------|
| 签名 | 单一窗口报文按海关规范签名（SM2/RSA） |
| 回执验签 | 防止伪造回执 |
| 企业资质 | 需单一窗口企业备案（enterpriseCode） |
| 密钥 | 企业数字证书/密钥加密存储 |
| 报文审计 | 记录原始报文与解析结果（EdiMessage） |
| 幂等 | 申报/回执处理幂等，防重复 |
| 传输安全 | AS2/HTTPS 加密，文件传输限定 SFTP 白名单 |

---

## 7. 落地步骤

### 报关对接
1. 扩展 `customs.js` 适配器（申报推送 + 回执拉取）。
2. 新增 `declarationService.js` 生成报关报文。
3. 新增 `/customs/:id/declare|receipt|sync` 接口。
4. 接入定时任务轮询回执，同步状态。
5. 申请单一窗口企业资质，联调报文规范。

### EDI 对接
1. 搭建 `src/edi/` 解析/生成/传输层。
2. 新增 `edi.js` 适配器 + `EdiMessage` 模型。
3. 实现 IFTMBF（订舱）首条报文。
4. 与承运人协商传输通道（OFTP2/AS2/SFTP）联调。

---

## 8. 验收标准

- [ ] 报关单可推送申报到单一窗口，状态映射正确
- [ ] 回执可拉取，放行/退单自动同步并预警
- [ ] 报关报文签名/验签通过
- [ ] EDI 可生成/解析 IFTMBF 报文
- [ ] EdiMessage 记录完整、可追溯
- [ ] 定时任务回执轮询稳定
- [ ] 异常（退单/报文失败）有告警

---

## 9. 后续扩展
- CUSDEC/CUSCAR 海关申报报文
- 舱单申报（单一窗口）
- 电子签章报关单
- EDI 与订单/财务自动联动（自动核销）

---

> 附：本方案沿用现有适配器模式，报关与 EDI 均以新增适配器 + 独立 service/edi 层实现，不侵入主流程。具体报文规范以海关及承运人官方文档为准。