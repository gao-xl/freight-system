// 运维脚本：宕机告警（健康检查 + 连续失败阈值 + 冷却去重 + 恢复通知）
// ---------------------------------------------------------------
// 职责：
//   1. 定时探测后端 /api/health（默认 http://127.0.0.1:3000/api/health）
//   2. 连续失败 OPS_HEALTH_FAIL_THRESHOLD 次才告警（默认 3，避免单次抖动误报）
//   3. 告警冷却：同一故障在冷却期内不重复刷屏（默认 30 分钟）
//   4. 服务恢复后发送恢复通知
//   5. 通过 scripts/lib/notify.js 外发（email / 企微 / webhook，缺配置自动跳过）
//
// 状态持久化：状态文件 ops-healthcheck.state.json 记录「上次告警时间 / 是否处于故障态」，
// 保证 cron 每次独立进程也能跨次去重与恢复通知。
//
// 用法（在 backend 目录执行）：
//   node scripts/ops-healthcheck.js              执行一次健康检查（供 crontab 每 N 分钟调用）
//   node scripts/ops-healthcheck.js --once       同上（显式单次）
//   node scripts/ops-healthcheck.js --reset      清除故障状态（人工确认恢复后使用）
//
// 环境变量：
//   OPS_HEALTH_URL            健康检查地址（默认 http://127.0.0.1:3000/api/health）
//   OPS_HEALTH_TIMEOUT_MS     单次探测超时（默认 5000）
//   OPS_HEALTH_FAIL_THRESHOLD 连续失败多少次后告警（默认 3）
//   OPS_ALERT_COOLDOWN_MIN    告警冷却分钟数（默认 30）
//
// 推荐 crontab（每 5 分钟）：
//   */5 * * * * cd /opt/freight/freight-system/backend && node scripts/ops-healthcheck.js >> logs/ops-healthcheck.log 2>&1
// ---------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { notify } = require('./lib/notify');

const STATE_FILE = path.resolve(__dirname, '..', 'ops-healthcheck.state.json');

function readState() {
  try {
    // 容错：某些编辑器/脚本写入可能带 UTF-8 BOM，JSON.parse 不接受，先剥掉
    const raw = fs.readFileSync(STATE_FILE, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return { consecutiveFails: 0, down: false, lastAlertAt: 0, lastRecoverAt: 0 };
  }
}

function writeState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function probe(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--reset')) {
    writeState({ consecutiveFails: 0, down: false, lastAlertAt: 0, lastRecoverAt: 0 });
    console.log('[健康检查] 已清除故障状态');
    return;
  }

  const url = process.env.OPS_HEALTH_URL || 'http://127.0.0.1:3000/api/health';
  const timeoutMs = parseInt(process.env.OPS_HEALTH_TIMEOUT_MS) || 5000;
  const threshold = parseInt(process.env.OPS_HEALTH_FAIL_THRESHOLD) || 3;
  const cooldownMin = parseInt(process.env.OPS_ALERT_COOLDOWN_MIN) || 30;
  const now = Date.now();

  const state = readState();
  const ok = await probe(url, timeoutMs);

  if (ok) {
    // 服务正常
    if (state.down) {
      // 从故障恢复 → 发恢复通知
      const meta = { url, downFor: state.downSince ? Math.round((now - state.downSince) / 1000) : null, time: new Date().toISOString() };
      await notify({
        eventType: 'ops.recovered',
        title: '服务已恢复',
        message: `健康检查 ${url} 已恢复正常${meta.downFor ? `，本次宕机约 ${Math.round(meta.downFor / 60)} 分钟` : ''}。`,
        payload: meta,
      });
      console.log('[健康检查] 服务已恢复，已发送恢复通知');
      writeState({ consecutiveFails: 0, down: false, lastAlertAt: 0, lastRecoverAt: now });
    } else {
      state.consecutiveFails = 0;
      writeState(state);
      console.log('[健康检查] 正常');
    }
    return;
  }

  // 探测失败
  state.consecutiveFails = (state.consecutiveFails || 0) + 1;
  console.log(`[健康检查] 失败 ${state.consecutiveFails}/${threshold} 次（${url}）`);

  if (state.consecutiveFails < threshold) {
    writeState(state);
    return;
  }

  // 已达阈值：是否在冷却期内（避免刷屏）
  const inCooldown = state.down && now - (state.lastAlertAt || 0) < cooldownMin * 60000;
  if (inCooldown) {
    writeState(state);
    console.log(`[健康检查] 故障持续中，冷却期内不重复告警（距上次告警 ${Math.round((now - state.lastAlertAt) / 60000)} 分钟）`);
    return;
  }

  // 首次进入故障态或冷却期结束 → 告警
  if (!state.down) state.downSince = now;
  state.down = true;
  state.lastAlertAt = now;
  const meta = {
    url,
    consecutiveFails: state.consecutiveFails,
    downSince: state.downSince ? new Date(state.downSince).toISOString() : null,
    time: new Date().toISOString(),
  };
  await notify({
    eventType: 'ops.down',
    title: '系统宕机告警',
    message: [
      `健康检查 ${url} 连续 ${state.consecutiveFails} 次失败，系统可能已宕机！`,
      state.downSince ? `疑似宕机时间：${new Date(state.downSince).toLocaleString('zh-CN')}` : '',
      '请立即检查：docker ps / docker logs freight-backend / 服务器负载与磁盘',
    ].filter(Boolean).join('\n'),
    payload: meta,
  });
  writeState(state);
  console.log('[健康检查] 已触发宕机告警');
}

main().catch((e) => {
  console.error('[健康检查] 执行异常', e.message);
  process.exit(1);
});
