"use strict";

const cacheAdapter = require("../adapters/cache-adapter");
const changeDetector = require("../adapters/change-detector");
const normalizer = require("../adapters/data-normalizer");
const config = require("../config");

/**
 * 船舶动态同步服务
 * 对接船讯网 API，定时同步船舶动态
 */
class VesselSync {
  constructor() {
    this._shipxyClient = null;
  }

  _getShipxyClient() {
    if (!this._shipxyClient) {
      try {
        this._shipxyClient = require("../api-clients/shipxy");
      } catch {
        this._log("warn", "船讯网 API 客户端未就绪，船舶同步将跳过 API 调用");
      }
    }
    return this._shipxyClient;
  }

  /**
   * 同步青岛港船舶动态
   * @param {string} portCode - 港口五位码，青岛港默认 CNTAO
   */
  async syncPortVessels(portCode = "CNTAO") {
    const startTime = Date.now();
    this._log("info", `开始同步港口 ${portCode} 船舶动态`);

    const client = this._getShipxyClient();
    const results = { berthed: [], anchored: [], expected: [], source: "shipxy" };

    if (client) {
      try {
        const [berthed, anchored, expected] = await Promise.allSettled([
          client.getBerthShips(portCode),
          client.getAnchorShips(portCode),
          client.getEtaShips(portCode),
        ]);

        results.berthed = berthed.status === "fulfilled" ? (berthed.value || []).map((v) => normalizer.normalizeVesselStatus({ ...v, source: "shipxy" })) : [];
        results.anchored = anchored.status === "fulfilled" ? (anchored.value || []).map((v) => normalizer.normalizeVesselStatus({ ...v, source: "shipxy" })) : [];
        results.expected = expected.status === "fulfilled" ? (expected.value || []).map((v) => normalizer.normalizeVesselStatus({ ...v, source: "shipxy" })) : [];
      } catch (err) {
        this._log("error", `船讯网 API 调用失败: ${err.message}`);
      }
    }

    // 缓存结果
    const allVessels = [...results.berthed, ...results.anchored, ...results.expected];
    const changes = [];

    for (const vessel of allVessels) {
      const cacheKey = `vessel:${vessel.mmsi || vessel.imo}`;
      const previous = await cacheAdapter.get(cacheKey);
      const prevData = previous ? JSON.parse(previous) : null;

      const { changed, changes: vesselChanges } = changeDetector.detectVesselChanges(prevData, vessel);
      if (changed) {
        changes.push({ vessel: vessel.vesselName, mmsi: vessel.mmsi, changes: vesselChanges });
      }

      await cacheAdapter.set(cacheKey, JSON.stringify(vessel), config.redis.ttl.vesselSchedule);
    }

    // 缓存港口汇总
    const summary = {
      portCode,
      updatedAt: new Date().toISOString(),
      counts: { berthed: results.berthed.length, anchored: results.anchored.length, expected: results.expected.length },
      vessels: allVessels,
    };
    await cacheAdapter.set(`port:${portCode}`, JSON.stringify(summary), config.redis.ttl.vesselSchedule);

    const elapsed = Date.now() - startTime;
    this._log("info", `船舶同步完成: 靠泊 ${results.berthed.length}, 锚地 ${results.anchored.length}, 预抵 ${results.expected.length} (${elapsed}ms)`);

    return { summary, changes };
  }

  /**
   * 获取港口船舶摘要（优先从缓存）
   */
  async getPortSummary(portCode = "CNTAO") {
    const cached = await cacheAdapter.get(`port:${portCode}`);
    if (cached) return JSON.parse(cached);
    return this.syncPortVessels(portCode);
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../../utils/logger");
      logger[level](`[船舶同步] ${msg}`);
    } catch {
      console.log(`[船舶同步] ${msg}`);
    }
  }
}

module.exports = new VesselSync();