"use strict";

/**
 * 云港通登录调试脚本
 * 定位登录失败原因：页面结构、选择器、验证码等
 *
 * 使用方式:
 *   node src/integrations/qingdao/debug-login.js
 *
 * 输出:
 *   - 页面 HTML 保存到 logs/ygt-debug-page.html
 *   - 页面截图保存到 logs/ygt-debug-screenshot.png
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const { chromium } = require("playwright");
const config = require("./config");

const LOG_DIR = path.join(__dirname, "..", "..", "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

async function main() {
  console.log("=".repeat(60));
  console.log("  云港通登录调试");
  console.log("=".repeat(60));

  console.log(`\n登录 URL: ${config.yungangtong.loginUrl}`);
  console.log(`用户名: ${config.yungangtong.username}`);

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

  // 1. 打开登录页
  console.log("\n[1] 打开登录页...");
  try {
    await page.goto(config.yungangtong.loginUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
  } catch (err) {
    console.log(`  ⚠️ networkidle 等待超时: ${err.message}，继续尝试`);
  }
  await page.waitForTimeout(2000);

  console.log(`  最终 URL: ${page.url()}`);
  console.log(`  页面标题: ${await page.title()}`);

  // 2. 保存 HTML
  const html = await page.content();
  const htmlPath = path.join(LOG_DIR, "ygt-debug-page.html");
  fs.writeFileSync(htmlPath, html, "utf-8");
  console.log(`\n[2] 页面 HTML 已保存: ${htmlPath} (${html.length} 字符)`);

  // 3. 截图
  const shotPath = path.join(LOG_DIR, "ygt-debug-screenshot.png");
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`[3] 页面截图已保存: ${shotPath}`);

  // 4. 分析页面上的输入框
  console.log("\n[4] 分析页面输入框:");
  const inputs = await page.$$eval("input", (els) =>
    els.map((el) => ({
      id: el.id,
      name: el.name,
      type: el.type,
      placeholder: el.placeholder,
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }))
  );
  console.log(`  找到 ${inputs.length} 个 input 元素:`);
  for (const inp of inputs) {
    console.log(`    - id="${inp.id}" name="${inp.name}" type="${inp.type}" placeholder="${inp.placeholder}" visible=${inp.visible}`);
  }

  // 5. 分析按钮
  console.log("\n[5] 分析页面按钮:");
  const buttons = await page.$$eval("button, input[type='submit'], .btn, .el-button", (els) =>
    els.map((el) => ({
      tag: el.tagName,
      id: el.id,
      text: (el.innerText || el.value || "").trim().slice(0, 30),
      className: (el.className || "").toString().slice(0, 50),
    }))
  );
  console.log(`  找到 ${buttons.length} 个按钮:`);
  for (const btn of buttons.slice(0, 20)) {
    console.log(`    - <${btn.tag}> id="${btn.id}" text="${btn.text}" class="${btn.className}"`);
  }

  // 6. 检查是否有验证码
  console.log("\n[6] 检查验证码:");
  const captchaImgs = await page.$$eval("img", (els) =>
    els
      .map((el) => el.src || "")
      .filter((s) => /captcha|verify|code|yzm/i.test(s))
  );
  console.log(`  验证码图片: ${captchaImgs.length > 0 ? captchaImgs.join(", ") : "未检测到"}`);

  // 7. 检查 iframe（有些登录是 iframe 嵌套）
  console.log("\n[7] 检查 iframe:");
  const frames = page.frames();
  console.log(`  共 ${frames.length} 个 frame:`);
  for (const f of frames) {
    console.log(`    - ${f.url().slice(0, 80)}`);
  }

  // 8. 尝试定位登录表单
  console.log("\n[8] 尝试定位登录表单:");
  const usernameSelectors = [
    "#username", "input[name='username']", "input[placeholder*='用户名']",
    "input[placeholder*='账号']", "input[type='text']", "input[type='tel']",
    "input[placeholder*='手机']", "input[placeholder*='手机号']",
  ];
  const passwordSelectors = [
    "#password", "input[name='password']", "input[placeholder*='密码']", "input[type='password']",
  ];

  for (const sel of usernameSelectors) {
    const el = await page.$(sel);
    if (el) {
      const visible = await el.isVisible().catch(() => false);
      console.log(`  ✅ 用户名选择器命中: ${sel} (visible=${visible})`);
    }
  }
  for (const sel of passwordSelectors) {
    const el = await page.$(sel);
    if (el) {
      const visible = await el.isVisible().catch(() => false);
      console.log(`  ✅ 密码选择器命中: ${sel} (visible=${visible})`);
    }
  }

  // 9. 尝试登录（如果找到表单）
  async function findVisibleSelector(page, selectors) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el && (await el.isVisible().catch(() => false))) return sel;
    }
    return null;
  }

  const usernameSel = await findVisibleSelector(page, usernameSelectors);
  const passwordSel = await findVisibleSelector(page, passwordSelectors);

  if (usernameSel && passwordSel) {
    console.log("\n[9] 尝试登录...");
    await page.fill(usernameSel, config.yungangtong.username);
    await page.waitForTimeout(500);
    await page.fill(passwordSel, config.yungangtong.password);
    await page.waitForTimeout(500);

    // 尝试点击登录按钮
    const loginBtnSelectors = [
      "button[type='submit']", "input[type='submit']",
      "button:has-text('登录')", "button:has-text('登 录')",
      ".login-btn", "#loginBtn", ".el-button--primary",
    ];
    let clicked = false;
    for (const sel of loginBtnSelectors) {
      const el = await page.$(sel);
      if (el && (await el.isVisible().catch(() => false))) {
        console.log(`  点击登录按钮: ${sel}`);
        await el.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      console.log("  未找到登录按钮，按 Enter");
      await page.keyboard.press("Enter");
    }

    await page.waitForTimeout(5000);
    console.log(`  登录后 URL: ${page.url()}`);

    const body = await page.content();
    const logoutKeywords = ["退出", "注销", "个人中心", "会员中心", "我的"];
    const loggedIn = logoutKeywords.some((kw) => body.includes(kw));
    console.log(`  登录结果: ${loggedIn ? "✅ 登录成功" : "❌ 登录失败"}`);

    // 检查错误提示
    const errorText = await page.$$eval(
      ".el-message, .error, .err-msg, .el-message__content, .login-error, [class*='error']",
      (els) => els.map((el) => (el.innerText || "").trim()).filter(Boolean).slice(0, 5)
    );
    if (errorText.length > 0) {
      console.log(`  错误提示: ${errorText.join(" | ")}`);
    }

    // 登录后截图
    const afterShot = path.join(LOG_DIR, "ygt-debug-after-login.png");
    await page.screenshot({ path: afterShot, fullPage: true });
    console.log(`  登录后截图: ${afterShot}`);
  } else {
    console.log("\n[9] 未找到登录表单，无法尝试登录");
    console.log("  ⚠️ 页面结构可能不是标准登录页，请查看截图分析");
  }

  await browser.close();
  console.log("\n" + "=".repeat(60));
  console.log("  调试完成，请查看 logs/ 目录下的截图和 HTML");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 调试失败:", err);
  process.exit(1);
});