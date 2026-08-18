"use strict";

/**
 * 云港通通关状态查询表单结构探查
 * 1. 提取三个查询入口的 aim URL
 * 2. 逐个导航进入，导出表单结构
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

const ENTRIES = ["运抵报告查询", "装载放行查询", "QQCT海关查验查询"];

async function dumpForm(page, label) {
  const info = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((el) => ({
      tag: el.tagName,
      type: el.type || "",
      id: el.id || "",
      name: el.name || "",
      placeholder: el.placeholder || "",
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], .btn, [class*='btn']")).map((el) => ({
      tag: el.tagName,
      text: (el.innerText || el.value || "").trim().slice(0, 30),
      id: el.id || "",
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
    return {
      url: location.href,
      title: document.title,
      inputs,
      buttons,
      text: document.body.innerText.slice(0, 1500),
    };
  });

  console.log(`\n  [${label}] URL: ${info.url}`);
  console.log(`  [${label}] 标题: ${info.title}`);
  console.log(`  [${label}] 输入控件 (${info.inputs.filter((i) => i.visible).length}):`);
  for (const i of info.inputs) {
    if (i.visible) {
      console.log(`    <${i.tag} type="${i.type}" id="${i.id}" name="${i.name}" placeholder="${i.placeholder}">`);
    }
  }
  console.log(`  [${label}] 按钮 (${info.buttons.filter((b) => b.visible).length}):`);
  for (const b of info.buttons) {
    if (b.visible) console.log(`    <${b.tag} id="${b.id}"> ${b.text}`);
  }
  console.log(`  [${label}] 页面文本:`);
  console.log("  " + info.text.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 1200));

  const shot = path.join(LOG_DIR, `form-${label}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`  [${label}] 截图: ${shot}`);
}

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通通关状态查询表单结构探查");
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

    // 提取三个查询入口的 aim URL
    await page.goto(config.yungangtong.queryUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    // 等待卡片异步加载完成
    try {
      await page.waitForSelector(".system-role", { timeout: 15000 });
    } catch {
      console.log("  ⚠️ 卡片未加载完成，继续尝试");
    }
    await new Promise((r) => setTimeout(r, 2000));

    const aimMap = await page.evaluate((names) => {
      const result = {};
      // 直接遍历所有 system-role 卡片，按标题匹配
      const cards = Array.from(document.querySelectorAll(".system-role"));
      for (const name of names) {
        const card = cards.find((c) => (c.innerText || "").trim().includes(name));
        result[name] = card ? card.getAttribute("aim") : null;
      }
      return result;
    }, ENTRIES);

    console.log("\n  查询入口 URL:");
    for (const [name, url] of Object.entries(aimMap)) {
      console.log(`  ${name}: ${url}`);
    }

    // 逐个导航进入并探查表单
    for (const name of ENTRIES) {
      const url = aimMap[name];
      if (!url) {
        console.log(`\n  ⚠️ ${name} 无 URL，跳过`);
        continue;
      }
      console.log("\n" + "-".repeat(64));
      console.log(`进入: ${name}`);
      console.log("-".repeat(64));

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: config.browser.navigationTimeout,
      }).catch((err) => console.log(`  导航警告: ${err.message}`));
      await new Promise((r) => setTimeout(r, 5000));

      await dumpForm(page, name);
    }

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
