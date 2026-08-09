// 备份 / 恢复 HTTP 端点控制器（AC-22，admin 专属）
//  - POST   /api/system/backup               执行备份 → 返回 { filename, size, warnings }
//  - GET    /api/system/backup/list          列出服务器上的备份
//  - DELETE /api/system/backup/:filename     删除服务器上的备份
//  - POST   /api/system/backup/inspect       检查备份内容（服务器备份 {filename} 或上传文件 file）
//  - GET    /api/system/backup/download/:filename   下载备份文件（校验文件名防路径穿越）
//  - POST   /api/system/restore              全量/部分恢复（备份来源：服务器 filename 或上传 file）
const fs = require('fs');
const { ok, fail, asyncHandler } = require('../utils/response');
const {
  createApiBackup,
  restoreApiArchive,
  resolveBackupFile,
  listServerBackups,
  deleteServerBackup,
  inspectBackup,
} = require('../services/backupRestoreService');

/**
 * @openapi
 * /api/system/backup:
 *   post:
 *     tags: [系统]
 *     summary: 一键备份（生成 tar.gz）
 *     description: |
 *       复用 scripts/backup.js 逻辑，将 data/、uploads/、运行配置打包为单个 tar.gz。
 *       返回备份文件名与大小，前端可据此调用 GET /api/system/backup/download/:filename 下载。
 *       业务库（PostgreSQL）在 pg_dump 可用时一并转储进归档。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 备份完成，返回元数据
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         filename: { type: string }
 *                         size: { type: integer }
 *                         warnings: { type: array, items: { type: string } }
 *       '401':
 *         description: 未登录或凭证无效
 *       '403':
 *         description: 无 admin 权限
 */
const backup = asyncHandler(async (req, res) => {
  const r = await createApiBackup();
  ok(res, { filename: r.filename, size: r.size, warnings: r.warnings }, '备份已生成');
});

/** 列出服务器上的备份文件 */
const list = asyncHandler(async (req, res) => {
  ok(res, { items: listServerBackups() }, '备份列表');
});

/** 删除服务器上的备份文件 */
const remove = asyncHandler(async (req, res) => {
  const r = deleteServerBackup(req.params.filename);
  if (!r.ok) return fail(res, r.message, 1, 404);
  ok(res, { filename: r.filename }, '备份已删除');
});

/**
 * 检查备份内容：解析 manifest + 数据库表清单（按业务模块聚类）。
 * 支持两种入参：JSON { filename }（服务器备份）或 multipart file（上传的备份）。
 */
const inspect = asyncHandler(async (req, res) => {
  let archivePath = null;
  let tmp = null;
  if (req.file) {
    tmp = req.file.path;
    archivePath = tmp;
  } else if (req.body && req.body.filename) {
    archivePath = resolveBackupFile(req.body.filename);
    if (!archivePath) return fail(res, '服务器上不存在该备份文件', 1, 404);
  } else {
    return fail(res, '请提供备份文件名或上传备份文件', 1, 400);
  }
  try {
    const r = await inspectBackup(archivePath);
    if (!r.ok) return fail(res, r.message, 1, 400);
    ok(res, { details: r.details }, '备份内容检查完成');
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { force: true }); } catch (e) { /* ignore */ } }
  }
});

/** 下载备份文件 */
const download = asyncHandler(async (req, res) => {
  const abs = resolveBackupFile(req.params.filename);
  if (!abs) return fail(res, '备份文件不存在或文件名不合法', 1, 404);
  res.download(abs);
});

/**
 * 全量 / 部分恢复。
 * 入参（multipart，字段 file 可选）：
 *   - filename: 服务器备份文件名（与 file 二选一）
 *   - file:     上传的备份 tar.gz（可选）
 *   - scope:    'full' | 'partial'（默认 full）
 *   - tables:   部分恢复选择的表名 JSON 数组（scope=partial 时）
 *   - includeData / includeUploads: '1'/'true' 是否覆盖对应文件分区
 *   - dryRun:   '1'/'true' 仅预检不落盘
 */
const restore = asyncHandler(async (req, res) => {
  let archivePath = null;
  let tmp = null;
  if (req.file) {
    tmp = req.file.path;
    archivePath = tmp;
  } else if (req.body && req.body.filename) {
    archivePath = resolveBackupFile(req.body.filename);
    if (!archivePath) return fail(res, '服务器上不存在该备份文件', 1, 404);
  } else {
    return fail(res, '请选择要恢复的备份（服务器备份或上传文件）', 1, 400);
  }

  const dryRun = /^(1|true)$/i.test((req.query.dryRun || req.body?.dryRun || '').toString());
  const scope = req.body?.scope === 'partial' ? 'partial' : 'full';
  let tables = [];
  if (scope === 'partial' && req.body?.tables) {
    try {
      tables = typeof req.body.tables === 'string' ? JSON.parse(req.body.tables) : req.body.tables;
    } catch (e) {
      if (tmp) { try { fs.rmSync(tmp, { force: true }); } catch (e2) { /* ignore */ } }
      return fail(res, 'tables 参数格式错误（应为 JSON 数组）', 1, 400);
    }
  }
  const includeData = req.body?.includeData !== '0' && req.body?.includeData !== 'false';
  const includeUploads = req.body?.includeUploads !== '0' && req.body?.includeUploads !== 'false';

  try {
    const result = await restoreApiArchive(archivePath, {
      dryRun,
      scope,
      tables,
      includeData,
      includeUploads,
    });
    if (!result.ok) return fail(res, result.message, 1, 400);
    ok(res, result, result.message);
  } catch (e) {
    return fail(res, e.message, 1, 500);
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { force: true }); } catch (e) { /* ignore */ } }
  }
});

module.exports = { backup, list, remove, inspect, download, restore };