/**
 * ============================================================================
 * SERVICE WORKER — CAÇA AOS BUGS (PWA ALTA FIDELIDADE)
 * ============================================================================
 */

const CACHE_NAME = "caca-aos-bugs-v1.1";

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/screenshot-mobile.png",
  "/screenshot-desktop.png",
  "/offline.html"
];

// 1. Instalação: Pré-carrega o App Shell e recursos estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[Service Worker] Falha parcial no pré-cache:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Ativação: Limpeza de caches antigos e reivindicação de clientes
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Interceptação de Requisições (Fetch)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignora requisições de esquemas não-HTTP (ex: chrome-extension, data:)
  if (!url.protocol.startsWith("http")) return;

  // Ignora chamadas de API e conexões WebSocket (Network-Only)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Requisições de navegação HTML (páginas): Network-First com fallback para cache/offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          // Atualiza cache em background
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cachedRes = await caches.match(req);
          if (cachedRes) return cachedRes;
          const offlinePage = await caches.match("/offline.html");
          return offlinePage || caches.match("/index.html");
        })
    );
    return;
  }

  // Recursos estáticos e fontes externas: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          // Falha de rede silenciosa para requisições em background
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Mensagens do Cliente (ex: Atualização imediata)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
