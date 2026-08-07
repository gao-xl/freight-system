// EDIFACT 报表构建器
// 从业务对象生成 IFTMBF（订舱确认）等标准报文。

const SEGMENT_TERM = "'";
const ELEMENT_SEP = '+';
const COMPONENT_SEP = ':';

function escape(v) {
  return String(v == null ? '' : v).replace(/([+\:?'])/g, '?$1');
}

function seg(tag, elements) {
  // elements: 二维数组 [[comp1,comp2], el2]
  const parts = [tag];
  for (const el of elements) {
    const comps = Array.isArray(el) ? el.map(escape) : [escape(el)];
    parts.push(comps.join(COMPONENT_SEP));
  }
  return parts.join(ELEMENT_SEP) + SEGMENT_TERM;
}

// 构建 IFTMBF 订舱确认报文
function buildIFTMBF({ refNo, sender, receiver, bookingNo, orderNo, containerNo, vesselName, voyageNo, originPort, destPort, cargoDesc }) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').slice(0, 12);
  let out = '';
  out += seg('UNB', [['UNOC', '3'], sender, receiver, [timestamp, `${now.getTime()}`], ['IFTMBF']]);
  out += seg('UNH', [refNo || '1', ['IFTMIN', 'D', '95A', 'UN']]);
  out += seg('BGM', [['700', '1'], ['900', bookingNo || '']]);
  out += seg('DTM', [['137'], timestamp]);
  if (orderNo) out += seg('RFF', [['AEO', orderNo]]);
  if (containerNo) out += seg('EQD', [['CN'], containerNo]);
  if (vesselName) out += seg('NAD', [['CA'], '', vesselName]);
  if (voyageNo) out += seg('TDT', [['20'], '', '', '', voyageNo]);
  if (originPort) out += seg('LOC', [['9', originPort]]);
  if (destPort) out += seg('LOC', [['11', destPort]]);
  if (cargoDesc) out += seg('FTX', [['AAA'], '', '', cargoDesc]);
  out += seg('UNT', [['0'], refNo || '1']);
  out += seg('UNZ', [['1'], `${now.getTime()}`]);
  return out;
}

module.exports = { buildIFTMBF, seg };