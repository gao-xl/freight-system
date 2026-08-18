'use strict';

// P2-2 海关单一窗口对接服务
// 职责：
//   1. submitDeclaration  - 组装报关申报报文并经网关推送单一窗口/海关QP，成功后回写状态
//   2. queryDeclaration   - 查询单票报关状态
//   3. applyReceipt       - 处理单一窗口入站回执（由网关回调调用），自动同步报关状态
//   4. mapSwStatus        - 外部回执状态 → 系统 CustomsDeclaration 枚举
//
// 报文/回执均经 EdiMessage 留痕；状态流转通过 eventBus 广播，供通知/流程联动。

const { CustomsDeclaration, Order, Supplier } = require('../services/dataAccess');
const gateway = require('./integrationGateway');
const eventBus = require('./eventBus');
const { logger } = require('../utils/logger');

const SW_STATUS_MAP = {
  accepted: 'submitted',       // 审单通过
  submitted: 'submitted',
  inspection: 'inspecting',    // 布控查验
  inspecting: 'inspecting',
  checked: 'inspecting',
  released: 'released',        // 放行
  release: 'released',
  rejected: 'rejected',        // 退单
  return: 'rejected',
  unaccepted: 'rejected',
  closed: 'closed',            // 结关
  cancelled: 'closed',
};

function mapSwStatus(raw) {
  const v = String(raw || '').toLowerCase();
  return SW_STATUS_MAP[v] || null;
}

// 组装申报报文（当前仅 export_clearance/inspection 走单一窗口申报链路）
async function buildDeclarationPayload(decl) {
  const order = await Order.findByPk(decl.orderId, {
    include: [{ model: Supplier, as: 'supplier', attributes: ['id', 'code', 'name'] }],
  });
  return {
    declNo: decl.declNo,
    type: decl.type,
    status: decl.status,
    hsCode: decl.hsCode,
    customsValue: Number(decl.customsValue) || 0,
    taxAmount: Number(decl.taxAmount) || 0,
    remark: decl.remark || '',
    order: order ? {
      id: order.id,
      orderNo: order.orderNo,
      type: order.type,
      mode: order.mode,
      serviceType: order.serviceType,
      originPort: order.originPort,
      destPort: order.destPort,
      cargoDesc: order.cargoDesc,
      cargoWeight: Number(order.cargoWeight) || 0,
      cargoVolume: Number(order.cargoVolume) || 0,
      packageCount: order.packageCount || 0,
      containerNo: order.containerNo,
      currency: order.currency,
      totalAmount: Number(order.totalAmount) || 0,
    } : null,
    supplier: order && order.supplier ? { id: order.supplier.id, code: order.supplier.code, name: order.supplier.name } : null,
  };
}

// 推送报关申报 → 单一窗口
async function submitDeclaration(declId) {
  const decl = await CustomsDeclaration.findByPk(declId);
  if (!decl) throw new Error(`报关单不存在: ${declId}`);
  if (decl.status !== 'prepared') throw new Error(`仅 prepared 状态的报关单可申报（当前 ${decl.status}）`);

  const payload = await buildDeclarationPayload(decl);
  const result = await gateway.send('customs', payload, {
    messageType: 'DECL_SUBMIT',
    refNo: decl.declNo,
    idemKey: `decl-submit-${decl.id}`,
  });

  // 回写：海关回执编号 + 提交状态/时间。报文返回的 customsNo/受理号回填。
  const remote = (result.data && (result.data.data || result.data)) || {};
  const customsNo = remote.customsNo || remote.billNo || remote.acceptNo || null;
  await decl.update({
    status: 'submitted',
    customsNo: customsNo || decl.customsNo,
    submitDate: new Date(),
  });
  eventBus.emit('customs.submitted', {
    declId: decl.id, declNo: decl.declNo, orderId: decl.orderId, customsNo,
  });
  return { ...result, synced: { status: 'submitted', customsNo } };
}

// 查询单票报关状态
async function queryDeclaration(declId) {
  const decl = await CustomsDeclaration.findByPk(declId);
  if (!decl) throw new Error(`报关单不存在: ${declId}`);
  const result = await gateway.query('customs', { declNo: decl.declNo }, {
    messageType: 'DECL_STATUS',
    refNo: decl.declNo,
    idemKey: `decl-query-${decl.id}`,
  });
  const remote = (result.data && (result.data.data || result.data)) || {};
  if (remote.status) {
    const mapped = mapSwStatus(remote.status);
    if (mapped && mapped !== decl.status) {
      const patch = { status: mapped };
      if (mapped === 'released') patch.releaseDate = new Date();
      if (remote.inspectionResult) patch.inspectionResult = String(remote.inspectionResult);
      if (remote.releaseDate) patch.releaseDate = remote.releaseDate;
      if (remote.customsNo) patch.customsNo = String(remote.customsNo);
      await decl.update(patch);
      eventBus.emit('customs.status', {
        declId: decl.id, declNo: decl.declNo, orderId: decl.orderId, from: decl.status, to: mapped,
      });
    }
  }
  return result;
}

// 应用单一窗口入站回执（网关回调调用）
// receipt: { declNo, status, customsNo, inspectionResult, releaseDate, messageTime }
async function applyReceipt(receipt) {
  if (!receipt || !receipt.declNo) throw new Error('回执缺少 declNo');
  const decl = await CustomsDeclaration.findOne({ where: { declNo: receipt.declNo } });
  if (!decl) throw new Error(`未找到报关单 ${receipt.declNo}`);

  const mapped = mapSwStatus(receipt.status);
  const patch = {};
  if (mapped) patch.status = mapped;
  if (receipt.customsNo) patch.customsNo = String(receipt.customsNo);
  if (receipt.inspectionResult) patch.inspectionResult = String(receipt.inspectionResult);
  if (receipt.releaseDate) patch.releaseDate = receipt.releaseDate;
  if (mapped === 'released' && !patch.releaseDate) patch.releaseDate = new Date();

  if (Object.keys(patch).length === 0) {
    return { declId: decl.id, declNo: decl.declNo, unchanged: true, receivedStatus: receipt.status };
  }

  const prevStatus = decl.status;
  await decl.update(patch);
  const to = mapped || prevStatus;

  // 广播事件：状态变更 → 通知/流程节点联动
  eventBus.emit('customs.status', {
    declId: decl.id, declNo: decl.declNo, orderId: decl.orderId,
    from: prevStatus, to,
    inspectionResult: receipt.inspectionResult || null,
    releaseDate: patch.releaseDate || decl.releaseDate || null,
  });
  return { declId: decl.id, declNo: decl.declNo, status: to, from: prevStatus, updated: true };
}

module.exports = { submitDeclaration, queryDeclaration, applyReceipt, mapSwStatus, buildDeclarationPayload };