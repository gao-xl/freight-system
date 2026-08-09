// 共享密码强度策略（统一校验入口）
// 规则：8-128 位；至少含字母与数字。
// 用途：setup-admin / user-create / user-update / change-password 统一走此口径，避免各控制器规则不一。
// 说明：登录不校验强度（存量弱密码仍需可登录），改密/建号才强制。

function validatePassword(pwd) {
  const s = String(pwd == null ? '' : pwd);
  if (s.length < 8) return { ok: false, message: '密码至少 8 位' };
  if (s.length > 128) return { ok: false, message: '密码不能超过 128 位' };
  if (!/[A-Za-z]/.test(s)) return { ok: false, message: '密码需包含字母' };
  if (!/\d/.test(s)) return { ok: false, message: '密码需包含数字' };
  return { ok: true, message: '' };
}

// 供 Joi schema 使用的校验器：替换散落的 min(6) 写法，统一强度
function joiPassword(required = true) {
  const Joi = require('joi');
  const base = Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/, { name: 'passwordStrength' })
    .messages({
      'string.min': '密码至少 8 位',
      'string.max': '密码不能超过 128 位',
      'string.pattern.name': '密码需同时包含字母与数字',
    });
  return required ? base.required() : base.allow('');
}

module.exports = { validatePassword, joiPassword };