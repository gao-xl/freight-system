"use strict";

/**
 * 云港通统一查询模块 - 提单号查询测试
 * 输入提单号 → 点击查询 → 监控网络请求 → 解析结果
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

const TEST_BL = process.argv[2] || "OOLU1234567890";

async function main() {
  console.log("=".repeat(64));
  console.log(`  云港通统一查询测试 - 提单号: ${TEST_BL}`);
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

    // 监控网络请求
    const apiRequests = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/") || url.includes("query") || url.includes("track") || url.includes("bl")) {
        apiRequests.push({ type: "REQ", method: req.method(), url, postData: req.postData() });
      }
    });
    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/api/") || url.includes("query") || url.includes("track") || url.includes("bl")) {
        let body = "";
        try {
          body = await res.text();
        } catch {}
        apiRequests.push({ type: "RES", status: res.status(), url, body: body.slice(0, 2000) });
      }
    });

    // 进入统一查询模块
    const moduleUrl = "https://www.qingdao-port.net/web/tycxtrack/index.html?201911081";
    await page.goto(moduleUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 5000));

    console.log(`\n  模块 URL: ${page.url()}`);

    // 找到提单号输入框并输入
    const inputSel = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const target = inputs.find((el) => (el.placeholder || "").includes("提单号"));
      if (target) {
        target.focus();
        return true;
      }
      return false;
    });

    if (!inputSel) {
      console.log("  ⚠️ 未找到提单号输入框");
    } else {
      // 使用 Playwright 输入
      const blInput = page.locator("input[placeholder*='提单号']").first();
      await blInput.fill(TEST_BL);
      await new Promise((r) => setTimeout(r, 500));
      console.log(`  已输入提单号: ${TEST_BL}`);

      // 点击查询按钮
      const queryBtn = page.getByRole("button", { name: "查询" }).first();
      await queryBtn.click({ timeout: 5000 }).catch(async () => {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const target = btns.find((b) => (b.innerText || "").trim() === "查询");
          if (target) target.click();
        });
      });
      console.log("  已点击查询按钮");

      // 等待结果
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 5000));
    }

    // 导出查询结果
    const resultText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
    console.log("\n  查询结果文本:");
    console.log("  " + resultText.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 3000));

    const shot = path.join(LOG_DIR, "query-result.png");
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`\n  结果截图: ${shot}`);

    // 输出 API 请求
    console.log("\n  API 请求记录:");
    for (const r of apiRequests) {
      if (r.type === "REQ") {
        console.log(`  [REQ] ${r.method} ${r.url}`);
        if (r.postData) console.log(`    POST: ${r.postData.slice(0, 500)}`);
      } else {
        console.log(`  [RES] ${r.status} ${r.url}`);
        if (r.body) console.log(`    BODY: ${r.body.slice(0, 800)}`);
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
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});