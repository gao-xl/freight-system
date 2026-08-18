"use strict";

/**
 * 云港通模块可访问性测试
 * 提取所有卡片 aim URL，逐个访问测试哪些模块可用
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通模块可访问性测试");
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

    // 提取所有卡片 aim URL
    const cards = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".system-role")).map((c) => ({
        title: (c.querySelector(".system-role-title")?.innerText || c.innerText || "").trim(),
        aim: c.getAttribute("aim"),
      }));
    });

    console.log(`\n  共 ${cards.length} 个功能卡片:`);
    for (const c of cards) {
      console.log(`  ${c.title}: ${c.aim}`);
    }

    // 逐个测试可访问性
    console.log("\n" + "-".repeat(64));
    console.log("  模块可访问性测试:");
    console.log("-".repeat(64));

    for (const c of cards) {
      if (!c.aim) continue;
      // 提取路径部分（去掉 hash）
      const pathPart = c.aim.split("#")[0];
      try {
        const res = await page.goto(pathPart, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await new Promise((r) => setTimeout(r, 2000));
        const title = await page.title();
        const is404 = title.includes("404") || (await page.content()).includes("Page not found");
        console.log(`  ${is404 ? "❌ 404" : "✅ OK "} ${c.title} → ${pathPart} [${title}]`);
      } catch (err) {
        console.log(`  ⚠️ 失败 ${c.title} → ${pathPart}: ${err.message.slice(0, 80)}`);
      }
    }

    await page.close();
  } catch (err) {
    console.error(`\n❌ 测试失败: ${err.message}`);
    console.error(err.stack);
  } finally {
    release();
    await browserPool.destroy();
  }

  console.log("\n" + "=".repeat(64));
  console.log("  测试完成");
  console.log("=".repeat(64));
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});
