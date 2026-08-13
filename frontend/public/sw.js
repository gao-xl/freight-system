/* 货代管理系统 Service Worker — app shell 缓存：网络优先 + 离线回退 */
// 发版时必须递增 VERSION，否则 activate 不会清理旧缓存，用户拿到旧 app shell。
// （P2-2 修复：已随 v0.2 迭代递增到 v1.0.1）
const VERSION = 'v1.0.1';
const CACHE_NAME = 'freight-app-shell-' + VERSION;

// 预缓存白名单：HTML 入口 + manifest + 图标（含 PNG，兼容 iOS/Android）
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// 发版升级时清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只处理同源请求；跨域与业务接口走网络，避免缓存脏数据
  if (url.origin !== self.location.origin) return;
  // 业务接口与后端反代的动态内容一律不缓存（P2-2 修复：排除 /api-docs、/openapi.json、/docs）
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/api-docs')) return;
  if (url.pathname === '/openapi.json') return;
  if (url.pathname.startsWith('/docs/')) return;

  // 页面导航：网络优先，失败回退缓存的首页（离线可用）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // P2-2 修复：仅缓存成功的响应，避免把错误页缓存为离线回退内容
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 静态资源：stale-while-revalidate（先回缓存，后台拉新）
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
