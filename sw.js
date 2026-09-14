// Site-wide service worker for offline play. Network first, so anyone online always gets
// the latest deploy; each same-origin file that loads is also copied into the cache, and
// when the network is gone that last copy is served instead.
const CACHE = "mini-games";

// Tile faces load one by one as tiles come up. The first time any tile is fetched, the whole
// set is cached, or offline mahjong would show blanks for every tile not seen yet.
// shared/js/test/sw.test.js keeps this list in step with shared/assets/tiles/.
const TILE_FILES = [
  "dragon-green.svg", "dragon-red.svg", "dragon-white.svg",
  "flower-bamboo.svg", "flower-chrysanthemum.svg", "flower-orchid.svg", "flower-plum.svg",
  "man1.svg", "man2.svg", "man3.svg", "man4.svg", "man5.svg", "man6.svg", "man7.svg", "man8.svg", "man9.svg",
  "pin1.svg", "pin2.svg", "pin3.svg", "pin4.svg", "pin5.svg", "pin6.svg", "pin7.svg", "pin8.svg", "pin9.svg",
  "season-autumn.svg", "season-spring.svg", "season-summer.svg", "season-winter.svg",
  "sou1.svg", "sou2.svg", "sou3.svg", "sou4.svg", "sou5.svg", "sou6.svg", "sou7.svg", "sou8.svg", "sou9.svg",
  "wind-east.svg", "wind-north.svg", "wind-south.svg", "wind-west.svg"
];
let tilesWarming = null;

// "/" and "/index.html" are the same page, and a query string doesn't change a static file.
function cacheKey(url) {
  const key = new URL(url);
  if (key.pathname.endsWith("/")) key.pathname += "index.html";
  key.search = "";
  key.hash = "";
  return key.href;
}

function store(url, response) {
  if (!response.ok) return Promise.resolve();
  return caches.open(CACHE).then((cache) => cache.put(cacheKey(url), response));
}

const isTile = (url) => new URL(url).pathname.includes("/shared/assets/tiles/");

// Runs once per worker start; tiles already cached aren't downloaded again.
function warmTiles(tileUrl) {
  if (!tilesWarming) {
    const base = new URL(".", tileUrl).href;
    tilesWarming = caches.open(CACHE).then((cache) => Promise.allSettled(TILE_FILES.map((name) =>
      cache.match(base + name).then((hit) => hit || fetch(base + name).then((response) => store(base + name, response))))));
  }
  return tilesWarming;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        event.waitUntil(store(request.url, response.clone()));
        if (isTile(request.url)) event.waitUntil(warmTiles(request.url));
        return response;
      })
      .catch(() => caches.match(cacheKey(request.url)).then((cached) => cached || Response.error())),
  );
});

// Pages send the files they loaded before this worker was controlling them.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "cache-urls") return;
  const urls = event.data.urls.filter((url) => new URL(url).origin === self.location.origin);
  const tile = urls.find(isTile);
  event.waitUntil(Promise.allSettled(urls.map((url) => fetch(url).then((response) => store(url, response)))
    .concat(tile ? [warmTiles(tile)] : [])));
});
