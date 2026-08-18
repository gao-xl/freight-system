/**
 * ISO 6346 集装箱号校验
 * 格式：4位字母(所有者代码) + 6位数字(序列号) + 1位数字(校验位)
 * 示例：COSU8001234
 */
const CHAR_MAP = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

function validateISO6346(containerNo) {
  if (!containerNo || typeof containerNo !== 'string') return { valid: false, reason: '箱号为空' };
  const no = containerNo.trim().toUpperCase();
  if (!/^[A-Z]{3}U\d{6}\d$/.test(no)) {
    return { valid: false, reason: '箱号格式错误，应为4位字母+7位数字（如 COSU8001234）' };
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = no[i];
    const val = c >= '0' && c <= '9' ? +c : CHAR_MAP[c];
    if (val === undefined) return { valid: false, reason: `无效字符: ${c}` };
    sum += val * Math.pow(2, i);
  }
  const checkDigit = sum % 11 % 10;
  if (checkDigit !== +no[10]) {
    return { valid: false, reason: `校验位不匹配，期望 ${checkDigit}，实际 ${no[10]}` };
  }
  return { valid: true };
}

module.exports = { validateISO6346 };