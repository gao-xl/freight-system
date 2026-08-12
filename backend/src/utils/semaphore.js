// 并发信号量：限制同时进行的重型任务数量（如 Chromium PDF 渲染），
// 超出限额的调用排队等待，避免多个高内存任务叠加导致低配服务器 OOM。
// 用法：await semaphore.run(async () => { ... })
class Semaphore {
  constructor(maxConcurrency) {
    this.max = Math.max(1, Number(maxConcurrency) || 1);
    this.active = 0;
    this.waiting = [];
  }

  // 尝试获取一个执行位；满员则挂起直到有释放
  acquire() {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  release() {
    const next = this.waiting.shift();
    if (next) {
      next(); // 唤醒下一个等待者，占用位交接
    } else {
      this.active -= 1;
    }
  }

  // 便捷封装：并发限流执行，函数返回结果透传
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

module.exports = { Semaphore };