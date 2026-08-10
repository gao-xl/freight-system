'use strict';

// P1 发票号段发号服务：按 bizType 顺序分配下一号，行级锁保证并发不重号。
// 依赖：NumberSegment 表已在迁移中建好并写入默认号段。
const { NumberSegment } = require('../models');
const { Op } = require('sequelize');

// 取符合 bizType 的启用号段（优先当前用户组私享，其次全局共享）
async function resolveSegment(bizType, groupId) {
  const where = { bizType, enabled: true };
  if (groupId) {
    const own = await NumberSegment.findOne({ where: { ...where, groupId } });
    if (own) return own;
  }
  return NumberSegment.findOne({ where: { ...where, groupId: { [Op.or]: [null, 0] } } });
}

// 原子发号：在已开启的事务内，锁定该号段行并将 currentSeq 加一，返回格式化号码。
// 必须在事务 t 内调用，否则并发下可能重号。
async function nextNumber({ bizType, groupId, transaction }) {
  const seg = await resolveSegment(bizType, groupId);
  if (!seg) return null; // 未配置号段 → 调用方回退到旧随机号
  // 行级锁读取当前值（SELECT ... FOR UPDATE）
  const locked = await NumberSegment.findByPk(seg.id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!locked || !locked.enabled) return null;
  // 校验号段是否已耗尽
  if (locked.endSeq && locked.endSeq > 0 && locked.currentSeq >= locked.endSeq) return null;
  const next = Number(locked.currentSeq) + 1;
  await locked.update({ currentSeq: next }, { transaction });
  const digit = Number(locked.digit) || 8;
  const seqStr = String(next).padStart(digit, '0');
  return `${locked.prefix}-${seqStr}`;
}

module.exports = { nextNumber, resolveSegment };