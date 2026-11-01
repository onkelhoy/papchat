import { effect } from "@papit/signals";

import { setStatus } from "./identity";
import { log } from "./log";
import { enablePush, pushState } from "./push";
import { getRoom } from "./room";
import { buzzed, incoming, me, prefs, rooms, setPrefs } from "./state";

// While you're not looking at papchat (PLAN §2.8, §6.9): a `Notification` for incoming calls and new
// messages (when the user allowed it in settings). While the tab is hidden: a flashing title while
// something rings, and `away` after 5 minutes, restored on return. `startNotify()` once at boot.

const AWAY_MS = 5 * 60_000;
const FLASH_MS = 1_000;
// a message this old came from history, not from someone writing now
const FRESH_MS = 2 * 60_000;
// someone who hasn't answered is asked again now and then, not on every visit
const ASK_AGAIN_MS = 7 * 24 * 60 * 60_000;

let started = false;
let awayTimer: ReturnType<typeof setTimeout> | undefined;
let wentAway = false;
let flashTimer: ReturnType<typeof setInterval> | undefined;
let flashBase = "";

/** True when the browser has notifications and the user said yes (in settings and to the browser). */
export function canNotify(): boolean {
    return typeof Notification !== "undefined" && Notification.permission === "granted" && prefs().notifications;
}

/** Asks the browser for permission (call from a click), stores the answer in prefs, and a yes covers calls with the app closed too. */
export async function requestNotifications(): Promise<boolean> {
    if (typeof Notification === "undefined") return false;
    let answer: NotificationPermission = Notification.permission;
    try
    {
        if (answer === "default") answer = await Notification.requestPermission();
    }
    catch (error)
    {
        log("notify: permission failed", error);
    }
    const granted = answer === "granted";
    setPrefs({ notifications: granted });
    if (granted) void enablePush();
    return granted;
}

/**
 * As soon as there's a profile, and again a week later for as long as nobody decided: calls `prompt`
 * unless the browser already settled it. The browser's own question needs a click on most browsers, so
 * `prompt` shows a button that calls `requestNotifications`. Until that's a yes the setting stays off,
 * so it never shows on and does nothing. iOS has nothing to ask with before the app is installed, so
 * `install` says how to get there.
 */
export function askNotifications(prompt: () => void, install: () => void) {
    effect(() => {
        if (!me() || Date.now() - prefs().notificationsAskedAt < ASK_AGAIN_MS) return;
        if (pushState() === "install")
        {
            setPrefs({ notificationsAskedAt: Date.now() });
            install();
            return;
        }
        if (typeof Notification === "undefined") return;

        const permission = Notification.permission;
        if (permission === "denied" || (permission === "granted" && prefs().notifications)) return;
        setPrefs({ notificationsAskedAt: Date.now(), notifications: false });
        prompt();
    });
}

/** Wires the watchers. Safe to call more than once. */
export function startNotify() {
    if (started || typeof document === "undefined") return;
    started = true;

    document.addEventListener("visibilitychange", onVisibility);
    watchCalls();
    watchMessages();
    watchBuzz();
}

function show(title: string, body: string, tag: string) {
    // a window behind another app isn't `hidden`, only unfocused
    if ((!document.hidden && document.hasFocus()) || !canNotify())
    {
        log("notify: not shown", tag, { hidden: document.hidden, focused: document.hasFocus(), permission: typeof Notification === "undefined" ? "none" : Notification.permission, setting: prefs().notifications });
        return;
    }
    void present(title, body, tag);
}

// through the service worker when there is one: that's how calls arrive, and a click on it opens the app
async function present(title: string, body: string, tag: string) {
    // `renotify`: the next message with this tag alerts too, instead of quietly replacing the last
    const options = { body, tag, renotify: true, data: {} } as NotificationOptions;
    try
    {
        const worker = await navigator.serviceWorker?.getRegistration();
        if (worker)
        {
            await worker.showNotification(title, options);
            log("notify: shown by the worker", tag);
            return;
        }
        const note = new Notification(title, options);
        note.onclick = () => {
            window.focus();
            note.close();
        };
        log("notify: shown by the page", tag);
    }
    catch (error)
    {
        log("notify: show failed", error);
    }
}

// ---------------------------------------------------------------- calls

function watchCalls() {
    const seen = new Set<string>();
    effect(() => {
        const calls = incoming();
        for (const call of calls)
        {
            if (seen.has(call.id)) continue;
            seen.add(call.id);
            const what = call.kind === "stage" ? `invites you to watch ${call.title}` : call.kind === "video" ? "is video calling…" : "is calling…";
            show(`${call.from.name} ${what}`, "papchat", `call:${call.id}`);
        }
        for (const id of seen) if (!calls.some(c => c.id === id)) seen.delete(id);

        if (calls.length > 0 && document.hidden) startFlash(`📞 ${calls[calls.length - 1].from.name}`);
        else stopFlash();
    });
}

function startFlash(text: string) {
    if (flashTimer) return;
    flashBase = document.title;
    let on = false;
    flashTimer = setInterval(() => {
        on = !on;
        document.title = on ? text : flashBase;
    }, FLASH_MS);
}

function stopFlash() {
    if (!flashTimer) return;
    clearInterval(flashTimer);
    flashTimer = undefined;
    document.title = flashBase;
}

// ---------------------------------------------------------------- messages

function watchMessages() {
    // last message id per room, "" for one with none yet: only new ones notify, including a chat's first
    const last = new Map<string, string>();
    effect(() => {
        const mine = me()?.uid;
        for (const summary of rooms())
        {
            const room = getRoom(summary.id);
            if (!room) continue;
            const list = room.messages();
            const newest = list[list.length - 1];
            log("notify: room", room.id, newest?.id, newest?.state);
            const before = last.get(room.id);
            last.set(room.id, newest?.id ?? "");
            if (!newest || before === newest.id) continue;
            if (Date.now() - newest.at > FRESH_MS || newest.uid === mine || newest.variant !== "text")
            {
                log("notify: no alert for", newest.variant, { age: Date.now() - newest.at, mine: newest.uid === mine });
                continue;
            }

            const from = room.participants().find(p => p.uid === newest.uid)?.name ?? "Someone";
            show(room.title ? `${from} in ${room.title}` : from, newest.text ?? "", `room:${room.id}`);
        }
    });
}

// ---------------------------------------------------------------- buzz

function watchBuzz() {
    effect(() => {
        const buzz = buzzed();
        if (!buzz) return;
        show(`${buzz.name} buzzed you`, "papchat", `buzz:${buzz.room}`);
    });
}

// ---------------------------------------------------------------- away

function onVisibility() {
    if (document.hidden)
    {
        clearTimeout(awayTimer);
        awayTimer = setTimeout(goAway, AWAY_MS);
        const calls = incoming();
        if (calls.length > 0) startFlash(`📞 ${calls[calls.length - 1].from.name}`);
        return;
    }

    clearTimeout(awayTimer);
    stopFlash();
    if (wentAway && me()?.status === "away") setStatus("available");
    wentAway = false;
}

// only from `available`: dnd, busy and a chosen away are the user's
function goAway() {
    if (!document.hidden || me()?.status !== "available") return;
    wentAway = true;
    setStatus("away");
}
