"use strict";

/**
 * 云港通 API 直接调用测试
 * 登录后直接调用 vipOceantally API，验证绕过 UI 抓取数据
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

const TEST_BL = process.argv[2] || "OOLU1234567890";

async function main() {
  console.log("=".repeat(64));
  console.log(`  云港通 API 直接调用测试 - 提单号: ${TEST_BL}`);
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

    // 先访问模块页面，确保 session 建立
    await page.goto("https://www.qingdao-port.net/web/tycxtrack/index.html?201911081", {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));

    // 直接调用 API（在页面上下文中，自动携带 Cookie）
    const result = await page.evaluate(async (blNo) => {
      const endpoints = [
        { name: "进口主提单", url: `/api/web/vip/vipOceantally/queryByBillNo?billNo=${encodeURIComponent(blNo)}&ieFlag=I&billType=ZTDH` },
        { name: "出口主提单", url: `/api/web/vip/vipOceantally/queryByBillNo?billNo=${encodeURIComponent(blNo)}&ieFlag=E&billType=ZTDH` },
      ];
      const results = [];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url, { credentials: "include" });
          const json = await res.json();
          results.push({ name: ep.name, status: res.status, json });
        } catch (e) {
          results.push({ name: ep.name, status: -1, error: e.message });
        }
      }
      return results;
    }, TEST_BL);

    for (const r of result) {
      console.log(`\n${"=".repeat(64)}`);
      console.log(`  ${r.name} (HTTP ${r.status})`);
      console.log("=".repeat(64));
      if (r.error) {
        console.log(`  ❌ 错误: ${r.error}`);
        continue;
      }
      const { code, message, data } = r.json;
      console.log(`  code: ${code}, message: ${message}`);
      if (!data) {
        console.log("  data: null");
        continue;
      }
      // 输出各状态节点的数据条数
      const statusData = data.data || {};
      console.log(`\n  状态节点数据 (${Object.keys(statusData).length} 个):`);
      for (const [key, value] of Object.entries(statusData)) {
        const count = Array.isArray(value) ? value.length : (value ? "object" : "empty");
        console.log(`    ${key}: ${count}`);
      }
      // 输出 configs 字段定义
      if (data.configs && data.configs.length > 0) {
        console.log(`\n  字段配置 (${data.configs.length} 个页面):`);
        for (const cfg of data.configs) {
          const params = (cfg.params || []).map((p) => p.paramName).join(", ");
          console.log(`    ${cfg.pageCode} [${cfg.tableName}]: ${params}`);
        }
      }
      // 保存完整 JSON
      const jsonPath = path.join(LOG_DIR, `api-${r.name}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(r.json, null, 2));
      console.log(`\n  完整响应已保存: ${jsonPath}`);
    }

    await page.close();
  } catch (err) {
    console.error(`\n❌ 测试失败: ${err.message}`);
    console.error(err.stack);
  } finally {
    release();
    await browserPool.destroy();
  }
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});