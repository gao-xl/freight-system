'use strict';

// SSRF 防护工具：校验出站 URL 的目标地址，阻止访问私有/环回/链路本地网段
// 统一收口所有"以用户可控 URL 作为出站目标"的出口（AI 对接、集成网关等），
// 防止服务端被诱导去探测/攻击内网、云元数据(169.254.169.254)等。
//
// 校验策略：
//   - 仅允许 http/https
//   - 直接 IP：命中私有段直接拒绝
//   - 域名：DNS 解析后对每个解析结果反查一次私有段；含私有即拒绝
//   - 可传入 allowPrivate=true 显式放行（例如内部对接白名单、管理员显式配置的场景）

const net = require('net');
const dns = require('dns').promises;

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // IPv4-mapped (::ffff:x.x.x.x) 转 IPv4 再判
  if (lower.startsWith('::ffff:')) return isPrivateIpv4(lower.slice(7));
  // fc00::/7  唯一本地
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // fe80::/10 链路本地
  if (/^fe[89ab]/.test(lower)) return true;
  // 其它私有/特殊段（2001:db8 文档、ff 组播、冲突段等）从严拦截常见危险段
  if (lower.startsWith('2001:db8:') || lower.startsWith('::ffff:')) return true;
  return false;
}

function isPrivate(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return false;
}

// 取出 URL 主机（剥掉 [ ]）
function hostOf(u) {
  return u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

// 校验出站 URL；通过返回 true，否则抛 Error
// opts: { allowPrivate } —— allowPrivate=true 时跳过私有段拦截（用于内部白名单场景）
async function assertSafeUrl(rawUrl, opts = {}) {
  const url = String(rawUrl || '').trim();
  if (!url) throw new Error('目标 URL 为空');
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error('目标 URL 格式不合法');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('仅支持 http/https 协议');
  }
  const host = hostOf(u);
  if (opts.allowPrivate) return true;

  if (net.isIP(host)) {
    if (isPrivate(host)) {
      throw new Error('目标地址为内网/本机地址，出于安全考虑已拦截');
    }
    return true;
  }

  // 域名：解析并对每个结果为极拦截；任一为私有即拒绝
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`目标域名无法解析: ${host}`);
  }
  if (!addrs || !addrs.length) throw new Error(`目标域名无法解析: ${host}`);
  for (const entry of addrs) {
    const ip = (entry && entry.address) || '';
    if (isPrivate(ip)) {
      throw new Error('目标域名解析到内网地址，出于安全考虑已拦截');
    }
  }
  return true;
}

module.exports = { assertSafeUrl, isPrivate, isPrivateIpv4, isPrivateIpv6 };