import request from './request';

// P3-3 运维监控
export const monitorAPI = {
  // 运行态监控快照 + 告警规则状态
  snapshot: () => request.get('/ops/monitor/snapshot'),
  // 读取告警规则
  getRules: () => request.get('/ops/monitor/rules'),
  // 保存告警规则（整表覆盖）
  saveRules: (rules) => request.put('/ops/monitor/rules', { rules }),
  // 手动触发一次流程节点超时升级扫描
  runEscalate: () => request.post('/ops/monitor/escalate/run'),
};