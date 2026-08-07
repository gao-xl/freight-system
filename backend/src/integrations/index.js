// 外部系统对接适配层
// 设计：每个外部系统实现一个适配器，统一接口 send() / query()，
// 通过 Integrations 工厂按 code 分发。新增对接只需在 adapters/ 下新增文件并注册。
const fs = require('fs');
const path = require('path');
const { IntegrationConfig } = require('../models');

const adapters = {};
const adapterDir = path.join(__dirname, 'adapters');
fs.readdirSync(adapterDir).forEach((file) => {
  if (file.endsWith('.js')) {
    const mod = require(path.join(adapterDir, file));
    if (mod && mod.code) adapters[mod.code] = mod;
  }
});

class IntegrationClient {
  constructor(code, cfg) {
    this.code = code;
    this.cfg = cfg;
    this.adapter = adapters[code];
  }

  async send(payload) {
    if (!this.adapter) throw new Error(`未注册的对接适配器: ${this.code}`);
    if (!this.cfg || !this.cfg.enabled) throw new Error(`对接 ${this.code} 未启用`);
    return this.adapter.send(this.cfg, payload);
  }

  async query(payload) {
    if (!this.adapter) throw new Error(`未注册的对接适配器: ${this.code}`);
    if (!this.cfg || !this.cfg.enabled) throw new Error(`对接 ${this.code} 未启用`);
    return this.adapter.query(this.cfg, payload);
  }

  static async get(code) {
    const cfg = await IntegrationConfig.findOne({ where: { code } });
    return new IntegrationClient(code, cfg);
  }
}

module.exports = { IntegrationClient, adapters };