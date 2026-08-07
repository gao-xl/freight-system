// EDIFACT 报文解析器
// 支持 UN/EDIFACT 标准报文（IFTMBF 订舱、IFTSTA 状态、IFTMIN 指令等）。
// 分隔符：段结束 "'"、数据元 "+"、复合元 ":"、转义 "?"。

const SEGMENT_TERM = "'";
const ELEMENT_SEP = '+';
const COMPONENT_SEP = ':';
const ESCAPE = '?';

// 解析一段报文字符串为段数组
function parse(raw) {
  const segments = [];
  const cleaned = String(raw || '').replace(/\r\n|\r|\n/g, '');
  const parts = cleaned.split(SEGMENT_TERM).filter((p) => p.trim());
  for (const part of parts) {
    const seg = part.trim();
    if (!seg) continue;
    const [tag, ...elements] = seg.split(ELEMENT_SEP);
    segments.push({
      tag: tag.trim(),
      elements: elements.map((e) => e.split(COMPONENT_SEP).map((c) => unescape(c))),
    });
  }
  return { segments, header: parseHeader(segments) };
}

function unescape(v) {
  return String(v).replace(/\?([+\:?'])/g, '$1');
}

// 提取 UNH/UNB 头部信息
function parseHeader(segments) {
  const header = {};
  const unh = segments.find((s) => s.tag === 'UNH');
  const unb = segments.find((s) => s.tag === 'UNB');
  if (unh) {
    header.refNo = unh.elements[0]?.[0];
    header.messageType = unh.elements[1]?.[0];
    header.version = unh.elements[1]?.[1];
  }
  if (unb) {
    header.sender = unb.elements[1]?.[0];
    header.receiver = unb.elements[2]?.[0];
    header.controlRef = unb.elements[4]?.[0];
  }
  return header;
}

// 便捷：按段标签取值
function getSegment(segments, tag) {
  return segments.find((s) => s.tag === tag);
}

module.exports = { parse, getSegment, parseHeader };