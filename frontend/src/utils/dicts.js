// 业务字典与状态映射
export const ORDER_STATUS = {
  draft: { text: '草稿', type: 'info' },
  confirmed: { text: '已确认', type: 'primary' },
  in_progress: { text: '进行中', type: 'warning' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'danger' },
};
export const ORDER_TYPE = { import: '进口', export: '出口', transit: '中转' };
export const MODE = { sea: '海运', air: '空运', land: '陆运', rail: '铁路' };
export const SERVICE_TYPE = { fcl: '整箱', lcl: '拼箱', charter: '包船', express: '快件' };

export const BOOKING_STATUS = {
  new: { text: '新订舱', type: 'info' }, confirmed: { text: '已确认', type: 'primary' },
  loading: { text: '装船中', type: 'warning' }, shipped: { text: '已出运', type: 'success' }, cancelled: { text: '已取消', type: 'danger' },
};
export const CUSTOMS_STATUS = {
  prepared: { text: '制作中', type: 'info' }, submitted: { text: '已申报', type: 'primary' },
  inspecting: { text: '查验中', type: 'warning' }, released: { text: '已放行', type: 'success' },
  rejected: { text: '退单', type: 'danger' }, closed: { text: '已结关', type: 'success' },
};
export const DOC_STATUS = {
  draft: { text: '草稿', type: 'info' }, issued: { text: '已签发', type: 'primary' },
  sent: { text: '已寄送', type: 'warning' }, received: { text: '已收妥', type: 'success' }, archived: { text: '已归档', type: 'info' },
};
export const DOC_TYPE = {
  bl: '海运提单', packing_list: '装箱单', invoice: '商业发票',
  certificate_of_origin: '原产地证', insurance: '保险单', other: '其他',
};
// 单证状态机流转（与后端 DOC_FLOW 对应）
export const DOC_FLOW = {
  draft: ['issued', 'archived'],
  issued: ['sent', 'archived'],
  sent: ['received', 'archived'],
  received: ['archived'],
  archived: [],
};
export const TRACK_STAGE = {
  booked: '已订舱', picked_up: '已提货', received: '已收货', loaded: '已装船',
  in_transit: '运输中', arrived: '已到港', cleared: '已清关', delivered: '已送达',
};
export const FIN_DIRECTION = { receivable: { text: '应收', type: 'danger' }, payable: { text: '应付', type: 'success' } };
export const FIN_CATEGORY = {
  ocean_freight: '海运运费', air_freight: '空运运费', local_charge: '本地操作费',
  customs_fee: '报关/关税', document_fee: '单证费', warehouse_fee: '仓储费', transport_fee: '运输费', other: '其他',
};
export const FIN_STATUS = {
  unpaid: { text: '未收/付', type: 'danger' }, partial: { text: '部分', type: 'warning' },
  paid: { text: '已收/付', type: 'success' }, waived: { text: '豁免', type: 'info' },
};
export const CUSTOMER_TYPE = { shipper: '发货人', consignee: '收货人', forwarder: '货代', importer: '进口商', exporter: '出口商', other: '其他' };
export const SUPPLIER_CATEGORY = { carrier: '船公司', airline: '航空公司', customs_broker: '报关行', truck: '车队', warehouse: '仓储', other: '其他' };
export const QUOTATION_STATUS = {
  draft: { text: '草稿', type: 'info' }, sent: { text: '已发送', type: 'primary' },
  confirmed: { text: '已确认', type: 'success' }, converted: { text: '已转订单', type: 'success' },
  expired: { text: '已过期', type: 'warning' }, cancelled: { text: '已取消', type: 'danger' },
};
export const QUO_ITEM_CATEGORY = {
  ocean_freight: '海运运费', air_freight: '空运运费', local_charge: '本地操作费',
  customs_fee: '报关/关税', document_fee: '单证费', warehouse_fee: '仓储费', transport_fee: '运输费', other: '其他',
};
export const QUO_ITEM_DIRECTION = { revenue: '收入', cost: '成本' };

export const dictText = (map, key) => map[key] ?? key;
export const statusOf = (map, key) => map[key] || { text: key, type: 'info' };
export const money = (v, currency = 'USD') => `${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;