"use strict";

/**
 * 验证码 OCR 识别器
 * 基于 tesseract.js，识别云港通简单字符验证码
 */

let workerPromise = null;

async function _getWorker() {
  if (!workerPromise) {
    const { createWorker } = require("tesseract.js");
    workerPromise = createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text" && m.progress === 1) {
          // 静默
        }
      },
    });
  }
  return workerPromise;
}

/**
 * 识别验证码图片
 * @param {Buffer} imageBuffer - 验证码图片
 * @param {object} options
 * @param {boolean} options.preprocess - 是否预处理（灰度化/二值化/放大）
 * @returns {Promise<string>} 识别出的验证码字符串
 */
async function recognizeCaptcha(imageBuffer, options = {}) {
  const { preprocess = true } = options;
  const worker = await _getWorker();

  let target = imageBuffer;

  if (preprocess) {
    target = await _preprocess(imageBuffer);
  }

  const { data } = await worker.recognize(target);
  // 只保留字母和数字
  const cleaned = (data.text || "").replace(/[^a-zA-Z0-9]/g, "");
  return cleaned;
}

/**
 * 图片预处理：放大 + 灰度化 + 二值化
 * 提高简单彩色字母验证码的识别率
 */
async function _preprocess(imageBuffer) {
  try {
    const sharp = require("sharp");
    // 放大 3 倍，灰度化，阈值二值化
    const processed = await sharp(imageBuffer)
      .resize({ width: 300, height: 90, fit: "fill" })
      .grayscale()
      .normalize()
      .threshold(140)
      .png()
      .toBuffer();
    return processed;
  } catch {
    // sharp 不可用时返回原图
    return imageBuffer;
  }
}

/**
 * 关闭 worker（进程退出时调用）
 */
async function terminate() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

module.exports = { recognizeCaptcha, terminate };