"use strict";

const { randomDelay, humanScroll } = require("../../browser/anti-detect");
const config = require("../../config");

/**
 * 云港通 - 通关状态查询
 *
 * 查询项：
 *  - 运抵报告 (cargo arrival report)
 *  - 装载放行 (loading release)
 *  - QQCT 海关查验 (customs inspection)
 */
class CustomsStatusScraper {
  /**
   * 批量查询通关状态
   * @param {import('playwright').Page} page - 已登录的页面
   * @param {Array<{blNo: string, containerNo?: string}>} items - 查询项
   * @returns {Promise<Array<{blNo: string, status: string, details: object}>>}
   */
  async batchQuery(page, items) {
    const results = [];
    for (const item of items) {
      try {
        const result = await this._querySingle(page, item);
        results.push(result);
        await randomDelay(1000, 3000); // 请求间隔，避免触发频率限制
      } catch (err) {
        this._log("warn", `查询 ${item.blNo} 失败: ${err.message}`);
        results.push({ blNo: item.blNo, containerNo: item.containerNo, status: "query_failed", error: err.message });
      }
    }
    return results;
  }

  async _querySingle(page, item) {
    // 导航到查询页面
    await page.goto(config.yungangtong.queryUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    });
    await randomDelay(500, 1500);

    const result = {
      blNo: item.blNo,
      containerNo: item.containerNo || null,
      queriedAt: new Date().toISOString(),
      cargoArrived: null,    // 运抵报告
      loadingReleased: null,  // 装载放行
      customsInspecting: null, // 海关查验
      rawData: null,
    };

    // 尝试通过提单号查询
    const inputSel = await this._findQueryInput(page);
    if (!inputSel) {
      throw new Error("无法定位查询输入框");
    }

    await page.fill(inputSel, item.blNo);
    await randomDelay(300, 800);

    // 点击查询按钮
    const searchBtn = await this._findSearchButton(page);
    if (searchBtn) {
      await page.click(searchBtn);
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await randomDelay(1000, 3000);

    // 解析结果
    const pageContent = await page.content();
    result.rawData = pageContent;

    // 解析运抵报告
    result.cargoArrived = this._parseCargoArrived(pageContent);
    // 解析装载放行
    result.loadingReleased = this._parseLoadingRelease(pageContent);
    // 解析海关查验
    result.customsInspecting = this._parseCustomsInspection(pageContent);

    // 综合判定状态
    result.status = this._determineStatus(result);

    return result;
  }

  _findQueryInput(page) {
    return this._findVisible(page, [
      "#blNo", "#billNo", "input[name='blNo']", "input[name='billNo']",
      "input[placeholder*='提单']", "input[placeholder*='单号']",
      "#containerNo", "input[name='containerNo']", "input[placeholder*='箱号']",
      "input[type='text']:not([readonly])",
    ]);
  }

  _findSearchButton(page) {
    return this._findVisible(page, [
      "button:has-text('查询')", "button:has-text('搜索')",
      "input[type='submit']", "button[type='submit']",
      ".search-btn", "#searchBtn", ".query-btn",
    ]);
  }

  async _findVisible(page, selectors) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el && (await el.isVisible().catch(() => false))) return sel;
    }
    return null;
  }

  _parseCargoArrived(html) {
    // 运抵报告关键词匹配
    const patterns = [
      /运抵报告[：:]\s*(已运抵|未运抵|已到达)/,
      /运抵状态[：:]\s*(已运抵|未运抵|已到达)/,
      /货物运抵[：:]\s*(是|否|已)/,
      /arrival[^<]*?(已|未|yes|no)/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[1].includes("已") || m[1].includes("是") || m[1].toLowerCase() === "yes";
    }
    return null;
  }

  _parseLoadingRelease(html) {
    const patterns = [
      /装载放行[：:]\s*(已放行|未放行|放行|不放行)/,
      /放行状态[：:]\s*(已放行|未放行)/,
      /loading\s*release[^<]*?(已|未|yes|no)/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[1].includes("已") || m[1].includes("放行") || m[1].toLowerCase() === "yes";
    }
    return null;
  }

  _parseCustomsInspection(html) {
    const patterns = [
      /海关查验[：:]\s*(查验中|已放行|未查验|已查验|待查验)/,
      /查验状态[：:]\s*(查验中|已放行|未查验|已查验|待查验)/,
      /QQCT.*查验[：:]\s*(查验中|已放行|未查验)/,
      /inspection[^<]*?(inspecting|passed|released)/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) {
        const v = m[1];
        if (v.includes("查验中") || v.includes("待查验") || v.toLowerCase() === "inspecting") return "inspecting";
        if (v.includes("放行") || v.includes("已查验") || v.toLowerCase() === "passed" || v.toLowerCase() === "released") return "passed";
        if (v.includes("未查验")) return "none";
        return v;
      }
    }
    return null;
  }

  _determineStatus(result) {
    if (result.cargoArrived === false) return "not_arrived";
    if (result.customsInspecting === "inspecting") return "customs_inspecting";
    if (result.loadingReleased === true) return "released";
    if (result.cargoArrived === true && result.loadingReleased === false) return "arrived_pending_release";
    if (result.loadingReleased === false) return "pending_release";
    return "unknown";
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../../utils/logger");
      logger[level](`[云港通·通关] ${msg}`);
    } catch {
      console.log(`[云港通·通关] ${msg}`);
    }
  }
}

module.exports = new CustomsStatusScraper();