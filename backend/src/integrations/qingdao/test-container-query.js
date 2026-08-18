"use strict";

/**
 * 云港通单箱查询测试
 * 用法: node test-container-query.js [箱号]
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const ygtLogin = require("./scrapers/yungangtong/login");
const browserPool = require("./browser/pool");
const vipContainer = require("./scrapers/yungangtong/vip-container");
const captchaOcr = require("./adapters/captcha-ocr");
const config = require("./config");

const TEST_CONTAINER = process.argv[2] || "TCLU1234567";

async function main() {
  console.log("=".repeat(64));
  console.log(`  云港通单箱查询测试 - 箱号: ${TEST_CONTAINER}`);
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

    // 建立模块 session（VIP API 需要模块上下文）
    await page.goto(config.yungangtong.vipQueryUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.browser.navigationTimeout,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    // 进口查询
    console.log("\n" + "-".repeat(64));
    console.log("  进口查询 (I)");
    console.log("-".repeat(64));
    const importResult = await vipContainer.queryByContainerNo(page, TEST_CONTAINER, { ieFlag: "I" });
    printResult(importResult);

    // 出口查询
    console.log("\n" + "-".repeat(64));
    console.log("  出口查询 (E)");
    console.log("-".repeat(64));
    const exportResult = await vipContainer.queryByContainerNo(page, TEST_CONTAINER, { ieFlag: "E" });
    printResult(exportResult);

    await page.close();
  } catch (err) {
    console.error(`\n❌ 测试失败: ${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    release();
    await browserPool.destroy();
  }
}

function printResult(result) {
  console.log(`  箱号: ${result.containerNo}`);
  console.log(`  提单号: ${result.blNo || "--"}`);
  console.log(`  状态: ${result.status}`);
  const v = result.vessel || {};
  const vesselName = v.importVesselNameCn || v.exportVesselNameCn || v.importVesselName || v.exportVesselName || "--";
  const voyageNo = v.importVoyageNo || v.exportVoyageNo || "--";
  console.log(`  船舶: ${vesselName} / 航次 ${voyageNo}`);

  if (result.container) {
    const c = result.container;
    console.log(`  箱信息: ${c.size || "--"}${c.type || ""} 箱属=${c.owner || "--"} 码头=${c.terminal || "--"} 流向=${c.flow || "--"}`);
    console.log(`    整箱重=${c.grossWeight || "--"} 堆存天数=${c.stackDays || "--"} 铅封=${c.sealNo || "--"}`);
    console.log(`    入港=${c.gateInTime || "--"} 出港=${c.gateOutTime || "--"}`);
    console.log(`    危品=${c.dangerous || "--"} 冷箱=${c.reefer || "--"} 温度=${c.temperature || "--"}`);
    console.log(`    装货港=${c.loadingPort || "--"} 卸货港=${c.dischargePort || "--"} 目的港=${c.destinationPort || "--"}`);
  }

  console.log("  状态节点:");
  for (const [key, node] of Object.entries(result.nodes)) {
    const mark = node.completed ? "✅" : "⬜";
    console.log(`    ${mark} ${node.name} (${node.time || "--"})${node.count ? ` x${node.count}` : ""}`);
  }
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});
