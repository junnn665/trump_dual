// オフラインでも遊べるようにするサービスワーカー
// 自分のサイトのファイルは「まず通信、だめならキャッシュ」なので、更新はすぐ反映される
const CACHE = 'trump-duel-v14';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/engine.js', 'js/cards.js', 'js/ai.js', 'js/ui.js', 'js/fx.js', 'js/sound.js', 'js/art.js',
  'js/controllers.js', 'js/stream.js', 'js/net.js', 'js/challenge.js', 'js/deck.js', 'js/collection.js', 'js/achieve.js', 'js/lines.js', 'js/tournament.js', 'lib/qrcode.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 通信対戦（Firebase）やフォントなど、ほかのサイトには手を出さない
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
