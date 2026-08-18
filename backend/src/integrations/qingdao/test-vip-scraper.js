"use strict";

/**
 * VIP API 抓取器测试
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const vipOceantally = require("./scrapers/yungangtong/vip-oceantally");
const browserPool = require("./browser/pool");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

const TEST_BL = process.argv[2] || "OOLU1234567890";

async function main() {
  console.log("=".repeat(64));
  console.log(`  VIP API 抓取器测试 - 提单号: ${TEST_BL}`);
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

    // 建立模块 session
    await page.goto("https://www.qingdao-port.net/web/tycxtrack/index.html?201911081", {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));

    // 测试进口查询
    console.log("\n" + "-".repeat(64));
    console.log("  进口查询:");
    console.log("-".repeat(64));
    const imp = await vipOceantally.queryByBillNo(page, TEST_BL, { ieFlag: "I" });
    console.log(`  提单号: ${imp.blNo}, 状态: ${imp.status}`);
    console.log(`  船信息: ${JSON.stringify(imp.vessel)}`);
    console.log(`  集装箱数: ${imp.containers.length}`);
    console.log("\n  状态节点:");
    for (const [key, node] of Object.entries(imp.nodes)) {
      console.log(`    ${node.completed ? "✅" : "⬜"} ${node.name} (${key}) ${node.time ? "时间: " + node.time : ""} ${node.count > 0 ? "[" + node.count + "条]" : ""}`);
    }

    // 测试出口查询
    console.log("\n" + "-".repeat(64));
    console.log("  出口查询:");
    console.log("-".repeat(64));
    const exp = await vipOceantally.queryByBillNo(page, TEST_BL, { ieFlag: "E" });
    console.log(`  提单号: ${exp.blNo}, 状态: ${exp.status}`);
    console.log(`  船信息: ${JSON.stringify(exp.vessel)}`);
    console.log(`  集装箱数: ${exp.containers.length}`);
    console.log("\n  状态节点:");
    for (const [key, node] of Object.entries(exp.nodes)) {
      console.log(`    ${node.completed ? "✅" : "⬜"} ${node.name} (${key}) ${node.time ? "时间: " + node.time : ""} ${node.count > 0 ? "[" + node.count + "条]" : ""}`);
    }

    await page.close();
  } catch (err) {
    console.error(`\n❌ 测试失败: ${err.message}`);
    console.error(err.stack);
  } finally {
    release();
    await browserPool.destroy();
  }
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});