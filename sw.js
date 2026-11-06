// Service worker: giữ khung ứng dụng để mở được khi mạng yếu; dữ liệu đám mây luôn lấy trực tiếp từ máy chủ.
const CACHE = 'tcc-shell-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/main.js', './js/config.js', './js/util.js', './js/defaults.js', './js/store.js', './js/calc.js',
  './js/optimize.js', './js/ui.js', './js/seed.js', './js/xl.js',
  './js/views/dashboard.js', './js/views/products.js', './js/views/formula.js', './js/views/ingredients.js',
  './js/views/criteria.js', './js/views/optimize.js', './js/views/approvals.js', './js/views/simulate.js',
  './js/views/reports.js', './js/views/admin.js',
  './vendor/supabase.js', './vendor/solver.js', './vendor/xlsx.full.min.js',
  './templates/file-nguyen-lieu-gia.xlsx', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API đám mây: không cache
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
