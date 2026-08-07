'use strict';

// 模块注册协议（单仓逻辑模块化 / 插件化二开入口）
//
// 一个模块 = 一个目录 backend/src/modules/<name>/index.js，导出：
//   {
//     name,          // 必填，模块唯一标识（小写英文）
//     title,         // 可选，中文名（日志与菜单展示）
//     dependencies,  // 可选，string[]，前置模块名，决定加载顺序
//     models,        // 可选，Sequelize 模型数组
//     routes,        // 可选，(router, mw) => void，声明本模块路由
//     services,      // 可选，对象，键为服务名
//     seed,          // 可选，async () => void，初始化数据
//     menu,          // 可选，{ path, icon, permission }
//     events,        // 可选，string[]，本模块发射的事件名
//     autoMount,     // 可选，false 表示路由已在别处挂载，mountRoutes 跳过
//   }
// 除 name 外全部可省略。
//
// 加载与挂载分两步，这是刻意设计：
//   load(dir)                 只做发现 + 校验 + 登记元信息，零副作用，不碰 Express。
//   mountRoutes(router, mw)   显式挂载路由，调用方决定时机。
// 这样往 modules/ 里丢一个新目录不会静默改变现有路由表，
// 现有 routes/index.js 的路由始终是唯一权威来源，除非调用方主动挂载。

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

// 协议白名单：用于拼写纠错提示（例如把 routes 写成 route）
const PROTOCOL_FIELDS = new Set([
  'name', 'title', 'dependencies', 'models', 'routes',
  'services', 'seed', 'menu', 'events', 'autoMount', 'legacy',
]);

class ModuleRegistryImpl {
  constructor() {
    this.modules = [];
    this.models = [];
    this.menus = [];
    this.eventTypes = {};
  }

  // 校验模块是否符合协议，返回错误信息数组（空数组 = 通过）
  validate(mod) {
    const errors = [];
    if (!mod || typeof mod !== 'object') return ['模块导出不是对象'];
    if (typeof mod.name !== 'string' || !mod.name.trim()) errors.push('缺少必填字段 name（非空字符串）');
    if (mod.dependencies !== undefined && !Array.isArray(mod.dependencies)) errors.push('dependencies 必须是数组');
    if (mod.models !== undefined && !Array.isArray(mod.models)) errors.push('models 必须是数组');
    if (mod.routes !== undefined && typeof mod.routes !== 'function') errors.push('routes 必须是函数 (router, mw) => void');
    if (mod.services !== undefined && (typeof mod.services !== 'object' || mod.services === null)) errors.push('services 必须是对象');
    if (mod.seed !== undefined && typeof mod.seed !== 'function') errors.push('seed 必须是函数');
    if (mod.menu !== undefined && (typeof mod.menu !== 'object' || mod.menu === null)) errors.push('menu 必须是对象');
    if (mod.events !== undefined) {
      if (!Array.isArray(mod.events)) errors.push('events 必须是数组');
      else if (mod.events.some((e) => typeof e !== 'string')) errors.push('events 数组元素必须是字符串');
    }
    return errors;
  }

  // 注册单个模块。source 仅用于日志定位（文件路径）
  register(mod, source = '') {
    const errors = this.validate(mod);
    if (errors.length) {
      const where = source ? ` [${source}]` : '';
      logger.warn(`[MODULE] 模块不符合协议，已跳过${where}: ${errors.join('; ')}`);
      return { ok: false, errors };
    }
    if (this.modules.find((m) => m.name === mod.name)) {
      logger.warn(`[MODULE] 模块 "${mod.name}" 已注册，跳过重复注册`);
      return { ok: false, errors: ['模块名重复'] };
    }
    // 拼写纠错提示：出现协议外字段时提醒，不阻断加载
    const unknown = Object.keys(mod).filter((k) => !PROTOCOL_FIELDS.has(k));
    if (unknown.length) {
      logger.warn(`[MODULE] 模块 "${mod.name}" 含协议外字段（将被忽略）: ${unknown.join(', ')}`);
    }

    this.modules.push(mod);
    if (mod.models) this.models.push(...mod.models);
    if (mod.menu) this.menus.push({ ...mod.menu, module: mod.name });
    if (mod.events) {
      for (const e of mod.events) this.eventTypes[e] = mod.name;
    }
    logger.info(`[MODULE] 已注册模块: ${mod.name}${mod.title ? ` (${mod.title})` : ''}`);
    return { ok: true, errors: [] };
  }

