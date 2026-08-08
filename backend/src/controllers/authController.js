const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const config = require('../config');
const { ok, fail, asyncHandler } = require('../utils/response');
const { getPermissions } = require('../services/permissionService');

// 占位密码哈希：用户不存在时也执行一次 bcrypt 比较，保持耗时一致，防时序侧信道枚举用户名
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, '用户名和密码不能为空');
  const user = await User.findOne({ where: { username } });
  const validUser = !!user && user.status === 'active';
  // 恒定时间比较：无论用户是否存在/禁用都执行 bcrypt，避免通过响应时间枚举用户名
  const passwordValid = validUser ? await bcrypt.compare(password, user.password) : await bcrypt.compare(password, DUMMY_HASH);
  if (!validUser || !passwordValid) {
    return fail(res, '用户名或密码错误', 1, 401);
  }
  await user.update({ lastLoginAt: new Date() });
  // D8：签发带 ver（tokenVersion）与 jti 的 token；改密/禁用后 tokenVersion 递增，旧 token 即刻失效
  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role, ver: user.tokenVersion || 0, jti: crypto.randomUUID() },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  const permissions = await getPermissions(user.id);
  ok(res, {
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, permissions },
  }, '登录成功');
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: ['id', 'username', 'name', 'role', 'email', 'phone', 'lastLoginAt', 'customerId'],
  });
  const permissions = await getPermissions(user.id);
  ok(res, { ...user.toJSON(), permissions });
});

const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const user = await User.findByPk(req.user.id);
  if (!await bcrypt.compare(oldPassword, user.password)) return fail(res, '原密码错误');
  user.password = await bcrypt.hash(newPassword, 10);
  // D8：改密后递增版本号，使该用户此前签发的所有 token 失效
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  ok(res, null, '密码修改成功，其他设备需重新登录');
});

module.exports = { login, me, changePassword };