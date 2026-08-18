"use strict";

const { randomDelay, humanType, injectAntiDetection } = require("../../browser/anti-detect");
const sessionManager = require("../../browser/session");
const captchaOcr = require("../../adapters/captcha-ocr");
const config = require("../../config");

const PLATFORM = "yungangtong";

// 云港通登录页实际结构（Ant Design 组件）
// 登录 URL 会重定向到 /login
const SELECTORS = {
  username: [
    "#form_item_username",
    "input[placeholder*='用户名']",
    "input[type='text']",
  ],
  password: [
    "#form_item_password",
    "input[placeholder*='密码']",
    "input[type='password']",
  ],
  captcha: [
    "#form_item_captcha",
    "input[placeholder*='验证码']",
  ],
  captchaImage: [".captcha", "img.captcha", "img[class*='captcha']"],
  loginButton: [
    "button:has-text('登 录')",
    "button:has-text('登录')",
    "button[type='submit']",
    ".ant-btn-primary",
  ],
  // 登录方式 Tab：账号登录
  accountTab: [
    "div:has-text('账号登录')",
    "span:has-text('账号登录')",
    ".ant-tabs-tab:has-text('账号登录')",
  ],
};

class YunGangTongLogin {
  /**
   * 登录云港通，返回带 Cookie 的 page
   * 优先使用缓存的 Cookie，Cookie 失效时重新登录
   * @param {import('playwright').BrowserContext} context
   * @param {object} options - { captchaResolver, onCaptchaImage }
   */
  async ensureLoggedIn(context, options = {}) {
    const page = await context.newPage();
    await injectAntiDetection(page);

    const cachedCookies = await sessionManager.load(PLATFORM);
    if (cachedCookies && cachedCookies.length > 0) {
      await page.context().addCookies(cachedCookies);
      await page.goto(config.yungangtong.baseUrl, {
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

    return this._doLogin(page, options);
  }

  /**
   * 执行登录（支持验证码自动识别 + 失败重试）
   * @param {object} options
   * @param {Function} options.captchaResolver - 验证码识别回调，默认使用本地 OCR
   * @param {Function} options.onCaptchaImage - 验证码图片回调（用于截图保存/打码）
   * @param {number} options.maxRetries - 验证码识别失败重试次数，默认 3
   */
  async _doLogin(page, options = {}) {
    const {
      captchaResolver = captchaOcr.recognizeCaptcha,
      onCaptchaImage,
      maxRetries = 3,
    } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this._log("info", `登录尝试 ${attempt}/${maxRetries}`);

      // 登录页会从 /page/login.html 重定向到 /login
      await page.goto(config.yungangtong.loginUrl, {
        waitUntil: "networkidle",
        timeout: config.browser.navigationTimeout,
      }).catch(() => {});
      await randomDelay(1000, 2000);

      // 切换到"账号登录"Tab（默认可能是介质卡）
      await this._switchToAccountTab(page);

      const usernameSel = await this._findVisible(page, SELECTORS.username);
      const passwordSel = await this._findVisible(page, SELECTORS.password);

      if (!usernameSel || !passwordSel) {
        throw new Error("[云港通] 无法定位登录表单，页面结构可能已变更");
      }

      await humanType(page, usernameSel, config.yungangtong.username);
      await randomDelay(300, 800);
      await humanType(page, passwordSel, config.yungangtong.password);
      await randomDelay(500, 1000);

      // 处理验证码
      const captchaSel = await this._findVisible(page, SELECTORS.captcha);
      if (captchaSel) {
        const captchaCode = await this._resolveCaptcha(page, { captchaResolver, onCaptchaImage });
        this._log("info", `验证码识别结果: ${captchaCode}`);
        await humanType(page, captchaSel, captchaCode);
        await randomDelay(300, 800);
      }

      const loginBtn = await this._findVisible(page, SELECTORS.loginButton);
      if (loginBtn) {
        await page.click(loginBtn);
      } else {
        await page.keyboard.press("Enter");
      }

      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await randomDelay(2000, 4000);

      if (await this._isLoggedIn(page)) {
        const cookies = await page.context().cookies();
        await sessionManager.save(PLATFORM, cookies);
        this._log("info", "登录成功，Cookie 已持久化");
        return page;
      }

      // 登录失败，检查错误信息
      const errorMsg = await this._getErrorMsg(page);
      this._log("warn", `登录失败 (第${attempt}次): ${errorMsg || "未知原因"}`);

      // 验证码错误时刷新重试
      if (attempt < maxRetries) {
        await randomDelay(1000, 2000);
      }
    }

    throw new Error("[云港通] 登录失败，多次尝试后仍未成功（可能验证码识别率低或账号密码错误）");
  }

  /**
   * 解析验证码
   * 优先使用外部识别器（打码平台/OCR），否则抛出需要手动处理
   */
  async _resolveCaptcha(page, { captchaResolver, onCaptchaImage }) {
    const captchaImgSel = await this._findVisible(page, SELECTORS.captchaImage);
    if (!captchaImgSel) {
      throw new Error("[云港通] 未找到验证码图片");
    }

    // 获取验证码图片 buffer
    const captchaEl = await page.$(captchaImgSel);
    const src = await captchaEl.getAttribute("src");
    let buffer = null;

    if (src && src.startsWith("blob:")) {
      // blob URL → 在页面内转 base64（ArrayBuffer 无法直接跨上下文传递）
      const base64 = await page.evaluate(async (blobUrl) => {
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      }, src);
      buffer = Buffer.from(base64, "base64");
    } else if (src && src.startsWith("data:")) {
      // data URL
      const base64 = src.split(",")[1];
      buffer = Buffer.from(base64, "base64");
    } else if (src) {
      // 普通 URL
      const res = await page.goto(src);
      buffer = await res.body();
    }

    if (!buffer) {
      throw new Error("[云港通] 无法读取验证码图片");
    }

    // 回调验证码图片（用于保存/打码）
    if (onCaptchaImage) {
      await onCaptchaImage(Buffer.from(buffer));
    }

    // 使用外部识别器
    if (captchaResolver) {
      const code = await captchaResolver(Buffer.from(buffer));
      if (code && code.trim()) return code.trim();
    }

    throw new Error("[云港通] 需要验证码识别服务（打码平台/OCR）");
  }

  async _switchToAccountTab(page) {
    const tabSel = await this._findVisible(page, SELECTORS.accountTab);
    if (tabSel) {
      await page.click(tabSel);
      await randomDelay(500, 1000);
    }
  }

  async _getErrorMsg(page) {
    const errorText = await page.$$eval(
      ".el-message, .error, .err-msg, .el-message__content, .login-error, [class*='error'], .ant-message, .ant-form-item-explain-error",
      (els) => els.map((el) => (el.innerText || "").trim()).filter(Boolean).slice(0, 3)
    );
    return errorText.length > 0 ? errorText.join(" | ") : null;
  }

  async _isLoggedIn(page) {
    const url = page.url();
    if (url.includes("/login")) return false;

    const body = await page.content();
    const logoutKeywords = ["退出", "注销", "个人中心", "会员中心", "我的"];
    return logoutKeywords.some((kw) => body.includes(kw));
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
      logger[level](`[云港通] ${msg}`);
    } catch {
      console.log(`[云港通] ${msg}`);
    }
  }
}

module.exports = new YunGangTongLogin();