"use strict";

/**
 * 云港通账号权限验证
 * 测试基础页面和 API 接口，判断账号是否已审批通过
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通账号权限验证");
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

    // 测试各种页面
    const testPages = [
      { name: "首页", url: "https://www.qingdao-port.net/" },
      { name: "查询门户", url: "https://www.qingdao-port.net/page/query.html" },
      { name: "集装箱", url: "https://www.qingdao-port.net/page/container.html" },
      { name: "hycx1 模块", url: "https://www.qingdao-port.net/hycx1/index.html" },
    ];

    for (const t of testPages) {
      try {
        const res = await page.goto(t.url, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await new Promise((r) => setTimeout(r, 2000));
        const title = await page.title();
        const text = await page.evaluate(() => document.body.innerText.slice(0, 500));
        const is404 = text.includes("404") || title.includes("404");
        console.log(`${is404 ? "❌ 404" : "✅ OK "} ${t.name}: ${t.url}`);
        console.log(`   标题: ${title}`);
        console.log(`   文本: ${text.replace(/\n/g, " ").slice(0, 200)}`);
        console.log("");
      } catch (err) {
        console.log(`⚠️ 失败 ${t.name}: ${err.message.slice(0, 80)}\n`);
      }
    }

    // 检查登录状态 - 页面是否有"退出登录"或个人中心
    const loggedInText = await page.evaluate(() => {
      const body = document.body.innerText;
      const hasLogout = body.includes("退出") || body.includes("注销") || body.includes("个人中心");
      const hasLogin = body.includes("登录");
      return { hasLogout, hasLogin, text: body.slice(0, 1000) };
    });
    console.log("登录状态检查:");
    console.log(`  有退出/个人中心: ${loggedInText.hasLogout}`);
    console.log(`  有登录按钮: ${loggedInText.hasLogin}`);

    // 检查页面的 Cookie 和 localStorage
    const cookies = await page.context().cookies();
    const ls = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        items[k] = (localStorage.getItem(k) || "").slice(0, 100);
      }
      return items;
    });
    console.log(`\n  Cookie 数: ${cookies.length}`);
    console.log("  localStorage 键:", Object.keys(ls).join(", "));

    // 尝试调用 API 检查 session
    const apiResult = await page.evaluate(async () => {
      try {
        const res = await fetch("/api/user/session");
        return { status: res.status, text: await res.text().catch(() => "") };
      } catch (e) {
        return { status: -1, text: e.message };
      }
    });
    console.log(`\n  Session API: ${apiResult.status} ${apiResult.text.slice(0, 200)}`);

    await page.close();
  } catch (err) {
    console.error(`\n❌ 验证失败: ${err.message}`);
  } finally {
    release();
    await browserPool.destroy();
  }
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});