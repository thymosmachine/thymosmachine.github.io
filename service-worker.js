const CACHE_NAME = "Thymos-Moira-v0.1"; // Název cache
const FILES_TO_CACHE = [
    "./", // Hlavní stránka
    "./index.html",
    "./uPlot.iife.min.js",
    "./uPlot.min.css",
    "./xlsx.full.min.js",
    "./images/icon-512x512.png",
    "./images/icon-192x192.png",
    "./images/icon-96x96.png",
    "./images/icon-48x48.png",
    "./images/icon-32x32.png",
    "./images/favicon.ico",
];


// Instalace Service Workeru a cacheování souborů
self.addEventListener('install', function (event) {
    // Check if a Service Worker is already active; if so, skip installation
    if (self.registration.active) {
        console.log("Service Worker already exists, skipping installation.");
        self.skipWaiting();
    } else {

        try {
            event.waitUntil(
                caches.open(CACHE_NAME).then((cache) => {
                    return Promise.all(
                        FILES_TO_CACHE.map((url) => {
                            return fetch(url)
                                .then((response) => {
                                    if (!response.ok) {
                                        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
                                    }
                                    return cache.put(url, response);
                                })
                                .catch((error) => console.error("Caching failed for:", url, error));
                        })
                    );
                })
            );
        } catch (error) {
            console.error("Service Worker installation failed: ", error);
        }
    }
});

// Aktivace Service Workeru
self.addEventListener('activate', function (event) {
    var cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames.map(function (cacheName) {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Odezva pro offline přístup
self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request).then(function (response) {
            return response || fetch(event.request);
        })
    );
});