// EDI 传输层：支持 FTP/SFTP/HTTP-VAN/邮箱等通道
// 真实环境需配置对接方传输参数；未配置时返回模拟成功。
const { IntegrationClient } = require('../integrations');

// 发送 EDI 报文到指定通道
async function send({ channel = 'edi', message, destination }) {
  const client = await IntegrationClient.get(channel);
  if (!client.cfg || !client.cfg.enabled) {
    // 未启用：模拟发送成功，便于联调
    return { ok: true, simulated: true, message: 'EDI 传输通道未启用，已模拟发送', length: String(message).length };
  }
  try {
    const result = await client.send({ message, destination });
    return { ok: true, simulated: false, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 接收 EDI 报文
async function receive({ channel = 'edi' }) {
  const client = await IntegrationClient.get(channel);
  if (!client.cfg || !client.cfg.enabled) {
    return { ok: true, simulated: true, messages: [] };
  }
  return client.query({ action: 'receive' });
}

module.exports = { send, receive };