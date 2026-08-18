"use strict";

/**
 * 青岛港集成模块 - 统一入口
 *
 * 使用方式:
 *
 *   const qingdao = require("./integrations/qingdao");
 *
 *   // 启动定时任务
 *   qingdao.start({
 *     getPendingCustoms: async () => OrderService.getPendingCustomsItems(),
 *     getPendingContainers: async () => OrderService.getPendingContainerItems(),
 *   });
 *
 *   // 手动查询
 *   const result = await qingdao.queryCustomsStatus([{ blNo: "ABC123" }]);
 *   const tracking = await qingdao.trackContainer("TCLU1234567");
 *   const vessels = await qingdao.getPortVessels("CNTAO");
 *
 *   // 健康检查
 *   const health = qingdao.healthCheck();
 *
 *   // 优雅关闭
 *   await qingdao.shutdown();
 */

const browserPool = require("./browser/pool");
const scheduler = require("./schedulers/index");
const customsMonitor = require("./services/customs-monitor");
const containerTracker = require("./services/container-tracker");
const vesselSync = require("./services/vessel-sync");
const cacheAdapter = require("./adapters/cache-adapter");
const config = require("./config");

let _started = false;

module.exports = {
  /**
   * 启动模块（初始化浏览器池 + 启动定时任务）
   */
  async start(options = {}) {
    if (_started) return;
    _started = true;

    await browserPool.init();
    scheduler.start(options);
    this._log("info", "青岛港集成模块已启动");
  },

  /**
   * 优雅关闭
   */
  async shutdown() {
    scheduler.stop();
    await browserPool.destroy();
    _started = false;
    this._log("info", "青岛港集成模块已关闭");
  },

  /**
   * 健康检查
   */
  healthCheck() {
    return {
      started: _started,
      browser: browserPool.status,
      scheduler: scheduler.getStatus(),
      cache: {
        redis: cacheAdapter.redisConnected,
        memorySize: cacheAdapter.memorySize,
      },
    };
  },

  // ---- 业务 API ----

  /**
   * 批量查询通关状态
   * @param {Array<{blNo: string, containerNo?: string}>} items
   */
  async queryCustomsStatus(items) {
    return customsMonitor.run(items);
  },

  /**
   * 查询集装箱状态
   * @param {Array<{containerNo: string, blNo?: string}>} items
   */
  async queryContainers(items) {
    return containerTracker.run(items);
  },

  /**
   * 提单号全程追踪
   * @param {string} blNo
   */
  async trackByBlNo(blNo) {
    return containerTracker.trackByBlNo(blNo);
  },

  /**
   * 获取港口船舶动态
   * @param {string} portCode - 港口代码，默认 CNTAO
   */
  async getPortVessels(portCode) {
    return vesselSync.getPortSummary(portCode);
  },

  /**
   * 手动触发船舶同步
   */
  async syncVessels(portCode) {
    return vesselSync.syncPortVessels(portCode);
  },

  /**
   * 手动触发单个定时任务
   * @param {string} name - customsStatus | container | vesselSchedule
   */
  async triggerTask(name) {
    return scheduler.trigger(name);
  },

  /**
   * 获取模块配置（脱敏）
   */
  getConfig() {
    return {
      browser: { poolSize: config.browser.poolSize, headless: config.browser.headless },
      scheduler: config.scheduler,
      yungangtong: { baseUrl: config.yungangtong.baseUrl, username: config.yungangtong.username ? "***" : "(未配置)" },
      luhaitong: { baseUrl: config.luhaitong.baseUrl, username: config.luhaitong.username ? "***" : "(未配置)" },
      redis: { enabled: config.redis.enabled, keyPrefix: config.redis.keyPrefix },
      notify: { enabled: config.notify.enabled },
    };
  },

  _log(level, msg) {
    try {
      const { logger } = require("../utils/logger");
      logger[level](`[青岛港] ${msg}`);
    } catch {
      console.log(`[青岛港] ${msg}`);
    }
  },
};