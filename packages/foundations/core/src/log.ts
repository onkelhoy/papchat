import { signal } from "@papit/signals";

import { storage } from "./storage";

// What the app is doing. While logging is on, lines go to the console and to a list in memory that the
// logs page shows. The list lasts until a reload; the switch itself is remembered, so a reload logs
// from the very start. People copy these lines to someone else, so what's secret never goes in them.

const KEPT = 1_000;
const LINE_MAX = 2_000;
// a burst of lines shows as one update
const SHOW_MS = 250;
const SECRET = new Set(["password", "token", "sig", "signature", "sa", "sb"]);

export type LogLine = { id: number; at: number; text: string };

/** True while logging is on. */
export const [logging, setLoggingSignal] = signal(storage.debug.get().log === true);
/** What's been logged since the page loaded, oldest first. */
export const [logLines, setLogLines] = signal<LogLine[]>([]);

let enabled: boolean | null = null;
let lines: LogLine[] = [];
let lastId = 0;
let showing: ReturnType<typeof setTimeout> | undefined;

function hide(key: string, value: unknown) {
    return SECRET.has(key) ? "(hidden)" : value;
}

function text(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value !== "object" || value === null) return String(value);
    try
    {
        return JSON.stringify(value, hide) ?? String(value);
    }
    catch
    {
        return String(value);
    }
}

function keep(args: unknown[]) {
    lines.push({ id: ++lastId, at: Date.now(), text: args.map(text).join(" ").slice(0, LINE_MAX) });
    if (lines.length > KEPT) lines = lines.slice(-KEPT);
    showing ??= setTimeout(() => {
        showing = undefined;
        setLogLines([...lines]);
    }, SHOW_MS);
}

export function log(...args: unknown[]) {
    if (enabled === null) enabled = storage.debug.get().log === true;
    if (!enabled) return;
    console.debug("[papchat]", ...args);
    keep(args);
}

export function setLogging(on: boolean) {
    enabled = on;
    storage.debug.set({ ...storage.debug.get(), log: on });
    setLoggingSignal(on);
}

const watched = new WeakSet<EventTarget>();

/** Logs what a webrtc client reports about its links and socket. Only the words: the details can hold addresses. */
export function logClient(client: EventTarget, name: string) {
    if (watched.has(client)) return;
    watched.add(client);
    client.addEventListener("debug", event => {
        const { type, message } = (event as CustomEvent<{ type?: string; message?: string }>).detail ?? {};
        if (type !== "duplicate") log(`${name}: ${type}:`, message);
    });
}

if (typeof window !== "undefined")
{
    window.addEventListener("error", event => log("uncaught:", event.error ?? event.message));
    window.addEventListener("unhandledrejection", event => log("uncaught:", event.reason));
}
