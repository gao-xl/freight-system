"use strict";

const config = require("../../config");

/**
 * 云港通 - VIP 全程追踪 API 抓取器
 *
 * 通过 /api/web/vip/vipOceantally/queryByBillNo 直接调用 API，
 * 返回进出口全流程状态（29 个状态节点）。
 *
 * 相比 UI 抓取，API 方式更稳定高效，无需解析 DOM。
 */
class VipOceantallyScraper {
  /**
   * 按提单号查询通关状态
   * @param {import('playwright').Page} page - 已登录页面（携带 Cookie）
   * @param {string} blNo - 提单号
   * @param {object} options
   * @param {string} options.ieFlag - I=进口, E=出口
   * @param {string} options.billType - ZTDH=主提单号, DH=分提单号
   * @returns {Promise<object>} 标准化通关状态
   */
  async queryByBillNo(page, blNo, options = {}) {
    const { ieFlag = "I", billType = "ZTDH" } = options;

    const url = `/api/web/vip/vipOceantally/queryByBillNo?billNo=${encodeURIComponent(blNo)}&ieFlag=${ieFlag}&billType=${billType}`;

    const json = await page.evaluate(async (u) => {
      const res = await fetch(u, { credentials: "include" });
      return await res.json();
    }, url);

    if (json.code !== 200) {
      throw new Error(`[云港通·VIP] 查询失败: code=${json.code}, message=${json.message}`);
    }

    return this._parse(json, blNo, ieFlag);
  }

  /**
   * 批量查询（进口+出口）
   * @param {import('playwright').Page} page
   * @param {string} blNo
   * @returns {Promise<object>}
   */
  async queryBoth(page, blNo) {
    const [importResult, exportResult] = await Promise.all([
      this.queryByBillNo(page, blNo, { ieFlag: "I" }).catch((e) => ({
        blNo, ieFlag: "I", status: "query_failed", error: e.message,
      })),
      this.queryByBillNo(page, blNo, { ieFlag: "E" }).catch((e) => ({
        blNo, ieFlag: "E", status: "query_failed", error: e.message,
      })),
    ]);
    return { import: importResult, export: exportResult };
  }

  /**
   * 解析 API 响应为标准格式
   */
  _parse(json, blNo, ieFlag) {
    const data = json.data || {};
    const nodes = data.data || {};
    const configs = data.configs || [];

    const isImport = ieFlag === "I";
    const prefix = isImport ? "IMPORT_" : "EXPORT_";

    // 提取各状态节点数据（取第一条记录）
    const extract = (key) => {
      const rows = nodes[key] || [];
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows[0];
    };

    // 基础信息
    const base = extract(`${prefix}BASE_DATA`);
    // 状态信息汇总（含各节点时间）
    const statusSummary = extract(`${prefix}STATUS_DATA`);

    const result = {
      blNo,
      ieFlag,
      source: "yungangtong",
      queriedAt: new Date().toISOString(),
      vessel: this._pick(base, ["vesselNameEn", "vesselNameCn", "voyageNo", "imoNo"]),
      containers: [],
      nodes: {},
      status: "unknown",
      raw: nodes,
    };

    // 解析基础信息中的集装箱列表
    if (Array.isArray(nodes[`${prefix}BASE_DATA`])) {
      result.containers = nodes[`${prefix}BASE_DATA`].map((row) => ({
        containerNo: row.containerNo,
        blNo: row.billNo || blNo,
        size: row.containerSize,
        type: row.containerType,
        sealNo: row.sealNo,
        terminal: row.terminalCode,
        weight: row.grossWeight,
        pieces: row.pieceCount,
        yard: row.yardCode,
        gateInTime: row.gateInTime,
        gateOutTime: row.gateOutTime,
        dangerous: row.dangerousFlag,
        reefer: row.reeferFlag,
        temperature: row.temperature,
        loadingPort: row.loadingPort,
        dischargePort: row.dischargePort,
        destinationPort: row.destinationPort,
      }));
    }

    // 解析各状态节点
    const nodeDefs = isImport ? this.IMPORT_NODES : this.EXPORT_NODES;
    for (const def of nodeDefs) {
      const rows = nodes[def.key];
      const completed = Array.isArray(rows) && rows.length > 0;
      result.nodes[def.key] = {
        key: def.key,
        name: def.name,
        completed,
        time: completed ? this._extractTime(rows[0], def.timeFields) : null,
        count: completed ? rows.length : 0,
        records: completed ? rows : [],
      };
    }

    // 综合判定状态
    result.status = this._determineStatus(result.nodes, isImport);

    return result;
  }

  // 进口状态节点定义
  IMPORT_NODES = [
    { key: "IMPORT_ORIGINAL_MANIFEST", name: "原始舱单", timeFields: ["receiveTime", "receiveDate"] },
    { key: "IMPORT_CUSTOMS_DECLARED", name: "报关单审结", timeFields: ["declareTime", "declarationTime"] },
    { key: "IMPORT_UNLOADED", name: "卸船", timeFields: ["unloadTime", "dischargeTime"] },
    { key: "IMPORT_TALLY_REPORT", name: "理货报告", timeFields: ["sendTime", "receiptTime"] },
    { key: "IMPORT_DIVERSION_APPLY", name: "分流申请", timeFields: ["receiptTime", "applyTime"] },
    { key: "IMPORT_DIVERSION_RELEASE", name: "分流放行", timeFields: ["releaseTime", "receiptTime"] },
    { key: "IMPORT_DIVERSION_ARRIVAL", name: "分流运抵", timeFields: ["arrivalTime", "receiptTime"] },
    { key: "IMPORT_INSPECTION_MAIN", name: "查验", timeFields: ["inspectionResultTime", "outInspectionTime"] },
    { key: "IMPORT_CUSTOMS_RELEASE", name: "报关单放行", timeFields: ["releaseTime", "customsReleaseTime"] },
    { key: "IMPORT_BILL_RELEASE", name: "提单放行", timeFields: ["releaseTime", "billReleaseTime"] },
    { key: "IMPORT_CONTAINER_LEAVE_PORT", name: "箱子离港", timeFields: ["departTime", "leaveTime"] },
    { key: "IMPORT_EMPTY_RETURN", name: "空箱返场", timeFields: ["returnTime", "emptyReturnTime"] },
  ];

