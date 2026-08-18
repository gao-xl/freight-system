"use strict";

/**
 * 云港通交互式登录验证
 * 截图验证码 → 用户查看输入 → 登录验证
 *
 * 使用方式:
 *   node src/integrations/qingdao/login-verify.js
 *
 * 输出:
 *   - 验证码截图: logs/captcha.png
 *   - 登录成功: Cookie 持久化到 sessions/yungangtong.json
 */

const path = require("path");
const fs = require("fs");
const readline = require("readline");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");

const LOG_DIR = path.join(__dirname, "..", "..", "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("=".repeat(60));
  console.log("  云港通交互式登录验证");
  console.log("=".repeat(60));

  if (!process.env.YGT_USERNAME || !process.env.YGT_PASSWORD) {
    console.error("❌ 未配置 YGT_USERNAME / YGT_PASSWORD");
    process.exit(1);
  }

  console.log(`\n用户名: ${process.env.YGT_USERNAME}`);

  // 初始化浏览器池
  await browserPool.init();
  const { context, release } = await browserPool.acquire();

  try {
    // 验证码识别器：截图保存 + 提示用户输入
    const captchaResolver = async (buffer) => {
      const captchaPath = path.join(LOG_DIR, "captcha.png");
      fs.writeFileSync(captchaPath, buffer);
      console.log(`\n📷 验证码已保存: ${captchaPath}`);
      console.log("  请打开上面的图片查看验证码");
      const code = await ask("请输入验证码: ");
      return code;
    };

    const page = await ygtLogin.ensureLoggedIn(context, {
      captchaResolver,
    });

    console.log("\n✅ 登录成功!");
    console.log(`  当前 URL: ${page.url()}`);
    console.log(`  页面标题: ${await page.title()}`);

    // 保存登录后截图
    const afterShot = path.join(LOG_DIR, "ygt-login-success.png");
    await page.screenshot({ path: afterShot, fullPage: true });
    console.log(`  登录后截图: ${afterShot}`);

    await page.close();
  } catch (err) {
    console.error(`\n❌ 登录失败: ${err.message}`);
  } finally {
    release();
    await browserPool.destroy();
  }

  console.log("\n" + "=".repeat(60));
  console.log("  验证完成");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 验证失败:", err);
  process.exit(1);
});