import { signal } from "@papit/signals";

import { LIMITS, signalUrl } from "./config";
import { deviceKey } from "./keys";
import { log } from "./log";
import { me } from "./state";
import { storage } from "./storage";
import type { CallPush, CancelPush } from "./types";

// Web push through the signal server, which keeps nothing: it seals this browser's subscription
// into a token and hands it back. Whoever holds the token can wake this browser, so the token is
// what people save (contacts.ts). The server's API is in the @papit/signal-server README.

/** `busy`: subscribing or unsubscribing right now. */
export type PushState = "unsupported" | "off" | "busy" | "on";
export type PushStatus = "sent" | "gone" | "failed";
export type PushOptions = {
    /** Seconds the push service keeps trying. */
    ttl: number;
};

const WAKE_RETRY_MS = 5_000;
// answers from a proxy while the server is starting
const WAKING = new Set([502, 503, 504]);

class ServerError extends Error {
    constructor(readonly status: number) {
        super(`push: server said ${status}`);
    }
}

export const [pushState, setPushState] = signal<PushState>(startingState());
/** This browser's token, "" while notifications for calls are off. */
export const [pushToken, setPushToken] = signal<string>(storage.push.get()?.token ?? "");

function supported(): boolean {
    return typeof navigator !== "undefined"
        && "serviceWorker" in navigator
        && "PushManager" in window
        && typeof Notification !== "undefined";
}

function startingState(): PushState {
    return supported() ? "off" : "unsupported";
}

function httpBase(): string {
    return signalUrl().replace(/^ws/, "http").replace(/\/+$/, "");
}

// a sleeping server takes 30-60 s to answer: wait for it, and go again once if the wait broke
async function call<T>(path: string, body?: unknown, retry = true): Promise<T> {
    try
    {
        const response = await fetch(httpBase() + path, {
            signal: AbortSignal.timeout(LIMITS.wakeMs),
            ...(body === undefined ? {} : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }),
        });
        if (!response.ok) throw new ServerError(response.status);
        return await response.json() as T;
    }
    catch (error)
    {
        const refused = error instanceof ServerError && !WAKING.has(error.status);
        if (!retry || refused) throw error;
        log("push: retrying", path, error);
        await new Promise(resolve => setTimeout(resolve, WAKE_RETRY_MS));
        return call<T>(path, body, false);
    }
}

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, key: string): boolean {
    const own = subscription.options.applicationServerKey;
    if (!own) return false;
    const a = new Uint8Array(own);
    const b = keyBytes(key);
    return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

// new server keys void a subscription: only a new one works then. The server's token for an unchanged
// subscription is still good, so nothing is sent for it.
async function subscribe() {
    const registration = await navigator.serviceWorker.ready;
    const { key } = await call<{ key: string }>("/push/key");

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription, key))
    {
        await subscription.unsubscribe();
        subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });

    const stored = storage.push.get();
    if (stored?.endpoint === subscription.endpoint) return;

    const { token } = await call<{ token: string }>("/push/subscribe", { subscription: subscription.toJSON() });
    storage.push.set({ token, endpoint: subscription.endpoint });
    setPushToken(token);
    log("push: subscribed");
}

function clear() {
    storage.push.set(null);
    setPushToken("");
}

/** Call from a tap, iOS refuses the permission request otherwise. "denied" means the browser said no. */
export async function enablePush(): Promise<"on" | "denied" | "failed"> {
    if (!supported()) return "failed";
    const answer = await Notification.requestPermission();
    if (answer !== "granted") return "denied";

    setPushState("busy");
    try
    {
        await subscribe();
        setPushState("on");
        return "on";
    }
    catch (error)
    {
        log("push: subscribing failed", error);
        setPushState("off");
        return "failed";
    }
}

/** Stops call notifications here. A token someone saved answers `gone` from now on. */
export async function disablePush() {
    if (!supported()) return;
    setPushState("busy");
    try
    {
        const registration = await navigator.serviceWorker.ready;
        await (await registration.pushManager.getSubscription())?.unsubscribe();
    }
    catch (error)
    {
        log("push: unsubscribing failed", error);
    }
    clear();
    setPushState("off");
}

/** On app load: a subscription can change, and the permission can be taken back in the browser. */
export async function refreshPush() {
    if (!supported() || !storage.push.get()) return;
    if (Notification.permission !== "granted")
    {
        clear();
        return;
    }

    setPushState("on");
    try
    {
        await subscribe();
    }
    catch (error)
    {
        log("push: refresh failed, keeping the token", error);
    }
}

/** Wakes whoever holds `token`. "gone": the token is dead for good, drop it. */
export async function sendPush(token: string, payload: unknown, options: PushOptions): Promise<PushStatus> {
    try
    {
        const { status } = await call<{ status: PushStatus }>("/push/send", { token, payload, ttl: options.ttl, urgency: "high" });
        return status;
    }
    catch (error)
    {
        log("push: send failed", error);
        // the server can't open it: its keys changed, so this token will never work again
        return error instanceof ServerError && error.status === 400 ? "gone" : "failed";
    }
}

/** What a device signs to say it's calling. A token only lets you wake a browser, not speak for anyone. */
export function callText(call: Pick<CallPush, "id" | "key" | "kind" | "direct" | "from" | "at">): string {
    return `papchat call\n${call.id}\n${call.key}\n${call.kind}\n${call.direct}\n${call.from}\n${call.at}`;
}

/** Rings the device behind `token` into a room. */
export async function pushCall(token: string, room: { id: string; password: string }, kind: CallPush["kind"], direct: boolean): Promise<PushStatus> {
    const profile = me();
    const device = deviceKey();
    if (!profile || !device) return "failed";

    const call = { id: room.id, key: room.password, kind, direct, from: profile.uid, at: Date.now() };
    const payload: CallPush = { t: "call", ...call, name: profile.name, pub: device.key, sig: await device.sign(callText(call)) };
    return sendPush(token, payload, { ttl: LIMITS.ringOfflineMs / 1000 });
}

export function pushCancel(token: string, id: string) {
    const profile = me();
    if (!profile) return;
    const payload: CancelPush = { t: "cancel", id, from: profile.uid, name: profile.name };
    void sendPush(token, payload, { ttl: LIMITS.missedCallS });
}
