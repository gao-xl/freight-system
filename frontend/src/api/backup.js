// 系统备份/恢复 API 封装（AC-22）
// 契约（与 be-onboarding backupController 对齐）：
//   POST /api/system/backup                    → { filename, size, warnings }（JSON 元数据）
//   GET  /api/system/backup/download/:filename → 备份文件流（.tar.gz）
//   POST /api/system/restore                   → multipart(file) 恢复（支持 ?dryRun=1 预检）
// fail-open：端点未就绪（后端开发中）→ 调用方捕获 404 后禁用并提示"备份服务初始化中"，不弹错不阻塞。
import axios from 'axios';

const silent = axios.create({ baseURL: '/api', timeout: 60000 });
silent.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
silent.interceptors.response.use(
  (response) => {
    // blob 响应（备份下载）保留完整响应，便于读取 Content-Disposition 文件名
    if (response.config.responseType === 'blob') return response;
    const res = response.data;
    if (res && typeof res === 'object' && 'code' in res) {
      if (res.code === 0) return res.data;
      return Promise.reject(new Error(res.message || '请求失败'));
    }
    return res;
  },
  (error) => Promise.reject(error)
);

// 生成备份：POST /api/system/backup → { filename, size, warnings }
export function createBackup() {
  return silent.post('/system/backup', null, { timeout: 120000 });
}

// 下载备份文件：GET /api/system/backup/download/:filename → { blob, filename }
export async function downloadBackup(filename) {
  const response = await silent.get(`/system/backup/download/${encodeURIComponent(filename)}`, {
    responseType: 'blob',
    timeout: 120000,
  });
  const disposition = response.headers?.['content-disposition'] || '';
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"/i.exec(disposition) || /filename=([^;]+)/i.exec(disposition);
  const name = match
    ? decodeURIComponent(match[1].replace(/"/g, '').trim())
    : filename;
  return { blob: response.data, filename: name };
}

// 上传备份文件恢复（multipart，字段名 file）
export function restoreBackup(file) {
  const form = new FormData();
  form.append('file', file);
  return silent.post('/system/restore', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
}
