"use strict";

/**
 * 云港通 - VIP 单箱查询 API 抓取器
 *
 * 通过 /api/web/vip/vipOceantally/queryByContainerNo 直接调用 API，
 * 按集装箱号查询进出口全流程状态。
 *
 * 返回结构（与单票查询类似，但以箱号为主键）：
 *   - CONTAINER_STATUS_DATA: 集装箱状态
 *   - IMPORT_STATUS_DATA / EXPORT_STATUS_DATA: 状态汇总（各节点时间）
 *   - IMPORT_BASE_DATA / EXPORT_BASE_DATA: 集装箱基础信息
 *   - IMPORT_UNLOADED: 卸船信息
 *   - 其余各状态节点数组
 */
class VipContainerScraper {
  /**
   * 按箱号查询集装箱状态
   * @param {import('playwright').Page} page - 已登录页面（携带 Cookie）
   * @param {string} containerNo - 集装箱号
   * @param {object} options
   * @param {string} options.ieFlag - I=进口, E=出口
   * @returns {Promise<object>} 标准化集装箱状态
   */
  async queryByContainerNo(page, containerNo, options = {}) {
    const { ieFlag = "I" } = options;

    const url = `/api/web/vip/vipOceantally/queryByContainerNo?containerNo=${encodeURIComponent(containerNo)}&ieFlag=${ieFlag}`;

    const json = await page.evaluate(async (u) => {
      const res = await fetch(u, { credentials: "include" });
      return await res.json();
    }, url);

    if (json.code !== 200) {
      throw new Error(`[云港通·VIP单箱] 查询失败: code=${json.code}, message=${json.message}`);
    }

    return this._parse(json, containerNo, ieFlag);
  }

  /**
   * 批量查询（进口+出口）
   * @param {import('playwright').Page} page
   * @param {string} containerNo
   * @returns {Promise<object>}
   */
  async queryBoth(page, containerNo) {
    const [importResult, exportResult] = await Promise.all([
      this.queryByContainerNo(page, containerNo, { ieFlag: "I" }).catch((e) => ({
        containerNo, ieFlag: "I", status: "query_failed", error: e.message,
      })),
      this.queryByContainerNo(page, containerNo, { ieFlag: "E" }).catch((e) => ({
        containerNo, ieFlag: "E", status: "query_failed", error: e.message,
      })),
    ]);
    return { import: importResult, export: exportResult };
  }

  /**
   * 解析 API 响应为标准格式
   */
  _parse(json, containerNo, ieFlag) {
    const data = json.data || {};
    const nodes = data.data || {};
    const isImport = ieFlag === "I";
    const prefix = isImport ? "IMPORT_" : "EXPORT_";

    const extract = (key) => {
      const rows = nodes[key] || [];
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows[0];
    };

    // 基础信息 + 状态汇总
    const base = extract(`${prefix}BASE_DATA`);
    const statusSummary = extract(`${prefix}STATUS_DATA`);
    const containerStatus = extract("CONTAINER_STATUS_DATA");

    const vesselPrefix = isImport ? "import" : "export";

    const result = {
      containerNo,
      ieFlag,
      source: "yungangtong",
      queriedAt: new Date().toISOString(),
      blNo: (base && base.billNo) || null,
      vessel: this._pick(base, [`${vesselPrefix}VesselName`, `${vesselPrefix}VesselNameCn`, `${vesselPrefix}VoyageNo`, "imoNo"]),
      container: this._parseContainer(base, containerStatus),
      nodes: {},
      status: "unknown",
      raw: nodes,
    };

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

    // 用状态汇总补齐节点时间（单箱查询的 STATUS_DATA 含各节点时间字段）
    if (statusSummary) {
      for (const def of nodeDefs) {
        const node = result.nodes[def.key];
        if (node && !node.completed) {
          const t = this._extractTime(statusSummary, def.summaryFields || []);
          if (t) {
            node.completed = true;
            if (def.summaryIsFlag) {
              node.flag = t;
            } else {
              node.time = t;
            }
            node.fromSummary = true;
          }
        }
      }
    }

    // 综合判定状态
    result.status = this._determineStatus(result.nodes, isImport);

    return result;
  }

  _parseContainer(base, containerStatus) {
    if (!base) return null;
    return {
      containerNo: base.containerNo,
      blNo: base.billNo || null,
      owner: base.containerOwner,
      size: base.containerSize,
      type: base.containerType,
      sealNo: base.sealNo,
      terminal: base.mtdm,
      flow: base.flowDirection,
      yard: base.yardCode,
      grossWeight: base.cargoWeight,
      stackDays: base.storageDays,
      gateInTime: base.gateInTime,
      gateOutTime: base.loadedTime,
      dangerous: base.dangerousGoodsFlag,
      dangerousImo: base.imdgImo,
      reefer: base.reeferFlag,
      temperature: base.temperature,
      loadingPort: base.loadPort,
      dischargePort: base.dischargePort,
      destinationPort: base.destinationPort,
      status: containerStatus ? this._pick(containerStatus, ["statusName", "statusTime", "receiptDesc", "receiptTime", "mtdm"]) : null,
    };
  }

