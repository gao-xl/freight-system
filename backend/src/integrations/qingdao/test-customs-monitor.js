"use strict";

/**
 * 通关监控服务完整流程测试
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const customsMonitor = require("./services/customs-monitor");

const TEST_BL = process.argv[2] || "OOLU1234567890";

async function main() {
  console.log("=".repeat(64));
  console.log(`  通关监控服务测试 - 提单号: ${TEST_BL}`);
  console.log("=".repeat(64));

  const items = [
    { blNo: TEST_BL, ieFlag: "I" },
    { blNo: TEST_BL, ieFlag: "E" },
  ];

  const { results, changes } = await customsMonitor.run(items);

  console.log(`\n  查询结果 (${results.length}):`);
  for (const r of results) {
    console.log(`  ${r.blNo} [${r.ieFlag}] → 状态: ${r.status}`);
    if (r.error) console.log(`    错误: ${r.error}`);
    if (r.lastCompletedNode) {
      console.log(`    最近完成节点: ${r.lastCompletedNode.name} (${r.lastCompletedNode.time})`);
    }
    if (r.containers && r.containers.length > 0) {
      console.log(`    集装箱: ${r.containers.length} 个`);
    }
  }

  console.log(`\n  变更记录 (${changes.length}):`);
  for (const c of changes) {
    console.log(`  ${c.blNo} [${c.ieFlag}]:`);
    for (const ch of c.changes) {
      console.log(`    ${ch.field}: ${JSON.stringify(ch.from)} → ${JSON.stringify(ch.to)}`);
    }
  }

  console.log("\n" + "=".repeat(64));
  console.log("  测试完成");
  console.log("=".repeat(64));
}

main().catch((err) => {
  console.error("❌ 异常:", err);
  process.exit(1);
});