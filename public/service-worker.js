// Nothing registers a service worker any more. A browser still holding an old one
// fetches this file when it checks for an update, and this removes it.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => client.navigate(client.url))),
  );
});