  // 进口状态节点定义
  IMPORT_NODES = [
    { key: "IMPORT_ORIGINAL_MANIFEST", name: "原始舱单", timeFields: ["receiveTime", "receiveDate"], summaryFields: ["originalManifestReceiptTime"] },
    { key: "IMPORT_CUSTOMS_DECLARED", name: "报关单审结", timeFields: ["declareTime", "declarationTime"], summaryFields: ["basTime"] },
    { key: "IMPORT_UNLOADED", name: "卸船", timeFields: ["gateInTime", "loadedTime", "unloadTime", "dischargeTime"], summaryFields: ["gateInTime"] },
    { key: "IMPORT_TALLY_REPORT", name: "理货报告", timeFields: ["sendTime", "receiptTime"], summaryFields: ["tallyReportReceiptTime"] },
    { key: "IMPORT_DIVERSION_APPLY", name: "分流申请", timeFields: ["receiptTime", "applyTime"], summaryFields: ["diversionApplyReceiptTime"] },
    { key: "IMPORT_DIVERSION_RELEASE", name: "分流放行", timeFields: ["releaseTime", "receiptTime"], summaryFields: ["customsDiversionReleaseTime"] },
    { key: "IMPORT_DIVERSION_ARRIVAL", name: "分流运抵", timeFields: ["arrivalTime", "receiptTime"], summaryFields: ["diversionArrivalReceiptTime"] },
    { key: "IMPORT_INSPECTION_MAIN", name: "查验", timeFields: ["inspectionResultTime", "outInspectionTime"], summaryFields: ["inspectionResult"] },
    { key: "IMPORT_CUSTOMS_RELEASE", name: "报关单放行", timeFields: ["releaseTime", "customsReleaseTime"], summaryFields: ["customsDeclReleaseTime"] },
    { key: "IMPORT_BILL_RELEASE", name: "提单放行", timeFields: ["releaseTime", "billReleaseTime"], summaryFields: ["customsBlReleaseTime"] },
    { key: "IMPORT_CONTAINER_LEAVE_PORT", name: "箱子离港", timeFields: ["departTime", "leaveTime"], summaryFields: ["loadedTime"] },
    { key: "IMPORT_EMPTY_RETURN", name: "空箱返场", timeFields: ["returnTime", "emptyReturnTime"], summaryFields: ["emptyReturnTime"] },
  ];

  // 出口状态节点定义
  EXPORT_NODES = [
    { key: "EXPORT_PRE_STOWAGE_MANIFEST", name: "预配舱单", timeFields: ["receiveTime", "receiveDate"], summaryFields: ["preManifestReceiptTime"] },
    { key: "EXPORT_CUSTOMS_DECLARED", name: "报关单审结", timeFields: ["declareTime", "declarationTime"], summaryFields: ["basTime"] },
    { key: "EXPORT_PACKING_LIST", name: "装箱单", timeFields: ["sendTime", "receiptTime"], summaryFields: ["packingListSendTime"] },
    { key: "EXPORT_VGM_CONFIRMED", name: "VGM确认", timeFields: ["confirmTime", "vgmTime"], summaryFields: ["vgmConfirm", "yardStatus"] },
    { key: "EXPORT_LADEN_CONTAINER_GATE_IN", name: "重箱集港", timeFields: ["gateInTime", "inTime"], summaryFields: ["gateInTime"] },
    { key: "EXPORT_ARRIVAL_REPORT", name: "运抵报告", timeFields: ["sendTime", "receiptTime"], summaryFields: ["arrivalReportReceiptTime"] },
    { key: "EXPORT_INSPECTION_MAIN", name: "查验", timeFields: ["inspectionResultTime", "outInspectionTime"], summaryFields: ["inspectionResult"] },
    { key: "EXPORT_CUSTOMS_RELEASE", name: "报关单放行", timeFields: ["releaseTime", "customsReleaseTime"], summaryFields: ["customsDeclReleaseTime"] },
    { key: "EXPORT_LOADING_RELEASE", name: "装载放行", timeFields: ["releaseTime", "loadingReleaseTime"], summaryFields: ["customsLoadReleaseTime"] },
    { key: "EXPORT_TERMINAL_RELEASE", name: "码头放行", timeFields: ["terminalReleaseTime", "releaseTime"], summaryFields: ["terminalReleaseFlag"], summaryIsFlag: true },
    { key: "EXPORT_TALLY_RELEASE", name: "外理放行", timeFields: ["tallyReleaseTime", "releaseTime"], summaryFields: ["tallyReleaseTime"] },
    { key: "EXPORT_CONTAINER_LOADED_ON_VESSEL", name: "箱子装船", timeFields: ["loadTime", "onBoardTime"], summaryFields: ["loadedTime"] },
    { key: "EXPORT_TALLY_REPORT", name: "理货报告", timeFields: ["sendTime", "receiptTime"], summaryFields: ["tallyReportReceiptTime"] },
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
   * 综合判定集装箱状态
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
}

module.exports = new VipContainerScraper();
