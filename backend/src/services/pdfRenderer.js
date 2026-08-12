// PDF 渲染器（D1 修复）
// 方案：puppeteer-core + 系统浏览器（Edge/Chrome/Chromium）渲染 HTML→PDF，
//       完整保留版式与中文字体；无可用浏览器时返回 null，调用方回退 pdfkit。
// 浏览器探测顺序：环境变量 PDF_BROWSER_PATH → 常见安装路径（Windows/Linux/macOS）→ 无。
// Docker 环境：Dockerfile 需安装 chromium 并设置 PDF_BROWSER_PATH（或命中 /usr/bin/chromium）。

const fs = require('fs');
const { logger } = require('../utils/logger');

const CANDIDATES = [
  process.env.PDF_BROWSER_PATH,
  // Windows Edge（Win10/11 必装）
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  // Windows Chrome
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  // Linux / Docker
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

// 探测可用浏览器路径；返回 null 表示无可用的浏览器渲染环境
function findBrowser() {
  for (const p of CANDIDATES) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch { /* 忽略无效路径 */ }
  }
  return null;
}

// HTML → PDF（Buffer）。失败返回 null（不抛错，由调用方决定回退策略）
async function htmlToPdf(html, pageSize = 'A4') {
  const executablePath = findBrowser();
  if (!executablePath) return null;

  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (e) {
    logger.warn('[PDF] puppeteer-core 未安装，回退 pdfkit：' + e.message);
    return null;
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      // --no-sandbox：Docker root 运行必需；--disable-gpu 避免无头 GPU 报错
      // --disable-dev-shm-usage：容器 /dev/shm 默认只有 64M，禁止用共享内存改走 /tmp，避免渲染崩溃
      // --disable-extensions / --no-first-run：省内存、省首启开销（低配 1G 服务器关键）
      // --renderer-process-limit=1：只允许一个渲染进程，打印单页时显著降低峰值内存
      // --js-flags=--max-old-space-size=240：进一步限制 V8 堆，防止 1G 服务器 OOM
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--renderer-process-limit=1',
        '--js-flags=--max-old-space-size=240',
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    // preferCSSPageSize：尊重 renderHTML 中 @page { size } 定义
    const buf = await page.pdf({
      format: pageSize || 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    });
    return Buffer.from(buf);
  } catch (e) {
    logger.warn('[PDF] 无头浏览器渲染失败，回退 pdfkit：' + e.message);
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* 忽略关闭异常 */ }
    }
  }
}

module.exports = { htmlToPdf, findBrowser };
