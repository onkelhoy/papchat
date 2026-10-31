// papchat's service worker: wakes the app for calls. It doesn't cache anything.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", () => { });
self.addEventListener("notificationclick", () => { });
