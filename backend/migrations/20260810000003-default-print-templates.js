'use strict';

/** 插入默认打印模板（提单、费用通知、对账单、装箱单） */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查是否已存在同类型默认模板
    const existing = await queryInterface.sequelize.query(
      `SELECT docType FROM "PrintTemplates" WHERE isDefault = true AND docType IN ($1, $2, $3, $4)`,
      { bind: ['bl', 'debit_note', 'statement', 'packing_list'], type: Sequelize.QueryTypes.SELECT },
    );

    const existingDocTypes = new Set(existing.map((r) => r.docType));

    const now = new Date();

    // ================================================================ 标准提单
    const blTemplate = {
      name: '标准提单',
      docType: 'bl',
      isDefault: true,
      pageSize: 'A4',
      content: JSON.stringify({
        blocks: [
          { type: 'header', content: 'BILL OF LADING', style: { fontSize: 18, bold: true, align: 'center' } },
          { type: 'line' },
          { type: 'field', label: '提单号', key: 'blNo', width: 33 },
          { type: 'field', label: '订舱号', key: 'bookingNo', width: 33 },
          { type: 'field', label: '船名航次', key: 'vesselVoyage', width: 34 },
          { type: 'field', label: '起运港', key: 'portOfLoading', width: 33 },
          { type: 'field', label: '目的港', key: 'portOfDischarge', width: 33 },
          { type: 'field', label: '交货地', key: 'placeOfDelivery', width: 34 },
          { type: 'field', label: '发货人', key: 'shipper', width: 100 },
          { type: 'field', label: '收货人', key: 'consignee', width: 100 },
          { type: 'field', label: '通知方', key: 'notifyParty', width: 100 },
          { type: 'field', label: '箱号/封号', key: 'containerSeal', width: 100 },
          { type: 'field', label: '品名', key: 'cargoDescription', width: 100 },
          { type: 'field', label: '件数/毛重/体积', key: 'packagesGwVolume', width: 100 },
          { type: 'field', label: '运费支付方式', key: 'freightPayment', width: 50 },
          { type: 'field', label: '提单签发地', key: 'placeOfIssue', width: 50 },
          { type: 'field', label: '签发日期', key: 'issueDate', width: 50 },
          { type: 'line' },
          { type: 'footer', content: '本提单一式两份，具有同等法律效力', style: { fontSize: 10, align: 'center' } },
        ],
        page: { size: 'A4', orientation: 'portrait', margin: { top: 20, bottom: 20, left: 15, right: 15 } },
      }),
      createdAt: now,
      updatedAt: now,
    };

    // ================================================================ 标准费用通知
    const debitNoteTemplate = {
      name: '标准费用通知',
      docType: 'debit_note',
      isDefault: true,
      pageSize: 'A4',
      content: JSON.stringify({
        blocks: [
          { type: 'header', content: 'DEBIT NOTE', style: { fontSize: 18, bold: true, align: 'center' } },
          { type: 'line' },
          { type: 'field', label: '编号', key: 'noteNo', width: 33 },
          { type: 'field', label: '日期', key: 'noteDate', width: 33 },
          { type: 'field', label: '客户', key: 'customerName', width: 34 },
          { type: 'field', label: '订单号', key: 'orderNo', width: 50 },
          { type: 'field', label: '船名航次', key: 'vesselVoyage', width: 50 },
          { type: 'line' },
          {
            type: 'table',
            columns: [
              { label: '费用项目', key: 'chargeItem', width: 25 },
              { label: '币种', key: 'currency', width: 10 },
              { label: '应收金额', key: 'receivable', width: 20 },
              { label: '应付金额', key: 'payable', width: 20 },
              { label: '备注', key: 'remark', width: 25 },
            ],
          },
          { type: 'line' },
          { type: 'field', label: '合计（应收）', key: 'totalReceivable', width: 50 },
          { type: 'field', label: '合计（应付）', key: 'totalPayable', width: 50 },
          { type: 'field', label: '付款期限', key: 'paymentTerms', width: 50 },
          { type: 'field', label: '收款账户', key: 'bankAccount', width: 50 },
          { type: 'line' },
          { type: 'footer', content: '请于付款期限内安排付款，逾期将按约定收取滞纳金', style: { fontSize: 10, align: 'center' } },
        ],
        page: { size: 'A4', orientation: 'portrait', margin: { top: 20, bottom: 20, left: 15, right: 15 } },
      }),
      createdAt: now,
      updatedAt: now,
    };

    // ================================================================ 标准对账单
    const statementTemplate = {
      name: '标准对账单',
      docType: 'statement',
      isDefault: true,
      pageSize: 'A4',
      content: JSON.stringify({
        blocks: [
          { type: 'header', content: 'STATEMENT', style: { fontSize: 18, bold: true, align: 'center' } },
          { type: 'line' },
          { type: 'field', label: '对账编号', key: 'statementNo', width: 33 },
          { type: 'field', label: '账期', key: 'period', width: 33 },
          { type: 'field', label: '客户', key: 'customerName', width: 34 },
          { type: 'field', label: '生成日期', key: 'generatedDate', width: 100 },
          { type: 'line' },
          {
            type: 'table',
            columns: [
              { label: '订单号', key: 'orderNo', width: 15 },
              { label: '费用项目', key: 'chargeItem', width: 20 },
              { label: '币种', key: 'currency', width: 8 },
              { label: '应收', key: 'receivable', width: 12 },
              { label: '应付', key: 'payable', width: 12 },
              { label: '已收付', key: 'paid', width: 12 },
              { label: '余额', key: 'balance', width: 12 },
            ],
          },
          { type: 'line' },
          { type: 'field', label: '应收合计', key: 'totalReceivable', width: 33 },
          { type: 'field', label: '应付合计', key: 'totalPayable', width: 33 },
          { type: 'field', label: '余额', key: 'totalBalance', width: 34 },
          { type: 'line' },
          { type: 'footer', content: '本对账单为双方财务核对依据，如有异议请于7日内联系财务部', style: { fontSize: 10, align: 'center' } },
        ],
        page: { size: 'A4', orientation: 'landscape', margin: { top: 20, bottom: 20, left: 15, right: 15 } },
      }),
      createdAt: now,
      updatedAt: now,
    };

    // ================================================================ 标准装箱单
    const packingListTemplate = {
      name: '标准装箱单',
      docType: 'packing_list',
      isDefault: true,
      pageSize: 'A4',
      content: JSON.stringify({
        blocks: [
          { type: 'header', content: 'PACKING LIST', style: { fontSize: 18, bold: true, align: 'center' } },
          { type: 'line' },
          { type: 'field', label: '装箱单号', key: 'packingListNo', width: 33 },
          { type: 'field', label: '日期', key: 'listDate', width: 33 },
          { type: 'field', label: '发货人', key: 'shipper', width: 34 },
          { type: 'field', label: '收货人', key: 'consignee', width: 50 },
          { type: 'field', label: '船名航次', key: 'vesselVoyage', width: 50 },
          { type: 'field', label: '起运港', key: 'portOfLoading', width: 50 },
          { type: 'field', label: '目的港', key: 'portOfDischarge', width: 50 },
          { type: 'line' },
          {
            type: 'table',
            columns: [
              { label: '唛头', key: 'marks', width: 15 },
              { label: '品名', key: 'cargoDescription', width: 25 },
              { label: '件数', key: 'packages', width: 12 },
              { label: '包装', key: 'packingType', width: 12 },
              { label: '毛重(KG)', key: 'grossWeight', width: 15 },
              { label: '体积(CBM)', key: 'volume', width: 12 },
            ],
          },
          { type: 'line' },
          { type: 'field', label: '总件数', key: 'totalPackages', width: 33 },
          { type: 'field', label: '总毛重(KG)', key: 'totalGrossWeight', width: 33 },
          { type: 'field', label: '总体积(CBM)', key: 'totalVolume', width: 34 },
        ],
        page: { size: 'A4', orientation: 'portrait', margin: { top: 20, bottom: 20, left: 15, right: 15 } },
      }),
      createdAt: now,
      updatedAt: now,
    };

    // 收集需要插入的模板（跳过已存在的）
    const allTemplates = [blTemplate, debitNoteTemplate, statementTemplate, packingListTemplate];
    const toInsert = allTemplates.filter((t) => !existingDocTypes.has(t.docType));

    if (toInsert.length > 0) {
      await queryInterface.bulkInsert('PrintTemplates', toInsert);
      console.log(`[Migration] 已插入 ${toInsert.length} 个默认打印模板`);
    } else {
      console.log('[Migration] 所有默认打印模板已存在，跳过插入');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DELETE FROM "PrintTemplates" WHERE isDefault = true AND docType IN ($1, $2, $3, $4)`,
      { bind: ['bl', 'debit_note', 'statement', 'packing_list'] },
    );
    console.log('[Migration] 已删除默认打印模板');
  },
};