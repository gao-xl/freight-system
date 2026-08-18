"use strict";

const browserPool = require("../browser/pool");
const ygtLogin = require("../scrapers/yungangtong/login");
const vipOceantally = require("../scrapers/yungangtong/vip-oceantally");
const normalizer = require("../adapters/data-normalizer");
const changeDetector = require("../adapters/change-detector");
const cacheAdapter = require("../adapters/cache-adapter");
const config = require("../config");

/**
 * 通关状态监控服务
 * 定时轮询云港通 VIP API，批量查询所有在途报关单的通关状态
 */
class CustomsMonitor {
  /**
   * 执行一轮通关状态查询
   * @param {Array<{blNo: string, containerNo?: string, ieFlag?: string}>} items - 待查询项
   * @returns {Promise<{results: Array, changes: Array}>}
   */
  async run(items) {
    if (!items || items.length === 0) {
      this._log("info", "无待查询项，跳过");
      return { results: [], changes: [] };
    }

    const startTime = Date.now();
    this._log("info", `开始查询 ${items.length} 条通关状态`);

    const { context, release } = await browserPool.acquire();
    let page;
    const changes = [];

    try {
      page = await ygtLogin.ensureLoggedIn(context);

      // 建立模块 session（VIP API 需要模块上下文）
      await page.goto(config.yungangtong.vipQueryUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.browser.navigationTimeout,
      }).catch(() => {});
      await this._sleep(3000);

      const results = [];
      for (const item of items) {
        try {
          const raw = await vipOceantally.queryByBillNo(page, item.blNo, {
            ieFlag: item.ieFlag || "I",
          });
          const result = normalizer.normalizeCustomsStatus(raw);
          results.push(result);

          // 缓存结果 + 变更检测
          const cacheKey = `customs:${result.blNo}:${result.ieFlag}`;
          const previous = await cacheAdapter.get(cacheKey);
          const prevData = previous ? JSON.parse(previous) : null;

          const { changed, changes: itemChanges } = changeDetector.detectCustomsChanges(
            prevData, result
          );

          if (changed) {
            changes.push({ blNo: result.blNo, ieFlag: result.ieFlag, changes: itemChanges });
            if (config.notify.onStatusChange) {
              this._notifyChange(result.blNo, itemChanges);
            }
          }

          await cacheAdapter.set(cacheKey, JSON.stringify(result), config.redis.ttl.customsStatus);
          await this._sleep(1000, 2000); // 请求间隔，避免频率限制
        } catch (err) {
          this._log("warn", `查询 ${item.blNo} 失败: ${err.message}`);
          results.push({
            blNo: item.blNo,
            ieFlag: item.ieFlag || "I",
            status: "query_failed",
            error: err.message,
          });
        }
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > config.logging.slowQueryThreshold) {
        this._log("warn", `通关状态查询耗时 ${elapsed}ms，超过阈值`);
      }

      this._log("info", `通关状态查询完成: ${results.length} 条, ${changes.length} 条变更 (${elapsed}ms)`);
      return { results, changes };
    } catch (err) {
      this._log("error", `通关状态查询失败: ${err.message}`);
      if (config.notify.onScraperError) {
        this._notifyError("云港通通关状态", err.message);
      }
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      release();
    }
  }

  _sleep(min = 1000, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min) + min);
    return new Promise((r) => setTimeout(r, delay));
  }

  _notifyChange(blNo, changes) {
    const msg = changes.map((c) => `  ${c.field}: ${c.from} → ${c.to}`).join("\n");
    this._log("info", `[状态变更] ${blNo}\n${msg}`);
    // TODO: 接入企业微信/邮件通知
  }

  _notifyError(source, message) {
    this._log("error", `[${source} 异常] ${message}`);
    // TODO: 接入告警通知
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../../utils/logger");
      logger[level](`[通关监控] ${msg}`);
    } catch {
      console.log(`[通关监控] ${msg}`);
    }
  }
}

module.exports = new CustomsMonitor();