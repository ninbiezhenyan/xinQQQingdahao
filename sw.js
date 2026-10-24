// Service Worker —— 让站点满足「可安装」条件（生成无浏览器角标的独立桌面图标）
// 策略：网络优先 + 离线回落。始终拿最新内容，只有断网/超时才用缓存，避免看到旧版本。
const CACHE = 'shy-restaurant-v4';
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

    // 页面本身（导航 / index.html）：必须拿到最新版本，否则改动永远看不到。
    // 因此这里【不设超时】—— 网慢就多等一会儿，只有在完全断网（fetch 直接失败）时才用缓存兜底。
    // 教训：早期给 HTML 也加了 3 秒超时，GitHub Pages 在国内常超时 → 回退旧缓存 → 用户看到的是旧页面。
    const isHTML = req.mode === 'navigate' || url.pathname.endsWith('/index.html');
    if (isHTML) {
      try {
        const res = await fetch(req);
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
    }

    // 图片等静态资源：网络优先 + 3 秒超时，慢的时候用缓存图，保证滑动流畅
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
