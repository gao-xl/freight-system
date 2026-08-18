"use strict";

/**
 * 云港通 tycxtrack 查询模块探查
 * 访问 /web/tycxtrack/index.html 检查是否可用
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通 tycxtrack 查询模块探查");
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

    const url = "https://www.qingdao-port.net/web/tycxtrack/index.html?201911081";
    console.log(`\n  访问: ${url}`);
    const res = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch((e) => console.log(`  导航警告: ${e.message}`));
    await new Promise((r) => setTimeout(r, 5000));

    const title = await page.title();
    const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    const is404 = text.includes("404") || title.includes("404");

    console.log(`  状态: ${is404 ? "❌ 404" : "✅ OK"}`);
    console.log(`  标题: ${title}`);
    console.log(`  最终 URL: ${page.url()}`);
    console.log(`\n  页面文本:`);
    console.log("  " + text.split("\n").filter((l) => l.trim()).join("\n  ").slice(0, 1500));

    // 导出表单
    const forms = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((el) => ({
        tag: el.tagName, type: el.type || "", id: el.id || "", name: el.name || "",
        placeholder: el.placeholder || "", visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      }));
      const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], .btn")).map((el) => ({
        tag: el.tagName, text: (el.innerText || el.value || "").trim().slice(0, 30),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      }));
      const frames = Array.from(document.querySelectorAll("iframe")).map((f) => f.src);
      return { inputs, buttons, frames };
    });

    console.log(`\n  iframe (${forms.frames.length}):`);
    for (const f of forms.frames) console.log("    " + f);

    console.log(`\n  输入控件 (${forms.inputs.filter((i) => i.visible).length}):`);
    for (const i of forms.inputs) {
      if (i.visible) console.log(`    <${i.tag} type="${i.type}" id="${i.id}" name="${i.name}" placeholder="${i.placeholder}">`);
    }
    console.log(`\n  按钮 (${forms.buttons.filter((b) => b.visible).length}):`);
    for (const b of forms.buttons) {
      if (b.visible) console.log(`    <${b.tag}> ${b.text}`);
    }

    const shot = path.join(__dirname, "..", "..", "..", "logs", "tycxtrack-page.png");
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`\n  截图: ${shot}`);

    await page.close();
  } catch (err) {
    console.error(`\n❌ 探查失败: ${err.message}`);
  } finally {
    release();
    await browserPool.destroy();
  }
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});