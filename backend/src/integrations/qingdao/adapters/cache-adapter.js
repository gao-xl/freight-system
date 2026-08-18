"use strict";

const config = require("../config");

/**
 * Redis 缓存适配器
 * 封装 ioredis 操作，不可用时静默降级为内存缓存
 */
class CacheAdapter {
  constructor() {
    this._redis = null;
    this._memoryStore = new Map();
    this._initialized = false;
  }

  async _ensureRedis() {
    if (this._initialized) return;
    this._initialized = true;

    if (!config.redis.enabled) {
      this._log("info", "Redis 缓存已禁用，使用内存缓存");
      return;
    }

    try {
      const Redis = require("ioredis");
      this._redis = new Redis({
        keyPrefix: config.redis.keyPrefix,
        maxRetriesPerRequest: 2,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      // 必须监听 error，否则连接失败会触发 unhandled error 崩溃进程
      this._redis.on("error", (err) => {
        this._log("warn", `Redis 连接错误: ${err.message}`);
        if (this._redis) {
          this._redis.disconnect();
          this._redis = null;
        }
      });

      await this._redis.connect();
      this._log("info", "Redis 缓存连接成功");
    } catch (err) {
      this._log("warn", `Redis 连接失败，降级为内存缓存: ${err.message}`);
      if (this._redis) {
        this._redis.disconnect().catch(() => {});
        this._redis = null;
      }
    }
  }

  async get(key) {
    await this._ensureRedis();

    if (this._redis) {
      try {
        return await this._redis.get(key);
      } catch (err) {
        this._log("warn", `Redis get 失败: ${err.message}`);
      }
    }

    const entry = this._memoryStore.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value;
    }
    this._memoryStore.delete(key);
    return null;
  }

  async set(key, value, ttlSeconds) {
    await this._ensureRedis();

    if (this._redis) {
      try {
        if (ttlSeconds > 0) {
          await this._redis.set(key, value, "EX", ttlSeconds);
        } else {
          await this._redis.set(key, value);
        }
        return;
      } catch (err) {
        this._log("warn", `Redis set 失败: ${err.message}`);
      }
    }

    this._memoryStore.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Infinity,
    });
  }

  async del(key) {
    await this._ensureRedis();

    if (this._redis) {
      try {
        await this._redis.del(key);
      } catch {}
    }
    this._memoryStore.delete(key);
  }

  async keys(pattern) {
    await this._ensureRedis();

    if (this._redis) {
      try {
        return await this._redis.keys(pattern);
      } catch {}
    }

    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return Array.from(this._memoryStore.keys()).filter((k) => regex.test(k));
  }

  async flushPattern(pattern) {
    const keys = await this.keys(pattern);
    for (const key of keys) {
      await this.del(key);
    }
  }

  get memorySize() {
    return this._memoryStore.size;
  }

  get redisConnected() {
    return this._redis !== null;
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../utils/logger");
      logger[level](`[Cache] ${msg}`);
    } catch {
      console.log(`[Cache] ${msg}`);
    }
  }
}

module.exports = new CacheAdapter();