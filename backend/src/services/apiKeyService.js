'use strict';

// 接口密钥服务：生成 / 校验 / 撤销
//
// 安全模型：
//   - 明文密钥 = 24 字节密码学随机数的十六进制串（48 字符，192 位熵），不可枚举
//   - 服务端只保存 SHA-256 摘要。密钥本身已是高熵随机值，不存在字典攻击面，
//     因此用 SHA-256 而非 bcrypt——认证在每请求热路径上，必须是常数级开销
//   - 明文只在创建响应里出现一次，不写日志、不入审计
//   - 权限上限锁死在绑定用户身上，密钥角色只能在此基础上继续收窄

const crypto = require('crypto');
const { ApiKey } = require('../models');

// 24 字节 -> 48 个十六进制字符
const KEY_BYTES = 24;
// 摘要为固定 64 字符十六进制，超出该长度的输入直接判无效，避免无谓的哈希开销
const MAX_KEY_INPUT = 256;
// lastUsedAt 节流窗口：同一把密钥一分钟内最多回写一次，避免每请求都打数据库
const TOUCH_INTERVAL_MS = 60 * 1000;

function generatePlainKey() {
  return crypto.randomBytes(KEY_BYTES).toString('hex');
}

function hashKey(plainKey) {
  return crypto.createHash('sha256').update(String(plainKey), 'utf8').digest('hex');
}

// 等长十六进制串的恒定时间比较，避免逐字节短路带来的时序侧信道
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// 展示用掩码：只暴露摘要首尾，便于人工核对是哪一把，又无法反推明文
function maskHash(keyHash) {
  if (!keyHash || keyHash.length < 12) return '******';
  return `${keyHash.slice(0, 6)}...${keyHash.slice(-4)}`;
}

// 列表 / 详情统一的脱敏输出，绝不包含 keyHash 全文
function toSafeJson(record) {
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    userId: record.userId,
    active: record.active,
    keyMask: maskHash(record.keyHash),
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    groupId: record.groupId,
    ownerId: record.ownerId,
    createdAt: record.createdAt,
  };
}

/**
 * 校验明文密钥，返回可用的 ApiKey 记录；任何一项不满足都返回 null（失败一律不区分原因）
 */
async function verifyPlainKey(plainKey) {
  if (typeof plainKey !== 'string') return null;
  const key = plainKey.trim();
  if (!key || key.length > MAX_KEY_INPUT) return null;

  const hash = hashKey(key);
  const record = await ApiKey.findOne({ where: { keyHash: hash } });
  if (!record) return null;
  // 防御性二次比对：即便未来查找逻辑改为范围查询，这里也保证摘要完全一致
  if (!timingSafeEqualHex(record.keyHash, hash)) return null;
  if (!record.active) return null;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) return null;
  return record;
}

/**
 * 节流回写 lastUsedAt。刻意不 await：认证成功后立刻放行，写库失败不影响请求。
 */
function touchLastUsed(record) {
  const last = record.lastUsedAt ? new Date(record.lastUsedAt).getTime() : 0;
  if (Date.now() - last < TOUCH_INTERVAL_MS) return;
  record.update({ lastUsedAt: new Date() }).catch(() => {
    // 使用时间只是运维参考，写失败不影响认证结果，静默忽略
  });
}

/**
 * 创建密钥。返回 { record, plainKey }，plainKey 由调用方一次性回传给用户后即丢弃。
 */
async function createKey({ name, role, userId, expiresAt = null, groupId = null, ownerId = null }) {
  const plainKey = generatePlainKey();
  const record = await ApiKey.create({
    keyHash: hashKey(plainKey),
    userId,
    role: role || null,
    name,
    active: true,
    expiresAt,
    groupId,
    ownerId,
  });
  return { record, plainKey };
}

async function listKeys() {
  const rows = await ApiKey.findAll({ order: [['id', 'DESC']] });
  return rows.map(toSafeJson);
}

/**
 * 撤销：置 active=false 而非物理删除，保留审计痕迹（谁在什么时候用过哪把密钥）
 */
async function revokeKey(id) {
  const record = await ApiKey.findByPk(id);
  if (!record) return null;
  if (record.active) await record.update({ active: false });
  return toSafeJson(record);
}

module.exports = {
  generatePlainKey,
  hashKey,
  timingSafeEqualHex,
  maskHash,
  toSafeJson,
  verifyPlainKey,
  touchLastUsed,
  createKey,
  listKeys,
  revokeKey,
};
