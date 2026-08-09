'use strict';

// 审计门面（core/auditService）
//
// 来源：架构解耦重构方案 E6（跨域写数据收口）
// 铁律：AuditLog.create 只允许出现在本文件；其余模块一律通过 auditService.record() 写审计。
// 依赖方向：core ← 任意层；本文件不依赖 controllers、不依赖业务域。
//
// 兼容：保持原 automationService / workflowService 直写时的字段语义不变，
//      只做「写入口收敛」，不改变 AuditLog 表结构与任何已落库字段格式。

const { AuditLog } = require('../models');
const { logger } = require('../utils/logger');

/**
 * 统一审计写入口
 * @param {Object} opts
 * @param {string|number} opts.userId     操作人 id（可空）
 * @param {string}        opts.username   操作人姓名（可空，缺省 SYSTEM）
 * @param {string}        opts.module     模块名（order/finance/automation/workflow/system...）
 * @param {string}        opts.action     动作（create/update/delete/login/transition/auto_advance...）
 * @param {string}        opts.method     HTTP 方法或执行方式（POST/AUTO/TRANSITION...）
 * @param {string|number} [opts.targetId] 目标记录 id
 * @param {string}        [opts.summary]  操作摘要
 * @param {string}        [opts.path]     请求路径
 * @param {string}        [opts.ip]       IP
 * @param {string}        [opts.userAgent] 用户代理
 * @param {Object}        [opts.transaction] 事务对象（可选）
 * @returns {Promise<boolean>} 是否落库成功（失败不抛错，避免阻断主流程）
 */
async function record({
  userId,
  username,
  module,
  action,
  method = 'POST',
  targetId,
  summary,
  path,
  ip,
  userAgent,
  transaction,
} = {}) {
  try {
    await AuditLog.create(
      {
        userId: userId || null,
        username: username || 'SYSTEM',
        module: module || 'system',
        action,
        method,
        path: path || null,
        targetId: targetId != null ? String(targetId) : null,
        summary: summary || '',
        ip: ip || null,
        userAgent: userAgent ? userAgent.slice(0, 255) : null,
      },
      transaction ? { transaction } : undefined
    );
    return true;
  } catch (e) {
    logger.error(`[AUDIT] 审计写入失败(${module}/${action})`, { message: e.message });
    return false;
  }
}

module.exports = { record };