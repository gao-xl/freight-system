"use strict";

/**
 * 云港通查询卡片 DOM 结构深度探查
 * 导出卡片完整 HTML，找出点击事件绑定元素，监控点击后的网络请求
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

const LOG_DIR = path.join(__dirname, "..", "..", "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const TARGET = process.argv[2] || "运抵报告查询";

async function main() {
  console.log("=".repeat(64));
  console.log(`  云港通卡片 DOM 探查: ${TARGET}`);
  console.log("=".repeat(64));

  await browserPool.init();
  const { context, release } = await browserPool.acquire();

  try {
    const page = await ygtLogin.ensureLoggedIn(context, {
      captchaResolver: async (buffer) => {
        const code = await captchaOcr.recognizeCaptcha(buffer);
        console.log(`  OCR 识别结果: "${code}"`);
        return code;
      },
      maxRetries: 5,
    });
    console.log("  ✅ 登录成功");

    await page.goto(config.yungangtong.queryUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    // 导出卡片容器完整 HTML
    const html = await page.evaluate((kw) => {
      const links = Array.from(document.querySelectorAll("a, div, span, li"));
      const target = links.find((el) => (el.innerText || "").trim() === kw);
      if (!target) return null;
      // 找到 system-role-container 容器
      let container = target;
      while (container && !(container.className || "").toString().includes("system-role-container")) {
        container = container.parentElement;
      }
      return container ? container.outerHTML : target.outerHTML;
    }, TARGET);

    if (!html) {
      console.log("  ⚠️ 未找到目标卡片");
      return;
    }

    const htmlPath = path.join(LOG_DIR, `card-${TARGET}.html`);
    fs.writeFileSync(htmlPath, html);
    console.log(`  卡片 HTML 已保存: ${htmlPath}`);
    console.log("\n  卡片 HTML 内容:");
    console.log("  " + html.replace(/</g, "\n  <").slice(0, 4000));

    // 监控网络请求 + 新页面
    const requests = [];
    page.on("request", (req) => {
      if (req.isNavigationRequest() || req.url().includes("/api/") || req.url().includes("query")) {
        requests.push(`[REQ] ${req.method()} ${req.url()}`);
      }
    });
    page.on("response", (res) => {
      if (res.url().includes("/api/") || res.url().includes("query")) {
        requests.push(`[RES] ${res.status()} ${res.url()}`);
      }
    });

    // 使用 Playwright locator 点击（点击元素中心）
    console.log("\n  使用 Playwright locator 点击卡片...");
    const popupPromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
    try {
      await page.getByText(TARGET, { exact: true }).first().click({ timeout: 5000 });
    } catch (err) {
      console.log(`  locator 点击失败: ${err.message}`);
      // 兜底：JS 点击
      await page.evaluate((kw) => {
        const links = Array.from(document.querySelectorAll("a, div, span, li"));
        const target = links.find((el) => (el.innerText || "").trim() === kw);
        if (target) target.click();
      }, TARGET);
    }

    const popup = await popupPromise;
    await new Promise((r) => setTimeout(r, 5000));

    console.log(`\n  新标签页: ${popup ? popup.url() : "无"}`);
    if (popup) {
      await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
      const popupShot = path.join(LOG_DIR, `popup-${TARGET}.png`);
      await popup.screenshot({ path: popupShot, fullPage: true });
      console.log(`  新标签页截图: ${popupShot}`);
      console.log(`  新标签页 URL: ${popup.url()}`);
      console.log(`  新标签页标题: ${await popup.title()}`);
      const popupText = await popup.evaluate(() => document.body.innerText.slice(0, 1500));
      console.log("  新标签页文本:");
      console.log("  " + popupText.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 1500));
      await popup.close().catch(() => {});
    }

    console.log(`\n  当前页 URL: ${page.url()}`);
    const shot = path.join(LOG_DIR, `after-click-${TARGET}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`  当前页截图: ${shot}`);

    console.log("\n  网络请求记录:");
    for (const r of requests.slice(-30)) console.log("  " + r);

    await page.close();
  } catch (err) {
    console.error(`\n❌ 探查失败: ${err.message}`);
    console.error(err.stack);
  } finally {
    release();
    await browserPool.destroy();
  }

  console.log("\n" + "=".repeat(64));
  console.log("  探查完成");
  console.log("=".repeat(64));
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});
