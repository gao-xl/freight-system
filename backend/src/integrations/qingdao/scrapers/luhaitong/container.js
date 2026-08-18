"use strict";

const { randomDelay } = require("../../browser/anti-detect");
const config = require("../../config");

/**
 * 陆海通 - 集装箱单箱查询 & 箱货动态
 *
 * 查询项：
 *  - 集装箱单箱查询（按箱号）
 *  - 箱货动态跟踪（全程节点）
 *  - 提单号全程物流追踪
 */
class ContainerScraper {
  /**
   * 批量查询集装箱状态
   * @param {import('playwright').Page} page - 已登录的页面
   * @param {Array<{containerNo: string, blNo?: string}>} items
   * @returns {Promise<Array<{containerNo: string, status: string, nodes: Array, rawData: object}>>}
   */
  async batchQuery(page, items) {
    const results = [];
    for (const item of items) {
      try {
        const result = await this._queryContainer(page, item);
        results.push(result);
        await randomDelay(1000, 3000);
      } catch (err) {
        this._log("warn", `查询 ${item.containerNo} 失败: ${err.message}`);
        results.push({ containerNo: item.containerNo, blNo: item.blNo, status: "query_failed", error: err.message });
      }
    }
    return results;
  }

  /**
   * 提单号全程物流追踪
   * @param {import('playwright').Page} page
   * @param {string} blNo
   * @returns {Promise<object>}
   */
  async trackByBlNo(page, blNo) {
    await page.goto(config.luhaitong.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    });
    await randomDelay(500, 1500);

    // 导航到物流追踪页面
    const trackingLink = await this._findVisible(page, [
      "a:has-text('物流追踪')", "a:has-text('全程追踪')",
      "a:has-text('货物跟踪')", ".tracking-menu", "#trackingNav",
    ]);
    if (trackingLink) {
      await page.click(trackingLink);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }

    // 输入提单号
    const inputSel = await this._findVisible(page, [
      "#blNo", "input[name='blNo']", "input[placeholder*='提单']",
      "input[placeholder*='单号']", "input[type='text']:not([readonly])",
    ]);
    if (!inputSel) throw new Error("无法定位提单号输入框");

    await page.fill(inputSel, blNo);
    await randomDelay(300, 800);

    const searchBtn = await this._findVisible(page, [
      "button:has-text('查询')", "button:has-text('搜索')", "button:has-text('追踪')",
      "button[type='submit']", ".search-btn",
    ]);
    if (searchBtn) {
      await page.click(searchBtn);
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await randomDelay(1000, 3000);

    const pageContent = await page.content();

    return {
      blNo,
      queriedAt: new Date().toISOString(),
      nodes: this._parseTrackingNodes(pageContent),
      rawData: pageContent,
    };
  }

  async _queryContainer(page, item) {
    await page.goto(config.luhaitong.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    });
    await randomDelay(500, 1500);

    // 尝试找到集装箱查询入口
    const containerLink = await this._findVisible(page, [
      "a:has-text('集装箱查询')", "a:has-text('箱货查询')",
      "a:has-text('单箱查询')", ".container-query",
    ]);
    if (containerLink) {
      await page.click(containerLink);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }

    const inputSel = await this._findVisible(page, [
      "#containerNo", "input[name='containerNo']", "input[placeholder*='箱号']",
      "input[placeholder*='集装箱']", "input[type='text']:not([readonly])",
    ]);
    if (!inputSel) throw new Error("无法定位箱号输入框");

    await page.fill(inputSel, item.containerNo);
    await randomDelay(300, 800);

    const searchBtn = await this._findVisible(page, [
      "button:has-text('查询')", "button:has-text('搜索')",
      "button[type='submit']", ".search-btn",
    ]);
    if (searchBtn) {
      await page.click(searchBtn);
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await randomDelay(1000, 3000);

    const pageContent = await page.content();

    const result = {
      containerNo: item.containerNo,
      blNo: item.blNo || null,
      queriedAt: new Date().toISOString(),
      nodes: this._parseContainerNodes(pageContent),
      status: this._determineStatus(pageContent),
      rawData: pageContent,
    };

    return result;
  }

  /**
   * 解析集装箱全程节点
   */
  _parseContainerNodes(html) {
    const nodes = [];
    const nodePatterns = [
      { key: "empty_pickup", label: "提空箱", patterns: [/提空箱.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /empty.*?pickup.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "gate_in", label: "进场", patterns: [/进场.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /gate\s*in.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "loaded", label: "已装箱", patterns: [/装箱.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /loaded.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "vgm", label: "VGM称重", patterns: [/VGM.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/i, /称重.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/] },
      { key: "terminal_in", label: "集港", patterns: [/集港.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /terminal\s*in.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "customs_release", label: "海关放行", patterns: [/海关放行.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /customs.*?release.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "onboard", label: "已装船", patterns: [/装船.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /on\s*board.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "departed", label: "已离港", patterns: [/离港.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /departed.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "arrived", label: "已到港", patterns: [/到港.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /arrived.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "discharged", label: "已卸船", patterns: [/卸船.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /discharged.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "empty_return", label: "还空箱", patterns: [/还空箱.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /empty\s*return.*?(\d{4}-\d{2}-\d{2})/i] },
    ];

    for (const node of nodePatterns) {
      for (const pattern of node.patterns) {
        const match = html.match(pattern);
        if (match) {
          nodes.push({
            key: node.key,
            label: node.label,
            time: match[1] || null,
            completed: true,
          });
          break;
        }
      }
    }

    return nodes;
  }

  /**
   * 解析提单全程追踪节点
   */
  _parseTrackingNodes(html) {
    // 追踪节点包括：海关、铁路、公路、码头、北斗数据
    const nodes = this._parseContainerNodes(html);

    // 额外的陆运/铁运节点
    const extraPatterns = [
      { key: "rail_depart", label: "铁路发运", patterns: [/铁路发运.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /rail.*?depart.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "rail_arrive", label: "铁路到达", patterns: [/铁路到达.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /rail.*?arrive.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "truck_depart", label: "公路发运", patterns: [/公路发运.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /truck.*?depart.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "truck_arrive", label: "公路到达", patterns: [/公路到达.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /truck.*?arrive.*?(\d{4}-\d{2}-\d{2})/i] },
      { key: "delivery", label: "已签收", patterns: [/签收.*?(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/, /delivered.*?(\d{4}-\d{2}-\d{2})/i] },
    ];

    for (const node of extraPatterns) {
      for (const pattern of node.patterns) {
        const match = html.match(pattern);
        if (match) {
          nodes.push({
            key: node.key,
            label: node.label,
            time: match[1] || null,
            completed: true,
          });
          break;
        }
      }
    }

    return nodes;
  }

  _determineStatus(html) {
    if (/还空箱|已签收|delivered|empty\s*return/i.test(html)) return "completed";
    if (/已到港|已卸船|arrived|discharged/i.test(html)) return "arrived";
    if (/已装船|已离港|on\s*board|departed/i.test(html)) return "in_transit";
    if (/集港|海关放行|terminal\s*in|customs\s*release/i.test(html)) return "at_terminal";
    if (/提空箱|进场|装箱|empty\s*pickup|gate\s*in/i.test(html)) return "inland";
    return "unknown";
  }

  async _findVisible(page, selectors) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el && (await el.isVisible().catch(() => false))) return sel;
    }
    return null;
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../../utils/logger");
      logger[level](`[陆海通·集装箱] ${msg}`);
    } catch {
      console.log(`[陆海通·集装箱] ${msg}`);
    }
  }
}

module.exports = new ContainerScraper();