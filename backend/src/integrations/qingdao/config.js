"use strict";

const path = require("path");

module.exports = {
  // 云港通平台
  yungangtong: {
    baseUrl: process.env.YGT_BASE_URL || "https://www.qingdao-port.net",
    loginUrl: process.env.YGT_LOGIN_URL || "https://www.qingdao-port.net/page/login.html",
    queryUrl: process.env.YGT_QUERY_URL || "https://www.qingdao-port.net/page/query.html",
    username: process.env.YGT_USERNAME || "",
    password: process.env.YGT_PASSWORD || "",
    // 查询页面端点
    endpoints: {
      customsStatus: "/api/customs/status",         // 通关状态（运抵报告/装载放行/海关查验）
      vesselSchedule: "/api/vessel/schedule",       // 口岸船期
      containerPlan: "/api/container/plan",          // 收箱截货计划
      terminal: "/api/terminal/query",               // 场站查询
      reeferTemp: "/api/reefer/temperature",         // 冻柜测温
      dangerousGoods: "/api/dangerous/query",        // 危险品库
      seaRail: "/api/searail/query",                 // 海铁联运
    },
  },

  // 陆海通平台
  luhaitong: {
    baseUrl: process.env.LHT_BASE_URL || "https://www.sdland-sea.com",
    loginUrl: process.env.LHT_LOGIN_URL || "https://www.sdland-sea.com/login",
    username: process.env.LHT_USERNAME || "",
    password: process.env.LHT_PASSWORD || "",
    endpoints: {
      containerQuery: "/api/container/query",        // 集装箱单箱查询
      vesselSchedule: "/api/vessel/schedule",        // 船舶计划
      blTracking: "/api/bl/tracking",                // 提单号全程追踪
      manifestStatus: "/api/manifest/status",        // 舱单状态
    },
  },

  // 浏览器池配置
  browser: {
    poolSize: parseInt(process.env.BROWSER_POOL_SIZE, 10) || 2,
    headless: process.env.BROWSER_HEADLESS !== "false",
    userDataDir: path.join(__dirname, "..", "..", "..", "..", ".browser-data"),
    // 反检测配置
    viewport: { width: 1920, height: 1080 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    // 超时配置
    navigationTimeout: 30000,
    actionTimeout: 10000,
    // 重试配置
    maxRetries: 3,
    retryDelay: 2000,
  },

  // Redis 缓存
  redis: {
    enabled: process.env.REDIS_ENABLED !== "false",
    keyPrefix: "qd:",
    ttl: {
      customsStatus: 300,    // 5分钟
      container: 300,
      vesselSchedule: 7200,  // 2小时
      tide: 21600,           // 6小时
      session: 86400,        // 24小时，Cookie 持久化
    },
  },

  // 调度器
  scheduler: {
    customsStatus: process.env.SCHEDULE_CUSTOMS || "*/30 * * * *",     // 每30分钟
    container: process.env.SCHEDULE_CONTAINER || "*/30 * * * *",
    vesselSchedule: process.env.SCHEDULE_VESSEL || "0 */2 * * *",      // 每2小时
    announcement: process.env.SCHEDULE_ANNOUNCE || "*/30 * * * *",
    tide: process.env.SCHEDULE_TIDE || "0 */6 * * *",                  // 每6小时
  },

  // 数据标准化：第三方状态码 → 系统内部状态码
  statusMapping: {
    customs: {
      released: "customs_released",      // 海关放行
      inspecting: "customs_inspecting",  // 海关查验中
      held: "customs_held",              // 海关扣留
      declared: "customs_declared",      // 已申报
      arrived: "cargo_arrived",          // 运抵
      loaded: "cargo_loaded",            // 装载放行
    },
    container: {
      empty_pickup: "container_empty_pickup",     // 提空箱
      gate_in: "container_gate_in",               // 进场
      loaded: "container_loaded",                 // 已装箱
      vgm: "container_vgm_done",                  // VGM完成
      terminal_in: "container_terminal_in",       // 集港
      customs_release: "container_customs_ok",    // 海关放行
      loaded_onboard: "container_onboard",        // 已装船
      departed: "container_departed",             // 已离港
      transshipped: "container_transshipped",     // 中转
      arrived_dest: "container_arrived",          // 到港
      discharged: "container_discharged",         // 卸船
      empty_return: "container_empty_return",     // 还空箱
    },
    vessel: {
      berthed: "vessel_berthed",
      anchored: "vessel_anchored",
      expected: "vessel_expected",
      departed: "vessel_departed",
    },
  },

  // 通知配置
  notify: {
    enabled: process.env.QD_NOTIFY_ENABLED !== "false",
    // 异常事件通知
    onStatusChange: true,   // 状态变更
    onAnomaly: true,         // 异常（海关查验、甩柜、延误）
    onScraperError: true,   // 抓取器异常
    channels: ["wechat", "email"],
  },

  // 日志
  logging: {
    level: process.env.QD_LOG_LEVEL || "info",
    slowQueryThreshold: 5000, // 查询超过5秒记录警告
  },
};