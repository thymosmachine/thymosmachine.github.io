const CACHE_NAME = "Thymos-Moira-vLATEST";

const FILES_TO_CACHE = [
    "/index.html",
    "/images/icon-512x512.png",
    "/images/favicon.ico",
    "/manifest.json",
];

const PACKAGES_DIR = "/packages/";      // složka, kterou chceme projít
const FETCH_EXCEPTIONS = ["/latest.txt"]; // neukládat do cache

// ---- helpers ----

// Rekurzivně projde directory listing a uloží všechny soubory do cache.
// Funguje jen pokud server vrací HTML listing (odkazy <a href="...">).
async function crawlAndCache(cache, basePath, depth = 0, maxDepth = 8) {
    if (depth > maxDepth) return;

    // absolutní URL basePath (kvůli relativním href)
    const baseURL = new URL(basePath, self.location.origin);

    let res;
    try {
        res = await fetch(baseURL.toString(), {cache: "no-cache"});
    } catch {
        return; // žádný listing / chyba sítě -> necháme na runtime cachování
    }
    if (!res.ok) return;

    const html = await res.text();

    // posbírej všechny hrefy
    const links = [...html.matchAll(/href="([^"]+)"/g)]
        .map(m => m[1])
        .filter(href => href && !href.startsWith("#") && !href.startsWith("?"))
        .map(href => new URL(href, baseURL)) // zrelativni vůči base
        // zůstaň jen uvnitř PACKAGES_DIR
        .filter(u => u.origin === self.location.origin && u.pathname.startsWith(PACKAGES_DIR));

    for (const u of links) {
        // přeskoč odkaz na „nadřazený“ adresář
        if (u.pathname === baseURL.pathname) continue;

        if (u.pathname.endsWith("/")) {
            // podadresář -> rekurze
            await crawlAndCache(cache, u.pathname, depth + 1, maxDepth);
        } else {
            // soubor -> stáhni a ulož (bez duplicitního fetch z cache.addAll)
            try {
                const r = await fetch(u.toString(), {cache: "no-cache"});
                if (r.ok) await cache.put(u.toString(), r.clone());
            } catch {
                // ignoruj chyby jednotlivých souborů
            }
        }
    }
}

// ---- install ----

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        await self.skipWaiting();

        const cache = await caches.open(CACHE_NAME);

        // 1) precache fixních souborů
        await cache.addAll(FILES_TO_CACHE);

        // 2) pokus o „vybrání všeho“ z /packages (rekurzivně přes directory listing)
        await crawlAndCache(cache, PACKAGES_DIR);
    })());
});

// ---- activate ----

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        await self.clients.claim();

        const cacheWhitelist = [CACHE_NAME];
        const names = await caches.keys();

        await Promise.all(names.map(async (name) => {
            if (!cacheWhitelist.includes(name)) {
                return caches.delete(name);
            }
            const cache = await caches.open(name);
            await cache.delete("latest.txt");
        }));
    })());
});

// ---- fetch ----

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  const isException = FETCH_EXCEPTIONS.some(ex => url.pathname.endsWith(ex));
  if (isException) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first pro /packages/* (pokud to máš)
  if (url.pathname.startsWith('/packages/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const network = await fetch(event.request);
      if (network && network.ok) {
        // KLONUJ IHNED
        const clone = network.clone();
        event.waitUntil(cache.put(event.request, clone));
      }
      return network;
    })());
    return;
  }

  // Network-first pro ostatní
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const network = await fetch(event.request);
      // KLONUJ IHNED
      const clone = network.clone();
      event.waitUntil(cache.put(event.request, clone));
      return network;
    } catch (err) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw err;
    }
  })());
});

