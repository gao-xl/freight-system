const { Op } = require('sequelize');
const { HsCode } = require('../services/dataAccess');
const { ok, asyncHandler } = require('../utils/response');
const { readThrough } = require('../services/readCache');

// HS 知识库变更低频，检索为高频只读，走 cache-aside 缓存 24h
const HS_CACHE_TTL = 24 * 60 * 60;

// 搜索HS编码
const search = asyncHandler(async (req, res) => {
  const { q = '', chapter = '' } = req.query;
  const where = {};
  if (q) {
    where[Op.or] = [
      { code: { [Op.like]: `%${q}%` } },
      { name: { [Op.like]: `%${q}%` } },
    ];
  }
  if (chapter) where.chapter = chapter;
  const rows = await readThrough(req, 'hscode', `search:${q}:${chapter}`, HS_CACHE_TTL, () =>
    HsCode.findAll({
      where,
      order: [['isCommon', 'DESC'], ['code', 'ASC']],
      limit: 50,
    }),
  );
  ok(res, rows);
});

// 按章节浏览
const chapters = asyncHandler(async (req, res) => {
  const rows = await readThrough(req, 'hscode', 'chapters', HS_CACHE_TTL, () =>
    HsCode.findAll({
      attributes: ['chapter', [HsCode.sequelize.fn('COUNT', HsCode.sequelize.col('id')), 'cnt']],
      group: ['chapter'],
      order: [['chapter', 'ASC']],
      raw: true,
    }).then((r) => r.map((x) => ({ chapter: x.chapter, count: Number(x.cnt) }))),
  );
  ok(res, rows);
});

module.exports = { search, chapters };