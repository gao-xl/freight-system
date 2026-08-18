"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../config");

const SESSION_DIR = path.join(config.browser.userDataDir, "sessions");

class SessionManager {
  constructor() {
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
  }

  _sessionPath(platform) {
    return path.join(SESSION_DIR, `${platform}.json`);
  }

  async save(platform, cookies) {
    const filePath = this._sessionPath(platform);
    const data = {
      platform,
      savedAt: new Date().toISOString(),
      cookies,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    this._log("info", `[${platform}] Cookie 已保存 (${cookies.length} 条)`);

    // 同时写入 Redis
    try {
      const cacheAdapter = require("../adapters/cache-adapter");
      await cacheAdapter.set(
        `session:${platform}`,
        JSON.stringify(data),
        config.redis.ttl.session
      );
    } catch {
      // Redis 不可用时静默降级
    }
  }

  async load(platform) {
    // 优先从 Redis 加载
    try {
      const cacheAdapter = require("../adapters/cache-adapter");
      const cached = await cacheAdapter.get(`session:${platform}`);
      if (cached) {
        const data = JSON.parse(cached);
        this._log("info", `[${platform}] Cookie 从 Redis 加载`);
        return data.cookies;
      }
    } catch {
      // Redis 不可用时回退到文件
    }

    // 从文件加载
    const filePath = this._sessionPath(platform);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      const age = Date.now() - new Date(data.savedAt).getTime();
      if (age < config.redis.ttl.session * 1000) {
        this._log("info", `[${platform}] Cookie 从文件加载 (已保存 ${Math.round(age / 3600000)}h)`);
        return data.cookies;
      }
      this._log("warn", `[${platform}] Cookie 已过期，需要重新登录`);
    }
    return null;
  }

  async clear(platform) {
    const filePath = this._sessionPath(platform);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    try {
      const cacheAdapter = require("../adapters/cache-adapter");
      await cacheAdapter.del(`session:${platform}`);
    } catch {}
    this._log("info", `[${platform}] Cookie 已清除`);
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../utils/logger");
      logger[level](`[Session] ${msg}`);
    } catch {
      console.log(`[Session] ${msg}`);
    }
  }
}

module.exports = new SessionManager();