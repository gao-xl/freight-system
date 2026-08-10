'use strict';

// 统一缓存服务（F7 基础设施）
// 设计：
//   - 默认使用进程内 Map（零外部依赖，单实例即可用）
//   - 配置 REDIS_URL 后自动切换到 Redis（多实例/水平扩展共享缓存）
//   - 任何 Redis 异常一律 fail-open 降级到内存，绝不阻塞业务主流程
//   - 对外暴露 get/set/del/invalidatePrefix/flush + 命中等指标计数
//
// 语义：缓存是「性能优化」，不是「正确性依赖」。读缓存失败/未命中就回源，
// 写缓存失败仅记日志。因此缓存层不抛异常给调用方。

const { logger } = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL || '';

// 默认 TTL：完全由调用方传入，这里只做负值防御
function normalizeTtl(ttlSeconds) {
  const n = Number(ttlSeconds);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

// ── 内存后端（LRU 掐尾，容量上限防无限增长） ──
class MemoryBackend {
  constructor(maxEntries = 5000) {
    this.max = maxEntries;
    this.map = new Map();
  }

  async get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > hit.ttl * 1000) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key, value, ttlSeconds) {
    if (this.map.size >= this.max) {
      // 简单淘汰：删除最早插入的一项
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, at: Date.now(), ttl: normalizeTtl(ttlSeconds) });
  }

  async del(key) {
    this.map.delete(key);
  }

  async invalidatePrefix(prefix) {
    let n = 0;
    for (const k of this.map.keys()) {
      if (k.startsWith(prefix)) { this.map.delete(k); n += 1; }
    }
    return n;
  }

  async flush() { this.map.clear(); }
}

// ── Redis 后端（可选，ioredis） ──
class RedisBackend {
  constructor(client) { this.client = client; }

  async get(key) { return this.client.get(key); }

  async set(key, value, ttlSeconds) {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.set(key, v, 'EX', normalizeTtl(ttlSeconds));
  }

  async del(key) { await this.client.del(key); }

  async invalidatePrefix(prefix) {
    const keys = await this.client.keys(`${prefix}*`);
    if (keys.length) await this.client.del(...keys);
    return keys.length;
  }

  async flush() { await this.client.flushdb(); }
}

// 序列化：只在跨后端需要时使用；内存后端直接存原始引用
function encode(value) {
  if (value === undefined || value === null) return value;
  return JSON.stringify({ __c: 1, v: value });
}
function decode(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.__c === 1 ? parsed.v : parsed;
  } catch (e) {
    return raw;
  }
}

let backend = null;
let mode = 'memory';
let ready = false;

// 指标计数（供 prometheus /api/metrics 读取）
const stats = { hits: 0, misses: 0, writes: 0, fallbacks: 0 };

function init() {
  if (backend) return backend;
  if (REDIS_URL) {
    try {
      // 懒加载：避免未配置 Redis 的部署也启动客户端
      const Redis = require('ioredis');
      const client = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        retryStrategy: () => null, // 不自动重连队列堆积；异常时降级内存
        enableOfflineQueue: false,
      });
      backend = new RedisBackend(client);
      mode = 'redis';
      client.on('error', (e) => {
        if (ready) logger.warn('[CACHE] Redis 连接异常，本次降级内存', { message: e.message });
      });
      ready = true;
      logger.info('[CACHE] 缓存后端已启用：Redis');
    } catch (e) {
      logger.warn('[CACHE] Redis 初始化失败，降级内存缓存', { message: e.message });
      backend = new MemoryBackend();
      mode = 'memory';
    }
  } else {
    backend = new MemoryBackend();
    mode = 'memory';
    logger.info('[CACHE] 缓存后端已启用：内存（未配置 REDIS_URL，单实例）');
  }
  return backend;
}

// 安全执行：Redis 异常时降级内存并记一次 fallback，保证主流程不中断
async function safeOp(fnMap) {
  const b = init();
  try {
    return await fnMap(b);
  } catch (e) {
    stats.fallbacks += 1;
    logger.warn('[CACHE] 缓存操作失败，降级处理', { message: e.message });
    const mem = new MemoryBackend();
    return fnMap(mem);
  }
}

async function get(key) {
  const raw = await safeOp((b) => b.get(key));
  if (raw === null || raw === undefined) { stats.misses += 1; return null; }
  // Redis 返回字符串需解码；内存返回原始引用需判断是否命中
  if (mode === 'redis') { stats.hits += 1; return decode(raw); }
  stats.hits += 1;
  return raw;
}

async function set(key, value, ttlSeconds) {
  stats.writes += 1;
  if (mode === 'redis') {
    await safeOp((b) => b.set(key, encode(value), ttlSeconds));
  } else {
    await safeOp((b) => b.set(key, value, ttlSeconds));
  }
}

async function del(key) { return safeOp((b) => b.del(key)); }

async function invalidatePrefix(prefix) { return safeOp((b) => b.invalidatePrefix(prefix)); }

async function flush() { return safeOp((b) => b.flush()); }

function getMode() { return mode; }
function getStats() { return { ...stats, mode }; }

module.exports = { get, set, del, invalidatePrefix, flush, getMode, getStats };