const CACHE="loadmaster-ai-v5.39.1-normal-first";
const ASSETS=[
  "./index.html?v=5.39.1",
  "./styles.css?v=5.39.1",
  "./app.js?v=5.39.1",
  "./manifest.webmanifest",
  "./icon.svg",
  "./optimizer.js",
  "./geometry.js",
  "./collision.js",
  "./refine.js",
  "./scoring.js",
  "./validator.js"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("loadmaster-ai-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const request = event.request;
  if(request.mode === "navigate") {
    event.respondWith(fetch(request, {cache:"no-store"}).then(response => {
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put("./index.html?v=5.39.1", copy));
      return response;
    }).catch(()=>caches.match("./index.html?v=5.39.1")));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if(response && response.ok){
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request, copy));
    }
    return response;
  }).catch(()=>caches.match(request)));
});
