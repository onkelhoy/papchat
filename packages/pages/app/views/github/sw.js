// papchat's service worker: wakes the app for calls. It doesn't cache anything. It can't read the
// translations, so the few strings it shows are here.

const STRINGS = {
    en: {
        call: "{name} is calling",
        video: "{name} is video calling",
        missed: "Missed call from {name}",
        body: "Tap to answer",
    },
    sv: {
        call: "{name} ringer",
        video: "{name} videoringer",
        missed: "Missat samtal från {name}",
        body: "Tryck för att svara",
    },
};

// the same as LIMITS.ringOfflineMs: a push delivered later than this is a call that's over
const RING_MS = 60_000;

const text = (key, name) => (STRINGS[self.navigator.language.slice(0, 2)] ?? STRINGS.en)[key].replace("{name}", () => name);
const icon = () => new URL("manifest.logo.png", self.registration.scope).href;
const windows = () => self.clients.matchAll({ type: "window", includeUncontrolled: true });

function callHash(call) {
    const { id, key, kind, direct, from, name, at, pub, sig } = call;
    return `#${new URLSearchParams({ call: id, key, kind, direct: String(direct), from, name, at: String(at), pub, sig })}`;
}

function missed(call) {
    // a notification is required for every push, and Safari ends the subscription without one.
    // Same tag, so it replaces the ringing one
    return self.registration.showNotification(text("missed", call.name), { tag: `call:${call.id}`, icon: icon(), data: {} });
}

async function ring(call) {
    const hash = callHash(call);
    if (Date.now() - call.at > RING_MS) return missed(call);

    // an open tab rings by itself; the notification stays in case nobody's looking at it
    for (const client of await windows()) client.postMessage({ type: "ring", hash });
    return self.registration.showNotification(text(call.kind === "video" ? "video" : "call", call.name), {
        tag: `call:${call.id}`,
        body: text("body", call.name),
        icon: icon(),
        renotify: true,
        requireInteraction: true,
        vibrate: [300, 200, 300, 200, 300],
        data: { hash },
    });
}

async function cancel(call) {
    for (const client of await windows()) client.postMessage({ type: "cancel", id: call.id });
    return missed(call);
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
    let message;
    try
    {
        message = event.data.json();
    }
    catch
    {
        return;
    }
    if (message?.t === "call") event.waitUntil(ring(message));
    else if (message?.t === "cancel") event.waitUntil(cancel(message));
});

async function open(hash) {
    const scope = self.registration.scope;
    const client = (await windows()).find(item => item.url.startsWith(scope));
    if (!client)
    {
        await self.clients.openWindow(scope + hash);
        return;
    }
    await client.focus();
    if (hash) client.postMessage({ type: "ring", hash, tapped: true });
}

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(open(event.notification.data?.hash ?? ""));
});
