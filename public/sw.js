self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("urban-director-"))
            .map(key => caches.delete(key))
        )
      ),
      self.registration.unregister()
    ])
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then(clients =>
        Promise.all(
          clients.map(client =>
            client.navigate ? client.navigate(client.url) : Promise.resolve()
          )
        )
      )
  );
});

self.addEventListener("fetch", () => {
  // Urban Director Studio intentionally does not cache application requests.
});
