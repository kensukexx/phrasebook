// オフラインでもアプリ本体（index.html）が開けるようにするための最小限のservice worker。
// 翻訳・為替レートなど外部APIへのリクエストはそのままネットに流し、失敗したときの扱いは
// アプリ側（index.html）の既存のフォールバック処理に任せる。Google翻訳の音声合成だけは
// 例外で、下のfetchハンドラでこのservice worker自身がキャッシュする（詳細はそちらのコメント）。
const CACHE_NAME = "phrasebook-shell-v2";
const SHELL_FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
const TTS_CACHE_NAME = "phrasebook-tts-audio-v1";

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
  // index.html側が持つ音声キャッシュ（phrasebook-tts-audio-*）など、シェル以外の
  // キャッシュ名はここでは一切触らない（誤って削除すると再生のたびに毎回オンラインで
  // 取得し直すことになってしまうため）。
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

  // Google翻訳の音声合成（発音再生）は無料・非公式のエンドポイントで、一時的な不調や
  // レート制限が起きやすい。一度取得できた音声はここでキャッシュしておき、同じフレーズの
  // 再生（特に聞き流しのループ・繰り返し再生）はオンライン状況に関わらず即座に鳴らせるようにする。
  // このエンドポイントはAccess-Control-Allow-Originを返さないため、<audio src>からの
  // リクエストはno-cors（不透明・opaqueなレスポンス）になる。中身をJS側で読むことはできないが、
  // ブラウザにそのまま再生させる分には問題なく、Cache APIへの保存・再利用もopaqueなまま行える。
  if (url.hostname === "translate.google.com" || url.hostname === "translate.googleapis.com") {
    if (url.pathname !== "/translate_tts") return; // 音声合成以外（翻訳API等）はそのまま素通し
    event.respondWith(
      caches.open(TTS_CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => cached || fetch(req).then((res) => {
          cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // 上記以外の外部API（翻訳・為替・Gemini・同期）はそのまま素通し

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
