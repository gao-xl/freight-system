"use strict";

/**
 * 变更检测器
 * 对比前后两次查询结果，仅返回有变化的字段，减少噪音推送
 */
class ChangeDetector {
  /**
   * 检测集装箱状态变更
   * @param {object} previous - 上次查询结果
   * @param {object} current - 本次查询结果
   * @returns {{ changed: boolean, changes: Array<{field: string, from: any, to: any}> }}
   */
  detectContainerChanges(previous, current) {
    if (!previous) return { changed: true, changes: [{ field: "all", from: null, to: current }] };

    const changes = [];

    // 状态变更
    if (previous.status !== current.status) {
      changes.push({ field: "status", from: previous.status, to: current.status });
    }

    // 新增节点
    const prevNodeKeys = new Set((previous.nodes || []).map((n) => n.key));
    const newNodes = (current.nodes || []).filter((n) => !prevNodeKeys.has(n.key));
    for (const node of newNodes) {
      changes.push({
        field: `node.${node.key}`,
        from: null,
        to: { label: node.label, time: node.time },
      });
    }

    // 节点时间更新
    const prevNodeMap = new Map((previous.nodes || []).map((n) => [n.key, n]));
    for (const node of current.nodes || []) {
      const prev = prevNodeMap.get(node.key);
      if (prev && prev.time !== node.time) {
        changes.push({
          field: `node.${node.key}.time`,
          from: prev.time,
          to: node.time,
        });
      }
    }

    return { changed: changes.length > 0, changes };
  }

  /**
   * 检测通关状态变更
   */
  detectCustomsChanges(previous, current) {
    if (!previous) return { changed: true, changes: [{ field: "all", from: null, to: current }] };

    const changes = [];
    const fields = ["cargoArrived", "loadingReleased", "customsInspecting", "status"];

    for (const field of fields) {
      if (previous[field] !== current[field]) {
        changes.push({ field, from: previous[field], to: current[field] });
      }
    }

    return { changed: changes.length > 0, changes };
  }

  /**
   * 检测船舶动态变更
   */
  detectVesselChanges(previous, current) {
    if (!previous) return { changed: true, changes: [{ field: "all", from: null, to: current }] };

    const changes = [];
    const fields = ["portStatus", "eta", "etd"];

    for (const field of fields) {
      if (previous[field] !== current[field]) {
        changes.push({ field, from: previous[field], to: current[field] });
      }
    }

    // 位置变更（仅当移动超过阈值）
    if (previous.position && current.position) {
      const dist = this._haversine(
        previous.position.lat, previous.position.lng,
        current.position.lat, current.position.lng
      );
      if (dist > 1) { // 超过1公里
        changes.push({
          field: "position",
          from: previous.position,
          to: { ...current.position, distanceKm: Math.round(dist * 10) / 10 },
        });
      }
    }

    return { changed: changes.length > 0, changes };
  }

  _haversine(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球半径 km
    const dLat = this._toRad(lat2 - lat1);
    const dLng = this._toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  _toRad(deg) { return deg * Math.PI / 180; }
}

module.exports = new ChangeDetector();