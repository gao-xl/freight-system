"use strict";

/**
 * 云港通 PoC 完整测试
 * 1. OCR 自动识别验证码登录
 * 2. 进入通关状态查询页
 * 3. 尝试查询测试提单号
 *
 * 使用方式:
 *   node src/integrations/qingdao/poc-test.js [提单号]
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

const TEST_BL = process.argv[2] || "TESTBL20260818";

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通 PoC 完整测试");
  console.log("=".repeat(64));

  if (!config.yungangtong.username || !config.yungangtong.password) {
    console.error("❌ 未配置云港通账号 (YGT_USERNAME / YGT_PASSWORD)");
    process.exit(1);
  }
  console.log(`\n账号: ${config.yungangtong.username}`);
  console.log(`测试提单号: ${TEST_BL}`);

  await browserPool.init();
  const { context, release } = await browserPool.acquire();

  try {
    // ========== 1. 登录（OCR 自动识别验证码） ==========
    console.log("\n" + "-".repeat(64));
    console.log("[步骤 1/3] 登录云港通（OCR 自动识别验证码）");
    console.log("-".repeat(64));

    const page = await ygtLogin.ensureLoggedIn(context, {
      // 使用本地 OCR 识别验证码
      captchaResolver: async (buffer) => {
        const captchaPath = path.join(LOG_DIR, "poc-captcha.png");
        fs.writeFileSync(captchaPath, buffer);
        const code = await captchaOcr.recognizeCaptcha(buffer);
        console.log(`  验证码截图: ${captchaPath}`);
        console.log(`  OCR 识别结果: "${code}"`);
        return code;
      },
      maxRetries: 5,
    });

    console.log("  ✅ 登录成功!");
    console.log(`  当前 URL: ${page.url()}`);
    console.log(`  页面标题: ${await page.title()}`);

    const loginShot = path.join(LOG_DIR, "poc-login-success.png");
    await page.screenshot({ path: loginShot, fullPage: true });
    console.log(`  登录后截图: ${loginShot}`);

    // ========== 2. 进入通关状态查询页 ==========
    console.log("\n" + "-".repeat(64));
    console.log("[步骤 2/3] 进入通关状态查询页");
    console.log("-".repeat(64));

    await page.goto(config.yungangtong.queryUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch((err) => {
      console.log(`  导航警告: ${err.message}`);
    });
    await new Promise((r) => setTimeout(r, 3000));

    const queryShot = path.join(LOG_DIR, "poc-query-page.png");
    await page.screenshot({ path: queryShot, fullPage: true });
    console.log(`  查询页截图: ${queryShot}`);
    console.log(`  查询页 URL: ${page.url()}`);

    // 打印页面可见文本，了解实际结构
    const pageText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log("\n  页面可见文本(前2000字符):");
    console.log("  " + pageText.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 2000));

    // ========== 3. 尝试查询测试提单号 ==========
    console.log("\n" + "-".repeat(64));
    console.log(`[步骤 3/3] 查询测试提单号: ${TEST_BL}`);
    console.log("-".repeat(64));

    // 查找查询输入框
    const inputSelectors = [
      "#blNo", "#billNo", "input[name='blNo']", "input[name='billNo']",
      "input[placeholder*='提单']", "input[placeholder*='单号']",
      "input[placeholder*='箱号']", "input[type='text']",
    ];

    let inputSel = null;
    for (const sel of inputSelectors) {
      const el = await page.$(sel);
      if (el && (await el.isVisible().catch(() => false))) {
        inputSel = sel;
        break;
      }
    }

    if (!inputSel) {
      console.log("  ⚠️ 未找到查询输入框，仅完成登录验证");
      console.log("  （查询页结构需根据截图进一步分析）");
    } else {
      console.log(`  找到输入框: ${inputSel}`);
      await page.fill(inputSel, TEST_BL);
      await new Promise((r) => setTimeout(r, 500));

      // 查找查询按钮
      const btnSelectors = [
        "button:has-text('查询')", "button:has-text('搜索')",
        "input[type='submit']", "button[type='submit']",
        ".search-btn", "#searchBtn", ".query-btn",
      ];
      let btnSel = null;
      for (const sel of btnSelectors) {
        const el = await page.$(sel);
        if (el && (await el.isVisible().catch(() => false))) {
          btnSel = sel;
          break;
        }
      }

      if (btnSel) {
        console.log(`  点击查询按钮: ${btnSel}`);
        await page.click(btnSel);
      } else {
        console.log("  未找到查询按钮，按回车");
        await page.keyboard.press("Enter");
      }

      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));

      const resultShot = path.join(LOG_DIR, "poc-query-result.png");
      await page.screenshot({ path: resultShot, fullPage: true });
      console.log(`  查询结果截图: ${resultShot}`);

      const resultText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
      console.log("\n  查询结果文本(前3000字符):");
      console.log("  " + resultText.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 3000));
    }

    await page.close();
  } catch (err) {
    console.error(`\n❌ PoC 测试失败: ${err.message}`);
    console.error(err.stack);
  } finally {
    release();
    await browserPool.destroy();
  }

  console.log("\n" + "=".repeat(64));
  console.log("  PoC 测试完成");
  console.log("=".repeat(64));
}

main().catch((err) => {
  console.error("❌ 测试异常:", err);
  process.exit(1);
});
