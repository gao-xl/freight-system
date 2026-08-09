// 通用 blob 下载工具（E3 门户：账单/提单 PDF 下载）
// 文件名优先解析 Content-Disposition，缺失时回退默认名。

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
export function downloadBlob(resp, fallbackName) {
  const name = parseContentDisposition(resp?.headers?.['content-disposition'], fallbackName);
  saveBlob(resp.data, name);
  return name;
}
