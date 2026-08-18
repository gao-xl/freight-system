'use strict';

// P3-3 运维监控控制器
// 接口：
//   GET  /ops/monitor/snapshot     运行态监控快照 + 告警规则状态
//   GET  /ops/monitor/rules        读取告警规则（含默认值）
//   PUT  /ops/monitor/rules        保存告警规则（整表覆盖）
//   POST /ops/monitor/escalate/run 手动触发一次流程节点超时升级扫描
// 鉴权：全部 require system:*（统一管理后台运维中心入口）

const { ok, fail, asyncHandler } = require('../utils/response');
const mon = require('../services/monitoringService');

// GET /ops/monitor/snapshot
const snapshot = asyncHandler(async (req, res) => {
  const [data, rules] = await Promise.all([mon.buildSnapshot(), mon.loadRules()]);
  const evalResult = await mon.evaluate(rules, data);
  ok(res, { data, rules: evalResult.all, firing: evalResult.firing, firedCount: evalResult.firing.length });
});

// GET /ops/monitor/rules
const getRules = asyncHandler(async (req, res) => {
  ok(res, { rules: await mon.loadRules() });
});

// PUT /ops/monitor/rules
const putRules = asyncHandler(async (req, res) => {
  const rules = await mon.saveRules(req.body && req.body.rules);
  ok(res, { rules }, '告警规则已保存');
});

// POST /ops/monitor/escalate/run  手动触发节点升级扫描（便于验证，不依赖定时）
const runEscalate = asyncHandler(async (req, res) => {
  const rules = await mon.loadRules();
  const result = await mon.escalateStuckNodes(rules);
  ok(res, result, `节点升级扫描完成（升级 ${result.escalated}，结案 ${result.resolved}）`);
});

module.exports = { snapshot, getRules, putRules, runEscalate };