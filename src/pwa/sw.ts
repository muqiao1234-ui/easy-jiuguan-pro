/** Service Worker - Cache First 策略 */

const CACHE_NAME = 'tavern-sandbox-v1';

// 需要预缓存的资源路径（构建后由 vite-plugin-singlefile 打包为单文件）
const PRECACHE_URLS: string[] = ['/'];

// ===== Install: 预缓存关键资源 =====
self.addEventListener('install', (event) => {
  const installEvent = event as ExtendableEvent;
  installEvent.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Install complete');
        // 强制激活，不等待旧 SW 释放
        return (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
      }),
  );
});

// ===== Activate: 清理旧缓存 =====
self.addEventListener('activate', (event) => {
  const activateEvent = event as ExtendableEvent;
  activateEvent.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            }),
        );
      })
      .then(() => {
        console.log('[SW] Activate complete');
        return (self as unknown as ServiceWorkerGlobalScope).clients.claim();
      }),
  );
});

// ===== Fetch: Cache First 策略 =====
self.addEventListener('fetch', (event) => {
  const fetchEvent = event as FetchEvent;

  // 只处理 GET 请求
  if (fetchEvent.request.method !== 'GET') {
    return;
  }

  // 跳过 chrome-extension 和 API 请求
  const url = new URL(fetchEvent.request.url);
  if (url.protocol === 'chrome-extension:' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
    return;
  }

  fetchEvent.respondWith(
    caches.match(fetchEvent.request).then((cachedResponse) => {
      if (cachedResponse) {
        // 缓存命中，直接返回
        return cachedResponse;
      }

      // 缓存未命中，请求网络并缓存
      return fetch(fetchEvent.request)
        .then((response) => {
          // 只缓存成功的 GET 响应
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(fetchEvent.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // 网络请求失败，尝试返回离线页面
          // 对于单文件应用，index.html 已在预缓存中
          return caches.match('/');
        });
    }),
  );
});

// 类型声明：扩展 ServiceWorkerGlobalScope
declare var self: ServiceWorkerGlobalScope;
