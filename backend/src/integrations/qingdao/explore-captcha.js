"use strict";

/**
 * 探查云港通验证码生成逻辑
 * 检查页面 JS 上下文，寻找验证码答案或生成方式
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const { chromium } = require("playwright");
const config = require("./config");

const LOG_DIR = path.join(__dirname, "..", "..", "..", "logs");

async function main() {
  console.log("=".repeat(60));
  console.log("  云港通验证码生成逻辑探查");
  console.log("=".repeat(60));

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  const page = await context.newPage();

  // 打开登录页
  await page.goto(config.yungangtong.loginUrl, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // 1. 检查验证码 img 元素及其父结构
  console.log("\n[1] 验证码元素结构:");
  const captchaInfo = await page.evaluate(() => {
    const img = document.querySelector(".captcha");
    if (!img) return { found: false };
    const parent = img.parentElement;
    return {
      found: true,
      src: img.src.slice(0, 50),
      className: img.className,
      parentHTML: parent ? parent.outerHTML.slice(0, 500) : null,
      siblings: parent ? Array.from(parent.children).map((c) => c.tagName + "." + c.className) : [],
    };
  });
  console.log(JSON.stringify(captchaInfo, null, 2));

  // 2. 检查全局变量（可能包含验证码答案）
  console.log("\n[2] 检查全局变量:");
  const globals = await page.evaluate(() => {
    const keys = Object.keys(window).filter((k) =>
      /captcha|verify|code|yzm|token|session/i.test(k)
    );
    const result = {};
    for (const k of keys) {
      try {
        const v = window[k];
        result[k] = typeof v === "object" ? JSON.stringify(v).slice(0, 100) : String(v).slice(0, 100);
      } catch {
        result[k] = "[无法读取]";
      }
    }
    return result;
  });
  console.log(JSON.stringify(globals, null, 2));

  // 3. 检查 Vue/Nuxt 应用实例
  console.log("\n[3] 检查 Vue 应用实例:");
  const vueInfo = await page.evaluate(() => {
    const el = document.querySelector("#__nuxt");
    if (!el || !el.__vue_app__) return { found: false };
    const app = el.__vue_app__;
    const result = { found: true, hasConfig: !!app.config };
    // 尝试遍历组件树找验证码相关
    const captchaComponents = [];
    const walk = (vnode, depth) => {
      if (!vnode || depth > 4) return;
      if (vnode.type && typeof vnode.type === "object") {
        const name = vnode.type.name || vnode.type.__name || "";
        if (/captcha|verify|code/i.test(name)) {
          captchaComponents.push(name);
        }
      }
      if (vnode.component) {
        const setupState = vnode.component.setupState || {};
        for (const key of Object.keys(setupState)) {
          if (/captcha|verify|code|answer/i.test(key)) {
            result[`setupState.${key}`] = String(setupState[key]).slice(0, 100);
          }
        }
      }
      if (vnode.children && typeof vnode.children === "object") {
        for (const child of Object.values(vnode.children)) {
          walk(child, depth + 1);
        }
      }
    };
    walk(app._instance && app._instance.subTree, 0);
    result.captchaComponents = captchaComponents;
    return result;
  });
  console.log(JSON.stringify(vueInfo, null, 2));

  // 4. 检查 canvas 元素
  console.log("\n[4] 检查 canvas 元素:");
  const canvasInfo = await page.evaluate(() => {
    const canvases = document.querySelectorAll("canvas");
    return Array.from(canvases).map((c, i) => ({
      index: i,
      width: c.width,
      height: c.height,
      id: c.id,
      className: c.className,
    }));
  });
  console.log(JSON.stringify(canvasInfo, null, 2));

  // 5. 尝试 hook canvas 绘制，刷新验证码
  console.log("\n[5] Hook canvas 绘制捕获验证码:");
  const hookResult = await page.evaluate(() => {
    return new Promise((resolve) => {
      const results = [];
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        const ctx = origGetContext.call(this, type, ...args);
        if (type === "2d" && ctx) {
          const origFillText = ctx.fillText;
          ctx.fillText = function (text, ...rest) {
            results.push({ type: "fillText", text: String(text) });
            return origFillText.call(this, text, ...rest);
          };
        }
        return ctx;
      };
      // 触发验证码刷新（点击验证码图片）
      const img = document.querySelector(".captcha");
      if (img) {
        img.click();
        setTimeout(() => resolve(results), 1000);
      } else {
        resolve(results);
      }
    });
  });
  console.log("捕获的绘制文本: " + JSON.stringify(hookResult));

  // 6. 检查验证码 img 的 blob 内容
  console.log("\n[6] 验证码 blob 图片信息:");
  const blobInfo = await page.evaluate(async () => {
    const img = document.querySelector(".captcha");
    if (!img || !img.src.startsWith("blob:")) return { found: false };
    const res = await fetch(img.src);
    const blob = await res.blob();
    return {
      found: true,
      type: blob.type,
      size: blob.size,
    };
  });
  console.log(JSON.stringify(blobInfo, null, 2));

  await browser.close();
  console.log("\n" + "=".repeat(60));
  console.log("  探查完成");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 探查失败:", err);
  process.exit(1);
});