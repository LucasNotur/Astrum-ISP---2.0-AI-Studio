self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('astrum-tech-cache-v2').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/src/main.tsx',
        '/tecnico'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-oss') {
    console.log('Background sync tag recebida no Service Worker!');
    // A sincronização real é gerenciada no client, ou poderia ser aqui chamando endpoints via fetch
  }
});
