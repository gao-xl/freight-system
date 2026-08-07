const { Supplier, User } = require('../models');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler, genCode } = require('../utils/response');
const { parseExcel, buildTemplate, cleanStr } = require('../services/importService');

const base = crudController({
  model: Supplier,
  searchFields: ['code', 'name', 'contact', 'phone', 'category'],
  codePrefix: 'SUP',
  codeField: 'code',
  order: [['id', 'DESC']],
  scoped: true,
});

// Excel 批量导入供应商：POST /suppliers/import（multipart，字段 file）
const SUPPLIER_HEADERS = [
  { key: 'name', header: '供应商名称', required: true },
  { key: 'code', header: '编码（留空自动生成）', required: false },
  { key: 'category', header: '类别(carrier/airline/customs_broker/truck/warehouse/other)', required: false },
  { key: 'contact', header: '联系人', required: false },
  { key: 'phone', header: '电话', required: false },
  { key: 'email', header: '邮箱', required: false },
  { key: 'address', header: '地址', required: false },
  { key: 'ports', header: '主营航线/港口', required: false },
  { key: 'contractNo', header: '合同号', required: false },
  { key: 'paymentTerms', header: '付款条件', required: false },
  { key: 'remark', header: '备注', required: false },
];

const importExcel = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, '请上传 Excel 文件', 1, 400);
  const rows = parseExcel(req.file.buffer);
  if (!rows.length) return fail(res, '文件中没有数据', 1, 400);
  const created = [], errors = [];
  // 归属：导入的供应商统一归属到当前用户默认组/本人
  const me = await User.findByPk(req.user.id);
  const defaultGroupId = me?.groupId || null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = cleanStr(r['供应商名称']);
    if (!name) { errors.push(`第 ${i + 2} 行：缺少供应商名称`); continue; }
    const category = cleanStr(r['类别(carrier/airline/customs_broker/truck/warehouse/other)']);
    try {
      const s = await Supplier.create({
        name,
        code: cleanStr(r['编码（留空自动生成）']) || genCode('SUP'),
        category: ['carrier', 'airline', 'customs_broker', 'truck', 'warehouse', 'other'].includes(category) ? category : 'carrier',
        contact: cleanStr(r['联系人']),
        phone: cleanStr(r['电话']),
        email: cleanStr(r['邮箱']),
        address: cleanStr(r['地址']),
        ports: cleanStr(r['主营航线/港口']),
        contractNo: cleanStr(r['合同号']),
        paymentTerms: cleanStr(r['付款条件']),
        remark: cleanStr(r['备注']),
        status: 'active',
        groupId: defaultGroupId,
        ownerId: req.user.id,
      });
      created.push(s.id);
    } catch (e) {
      errors.push(`第 ${i + 2} 行：${e.message}`);
    }
  }
  ok(res, { created: created.length, failed: errors.length, errors }, `成功导入 ${created.length} 条，失败 ${errors.length} 条`);
});

// 下载供应商导入模板：GET /suppliers/import-template
const importTemplate = asyncHandler(async (req, res) => {
  const buf = buildTemplate(SUPPLIER_HEADERS, '供应商导入');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="supplier-import-template.xlsx"');
  res.send(Buffer.from(buf));
});

module.exports = { ...base, importExcel, importTemplate };