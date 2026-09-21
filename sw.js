// Service Worker —— 让站点满足「可安装」条件（生成无浏览器角标的独立桌面图标）
// 策略：网络优先 + 离线回落。始终拿最新内容，只有断网/超时才用缓存，避免看到旧版本。
const CACHE = 'shy-restaurant-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const NET_TIMEOUT = 3000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await withTimeout(fetch(req), NET_TIMEOUT);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit =
        (await cache.match(req)) ||
        (await cache.match('./index.html')) ||
        (await cache.match('./'));
      if (hit) return hit;
      throw err;
    }
  })());
});
