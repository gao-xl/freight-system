"use strict";

const axios = require("axios");

/**
 * 船讯网 (ShipXY) API 客户端
 * 文档: https://apidocs.shipxy.com/
 *
 * 免费版可获取岸基AIS数据，企业版支持卫星AIS
 */
class ShipXYClient {
  constructor() {
    this.baseUrl = process.env.SHIPXY_API_URL || "https://api.shipxy.com";
    this.apiKey = process.env.SHIPXY_API_KEY || "";
    this._enabled = !!this.apiKey;
  }

  get enabled() {
    return this._enabled;
  }

  async _request(endpoint, params = {}) {
    if (!this._enabled) {
      throw new Error("船讯网 API Key 未配置");
    }
    const url = `${this.baseUrl}${endpoint}`;
    const response = await axios.get(url, {
      params: { ...params, apikey: this.apiKey },
      timeout: 10000,
    });
    if (response.data && response.data.status === 0) {
      return response.data.data || response.data;
    }
    throw new Error(`船讯网 API 错误: ${response.data?.msg || "未知错误"}`);
  }

  /**
   * 获取港口靠泊船舶
   * @param {string} portCode - 港口五位码，如 CNTAO (青岛港)
   */
  async getBerthShips(portCode) {
    return this._request("/v2/port/berthships", { portcode: portCode });
  }

  /**
   * 获取港口锚地船舶
   */
  async getAnchorShips(portCode) {
    return this._request("/v2/port/anchorships", { portcode: portCode });
  }

  /**
   * 获取港口预抵船舶
   */
  async getEtaShips(portCode) {
    return this._request("/v2/port/etaships", { portcode: portCode });
  }

  /**
   * 获取船舶实时位置
   * @param {string} mmsi - 船舶 MMSI
   */
  async getVesselPosition(mmsi) {
    return this._request("/v2/vessel/position", { mmsi });
  }

  /**
   * 获取船舶历史轨迹
   * @param {string} mmsi
   * @param {string} startTime - ISO 8601
   * @param {string} endTime - ISO 8601
   */
  async getVesselTrack(mmsi, startTime, endTime) {
    return this._request("/v2/vessel/track", { mmsi, begintime: startTime, endtime: endTime });
  }
}

module.exports = new ShipXYClient();