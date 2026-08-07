'use strict';

// 接口密钥管理：参数校验 + 调 service + 组装响应，业务逻辑在 services/apiKeyService.js
const { User, Role } = require('../models');
const { ok, fail, asyncHandler } = require('../utils/response');
const apiKeyService = require('../services/apiKeyService');

const NAME_MAX = 100;

// 创建密钥：明文只在本次响应返回一次
const create = asyncHandler(async (req, res) => {
  const { name, role, userId, expiresAt, groupId, ownerId } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) return fail(res, '密钥名称必填');
  if (name.length > NAME_MAX) return fail(res, `密钥名称不能超过 ${NAME_MAX} 个字符`);

  // 未指定绑定用户时绑定当前操作者；密钥权限上限即该用户的权限
  const targetUserId = userId == null ? req.user.id : Number(userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) return fail(res, 'userId 必须是正整数');
  const targetUser = await User.findByPk(targetUserId);
  if (!targetUser) return fail(res, '绑定用户不存在', 1, 404);
  if (targetUser.status !== 'active') return fail(res, '绑定用户已禁用，无法签发密钥');

  // 角色缺省取绑定用户的角色；显式指定时必须是真实存在的角色，否则密钥会因为交集为空而完全不可用
  const targetRole = role == null || role === '' ? targetUser.role : String(role);
  if (targetRole) {
    const roleRow = await Role.findOne({ where: { code: targetRole } });
    if (!roleRow) return fail(res, `角色 ${targetRole} 不存在，请先在角色管理中创建`);
  }

  let expires = null;
  if (expiresAt) {
    expires = new Date(expiresAt);
    if (Number.isNaN(expires.getTime())) return fail(res, 'expiresAt 不是合法时间');
    if (expires.getTime() <= Date.now()) return fail(res, 'expiresAt 必须晚于当前时间');
  }

  let group = null;
  if (groupId != null) {
    group = Number(groupId);
    if (!Number.isInteger(group) || group <= 0) return fail(res, 'groupId 必须是正整数');
  }

  let owner = null;
  if (ownerId != null) {
    owner = Number(ownerId);
    if (!Number.isInteger(owner) || owner <= 0) return fail(res, 'ownerId 必须是正整数');
    // ownerId 的语义是「只看本人数据」，取值必须与绑定用户一致，否则范围含义无法确定
    if (owner !== targetUserId) return fail(res, 'ownerId 必须与绑定用户 userId 一致');
  }

  const { record, plainKey } = await apiKeyService.createKey({
    name: name.trim(),
    role: targetRole,
    userId: targetUserId,
    expiresAt: expires,
    groupId: group,
    ownerId: owner,
  });

  ok(res, {
    ...apiKeyService.toSafeJson(record),
    key: plainKey,
  }, '密钥已生成，明文仅本次返回，请立即保存');
});

// 列表：只返回元信息与掩码，不含明文，也不含摘要全文
const list = asyncHandler(async (req, res) => {
  ok(res, await apiKeyService.listKeys());
});

// 撤销：置为失效而非物理删除，保留使用痕迹
const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 'id 必须是正整数');
  const revoked = await apiKeyService.revokeKey(id);
  if (!revoked) return fail(res, '密钥不存在', 1, 404);
  ok(res, revoked, '密钥已撤销');
});

module.exports = { create, list, remove };
