"use strict";

/**
 * 青岛港集成模块 PoC 测试脚本
 *
 * 使用方式:
 *   node src/integrations/qingdao/test-poc.js
 *
 * 前置条件:
 *   1. 设置环境变量 YGT_USERNAME / YGT_PASSWORD（云港通）
 *   2. 设置环境变量 LHT_USERNAME / LHT_PASSWORD（陆海通）
 *   3. (可选) 设置 SHIPXY_API_KEY
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const qingdao = require("./index");

const TEST_BL_NO = process.env.TEST_BL_NO || "TEST123456";
const TEST_CONTAINER_NO = process.env.TEST_CONTAINER_NO || "TCLU1234567";

async function main() {
  console.log("=".repeat(60));
  console.log("  青岛港集成模块 PoC 测试");
  console.log("=".repeat(60));

  // 1. 显示配置
  console.log("\n📋 当前配置:");
  console.log(JSON.stringify(qingdao.getConfig(), null, 2));

  // 2. 健康检查
  console.log("\n🔍 健康检查 (启动前):");
  console.log(qingdao.healthCheck());

  // 3. 启动模块
  console.log("\n🚀 启动模块...");
  await qingdao.start({
    getPendingCustoms: null,    // 不启动定时任务
    getPendingContainers: null,
    getPendingVessels: false,
  });
  console.log("✅ 模块已启动");

  console.log("\n🔍 健康检查 (启动后):");
  console.log(qingdao.healthCheck());

  // 4. 测试通关状态查询（如果配置了云港通账号）
  if (process.env.YGT_USERNAME && process.env.YGT_PASSWORD) {
    console.log(`\n📦 测试云港通通关状态查询: ${TEST_BL_NO}`);
    try {
      const result = await qingdao.queryCustomsStatus([{ blNo: TEST_BL_NO }]);
      console.log("✅ 通关状态查询结果:");
      console.log(JSON.stringify(result.results, null, 2));
      if (result.changes.length > 0) {
        console.log(`📢 检测到 ${result.changes.length} 条状态变更`);
      }
    } catch (err) {
      console.log(`⚠️ 通关状态查询失败: ${err.message}`);
      console.log("   (这可能是正常的 - 确认页面结构或账号配置)");
    }
  } else {
    console.log("\n⚠️ 未配置云港通账号，跳过通关状态查询测试");
    console.log("   设置环境变量: YGT_USERNAME / YGT_PASSWORD");
  }

  // 5. 测试集装箱查询（如果配置了陆海通账号）
  if (process.env.LHT_USERNAME && process.env.LHT_PASSWORD) {
    console.log(`\n📦 测试陆海通集装箱查询: ${TEST_CONTAINER_NO}`);
    try {
      const result = await qingdao.queryContainers([
        { containerNo: TEST_CONTAINER_NO, blNo: TEST_BL_NO },
      ]);
      console.log("✅ 集装箱查询结果:");
      console.log(JSON.stringify(result.results, null, 2));
      if (result.changes.length > 0) {
        console.log(`📢 检测到 ${result.changes.length} 条状态变更`);
      }
    } catch (err) {
      console.log(`⚠️ 集装箱查询失败: ${err.message}`);
      console.log("   (这可能是正常的 - 确认页面结构或账号配置)");
    }

    // 测试提单追踪
    console.log(`\n📦 测试提单号全程追踪: ${TEST_BL_NO}`);
    try {
      const tracking = await qingdao.trackByBlNo(TEST_BL_NO);
      console.log("✅ 提单追踪结果:");
      console.log(JSON.stringify(tracking, null, 2));
    } catch (err) {
      console.log(`⚠️ 提单追踪失败: ${err.message}`);
    }
  } else {
    console.log("\n⚠️ 未配置陆海通账号，跳过集装箱查询测试");
    console.log("   设置环境变量: LHT_USERNAME / LHT_PASSWORD");
  }

  // 6. 测试船舶动态（如果配置了船讯网 API Key）
  if (process.env.SHIPXY_API_KEY) {
    console.log("\n📦 测试船舶动态同步: CNTAO (青岛港)");
    try {
      const result = await qingdao.syncVessels("CNTAO");
      console.log("✅ 船舶动态同步结果:");
      console.log(JSON.stringify(result.summary, null, 2));
    } catch (err) {
      console.log(`⚠️ 船舶同步失败: ${err.message}`);
    }
  } else {
    console.log("\n⚠️ 未配置船讯网 API Key，跳过船舶同步测试");
    console.log("   设置环境变量: SHIPXY_API_KEY");
  }

  // 7. 关闭
  console.log("\n🛑 关闭模块...");
  await qingdao.shutdown();
  console.log("✅ 模块已关闭");

  console.log("\n" + "=".repeat(60));
  console.log("  PoC 测试完成");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ 测试失败:", err);
  process.exit(1);
});