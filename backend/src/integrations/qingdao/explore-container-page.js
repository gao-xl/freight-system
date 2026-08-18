"use strict";

/**
 * 云港通 container.html 页面查询表单探查
 * 检查集装箱页面是否有可用的查询功能
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通 container.html 查询表单探查");
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

    await page.goto("https://www.qingdao-port.net/page/container.html", {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));

    // 导出页面所有链接（aim 属性）
    const links = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll("[aim], a[href]").forEach((el) => {
        const aim = el.getAttribute("aim");
        const href = el.getAttribute("href");
        const text = (el.innerText || "").trim().slice(0, 30);
        if ((aim || (href && !href.startsWith("#") && !href.startsWith("javascript"))) && text) {
          items.push({ text, aim, href });
        }
      });
      return items;
    });

    console.log(`\n  页面链接 (${links.length}):`);
    for (const l of links.slice(0, 40)) {
      console.log(`  ${l.text}: aim=${l.aim || "-"} href=${l.href || "-"}`);
    }

    // 导出页面表单
    const forms = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((el) => ({
        tag: el.tagName, type: el.type || "", id: el.id || "", name: el.name || "",
        placeholder: el.placeholder || "", visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      }));
      const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], .btn")).map((el) => ({
        tag: el.tagName, text: (el.innerText || el.value || "").trim().slice(0, 30),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      }));
      return { inputs, buttons };
    });

    console.log(`\n  输入控件 (${forms.inputs.filter((i) => i.visible).length}):`);
    for (const i of forms.inputs) {
      if (i.visible) console.log(`    <${i.tag} type="${i.type}" id="${i.id}" name="${i.name}" placeholder="${i.placeholder}">`);
    }
    console.log(`\n  按钮 (${forms.buttons.filter((b) => b.visible).length}):`);
    for (const b of forms.buttons) {
      if (b.visible) console.log(`    <${b.tag}> ${b.text}`);
    }

    const shot = path.join(__dirname, "..", "..", "..", "logs", "container-page.png");
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