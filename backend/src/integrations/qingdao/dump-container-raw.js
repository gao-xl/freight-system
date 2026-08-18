"use strict";

/**
 * 云港通单箱查询原始响应导出
 * 用法: node dump-container-raw.js [箱号]
 * 将 queryByContainerNo 的原始响应保存为 JSON 文件，用于分析字段结构
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
  console.log(`  云港通单箱查询原始响应导出 - 箱号: ${TEST_CONTAINER}`);
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

    await page.goto(config.yungangtong.vipQueryUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    for (const ieFlag of ["I", "E"]) {
      const url = `/api/web/vip/vipOceantally/queryByContainerNo?containerNo=${encodeURIComponent(TEST_CONTAINER)}&ieFlag=${ieFlag}`;
      const json = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: "include" });
        return await res.json();
      }, url);

      const file = path.join(__dirname, "..", "..", "..", "logs", `container-raw-${ieFlag === "I" ? "import" : "export"}.json`);
      require("fs").writeFileSync(file, JSON.stringify(json, null, 2), "utf8");
      console.log(`  [${ieFlag}] 原始响应已保存: ${file}`);

      // 输出各节点的字段名（第一条记录）
      const data = (json.data || {}).data || {};
      for (const [key, rows] of Object.entries(data)) {
        if (Array.isArray(rows) && rows.length > 0) {
          console.log(`\n  ${key} (${rows.length} 条):`);
          console.log(`    ${Object.keys(rows[0]).join(", ")}`);
        } else {
          console.log(`  ${key}: 空`);
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    await page.close();
  } catch (err) {
    console.error(`\n❌ 导出失败: ${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    release();
    await browserPool.destroy();
  }
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});
