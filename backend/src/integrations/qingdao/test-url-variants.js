"use strict";

/**
 * 云港通 hycx1 模块 URL 变体测试
 * 尝试各种可能的访问路径
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

const VARIANTS = [
  "https://www.qingdao-port.net/hycx1/",
  "https://www.qingdao-port.net/hycx1",
  "https://www.qingdao-port.net/hycx1/index.html#/wlzz/xcdbg",
  "https://www.qingdao-port.net/index.html#/wlzz/xcdbg",
  "https://www.qingdao-port.net/#/wlzz/xcdbg",
  "https://www.qingdao-port.net/wlzz/xcdbg",
  "https://www.qingdao-port.net/port/wmdx",
  "https://www.qingdao-port.net/hycx1/index.html#/port/wmdx",
  "https://www.qingdao-port.net/hycx1/index.html#/",
];

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通 hycx1 模块 URL 变体测试");
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
    console.log("  ✅ 登录成功\n");

    for (const url of VARIANTS) {
      try {
        const res = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await new Promise((r) => setTimeout(r, 3000));
        const title = await page.title();
        const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
        const is404 = text.includes("404") || title.includes("404");
        console.log(`${is404 ? "❌ 404" : "✅ OK "} ${url}`);
        if (!is404) {
          console.log(`   标题: ${title}`);
          console.log(`   文本: ${text.replace(/\n/g, " ").slice(0, 250)}`);
        }
        console.log("");
      } catch (err) {
        console.log(`⚠️ 失败 ${url}: ${err.message.slice(0, 80)}\n`);
      }
    }

    await page.close();
  } catch (err) {
    console.error(`\n❌ 测试失败: ${err.message}`);
  } finally {
    release();
    await browserPool.destroy();
  }
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});