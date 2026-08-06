// オフラインでもアプリ本体（index.html）が開けるようにするための最小限のservice worker。
// 翻訳・音声合成・為替レートなど外部APIへのリクエストはそのままネットに流し、失敗したときの
// 扱いはアプリ側（index.html）の既存のフォールバック処理に任せる。
//
// 過去の経緯（あえて残す）: 一度はGoogle音声合成（translate_tts）だけこのservice worker自身が
// 横取りしてCache APIに保存し、同じフレーズの再生を2回目以降オフラインでも即座に鳴らせるように
// していたが、撤去した。理由: このservice worker内でfetch()を使ってtranslate_tts宛てにリクエスト
// すると、同じリクエストでも<audio src>から直接読み込む場合とは異なりGoogle側が404を返すことが
// 実機検証で判明したため（fetch()由来のリクエストだけを弾いているとみられる、非公式エンドポイント
// 特有の挙動）。つまりこの横取り自体が、キャッシュの恩恵と引き換えに再生失敗を招きうる状態だった。
// <audio src>からの直接リクエスト（このservice workerが一切関与しない経路）は安定して成功するため、
// translate_tts宛てのリクエストは他の外部APIと同様、素通しに戻している。
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
  // "phrasebook-shell-"で始まるキャッシュだけを対象に古いバージョンを掃除する。
  // それ以外の名前のキャッシュ（将来また何か追加する場合に備えて）はここでは一切触らない。
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith("phrasebook-shell-") && n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return; // 外部API（翻訳・音声合成・為替・Gemini・同期）はそのまま素通し

  event.respondWith(
    fetchWithTimeout(req, { cache: "no-store" }) // ブラウザのHTTPキャッシュを経由させず、必ずオリジンに新しさを確認しにいく
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});

// 通常のfetch()は、接続はできているのに応答が返ってこない（回線があるように見えて実際は
// つながっていない等）ケースでは何秒でもハングし続けることがある。ページ側にも同様の
// setTimeoutによるタイムアウトがあるが、service worker内のfetch()自体がハングしている間は
// ページ側のタイマーが発火しないことが実機検証で判明した（オフラインだと音声が延々と鳴らない
// まま止まる、という形で実際に報告された不具合の原因の一つ）。ハング自体をservice worker側で
// 確実に打ち切る必要がある。現状ここで使っているのはシェルファイル（同一オリジン）のfetchのみ。
function fetchWithTimeout(req, opts, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(req, Object.assign({}, opts, { signal: controller.signal }))
    .finally(() => clearTimeout(timer));
}