  // 出口状态节点定义
  EXPORT_NODES = [
    { key: "EXPORT_PRE_STOWAGE_MANIFEST", name: "预配舱单", timeFields: ["receiveTime", "receiveDate"] },
    { key: "EXPORT_CUSTOMS_DECLARED", name: "报关单审结", timeFields: ["declareTime", "declarationTime"] },
    { key: "EXPORT_PACKING_LIST", name: "装箱单", timeFields: ["sendTime", "receiptTime"] },
    { key: "EXPORT_VGM_CONFIRMED", name: "VGM确认", timeFields: ["confirmTime", "vgmTime"] },
    { key: "EXPORT_LADEN_CONTAINER_GATE_IN", name: "重箱集港", timeFields: ["gateInTime", "inTime"] },
    { key: "EXPORT_ARRIVAL_REPORT", name: "运抵报告", timeFields: ["sendTime", "receiptTime"] },
    { key: "EXPORT_INSPECTION_MAIN", name: "查验", timeFields: ["inspectionResultTime", "outInspectionTime"] },
    { key: "EXPORT_CUSTOMS_RELEASE", name: "报关单放行", timeFields: ["releaseTime", "customsReleaseTime"] },
    { key: "EXPORT_LOADING_RELEASE", name: "装载放行", timeFields: ["releaseTime", "loadingReleaseTime"] },
    { key: "EXPORT_TERMINAL_RELEASE", name: "码头放行", timeFields: ["terminalReleaseTime", "releaseTime"] },
    { key: "EXPORT_TALLY_RELEASE", name: "外理放行", timeFields: ["tallyReleaseTime", "releaseTime"] },
    { key: "EXPORT_CONTAINER_LOADED_ON_VESSEL", name: "箱子装船", timeFields: ["loadTime", "onBoardTime"] },
    { key: "EXPORT_TALLY_REPORT", name: "理货报告", timeFields: ["sendTime", "receiptTime"] },
  ];

  _extractTime(row, fields) {
    for (const f of fields) {
      if (row && row[f]) return row[f];
    }
    return null;
  }

  _pick(obj, fields) {
    if (!obj) return {};
    const out = {};
    for (const f of fields) {
      if (obj[f] !== undefined && obj[f] !== null && obj[f] !== "") out[f] = obj[f];
    }
    return out;
  }

  /**
   * 综合判定通关状态
   * 按流程顺序，找到最后一个完成的节点
   */
  _determineStatus(nodes, isImport) {
    const order = isImport
      ? ["IMPORT_ORIGINAL_MANIFEST", "IMPORT_CUSTOMS_DECLARED", "IMPORT_UNLOADED", "IMPORT_TALLY_REPORT",
         "IMPORT_DIVERSION_APPLY", "IMPORT_DIVERSION_RELEASE", "IMPORT_DIVERSION_ARRIVAL",
         "IMPORT_INSPECTION_MAIN", "IMPORT_CUSTOMS_RELEASE", "IMPORT_BILL_RELEASE",
         "IMPORT_CONTAINER_LEAVE_PORT", "IMPORT_EMPTY_RETURN"]
      : ["EXPORT_PRE_STOWAGE_MANIFEST", "EXPORT_CUSTOMS_DECLARED", "EXPORT_PACKING_LIST", "EXPORT_VGM_CONFIRMED",
         "EXPORT_LADEN_CONTAINER_GATE_IN", "EXPORT_ARRIVAL_REPORT", "EXPORT_INSPECTION_MAIN",
         "EXPORT_CUSTOMS_RELEASE", "EXPORT_LOADING_RELEASE", "EXPORT_TERMINAL_RELEASE",
         "EXPORT_TALLY_RELEASE", "EXPORT_CONTAINER_LOADED_ON_VESSEL", "EXPORT_TALLY_REPORT"];

    const lastCompleted = [...order].reverse().find((key) => nodes[key] && nodes[key].completed);
    if (!lastCompleted) return "not_found";

    const name = nodes[lastCompleted].name;
    const statusMap = {
      "原始舱单": "manifest_received",
      "预配舱单": "manifest_received",
      "报关单审结": "customs_declared",
      "装箱单": "packing_list",
      "VGM确认": "vgm_confirmed",
      "重箱集港": "gate_in",
      "卸船": "discharged",
      "理货报告": "tally_reported",
      "运抵报告": "arrival_reported",
      "分流申请": "diversion_applied",
      "分流放行": "diversion_released",
      "分流运抵": "diversion_arrived",
      "查验": "customs_inspecting",
      "报关单放行": "customs_released",
      "装载放行": "loading_released",
      "码头放行": "terminal_released",
      "外理放行": "tally_released",
      "提单放行": "bill_released",
      "箱子离港": "departed",
      "箱子装船": "loaded_onboard",
      "空箱返场": "empty_returned",
    };
    return statusMap[name] || lastCompleted;
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../../utils/logger");
      logger[level](`[云港通·VIP] ${msg}`);
    } catch {
      console.log(`[云港通·VIP] ${msg}`);
    }
  }
}

module.exports = new VipOceantallyScraper();
