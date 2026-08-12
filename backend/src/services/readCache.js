'use strict';

// 作用域感知的读缓存 helper（方案 A：高频只读接口减负）
//
// 设计要点：
//   1. 复用 cacheService（内存 LRU / 可选 Redis，fail-open 降级），所有键统一前缀 'rc:'。
//   2. 缓存键包含「数据隔离作用域」签名：all 范围各用户共享；group/self 按 userId 隔离，
//      避免跨用户/跨组读到不该看的数据（数据隔离不被缓存绕过）。
//   3. 单飞（single-flight）：同一 key 的并发未命中只让一个请求回源填缓存，
//      其余复用同一次结果，防止缓存击穿在低配服务器上打满 DB。
//   4. 严格只读：任何写接口不经过本 helper；写端通过 invalidatePrefix 主动失效。
//
// 语义：缓存是性能优化不是正确性依赖。读缓存失败/未命中一律回源，绝不抛异常。

const cacheService = require('./cacheService');
const { getScope } = require('../middleware/dataScope');

const PREFIX = 'rc:';

// 进程内单飞表：key -> Promise
const inflight = new Map();

// 校验作用域签名是合法字符串；否则回退为 'anon'（防御性）
function safeSeg(v) {
  return String(v == null ? '' : v).slice(0, 64);
}

// 生成当前请求的数据隔离作用域签名（采样自缓存好的 req.dataScope，零额外查询）
async function scopeSignature(req) {
  const scope = await getScope(req); // dataScope 中间件已缓存到 req.dataScope
  if (scope.scope === 'all') return 'all';
  if (scope.scope === 'group') {
    const gids = Array.isArray(scope.groupIds) ? [...scope.groupIds].sort((a, b) => a - b).join(',') : '';
    return `group:${gids}`;
  }
  // self 或未知：按用户隔离最安全
  return `self:${req.user?.id ?? 'anon'}`;
}

// 组合缓存键：rc:{namespace}:{scopeOnly}:{seed}
// - namespace：接口级命名（如 dashboard / rate）
// - scopeOnly：仅作用域签名（跨用户共享，用于 all 范围）
// - seed：请求参数指纹（如查询参数），保证不同参数的缓存隔离
async function buildKey(namespace, req, seed) {
  const sig = await scopeSignature(req);
  return `${PREFIX}${safeSeg(namespace)}:${sig}:${safeSeg(seed)}`;
}

// 读缓存：命中直接返回；未命中回源并回填（单飞防击穿）
// 参数：req, namespace, seed, ttlSeconds, loader()
async function readThrough(req, namespace, seed, ttlSeconds, loader) {
  const key = await buildKey(namespace, req, seed);
  const hit = await cacheService.get(key);
  if (hit !== null && hit !== undefined) return hit;

  // 单飞：并发同 key 只回源一次
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const value = await loader();
    if (value !== null && value !== undefined) {
      await cacheService.set(key, value, ttlSeconds);
    }
    inflight.delete(key);
    return value;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } catch (e) {
    inflight.delete(key);
    throw e;
  }
}

// 按命名空间失效（写端调用）：rc:{namespace}:*
async function invalidateNamespace(namespace) {
  await cacheService.invalidatePrefix(`${PREFIX}${safeSeg(namespace)}:`);
}

module.exports = { readThrough, invalidateNamespace, buildKey, _internal: { inflight } };