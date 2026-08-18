const { Op } = require('sequelize');
const { HsCode } = require('../services/dataAccess');
const { ok, asyncHandler } = require('../utils/response');

// 搜索HS编码
const search = asyncHandler(async (req, res) => {
  const { q, chapter } = req.query;
  const where = {};
  if (q) {
    where[Op.or] = [
      { code: { [Op.like]: `%${q}%` } },
      { name: { [Op.like]: `%${q}%` } },
    ];
  }
  if (chapter) where.chapter = chapter;
  const rows = await HsCode.findAll({
    where,
    order: [['isCommon', 'DESC'], ['code', 'ASC']],
    limit: 50,
  });
  ok(res, rows);
});

// 按章节浏览
const chapters = asyncHandler(async (req, res) => {
  const rows = await HsCode.findAll({
    attributes: ['chapter', [HsCode.sequelize.fn('COUNT', HsCode.sequelize.col('id')), 'cnt']],
    group: ['chapter'],
    order: [['chapter', 'ASC']],
    raw: true,
  });
  ok(res, rows.map((r) => ({ chapter: r.chapter, count: Number(r.cnt) })));
});

module.exports = { search, chapters };