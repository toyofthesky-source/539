const CACHE_NAME = '539-analysis-cache-202609011721';
const ASSETS = [
  'index.html',
  'app.js',
  'manifest.json',
  'data.json',
  'icon-192.png',
  'icon-512.png'
];

// install 事件：快取靜態資源，並強制立即接管
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

// activate 事件：清理舊版快取，並立即取得客戶端控制權
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// fetch 事件：快取路由攔截
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. 對於數據 data.json 採取 Network-First 策略
  // 裁切掉 URL 中的 query string，統一快取與匹配乾淨的 'data.json'，防止快取膨脹與離線失效
  if (url.pathname.endsWith('data.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('data.json', clone));
          }
          return response;
        })
        .catch(() => {
          // 網路失敗/離線時，讀取沒有 query string 的快取數據
          return caches.match('data.json');
        })
    );
  } else {
    // 2. 對於靜態資源採取 Stale-While-Revalidate 策略，兼顧載入速度與背景自動更新
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            if (networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            // 忽略背景 fetch 失敗
          });
        return cachedResponse || fetchPromise;
      })
    );
  }
});
