const CACHE_NAME = 'matyer-v2.4'; 
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// =========================================================================
// 1. KURULUM VE AKTİVASYON (Uygulamanın Telefona Yüklenmesini Sağlar)
// =========================================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// =========================================================================
// 2. STRATEJİ: CSV'ler Hariç Önbellekleme & Dinamik Güncelleme
// =========================================================================

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // CSV dosyaları asla önbelleğe girmemeli, hep internetten (canlı) çekilmeli
  if (url.includes('.csv')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Diğer statik kaynaklar (Arayüz, ikonlar vb.) için Stale-While-Revalidate stratejisi
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null);

        return cachedResponse || networkFetch;
      });
    })
  );
});