importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

const CACHE_NAME = 'matyer-v2.4'; 
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

const GITHUB_USER = "ytumat34";
const GITHUB_REPO = "matyer";
const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/commits?per_page=1`;

// =========================================================================
// 1. KURULUM VE AKTİVASYON (Önbellek Yönetimi)
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
          if (cache !== CACHE_NAME && cache !== 'matyer-badge-cache') {
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
  
  // CSV dosyaları asla önbelleğe girmemeli, hep canlı çekilmeli
  if (url.includes('.csv')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // GitHub API isteklerini doğrudan internetten getir, askıda bırakma
  if (url.includes('api.github.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Diğer statik kaynaklar için Stale-While-Revalidate stratejisi
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

// =========================================================================
// 3. PWA EVENT LISTENERS (Mesaj, Periyodik Senkronizasyon ve Tıklama)
// =========================================================================

// Arka planda (Uygulama kapalıyken) işletim sisteminden gelen tetiklenme (Doğru yazım: periodicsync)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-csv-update') {
    event.waitUntil(checkGitHubCommitsForBadge());
  }
});

// Uygulama içinden manuel tetikleme gelirse
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'executeBadge') {
    event.waitUntil(checkGitHubCommitsForBadge());
  }
});

// Öğrenci bildirime tıkladığında uygulamayı ön plana getirme veya açma
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); 
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});

// =========================================================================
// 4. KÜRESEL TEK ANA KONTROL FONKSİYONU (Döngüleri Engelleyen Güvenli Yapı)
// =========================================================================

async function checkGitHubCommitsForBadge() {
  try {
    const response = await fetch(API_URL, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
    const data = await response.json();

    if (data && data.length > 0) {
      const lastCommitDate = data[0].commit.committer.date;
      
      const cache = await caches.open('matyer-badge-cache');
      const cachedResponse = await cache.match('last_seen_date');
      
      let savedDate = null;
      if (cachedResponse) {
        savedDate = await cachedResponse.text();
      }

      // EĞER YENİ BİR COMMIT VARSA
      if (!savedDate || new Date(lastCommitDate) > new Date(savedDate)) {
        
        // 1. İkonun üzerine "1" rakamını yerleştir
        if ('setAppBadge' in self.navigator) {
          await self.navigator.setAppBadge(1);
        }

        // 2. Bildirimi fırlat (Hem ön plan hem arka plan için ortak başlık)
        await self.registration.showNotification("MATyer Güncellendi!", {
          body: "Yeni sınav yerleri yayınlandı. Kontrol etmek için tıklayın.",
          icon: "icon.png", 
          badge: "icon.png",
          vibrate: [200, 100, 200],
          tag: "csv-update-notification",
          renotify: true,
          data: { url: "./index.html" }
        });

        // 3. KRİTİK: Sonsuz bildirime girmemesi için yeni tarihi HEMEN cache'e yaz
        await cache.put('last_seen_date', new Response(lastCommitDate));
      }
    }
  } catch (err) {
    console.error('Arka plan badge kontrolü başarısız:', err);
  }
}