  /**
   * 加载模块。两种入参：
   *   load('/abs/path/to/modules')  扫描目录（推荐，插件化用法）
   *   load([modA, modB], ctx)       直接传模块数组（兼容既有调用方）
   */
  load(input, ctx = {}) {
    if (typeof input === 'string') return this.loadFromDir(input);
    if (Array.isArray(input)) return this.loadFromList(input, ctx);
    throw new TypeError('ModuleRegistry.load 入参必须是目录路径字符串或模块数组');
  }

  /**
   * 扫描目录：每个子目录的 index.js 视为一个模块。
   * 只做发现 + 校验 + 登记，不挂载路由、不同步模型。
   * 单个模块加载失败被隔离，不影响其他模块与服务启动。
   */
  loadFromDir(modulesDir) {
    const result = { dir: modulesDir, loaded: [], skipped: [], errors: [] };

    let entries;
    try {
      entries = fs.readdirSync(modulesDir, { withFileTypes: true });
    } catch (e) {
      logger.warn(`[MODULE] 模块目录不可读，跳过扫描: ${modulesDir} (${e.message})`);
      result.errors.push({ module: null, message: e.message });
      return result;
    }

    for (const entry of entries) {
      // 只认子目录；扁平 .js 文件不属于本协议，交由调用方自行 require
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // 下划线/点开头视为私有或临时目录
      if (name.startsWith('_') || name.startsWith('.')) {
        result.skipped.push({ module: name, reason: '目录名以 _ 或 . 开头，视为私有目录' });
        continue;
      }
      const entryFile = path.join(modulesDir, name, 'index.js');
      if (!fs.existsSync(entryFile)) {
        result.skipped.push({ module: name, reason: '缺少 index.js' });
        continue;
      }

      let mod;
      try {
        mod = require(entryFile);
      } catch (e) {
        logger.error(`[MODULE] 模块加载失败，已跳过: ${name} - ${e.message}`);
        result.errors.push({ module: name, message: e.message });
        continue;
      }

      const reg = this.register(mod, entryFile);
      if (reg.ok) {
        // 目录名与 name 不一致会让排障困难，明确提示
        if (mod.name !== name) {
          logger.warn(`[MODULE] 目录名 "${name}" 与模块 name "${mod.name}" 不一致，建议保持一致`);
        }
        result.loaded.push(mod.name);
      } else {
        result.skipped.push({ module: name, reason: reg.errors.join('; ') });
      }
    }

    logger.info(
      `[MODULE] 目录扫描完成: 已加载 ${result.loaded.length} 个` +
      `${result.loaded.length ? ` (${result.loaded.join(', ')})` : ''}` +
      `${result.skipped.length ? `，跳过 ${result.skipped.length} 个` : ''}` +
      `${result.errors.length ? `，失败 ${result.errors.length} 个` : ''}`
    );
    return result;
  }

  /**
   * 直接注册模块数组，并按依赖顺序挂载路由 / 收集服务。
   * @param {Array} modules 模块定义数组
   * @param {Object} ctx { router, middleware }
   */
  loadFromList(modules, ctx = {}) {
    for (const mod of modules) this.register(mod);

    const order = this.topoSort();
    logger.info(`[MODULE] 加载顺序: ${order.join(' → ')}`);

    const services = {};
    for (const name of order) {
      const mod = this.modules.find((m) => m.name === name);
      if (!mod) continue;
      if (mod.routes && ctx.router && mod.autoMount !== false) {
        mod.routes(ctx.router, ctx.middleware || {});
        logger.info(`[MODULE] 路由已挂载: ${name}`);
      }
      if (mod.services) Object.assign(services, mod.services);
    }

    return {
      modules: this.modules,
      models: this.models,
      menus: this.menus,
      eventTypes: this.eventTypes,
      services,
    };
  }

