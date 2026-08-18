"use strict";

/**
 * 监听云港通登录页网络请求，定位验证码 API
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const { chromium } = require("playwright");
const config = require("./config");

async function main() {
  console.log("=".repeat(60));
  console.log("  云港通网络请求监听");
  console.log("=".repeat(60));

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests = [];

  page.on("request", (req) => {
    const url = req.url();
    if (
      /captcha|verify|code|yzm|login|token|auth|session/i.test(url) &&
      !/_nuxt|\.js|\.css|\.png|\.svg|\.woff/.test(url)
    ) {
      requests.push({
        method: req.method(),
        url: url.slice(0, 150),
        postData: req.postData() ? req.postData().slice(0, 200) : null,
      });
    }
  });

  page.on("response", (res) => {
    const url = res.url();
    if (/captcha|verify|code|yzm/i.test(url)) {
      console.log(`\n📡 验证码响应: ${res.status()} ${url.slice(0, 150)}`);
      console.log(`   Content-Type: ${res.headers()["content-type"]}`);
    }
  });

  await page.goto(config.yungangtong.loginUrl, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  console.log("\n=== 相关请求 ===");
  requests.forEach((r, i) => {
    console.log(`\n[${i}] ${r.method} ${r.url}`);
    if (r.postData) console.log(`    POST: ${r.postData}`);
  });

  // 检查验证码 img 的 blob 来源 - 通过 Performance API 查找资源
  console.log("\n=== Performance 资源（验证码相关）===");
  const resources = await page.evaluate(() => {
    return performance.getEntriesByType("resource")
      .map((r) => r.name)
      .filter((n) => /captcha|verify|code|yzm/i.test(n));
  });
  resources.forEach((r) => console.log("  " + r.slice(0, 150)));

  await browser.close();
  console.log("\n" + "=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 失败:", err);
  process.exit(1);
});