// オフラインでもアプリ本体（index.html）が開けるようにするための最小限のservice worker。
// 翻訳・音声合成・為替レートなど外部APIへのリクエストはそのままネットに流し、
// 失敗したときの扱いはアプリ側（index.html）の既存のフォールバック処理に任せる。
const CACHE_NAME = "phrasebook-shell-v2";
const SHELL_FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  // cache: "reload" でブラウザのHTTPキャッシュを無視して必ずオリジンから取得する。
  // GitHub PagesはCache-Control: max-age=600を返すため、素のaddAll()だと
  // 直前に閲覧した際のキャッシュがまだ新鮮とみなされ、更新後もしばらく古い
  // index.htmlのままになってしまうことがあった（実際に報告された不具合）。
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(SHELL_FILES.map((url) => fetch(new Request(url, { cache: "reload" })).then((res) => cache.put(url, res)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return; // 外部APIはそのまま素通し

  event.respondWith(
    fetch(req, { cache: "no-store" }) // ブラウザのHTTPキャッシュを経由させず、必ずオリジンに新しさを確認しにいく
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
