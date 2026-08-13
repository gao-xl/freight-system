// F5 实时推送：基于 fetch + ReadableStream 的 SSE 客户端
// 原生 EventSource 无法携带 Authorization header，故用 fetch 流式读取，
// 解析 'data: ...' 帧，自动断线重连。
// 修复：token 不再作为固定参数传入，每次重连都从 localStorage 读取最新 token，
//       避免 access token 刷新后 SSE 仍用旧 token 导致 401 死循环。
export function createSSE({ url, onEvent, onError, retryDelay = 3000 }) {
  let running = true;
  let controller = null;
  let timer = null;

  function currentToken() {
    return localStorage.getItem('token') || '';
  }

  async function connect() {
    if (!running) return;
    controller = new AbortController();
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${currentToken()}` },
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`SSE HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // eslint-disable-next-line no-constant-condition
      while (running) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        // SSE 帧以空行(\n\n)分隔
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          const data = dataLine.slice(5).trim();
          if (!data) continue;
          try {
            onEvent(JSON.parse(data));
          } catch (e) { /* 忽略无法解析的帧 */ }
        }
      }
    } catch (e) {
      if (!running) return;
      onError && onError(e);
    } finally {
      if (running) {
        timer = setTimeout(connect, retryDelay);
      }
    }
  }

  connect();

  return () => {
    running = false;
    if (timer) clearTimeout(timer);
    if (controller) controller.abort();
  };
}