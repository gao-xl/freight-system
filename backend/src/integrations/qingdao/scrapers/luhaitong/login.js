"use strict";

const { randomDelay, humanType, injectAntiDetection } = require("../../browser/anti-detect");
const sessionManager = require("../../browser/session");
const config = require("../../config");

const PLATFORM = "luhaitong";

class LuHaiTongLogin {
  /**
   * 登录陆海通，返回带 Cookie 的 page
   */
  async ensureLoggedIn(context) {
    const page = await context.newPage();
    await injectAntiDetection(page);

    const cachedCookies = await sessionManager.load(PLATFORM);
    if (cachedCookies && cachedCookies.length > 0) {
      await page.context().addCookies(cachedCookies);
      await page.goto(config.luhaitong.baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.browser.navigationTimeout,
      });
      await randomDelay(1000, 2000);

      if (await this._isLoggedIn(page)) {
        this._log("info", "Cookie 有效，跳过登录");
        return page;
      }
      this._log("warn", "Cookie 已失效，重新登录");
      await sessionManager.clear(PLATFORM);
    }

    return this._doLogin(page);
  }

  async _doLogin(page) {
    await page.goto(config.luhaitong.loginUrl, {
      waitUntil: "networkidle",
      timeout: config.browser.navigationTimeout,
    });
    await randomDelay(1000, 2000);

    const usernameSel = await this._findInput(page, [
      "#username", "input[name='username']", "input[name='account']",
      "input[placeholder*='用户名']", "input[placeholder*='账号']", "input[placeholder*='手机']",
      "input[type='text']",
    ]);
    const passwordSel = await this._findInput(page, [
      "#password", "input[name='password']", "input[placeholder*='密码']", "input[type='password']",
    ]);

    if (!usernameSel || !passwordSel) {
      throw new Error("[陆海通] 无法定位登录表单，页面结构可能已变更");
    }

    await humanType(page, usernameSel, config.luhaitong.username);
    await randomDelay(300, 800);
    await humanType(page, passwordSel, config.luhaitong.password);
    await randomDelay(500, 1000);

    const loginBtn = await this._findElement(page, [
      "button[type='submit']", "input[type='submit']",
      "button:has-text('登录')", "button:has-text('登 录')",
      ".login-btn", "#loginBtn", ".el-button--primary",
    ]);

    if (loginBtn) {
      await page.click(loginBtn);
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await randomDelay(2000, 4000);

    if (!(await this._isLoggedIn(page))) {
      const captcha = await page.$("img[src*='captcha'], img[src*='verify'], .captcha-img, .verify-code");
      if (captcha) {
        throw new Error("[陆海通] 登录遇到验证码，需要手动处理或配置验证码识别服务");
      }
      throw new Error("[陆海通] 登录失败，请检查账号密码");
    }

    const cookies = await page.context().cookies();
    await sessionManager.save(PLATFORM, cookies);
    this._log("info", "登录成功，Cookie 已持久化");

    return page;
  }

  async _isLoggedIn(page) {
    const url = page.url();
    if (url.includes("/login")) return false;
    const body = await page.content();
    const logoutKeywords = ["退出", "注销", "个人中心", "会员中心", "我的", "用户名"];
    return logoutKeywords.some((kw) => body.includes(kw));
  }

  async _findInput(page, selectors) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el && (await el.isVisible())) return sel;
    }
    return null;
  }

  async _findElement(page, selectors) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el && (await el.isVisible())) return sel;
    }
    return null;
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../../utils/logger");
      logger[level](`[陆海通] ${msg}`);
    } catch {
      console.log(`[陆海通] ${msg}`);
    }
  }
}

module.exports = new LuHaiTongLogin();