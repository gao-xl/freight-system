"use strict";

/**
 * 云港通门户页脚本资源探查
 * 导出所有 script src + 内联脚本中 aim/system-role 导航逻辑
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

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通门户页脚本资源探查");
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
    try {
      await page.waitForSelector(".system-role", { timeout: 15000 });
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));

    // 导出所有 script src
    const scripts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("script[src]")).map((s) => s.src);
    });
    console.log(`\n  页面脚本 (${scripts.length}):`);
    for (const s of scripts) console.log("  " + s);

    // 搜索内联脚本中的 aim 导航逻辑
    const inlineHits = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script:not([src])"));
      const results = [];
      for (const s of scripts) {
        const text = s.textContent || "";
        if (text.includes("aim") || text.includes("system-role") || text.includes("hycx1")) {
          results.push(text.slice(0, 3000));
        }
      }
      return results;
    });
    console.log(`\n  内联脚本命中 (${inlineHits.length}):`);
    for (const h of inlineHits) {
      console.log("  ---");
      console.log("  " + h.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 3000));
    }

    // 监听点击卡片时的完整网络请求
    const requests = [];
    page.on("request", (req) => {
      requests.push(`[REQ] ${req.method()} ${req.url()}`);
    });
    page.on("response", (res) => {
      requests.push(`[RES] ${res.status()} ${res.url()}`);
    });

    // 点击运抵报告查询卡片
    console.log("\n  点击运抵报告查询卡片...");
    await page.getByText("运抵报告查询", { exact: true }).first().click({ timeout: 5000 }).catch(async () => {
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a, div, span, li"));
        const target = links.find((el) => (el.innerText || "").trim() === "运抵报告查询");
        if (target) target.click();
      });
    });
    await new Promise((r) => setTimeout(r, 5000));

    console.log(`\n  点击后 URL: ${page.url()}`);
    console.log("\n  网络请求记录:");
    for (const r of requests.slice(-40)) console.log("  " + r);

    // 保存完整 HTML 供分析
    const html = await page.content();
    const htmlPath = path.join(LOG_DIR, "after-click-full.html");
    fs.writeFileSync(htmlPath, html);
    console.log(`\n  点击后完整 HTML: ${htmlPath}`);

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
