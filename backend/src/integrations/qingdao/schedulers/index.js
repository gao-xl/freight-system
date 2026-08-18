"use strict";

const cron = require("node-cron");
const config = require("../config");

/**
 * 定时任务调度器
 * 基于 node-cron（项目已有），管理所有定时抓取任务
 */
class Scheduler {
  constructor() {
    this._tasks = new Map();
    this._running = false;
  }

  /**
   * 启动所有定时任务
   * @param {object} options.getPendingItems - 获取待查询项的回调函数
   */
  start(options = {}) {
    if (this._running) return;
    this._running = true;

    const { getPendingCustoms, getPendingContainers, getPendingVessels } = options;

    // 通关状态轮询（每30分钟）
    if (getPendingCustoms) {
      this._addTask("customsStatus", config.scheduler.customsStatus, async () => {
        const items = await getPendingCustoms();
        const { customsMonitor } = require("../services/customs-monitor");
        await customsMonitor.run(items);
      });
    }

    // 集装箱状态轮询（每30分钟）
    if (getPendingContainers) {
      this._addTask("container", config.scheduler.container, async () => {
        const items = await getPendingContainers();
        const { containerTracker } = require("../services/container-tracker");
        await containerTracker.run(items);
      });
    }

    // 船舶动态同步（每2小时）
    if (getPendingVessels !== false) {
      this._addTask("vesselSchedule", config.scheduler.vesselSchedule, async () => {
        const { vesselSync } = require("../services/vessel-sync");
        await vesselSync.syncPortVessels();
      });
    }

    this._log("info", `调度器已启动，共 ${this._tasks.size} 个定时任务`);
  }

  /**
   * 停止所有定时任务
   */
  stop() {
    for (const [name, task] of this._tasks) {
      task.stop();
      this._log("info", `任务 ${name} 已停止`);
    }
    this._tasks.clear();
    this._running = false;
  }

  /**
   * 手动触发单个任务
   */
  async trigger(name) {
    const task = this._tasks.get(name);
    if (!task) throw new Error(`任务 ${name} 不存在`);
    this._log("info", `手动触发任务: ${name}`);
    await task.execute();
  }

  /**
   * 获取任务状态
   */
  getStatus() {
    const status = {};
    for (const [name, task] of this._tasks) {
      status[name] = {
        running: task.running,
        lastRun: task.lastRun,
        lastError: task.lastError,
      };
    }
    return status;
  }

  _addTask(name, cronExpression, fn) {
    // 包装执行函数，捕获错误、记录状态
    const wrapped = async () => {
      const task = this._tasks.get(name);
      if (task.running) {
        this._log("warn", `任务 ${name} 正在执行中，跳过本次调度`);
        return;
      }

      task.running = true;
      try {
        await fn();
        task.lastRun = new Date().toISOString();
        task.lastError = null;
      } catch (err) {
        task.lastError = err.message;
        this._log("error", `任务 ${name} 执行失败: ${err.message}`);
      } finally {
        task.running = false;
      }
    };

    const cronTask = cron.schedule(cronExpression, wrapped, { scheduled: true });
    this._tasks.set(name, {
      cronTask,
      execute: wrapped,
      running: false,
      lastRun: null,
      lastError: null,
    });

    this._log("info", `任务 ${name} 已注册: ${cronExpression}`);
  }

  _log(level, msg) {
    try {
      const { logger } = require("../../utils/logger");
      logger[level](`[调度器] ${msg}`);
    } catch {
      console.log(`[调度器] ${msg}`);
    }
  }
}

module.exports = new Scheduler();