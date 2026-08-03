// App-shell cache so the tracker still opens (and your data is still readable) offline.
const CACHE_NAME = "habit-tracker-v18";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./habits.js",
  "./storage.js",
  "./ui.js",
  "./theme.js",
  "./confetti.js",
  "./tracker.js",
  "./sleepTab.js",
  "./insightsTab.js",
  "./dayEditor.js",
  "./addTask.js",
  "./sync.js",
  "./push.js",
  "./settings.js",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Web Push: fires even when the app/tab is fully closed, sent by the
// scheduled Cloud Function in functions/index.js (only active once Sync is on).
self.addEventListener("push", (event) => {
  let data = { title: "Habits", body: "You have habits left today." };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icon.svg",
      badge: "icon.svg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow("./");
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => cached);
    })
  );
});
