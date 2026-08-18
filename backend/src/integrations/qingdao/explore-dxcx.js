"use strict";

/**
 * 云港通单箱查询(VIP) API 探查
 * 导航到 /vip/dxcx 页面，监控网络请求，找到集装箱查询 API
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

const TEST_CONTAINER = process.argv[2] || "TCLU1234567";

async function main() {
  console.log("=".repeat(64));
  console.log(`  云港通单箱查询 API 探查 - 箱号: ${TEST_CONTAINER}`);
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

    // 监控所有 API 请求
    const apiRequests = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/")) {
        apiRequests.push({ type: "REQ", method: req.method(), url, postData: req.postData() });
      }
    });
    page.on("response", async (res) => {
      const url = res.url();
      if (url.includes("/api/")) {
        let body = "";
        try {
          body = await res.text();
        } catch {}
        apiRequests.push({ type: "RES", status: res.status(), url, body: body.slice(0, 1500) });
      }
    });

    // 进入单箱查询(VIP)页面
    const moduleUrl = "https://www.qingdao-port.net/web/tycxtrack/index.html?201911081#/vip/dxcx";
    await page.goto(moduleUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 6000));

    console.log(`\n  页面 URL: ${page.url()}`);
    const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    console.log("  页面文本:");
    console.log("  " + text.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 1200));

    // 查找箱号输入框
    const inputInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input")).map((el) => ({
        placeholder: el.placeholder || "",
        id: el.id || "",
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      }));
      return inputs;
    });
    console.log(`\n  输入框 (${inputInfo.length}):`);
    for (const i of inputInfo) {
      if (i.visible) console.log(`    placeholder="${i.placeholder}" id="${i.id}"`);
    }

    // 输入箱号并查询
    const containerInput = page.locator("input[placeholder*='箱号'], input[placeholder*='集装箱']").first();
    const hasInput = await containerInput.count().catch(() => 0);
    if (hasInput > 0) {
      await containerInput.fill(TEST_CONTAINER);
      await new Promise((r) => setTimeout(r, 500));
      console.log(`\n  已输入箱号: ${TEST_CONTAINER}`);

      const queryBtn = page.getByRole("button", { name: "查询" }).first();
      await queryBtn.click({ timeout: 5000 }).catch(async () => {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const target = btns.find((b) => (b.innerText || "").trim() === "查询");
          if (target) target.click();
        });
      });
      console.log("  已点击查询按钮");
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 5000));
    } else {
      console.log("\n  ⚠️ 未找到箱号输入框");
    }

    // 输出查询结果
    const resultText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log("\n  查询结果文本:");
    console.log("  " + resultText.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 2500));

    const shot = path.join(__dirname, "..", "..", "..", "logs", "dxcx-result.png");
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`\n  结果截图: ${shot}`);

    // 输出 API 请求（过滤掉静态资源）
    console.log("\n  API 请求记录:");
    for (const r of apiRequests) {
      if (r.url.includes("_nuxt") || r.url.includes(".js") || r.url.includes(".css") || r.url.includes(".woff")) continue;
      if (r.type === "REQ") {
        console.log(`  [REQ] ${r.method} ${r.url}`);
        if (r.postData) console.log(`    POST: ${r.postData.slice(0, 500)}`);
      } else {
        console.log(`  [RES] ${r.status} ${r.url}`);
        if (r.body && r.body.includes("container")) console.log(`    BODY: ${r.body.slice(0, 1200)}`);
      }
    }

    await page.close();
  } catch (err) {
    console.error(`\n❌ 探查失败: ${err.message}`);
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