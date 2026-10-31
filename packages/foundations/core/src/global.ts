import { signal } from "@papit/signals";

import { LIMITS } from "./config";
import { broadcast, on } from "./lobby";
import { log } from "./log";
import { me } from "./state";
import { storage } from "./storage";
import type { ChatMessage, Profile } from "./types";

// Global chat: a line everyone in the network shares, sent as one lobby broadcast, so it travels the
// chord network and its relays with no room behind it. Each network has its own, because the lobby is
// the network. It never notifies, makes no sound and isn't saved: late joiners see nothing earlier.
// Nobody can moderate the public lobby, so every client applies its own rate limit and mutes.

const TYPE = "global";
const KEPT = 200;

/** The row id of global chat in the room list. */
export const GLOBAL_ID = "global";

const [globalLog, setGlobalLog] = signal<ChatMessage[]>([]);
const [authors, setAuthors] = signal<Record<string, Profile>>({});

/** Everyone who posted, by uid: they may have left since. */
export const globalAuthors = authors;
/** True when global chat is what's on screen. */
export const [globalOpen, setGlobalOpenSignal] = signal(false);
/** Something new was posted while global chat wasn't open. Shows as a dot, never as a count. */
export const [globalUnseen, setGlobalUnseen] = signal(false);
/** uids you've muted here. Only hides them for you. */
export const [muted, setMuted] = signal<string[]>(storage.muted.get());

/** What global chat shows: the posts of everyone you haven't muted, oldest first. */
export function globalMessages(): ChatMessage[] {
    const hidden = new Set(muted());
    return globalLog().filter(message => !hidden.has(message.uid));
}

export function setGlobalOpen(open: boolean) {
    setGlobalOpenSignal(open);
    if (open) setGlobalUnseen(false);
}

/** Mutes or unmutes `uid` on this device. */
export function toggleMute(uid: string) {
    const next = muted().includes(uid) ? muted().filter(other => other !== uid) : [...muted(), uid];
    storage.muted.set(next);
    setMuted(next);
}

function add(message: ChatMessage, author: Profile) {
    setAuthors(map => ({ ...map, [author.uid]: author }));
    setGlobalLog(list => [...list, message].slice(-KEPT));
}

let lastPost = 0;

/** Posts to everyone in this network. False when empty, too soon after your last post, or not connected. */
export function postGlobal(text: string): boolean {
    const profile = me();
    const clean = String(text ?? "").trim().slice(0, LIMITS.messageChars);
    const now = Date.now();
    if (!clean || !profile || now - lastPost < LIMITS.globalGapMs) return false;

    const id = crypto.randomUUID();
    if (!broadcast(TYPE, { id, text: clean })) return false;
    lastPost = now;
    add({ id, uid: profile.uid, at: now, variant: "text", text: clean }, profile);
    return true;
}

// senders over the limit are dropped here, whatever their own client lets them do
const lastHeard = new Map<string, number>();

on<unknown>(TYPE, (payload, from) => {
    if (!from.profile || !from.uid || typeof payload !== "object" || payload === null) return;
    const { id, text } = payload as Record<string, unknown>;
    if (typeof text !== "string" || typeof id !== "string" || !id || id.length > 64) return;
    const clean = text.trim().slice(0, LIMITS.messageChars);
    if (!clean) return;

    const now = Date.now();
    if (now - (lastHeard.get(from.uid) ?? 0) < LIMITS.globalGapMs)
    {
        log("global: too fast, dropped", from.uid);
        return;
    }
    lastHeard.set(from.uid, now);

    add({ id: id, uid: from.uid, at: now, variant: "text", text: clean }, from.profile);
    if (!globalOpen() && !muted().includes(from.uid)) setGlobalUnseen(true);
});
