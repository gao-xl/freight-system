// 通用 blob 下载工具（E3 门户：账单/提单 PDF 下载）
// 文件名优先解析 Content-Disposition，缺失时回退默认名。

import { ElMessage } from 'element-plus';

// 解析 Content-Disposition 文件名（兼容 filename*=UTF-8'' 与 filename="..." 两种写法）
export function parseContentDisposition(disposition, fallback) {
  if (!disposition) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) {
    try { return decodeURIComponent(star[1].replace(/"/g, '')); } catch { /* 转码失败走下方兜底 */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].replace(/"/g, '') : fallback;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 统一下载：resp 为 axios 完整响应（responseType: 'blob'），返回实际保存的文件名
// 若后端返回的是 JSON 错误（如 PDF 功能关闭的 503），则提示而非下载错误文件
export async function downloadBlob(resp, fallbackName) {
  const type = resp?.data?.type || '';
  const isJson = typeof type === 'string' && type.includes('application/json');
  if (isJson) {
    try {
      const text = await resp.data.text();
      const json = JSON.parse(text);
      ElMessage.error(json?.message || '下载失败');
    } catch (e) {
      ElMessage.error('下载失败');
    }
    return null;
  }
  const name = parseContentDisposition(resp?.headers?.['content-disposition'], fallbackName);
  saveBlob(resp.data, name);
  return name;
}
