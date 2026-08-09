'use strict';

// P3.2 统一流程状态机服务：transition 是订单/订舱/报关/财务状态流转的唯一显式入口
// 流程：校验规则（WorkflowConfig）→ 校验角色（fromRole）→ 执行动作 → 审计 → 事件
// 设计：不改变既有"派生式"状态推导，本服务负责"显式状态变更"的配置化与审计。

const { WorkflowConfig, Order, Booking, CustomsDeclaration, FinanceRecord } = require('../models');
const { record: auditRecord } = require('../core/auditService');

// 对象类型 → 模型映射
const MODEL_MAP = {
  order: Order,
  booking: Booking,
  customs: CustomsDeclaration,
  finance: FinanceRecord,
};

// 业务对象的可流转状态清单（供前端下拉）
const STATUS_OPTIONS = {
  order: ['draft', 'confirmed', 'in_progress', 'completed', 'cancelled'],
  booking: ['pending', 'confirmed', 'loading', 'shipped', 'cancelled'],
  customs: ['prepared', 'submitted', 'inspecting', 'released', 'rejected', 'closed'],
  finance: ['unpaid', 'partial', 'paid', 'waived'],
};

// 审计留痕（统一走 core/auditService 门面）
async function logAudit(username, bizType, targetId, from, to, summary) {
  return auditRecord({
    username: username || 'SYSTEM',
    module: 'workflow',
    action: 'transition',
    method: 'TRANSITION',
    targetId,
    summary: summary || `[${bizType}] ${from} → ${to}`,
  });
}

/**
 * 统一状态流转入口
 * @param {Object} opts
 * @param {string} opts.bizType  order/booking/customs/finance
 * @param {number} opts.id       业务记录 id
 * @param {string} opts.toStatus 目标状态
 * @param {Object} [opts.ctx]    { user: {id,role,name} }
 * @param {string} [opts.fromStatus] 显式指定当前状态（缺省取记录当前状态）
 */
async function transition({ bizType, id, toStatus, ctx = {}, fromStatus } = {}) {
  const Model = MODEL_MAP[bizType];
  if (!Model) return { ok: false, code: 400, message: `不支持的 bizType: ${bizType}` };

  const rec = await Model.findByPk(id);
  if (!rec) return { ok: false, code: 404, message: '业务记录不存在' };

  const from = fromStatus || rec.status || 'draft';
  if (from === toStatus) return { ok: false, code: 400, message: '状态未变化' };

  // 1. 校验流转规则：存在 enabled 配置且 from → to 匹配（from='*' 通配）
  const configs = await WorkflowConfig.findAll({ where: { bizType, enabled: true } });
  const rule = configs.find((c) => (c.fromStatus === '*' || c.fromStatus === from) && c.toStatus === toStatus);
  if (!rule) {
    return {
      ok: false,
      code: 403,
      message: `未配置的流转: ${from} → ${toStatus}（请先在「流程配置」中添加）`,
    };
  }

  // 2. 角色校验
  if (rule.fromRole && rule.fromRole !== '*' && ctx.user?.role !== rule.fromRole && ctx.user?.role !== 'admin') {
    return { ok: false, code: 403, message: `仅 ${rule.fromRole} 角色可执行该流转` };
  }

  // 3. 执行动作（目前仅 update_status；后续可扩展动作注册表）
  if (rule.action === 'update_status' || !rule.action) {
    await rec.update({ status: toStatus });
  } else {
    return { ok: false, code: 500, message: `未实现的动作: ${rule.action}` };
  }

  // 4. 审计 + 事件
  await logAudit(ctx.user?.name, bizType, id, from, toStatus, rule.remark || null);
  try {
    const eventBus = require('./eventBus');
    eventBus.emit(`${bizType}.transitioned`, { id, from, to: toStatus, rule });
  } catch { /* 事件失败不阻断 */ }

  return { ok: true, data: { id, from, to: toStatus }, message: '状态已更新' };
}

module.exports = { transition, MODEL_MAP, STATUS_OPTIONS };
