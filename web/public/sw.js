/* Atlas service worker — hand-rolled, no Workbox.
 *
 * Cache buckets are versioned. Bump the version suffix to invalidate
 * everything on the next activation (e.g. shell HTML structure change).
 */

const VERSION = "v1";
const CACHE_SHELL = `atlas-shell-${VERSION}`;
const CACHE_TRIPS = `atlas-trips-${VERSION}`;
const CACHE_TILES = `atlas-tiles-${VERSION}`;
const ALL_CACHES = [CACHE_SHELL, CACHE_TRIPS, CACHE_TILES];

const PRECACHE = ["/", "/today", "/offline", "/manifest.json", "/icon-192.png", "/icon-512.png"];
const TILE_CAP = 1000;
const TILES_HOST = "tiles.openfreemap.org";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(url))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith("atlas-") && !ALL_CACHES.includes(n))
          .map((n) => caches.delete(n)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache mutations — synth 503 when offline.
  if (req.method !== "GET") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            JSON.stringify({ detail: "You're offline." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    return;
  }

  // OpenFreeMap tiles → cache-first with LRU cap.
  if (url.host === TILES_HOST) {
    event.respondWith(handleTile(req));
    return;
  }

  // Atlas API GET → network-first, fall back to cache.
  if (url.host.startsWith("api.atlas.")) {
    event.respondWith(networkFirst(req, CACHE_TRIPS));
    return;
  }

  // Same-origin navigation → network-first → cache → /offline.
  if (req.mode === "navigate") {
    event.respondWith(navigationHandler(req));
    return;
  }

  // Same-origin static assets (_next/static, icons, manifest) → SWR.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, CACHE_SHELL));
    return;
  }

  // Everything else: network only (default).
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ detail: "Offline and not cached." }),
      { status: 504, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function navigationHandler(req) {
  const cache = await caches.open(CACHE_SHELL);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await cache.match("/offline");
    if (offline) return offline;
    return new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await networkPromise) || new Response("", { status: 504 });
}

async function handleTile(req) {
  const cache = await caches.open(CACHE_TILES);
  const cached = await cache.match(req);
  if (cached) {
    bumpTileLru(req.url);
    return cached;
  }
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone());
      bumpTileLru(req.url);
      maybeEvictTiles();
    }
    return fresh;
  } catch {
    return new Response("", { status: 504 });
  }
}

// LRU bookkeeping for tiles (IndexedDB so it survives SW restarts).
const LRU_DB = "atlas-tile-meta";
const LRU_STORE = "lru";

function openLru() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LRU_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LRU_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function bumpTileLru(url) {
  try {
    const db = await openLru();
    const tx = db.transaction(LRU_STORE, "readwrite");
    tx.objectStore(LRU_STORE).put(Date.now(), url);
  } catch {
    // best-effort
  }
}

let evictionInFlight = false;
async function maybeEvictTiles() {
  if (evictionInFlight) return;
  evictionInFlight = true;
  try {
    const cache = await caches.open(CACHE_TILES);
    const keys = await cache.keys();
    if (keys.length <= TILE_CAP) return;
    const db = await openLru();
    const all = await new Promise((resolve) => {
      const tx = db.transaction(LRU_STORE, "readonly");
      const store = tx.objectStore(LRU_STORE);
      const valReq = store.getAll();
      const keyReq = store.getAllKeys();
      Promise.all([
        new Promise((r) => { valReq.onsuccess = () => r(valReq.result); }),
        new Promise((r) => { keyReq.onsuccess = () => r(keyReq.result); }),
      ]).then(([values, keys]) => resolve(keys.map((k, i) => [k, values[i]])));
    });
    all.sort((a, b) => a[1] - b[1]); // oldest first
    const toEvict = all.slice(0, keys.length - TILE_CAP);
    for (const [url] of toEvict) {
      await cache.delete(url);
      const dx = db.transaction(LRU_STORE, "readwrite");
      dx.objectStore(LRU_STORE).delete(url);
    }
  } catch {
    // best effort
  } finally {
    evictionInFlight = false;
  }
}

// ── Active-trip pre-cache, driven by postMessage from the home page. ─────
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "precache-trip") return;
  event.waitUntil(precacheTrip(data));
});

async function precacheTrip({ slug, apiBase, bbox }) {
  if (!slug || !apiBase) return;
  const cache = await caches.open(CACHE_TRIPS);
  await Promise.allSettled([
    fetchAndCache(`${apiBase}/trips/${slug}`, cache),
    fetchAndCache(`${apiBase}/trips/${slug}/budget`, cache),
  ]);
  if (!bbox) return;

  // Fetch the style JSON to extract tile URL templates.
  const styleUrl = "https://tiles.openfreemap.org/styles/positron";
  let style;
  try {
    const r = await fetch(styleUrl);
    if (r.ok) {
      const tilesCache = await caches.open(CACHE_TILES);
      tilesCache.put(styleUrl, r.clone());
      style = await r.json();
    }
  } catch { /* skip */ }
  if (!style || !style.sources) return;

  const tileUrls = [];
  for (const src of Object.values(style.sources)) {
    for (const t of src.tiles || []) tileUrls.push(t);
  }
  if (tileUrls.length === 0) return;

  const MAX_PREFETCH = 250;
  const targets = [];
  outer: for (const z of [11, 12, 13, 14]) {
    const [x0, y0, x1, y1] = bboxToTileRange(bbox, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (targets.length >= MAX_PREFETCH) break outer;
        for (const tmpl of tileUrls) {
          targets.push(
            tmpl.replace("{z}", z).replace("{x}", x).replace("{y}", y),
          );
        }
      }
    }
  }
  const tilesCache = await caches.open(CACHE_TILES);
  await Promise.allSettled(
    targets.map((u) => fetchAndCache(u, tilesCache).then(() => bumpTileLru(u))),
  );
  maybeEvictTiles();
}

async function fetchAndCache(url, cache) {
  try {
    const r = await fetch(url);
    if (r && r.ok) cache.put(url, r.clone());
  } catch { /* swallow */ }
}

function bboxToTileRange(bbox, z) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return [
    lngToTileX(minLng, z),
    latToTileY(maxLat, z),
    lngToTileX(maxLng, z),
    latToTileY(minLat, z),
  ];
}
function lngToTileX(lng, z) {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) *
      Math.pow(2, z),
  );
}
