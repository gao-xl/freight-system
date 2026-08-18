"use strict";

/**
 * 测试验证码 OCR 识别效果
 * 使用之前保存的验证码图片 logs/captcha.png（内容应为 2VQx1）
 */

const path = require("path");
const fs = require("fs");
const { recognizeCaptcha, terminate } = require("./adapters/captcha-ocr");

const CAPTCHA_PATH = path.join(__dirname, "..", "..", "..", "logs", "captcha.png");

async function main() {
  console.log("=".repeat(60));
  console.log("  验证码 OCR 识别测试");
  console.log("=".repeat(60));

  if (!fs.existsSync(CAPTCHA_PATH)) {
    console.error(`❌ 验证码图片不存在: ${CAPTCHA_PATH}`);
    console.log("   请先运行 login-verify.js 生成验证码截图");
    process.exit(1);
  }

  const buffer = fs.readFileSync(CAPTCHA_PATH);
  console.log(`\n验证码图片: ${CAPTCHA_PATH} (${buffer.length} 字节)`);

  console.log("\n[1] 直接识别（无预处理）:");
  try {
    const result1 = await recognizeCaptcha(buffer, { preprocess: false });
    console.log(`  识别结果: "${result1}"`);
  } catch (err) {
    console.log(`  ❌ 失败: ${err.message}`);
  }

  console.log("\n[2] 预处理后识别（放大+灰度+二值化）:");
  try {
    const result2 = await recognizeCaptcha(buffer, { preprocess: true });
    console.log(`  识别结果: "${result2}"`);
  } catch (err) {
    console.log(`  ❌ 失败: ${err.message}`);
  }

  await terminate();
  console.log("\n" + "=".repeat(60));
  console.log("  测试完成");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 测试失败:", err);
  process.exit(1);
});