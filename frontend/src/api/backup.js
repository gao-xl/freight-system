// 系统备份/恢复 API 封装（AC-22）
// 契约（与备份恢复 backupController 对齐）：
//   POST   /api/system/backup                → { filename, size, warnings }（生成）
//   GET    /api/system/backup/list           → { items: [{ filename, size, sizeText, mtime, kind }] }
//   DELETE /api/system/backup/:filename      → 删除服务器备份
//   POST   /api/system/backup/inspect        → 检查备份内容（{filename} 或 multipart file）
//   GET    /api/system/backup/download/:filename → 备份文件流（.tar.gz）
//   POST   /api/system/restore               → 全量/部分恢复（服务器 filename 或 multipart file）
// fail-open：端点未就绪（后端开发中）→ 调用方捕获 404 后禁用并提示，不弹错不阻塞。
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

// 列出服务器上的备份：GET /api/system/backup/list → { items }
export function listBackups() {
  return silent.get('/system/backup/list');
}

// 删除服务器上的备份：DELETE /api/system/backup/:filename
export function deleteBackup(filename) {
  return silent.delete(`/system/backup/${encodeURIComponent(filename)}`);
}

// 检查备份内容：POST /api/system/backup/inspect（JSON { filename } 或 FormData file）
export function inspectBackup(payload) {
  if (payload instanceof FormData || payload instanceof File) {
    const form = new FormData();
    form.append('file', payload);
    return silent.post('/system/backup/inspect', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  }
  return silent.post('/system/backup/inspect', { filename: payload.filename }, { timeout: 120000 });
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

// 全量/部分恢复（multipart：file 或 filename 二选一，另带 scope/tables/includeData/includeUploads/dryRun）
export function restoreBackup(payload) {
  const form = new FormData();
  if (payload.file) form.append('file', payload.file);
  if (payload.filename) form.append('filename', payload.filename);
  form.append('scope', payload.scope || 'full');
  if (payload.scope === 'partial' && Array.isArray(payload.tables) && payload.tables.length) {
    form.append('tables', JSON.stringify(payload.tables));
  }
  if (payload.includeData === false) form.append('includeData', '0');
  if (payload.includeUploads === false) form.append('includeUploads', '0');
  if (payload.dryRun) form.append('dryRun', '1');
  return silent.post('/system/restore', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
}

// 仅预检（更换新备份预检入口，供前端二次确认）
export function previewRestore(payload) {
  return restoreBackup({ ...payload, dryRun: true });
}