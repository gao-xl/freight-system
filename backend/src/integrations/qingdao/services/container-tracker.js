"use strict";

const browserPool = require("../browser/pool");
const lhtLogin = require("../scrapers/luhaitong/login");
const containerScraper = require("../scrapers/luhaitong/container");
const ygtLogin = require("../scrapers/yungangtong/login");
const vipContainer = require("../scrapers/yungangtong/vip-container");
const normalizer = require("../adapters/data-normalizer");
const changeDetector = require("../adapters/change-detector");
const cacheAdapter = require("../adapters/cache-adapter");
const config = require("../config");

/**
 * 集装箱追踪服务
 * 定时轮询陆海通，批量查询集装箱状态
 */
class ContainerTracker {
  /**
   * 执行一轮集装箱状态查询
   * @param {Array<{containerNo: string, blNo?: string}>} items
   * @returns {Promise<{results: Array, changes: Array}>}
   */
  async run(items) {
    if (!items || items.length === 0) {
      this._log("info", "无待查询集装箱，跳过");
      return { results: [], changes: [] };
    }

    const startTime = Date.now();
    this._log("info", `开始查询 ${items.length} 个集装箱状态`);

    const { context, release } = await browserPool.acquire();
    let page;
    const changes = [];

    try {
      page = await lhtLogin.ensureLoggedIn(context);
      const rawResults = await containerScraper.batchQuery(page, items);
      const results = rawResults.map((r) => {
        const normalized = normalizer.normalizeContainerStatus({ ...r, source: "luhaitong" });
        return normalized;
      });

      // 缓存 + 变更检测
      for (const result of results) {
        const cacheKey = `container:${result.containerNo}`;
        const previous = await cacheAdapter.get(cacheKey);
        const prevData = previous ? JSON.parse(previous) : null;

        const { changed, changes: itemChanges } = changeDetector.detectContainerChanges(
          prevData, result
        );

        if (changed) {
          changes.push({ containerNo: result.containerNo, changes: itemChanges });
          if (config.notify.onStatusChange) {
            await this._notifyChange(result.containerNo, result.blNo, itemChanges);
          }
        }

        // 合并多个数据源的数据
        const merged = normalizer.mergeContainerData(prevData, result);
        await cacheAdapter.set(cacheKey, JSON.stringify(merged), config.redis.ttl.container);
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > config.logging.slowQueryThreshold) {
        this._log("warn", `集装箱查询耗时 ${elapsed}ms，超过阈值`);
      }

      this._log("info", `集装箱查询完成: ${results.length} 条, ${changes.length} 条变更 (${elapsed}ms)`);
      return { results, changes };
    } catch (err) {
      this._log("error", `集装箱查询失败: ${err.message}`);
      if (config.notify.onScraperError) {
        this._notifyError("陆海通集装箱", err.message);
      }
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      release();
    }
  }

  /**
   * 提单号全程追踪
   */
  async trackByBlNo(blNo) {
    const { context, release } = await browserPool.acquire();
    let page;
    try {
      page = await lhtLogin.ensureLoggedIn(context);
      const result = await containerScraper.trackByBlNo(page, blNo);
      return result;
    } finally {
      if (page) await page.close().catch(() => {});
      release();
    }
  }

  /**
   * 云港通 VIP 单箱查询（青岛港）
   * @param {string} containerNo - 集装箱号
   * @param {string} ieFlag - I=进口, E=出口
   * @returns {Promise<object>} 标准化集装箱状态
   */
  async trackByContainerNo(containerNo, ieFlag = "I") {
    const { context, release } = await browserPool.acquire();
    let page;
    try {
      page = await ygtLogin.ensureLoggedIn(context);
      // 建立模块 session（VIP API 需要模块上下文）
      await page.goto(config.yungangtong.vipQueryUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.browser.navigationTimeout,
      }).catch(() => {});
      await this._sleep(3000);

      const raw = await vipContainer.queryByContainerNo(page, containerNo, { ieFlag });
      return normalizer.normalizeYgtContainerStatus(raw);
    } finally {
      if (page) await page.close().catch(() => {});
      release();
    }
  }

  _sleep(min = 1000, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min) + min);
    return new Promise((r) => setTimeout(r, delay));
  }

  async _notifyChange(containerNo, blNo, changes) {
    const msg = changes.map((c) => `  ${c.field}: ${c.from || "无"} → ${c.to || "更新"}`).join("\n");
    this._log("info", `[集装箱变更] ${containerNo}${blNo ? ` (${blNo})` : ""}\n${msg}`);
    // TODO: 接入企业微信/邮件通知
  }

  _notifyError(source, message) {
    this._log("error", `[${source} 异常] ${message}`);
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../../utils/logger");
      logger[level](`[集装箱追踪] ${msg}`);
    } catch {
      console.log(`[集装箱追踪] ${msg}`);
    }
  }
}

module.exports = new ContainerTracker();