  /**
   * 显式挂载已注册模块的路由（opt-in）。
   * 声明 autoMount === false 的模块会被跳过——用于路由已在 routes/index.js 声明的存量模块，
   * 避免同一路径被重复注册。
   */
  mountRoutes(router, mw = {}) {
    const mounted = [];
    for (const name of this.topoSort()) {
      const mod = this.modules.find((m) => m.name === name);
      if (!mod || typeof mod.routes !== 'function') continue;
      if (mod.autoMount === false) {
        logger.info(`[MODULE] 跳过路由挂载（autoMount=false）: ${name}`);
        continue;
      }
      try {
        mod.routes(router, mw);
        mounted.push(name);
        logger.info(`[MODULE] 路由已挂载: ${name}`);
      } catch (e) {
        logger.error(`[MODULE] 路由挂载失败: ${name} - ${e.message}`);
      }
    }
    return mounted;
  }

  // 拓扑排序（Kahn 算法），按 dependencies 决定加载顺序并检测循环依赖
  topoSort() {
    const names = this.modules.map((m) => m.name);
    const inDegree = {};
    const adj = {};
    for (const m of this.modules) {
      inDegree[m.name] = 0;
      adj[m.name] = [];
    }
    for (const m of this.modules) {
      for (const dep of m.dependencies || []) {
        if (adj[dep]) {
          adj[dep].push(m.name);
          inDegree[m.name] += 1;
        } else {
          logger.warn(`[MODULE] 模块 "${m.name}" 声明的前置依赖 "${dep}" 未注册`);
        }
      }
    }
    const queue = names.filter((n) => inDegree[n] === 0);
    const sorted = [];
    while (queue.length) {
      const n = queue.shift();
      sorted.push(n);
      for (const next of adj[n]) {
        inDegree[next] -= 1;
        if (inDegree[next] === 0) queue.push(next);
      }
    }
    if (sorted.length !== names.length) {
      const cycle = names.filter((n) => !sorted.includes(n));
      throw new Error(`模块循环依赖: ${cycle.join(' → ')}`);
    }
    return sorted;
  }

  // 按依赖顺序执行全部模块的 seed，单个失败不中断其余
  async seedAll() {
    const results = {};
    for (const name of this.topoSort()) {
      const mod = this.modules.find((m) => m.name === name);
      if (!mod || typeof mod.seed !== 'function') continue;
      try {
        await mod.seed();
        results[name] = 'ok';
        logger.info(`[MODULE] seed 完成: ${name}`);
      } catch (e) {
        results[name] = `error: ${e.message}`;
        logger.error(`[MODULE] seed 失败: ${name} - ${e.message}`);
      }
    }
    return results;
  }

  // 模块元信息列表（供前端菜单/权限或排障查阅）
  list() {
    return this.modules.map((m) => ({
      name: m.name,
      title: m.title || m.name,
      menu: m.menu || null,
      events: m.events || [],
      dependencies: m.dependencies || [],
      hasRoutes: typeof m.routes === 'function',
      autoMount: m.autoMount !== false,
    }));
  }

  get(name) {
    return this.modules.find((m) => m.name === name) || null;
  }

  // 清空注册表（测试用）
  reset() {
    this.modules = [];
    this.models = [];
    this.menus = [];
    this.eventTypes = {};
  }
}

// 单例：全进程共享一份注册表
const ModuleRegistry = new ModuleRegistryImpl();

module.exports = { ModuleRegistry, ModuleRegistryImpl };
