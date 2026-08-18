"use strict";

const { chromium } = require("playwright");
const config = require("../config");

class BrowserPool {
  constructor() {
    this.browsers = [];
    this.contexts = [];
    this.available = [];
    this.inUse = new Set();
    this.poolSize = config.browser.poolSize;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    for (let i = 0; i < this.poolSize; i++) {
      const browser = await chromium.launch({
        headless: config.browser.headless,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
      });
      const context = await browser.newContext({
        viewport: config.browser.viewport,
        locale: config.browser.locale,
        timezoneId: config.browser.timezoneId,
        userAgent: this._randomUA(),
      });
      this.browsers.push(browser);
      this.contexts.push(context);
      this.available.push(i);
    }
    this._initialized = true;
    this._log("info", `浏览器池已初始化，共 ${this.poolSize} 个实例`);
  }

  async acquire() {
    await this.init();
    if (this.available.length === 0) {
      this._log("warn", "浏览器池已满，等待释放...");
      await new Promise((r) => setTimeout(r, 1000));
      return this.acquire();
    }
    const idx = this.available.pop();
    this.inUse.add(idx);
    return {
      context: this.contexts[idx],
      release: () => this._release(idx),
    };
  }

  _release(idx) {
    this.inUse.delete(idx);
    this.available.push(idx);
  }

  async destroy() {
    for (const browser of this.browsers) {
      await browser.close().catch(() => {});
    }
    this.browsers = [];
    this.contexts = [];
    this.available = [];
    this.inUse.clear();
    this._initialized = false;
    this._log("info", "浏览器池已销毁");
  }

  get status() {
    return {
      total: this.poolSize,
      available: this.available.length,
      inUse: this.inUse.size,
      initialized: this._initialized,
    };
  }

  _randomUA() {
    const uas = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    ];
    return uas[Math.floor(Math.random() * uas.length)];
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../utils/logger");
      logger[level](`[BrowserPool] ${msg}`);
    } catch {
      console.log(`[BrowserPool] ${msg}`);
    }
  }
}

module.exports = new BrowserPool();