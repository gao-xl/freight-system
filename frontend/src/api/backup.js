import request from './request';

export const backupConfigAPI = {
  get: () => request.get('/system/backup-config'),
  update: (data) => request.put('/system/backup-config', data),
};

export const createBackup = () => request.post('/system/backup').then((r) => r.data || r);

export const downloadBackup = async (filename) => {
  const res = await request.get(`/system/backup/download/${encodeURIComponent(filename)}`, { responseType: 'blob' });
  return { blob: res.data, filename };
};

export const restoreBackup = (payload) => {
  const fd = new FormData();
  if (payload.filename) fd.append('filename', payload.filename);
  if (payload.file) fd.append('file', payload.file);
  fd.append('scope', payload.scope || 'full');
  if (payload.tables) fd.append('tables', JSON.stringify(payload.tables));
  if (payload.includeUploads !== undefined) fd.append('includeUploads', payload.includeUploads ? '1' : '0');
  return request.post('/system/restore', fd).then((r) => r.data || r);
};

export const listBackups = () => request.get('/system/backup/list').then((r) => r.data || r);

export const deleteBackup = (filename) => request.delete(`/system/backup/${encodeURIComponent(filename)}`);

export const inspectBackup = (payload) => {
  const fd = new FormData();
  if (typeof payload === 'string' || payload instanceof File) {
    fd.append('file', payload);
  } else if (payload.filename) {
    fd.append('filename', payload.filename);
  }
  return request.post('/system/backup/inspect', fd).then((r) => r.data || r);
};