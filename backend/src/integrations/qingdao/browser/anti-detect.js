"use strict";

/**
 * 反检测策略模块
 * 注入脚本到页面上下文，隐藏自动化痕迹
 */

const ANTI_DETECT_SCRIPT = `
  // 覆盖 navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => false });

  // 覆盖 chrome 对象
  window.chrome = { runtime: {} };

  // 覆盖 permissions
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters)
  );

  // 覆盖 plugins
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  // 覆盖 languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['zh-CN', 'zh', 'en'],
  });
`;

const HUMAN_BEHAVIOR_SCRIPT = `
  // 注入人类行为模拟：随机鼠标移动
  (() => {
    const moveRandomly = () => {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: x, clientY: y, bubbles: true
      }));
    };
    setInterval(moveRandomly, 3000 + Math.random() * 5000);
  })();
`;

async function injectAntiDetection(page) {
  await page.addInitScript(ANTI_DETECT_SCRIPT);
}

async function injectHumanBehavior(page) {
  await page.evaluate(HUMAN_BEHAVIOR_SCRIPT);
}

async function randomDelay(min = 500, max = 2000) {
  const delay = Math.floor(Math.random() * (max - min) + min);
  return new Promise((r) => setTimeout(r, delay));
}

async function humanType(page, selector, text) {
  const el = await page.$(selector);
  if (!el) return;
  await el.click();
  for (const char of text) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 100 });
  }
}

async function humanScroll(page, distance = 300) {
  await page.evaluate((d) => {
    window.scrollBy({ top: d, behavior: "smooth" });
  }, distance);
  await randomDelay(500, 1500);
}

module.exports = {
  injectAntiDetection,
  injectHumanBehavior,
  randomDelay,
  humanType,
  humanScroll,
};