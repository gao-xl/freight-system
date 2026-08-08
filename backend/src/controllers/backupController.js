// 备份 / 恢复 HTTP 端点控制器（AC-22，admin 专属）
//  - POST /api/system/backup              执行备份 → 返回 { filename, size, warnings }
//  - GET  /api/system/backup/download/:filename  下载备份文件（校验文件名防路径穿越）
//  - POST /api/system/restore             上传 tar.gz → 预检(dry-run) → 快照 → 替换
const fs = require('fs');
const { ok, fail, asyncHandler } = require('../utils/response');
const { createApiBackup, restoreApiArchive, resolveBackupFile } = require('../services/backupRestoreService');

/**
 * @openapi
 * /api/system/backup:
 *   post:
 *     tags: [系统]
 *     summary: 一键备份（生成 tar.gz）
 *     description: |
 *       复用 scripts/backup.js 逻辑，将 data/、uploads/、运行配置打包为单个 tar.gz。
 *       返回备份文件名与大小，前端可据此调用 GET /api/system/backup/download/:filename 下载。
 *       业务数据位于外部 PostgreSQL 时需另行用 pg_dump 备份（返回的 warnings 会提示）。
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

/**
 * @openapi
 * /api/system/backup/download/{filename}:
 *   get:
 *     tags: [系统]
 *     summary: 下载备份文件
 *     description: 仅允许下载 backup / prerestore 产出的 tar.gz（文件名白名单校验，防路径穿越）。
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: 备份文件流
 *       '401':
 *         description: 未登录或凭证无效
 *       '403':
 *         description: 无 admin 权限
 *       '404':
 *         description: 备份文件不存在
 */
const download = asyncHandler(async (req, res) => {
  const abs = resolveBackupFile(req.params.filename);
  if (!abs) return fail(res, '备份文件不存在或文件名不合法', 1, 404);
  res.download(abs);
});

/**
 * @openapi
 * /api/system/restore:
 *   post:
 *     tags: [系统]
 *     summary: 从备份恢复（预检 → 快照 → 替换）
 *     description: |
 *       multipart/form-data 上传 backup 产出的 tar.gz（字段名 file）。
 *       流程与 scripts/restore.js 一致：先预检归档完整性与 manifest，恢复前自动生成
 *       freight-prerestore-*.tar.gz 快照，再替换 data/ 与 uploads/；不覆盖当前 .env（防密钥替换）。
 *       传 ?dryRun=1 或 body.dryRun=true 时仅预检不落盘，供前端二次确认。
 *       恢复完成后需重启后端使数据生效。
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               dryRun: { type: boolean }
 *     responses:
 *       '200':
 *         description: 恢复/预检结果
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
 *                         ok: { type: boolean }
 *                         dryRun: { type: boolean }
 *                         message: { type: string }
 *                         details: { type: object }
 *       '400':
 *         description: 未上传文件或归档不合法
 *       '401':
 *         description: 未登录或凭证无效
 *       '403':
 *         description: 无 admin 权限
 */
const restore = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, '请上传备份文件（tar.gz）', 1, 400);
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || (req.body && req.body.dryRun === true);
  try {
    const result = await restoreApiArchive(req.file.path, { dryRun });
    if (!result.ok) return fail(res, result.message, 1, 400);
    ok(res, result, result.message);
  } finally {
    // 清理上传的临时文件
    try { fs.rmSync(req.file.path, { force: true }); } catch (e) { /* ignore */ }
  }
});

module.exports = { backup, download, restore };
