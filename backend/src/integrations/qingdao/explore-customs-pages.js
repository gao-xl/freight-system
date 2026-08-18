"use strict";

/**
 * 云港通通关状态查询页结构探查
 * 逐个进入 运抵报告/装载放行/QQCT海关查验 查询页，分析表单结构
 *
 * 使用方式:
 *   node src/integrations/qingdao/explore-customs-pages.js
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

// 通关状态查询入口（按页面文本定位）
const QUERY_ENTRIES = [
  { name: "运抵报告查询", keyword: "运抵报告查询" },
  { name: "装载放行查询", keyword: "装载放行查询" },
  { name: "QQCT海关查验查询", keyword: "QQCT海关查验查询" },
];

async function dumpPageStructure(page, label) {
  const info = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((el) => ({
      tag: el.tagName,
      type: el.type || "",
      id: el.id || "",
      name: el.name || "",
      placeholder: el.placeholder || "",
      value: el.value || "",
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a.btn, .btn")).map((el) => ({
      tag: el.tagName,
      text: (el.innerText || el.value || "").trim().slice(0, 30),
      id: el.id || "",
      class: (el.className || "").toString().slice(0, 50),
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
    const frames = Array.from(document.querySelectorAll("iframe")).map((f) => ({
      src: f.src || "",
      id: f.id || "",
    }));
    return { inputs, buttons, frames, url: location.href, title: document.title };
  });

  console.log(`\n  [${label}] URL: ${info.url}`);
  console.log(`  [${label}] 标题: ${info.title}`);
  console.log(`  [${label}] iframe: ${JSON.stringify(info.frames)}`);

  console.log(`  [${label}] 输入控件 (${info.inputs.length}):`);
  for (const i of info.inputs) {
    if (i.visible) {
      console.log(`    <${i.tag} type="${i.type}" id="${i.id}" name="${i.name}" placeholder="${i.placeholder}" value="${i.value}">`);
    }
  }

  console.log(`  [${label}] 按钮 (${info.buttons.length}):`);
  for (const b of info.buttons) {
    if (b.visible) {
      console.log(`    <${b.tag} id="${b.id}" class="${b.class}"> ${b.text}`);
    }
  }

  const shot = path.join(LOG_DIR, `explore-${label}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`  [${label}] 截图: ${shot}`);
}

async function main() {
  console.log("=".repeat(64));
  console.log("  云港通通关状态查询页结构探查");
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

    // 进入信息统一查询页
    await page.goto(config.yungangtong.queryUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    for (const entry of QUERY_ENTRIES) {
      console.log("\n" + "-".repeat(64));
      console.log(`进入查询页: ${entry.name}`);
      console.log("-".repeat(64));

      // 重新加载查询门户页（避免页面状态残留）
      await page.goto(config.yungangtong.queryUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.browser.navigationTimeout,
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));

      // 查找对应卡片的链接信息（href / target / 是否新窗口）
      const linkInfo = await page.evaluate((kw) => {
        const links = Array.from(document.querySelectorAll("a, div, span, li"));
        const target = links.find((el) => (el.innerText || "").trim() === kw);
        if (!target) return null;
        // 向上查找最近的 <a> 标签
        let a = target;
        while (a && a.tagName !== "A") a = a.parentElement;
        // 收集卡片及其祖先的 onclick / data 属性 / class
        const chain = [];
        let node = target;
        for (let i = 0; i < 5 && node; i++) {
          chain.push({
            tag: node.tagName,
            class: (node.className || "").toString().slice(0, 80),
            onclick: node.getAttribute("onclick"),
            href: node.getAttribute && node.getAttribute("href"),
            dataUrl: node.getAttribute && node.getAttribute("data-url"),
          });
          node = node.parentElement;
        }
        return {
          href: a ? a.getAttribute("href") : null,
          target: a ? a.getAttribute("target") : null,
          chain,
        };
      }, entry.keyword);

      if (!linkInfo) {
        console.log(`  ⚠️ 未找到入口: ${entry.keyword}`);
        continue;
      }
      console.log(`  链接信息: ${JSON.stringify(linkInfo, null, 2)}`);

      // 监听新标签页（target=_blank 场景）
      const [newPage] = await Promise.all([
        context.waitForEvent("page", { timeout: 8000 }).catch(() => null),
        (async () => {
          await page.evaluate((kw) => {
            const links = Array.from(document.querySelectorAll("a, div, span, li"));
            const target = links.find((el) => (el.innerText || "").trim() === kw);
            if (target) target.click();
          }, entry.keyword);
        })(),
      ]);

      // 若打开新标签页，切换到新标签页
      if (newPage && typeof newPage.waitForLoadState === "function") {
        await newPage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));
        await dumpPageStructure(newPage, entry.name);
        await newPage.close().catch(() => {});
        continue;
      }

      // 等待页面跳转
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 4000));

      await dumpPageStructure(page, entry.name);

      // 如果页面有 iframe，探查 iframe 内部结构
      const frames = page.frames();
      for (const frame of frames) {
        if (frame === page.mainFrame()) continue;
        console.log(`\n  [${entry.name}] iframe 内容: ${frame.url()}`);
        try {
          const finfo = await frame.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((el) => ({
              tag: el.tagName, type: el.type || "", id: el.id || "", name: el.name || "",
              placeholder: el.placeholder || "", visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
            }));
            const buttons = Array.from(document.querySelectorAll("button, input[type='submit']")).map((el) => ({
              tag: el.tagName, text: (el.innerText || el.value || "").trim().slice(0, 30),
              visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
            }));
            return { inputs, buttons };
          });
          console.log(`  iframe 输入控件:`);
          for (const i of finfo.inputs) {
            if (i.visible) console.log(`    <${i.tag} type="${i.type}" id="${i.id}" name="${i.name}" placeholder="${i.placeholder}">`);
          }
          console.log(`  iframe 按钮:`);
          for (const b of finfo.buttons) {
            if (b.visible) console.log(`    <${b.tag}> ${b.text}`);
          }
        } catch (err) {
          console.log(`  iframe 探查失败: ${err.message}`);
        }
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

  console.log("\n" + "=".repeat(64));
  console.log("  探查完成");
  console.log("=".repeat(64));
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});
