"use strict";

const config = require("../config");

/**
 * 数据标准化适配器
 * 将云港通/陆海通/第三方API的原始数据统一映射为系统内部标准格式
 */
class DataNormalizer {
  /**
   * 标准化通关状态
   * @param {object} raw - 云港通抓取的原始通关状态
   * @returns {object} 标准化结果
   */
  normalizeCustomsStatus(raw) {
    const mapping = config.statusMapping.customs;
    return {
      blNo: raw.blNo,
      containerNo: raw.containerNo,
      queriedAt: raw.queriedAt,
      source: "yungangtong",
      status: this._mapStatus(raw.status, mapping),
      details: {
        cargoArrived: raw.cargoArrived,
        loadingReleased: raw.loadingReleased,
        customsInspecting: raw.customsInspecting,
      },
    };
  }

  /**
   * 标准化集装箱状态
   * @param {object} raw - 陆海通/飞驼可视抓取的原始集装箱数据
   * @returns {object} 标准化结果
   */
  normalizeContainerStatus(raw) {
    const mapping = config.statusMapping.container;
    return {
      containerNo: raw.containerNo,
      blNo: raw.blNo,
      queriedAt: raw.queriedAt,
      source: raw.source || "luhaitong",
      status: this._mapStatus(raw.status, mapping),
      nodes: (raw.nodes || []).map((n) => ({
        ...n,
        internalKey: mapping[n.key] || n.key,
      })),
      lastCompletedNode: this._lastCompletedNode(raw.nodes || []),
    };
  }

  /**
   * 标准化船舶动态
   * @param {object} raw - 船讯网API原始数据
   * @returns {object} 标准化结果
   */
  normalizeVesselStatus(raw) {
    const mapping = config.statusMapping.vessel;
    return {
      mmsi: raw.mmsi,
      imo: raw.imo,
      vesselName: raw.vesselName || raw.shipname,
      callSign: raw.callSign,
      position: {
        lat: raw.lat,
        lng: raw.lng,
        speed: raw.speed,
        course: raw.course,
        updatedAt: raw.positionUpdated || raw.utc,
      },
      portStatus: this._mapStatus(raw.portStatus || raw.status, mapping),
      eta: raw.eta,
      etd: raw.etd,
      source: raw.source || "shipxy",
    };
  }

  /**
   * 合并多个数据源的同一条记录
   * 例如：飞驼可视的集装箱追踪 + 陆海通的集装箱查询
   */
  mergeContainerData(existing, incoming) {
    if (!existing) return incoming;
    const merged = { ...existing };

    // 合并节点，以时间更新的为准
    const nodeMap = new Map();
    for (const n of (existing.nodes || [])) {
      nodeMap.set(n.key, n);
    }
    for (const n of (incoming.nodes || [])) {
      const existingNode = nodeMap.get(n.key);
      if (!existingNode || (n.time && n.time > existingNode.time)) {
        nodeMap.set(n.key, n);
      }
    }
    merged.nodes = Array.from(nodeMap.values()).sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
    merged.sources = [...new Set([...(existing.sources || []), incoming.source])];
    merged.lastCompletedNode = this._lastCompletedNode(merged.nodes);
    merged.status = this._deriveStatus(merged.nodes);

    return merged;
  }

  _mapStatus(rawStatus, mapping) {
    if (!rawStatus) return "unknown";
    for (const [key, value] of Object.entries(mapping)) {
      if (rawStatus.includes(key) || rawStatus === value) return value;
    }
    return rawStatus;
  }

  _lastCompletedNode(nodes) {
    const completed = nodes.filter((n) => n.completed && n.time);
    if (completed.length === 0) return null;
    return completed.reduce((latest, n) => (n.time > latest.time ? n : latest), completed[0]);
  }

  _deriveStatus(nodes) {
    const keys = nodes.filter((n) => n.completed).map((n) => n.key);
    if (keys.includes("empty_return") || keys.includes("delivery")) return "completed";
    if (keys.includes("arrived") || keys.includes("discharged")) return "arrived";
    if (keys.includes("onboard") || keys.includes("departed")) return "in_transit";
    if (keys.includes("terminal_in") || keys.includes("customs_release")) return "at_terminal";
    if (keys.length > 0) return "inland";
    return "unknown";
  }
}

module.exports = new DataNormalizer();