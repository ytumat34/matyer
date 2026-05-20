const CACHE_NAME = 'matyer-v2.4'; 
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
  // Varsa './script.js' veya './style.css' gibi dosyalarınızı da buraya ekleyin hocam
];

const GITHUB_USER = "ytumat34";
const GITHUB_REPO = "matyer";
const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/commits?per_page=1`;

// KURULUM: Dosyaları önbelleğe al
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// AKTİVASYON: Eski v1, v2, v2.1 önbelleklerini tamamen temizle (Kilitlenmeyi çözen kısım)
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

// STRATEJİ: CSV'ler hariç her şeyi akıllıca önbellekle ve dinamik olarak güncelle
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // CSV dosyaları asla önbelleğe girmez, hep canlı çekilir
  if (url.includes('.csv')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // --- YENİ EKLEME: Öğrenci siteye her girdiğinde veya veri çektiğinde arkada çaktırmadan commit kontrolü yap
  if (url.includes(API_URL)) {
    event.waitUntil(checkGitHubCommitsForBadge());
  }

  // Diğer statik kaynaklar için akıllı kontrol
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        // Eğer dosya önbellekte varsa getir, aynı anda arka planda ağdan güncelini çekip önbelleği tazele
        const networkFetch = fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null); // Çevrimdışı hatası vermesin diye

        return cachedResponse || networkFetch;
      });
    })
  );
});

// =========================================================================
// PWA ICON BADGE & ARKA PLAN KONTROL MEKANİZMASI (GÜNCELLENDİ)
// =========================================================================

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-csv-update') {
    event.waitUntil(checkGitHubCommitsForBadge());
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'executeBadge') {
    event.waitUntil(checkGitHubCommitsForBadge());
  }
});

// --- YENİ BİLDİRİM DİNLEYİCİSİ: Öğrenci bildirime tıkladığında uygulamayı açar ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Bildirimi kapat
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Eğer uygulama arka planda zaten açıksa ona odaklan (focus yap)
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Açık değilse sıfırdan ana sayfayı aç
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});

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

      // Eğer yeni bir commit (yeni bir CSV) varsa!
      if (!savedDate || new Date(lastCommitDate) > new Date(savedDate)) {
        
        // 1. İkonun üzerine "1" rakamını yerleştir
        if ('setAppBadge' in self.navigator) {
          await self.navigator.setAppBadge(1);
        }

        // 2. Öğrencinin telefon ekranına Push Bildirimi fırlat
        await self.registration.showNotification("MATyer Güncellendi!", {
          body: "Yeni sınav yerleri yüklendi. Kontrol etmek için tıklayın.",
          icon: "icon.png", // manifest.json dosyanızdaki ikon ismi neyse tam aynısı olmalı
          badge: "icon.png",
          vibrate: [200, 100, 200],
          data: { url: "./index.html" }
        });

        // 3. Döngüye girmemesi için yeni tarihi hemen önbelleğe kaydet
        await cache.put('last_seen_date', new Response(lastCommitDate));

      } else {
        // Yeni güncelleme yoksa ve ikon üstünde eski rozet kalmışsa temizleyebiliriz
        if ('clearAppBadge' in self.navigator && savedDate === lastCommitDate) {
          // Uygulama açık değilse durduk yere rozeti silme mantığı (isteğe bağlı)
        }
      }
    }
  } catch (err) {
    console.error('Arka plan badge kontrolü başarısız:', err);
  }
}