import { signal } from "@papit/signals";

import { LIMITS } from "./config";
import { cleanGif } from "./gif";
import { log } from "./log";
import { personOf } from "./people";
import { prefs } from "./state";
import type { ChatMessage, Conversation, ConversationMember } from "./types";

// Saved chats: conversations and their messages, on this device only, in IndexedDB. Files aren't kept.
// A conversation belongs to people, not to a room: rooms disappear, and this is what's left of them.
// A 1:1 is keyed by its two people, a group by a uuid its room carries in `meta`.

const DB = "papchat-history";
const CONVERSATIONS = "conversations";
const MESSAGES = "messages";
const BY_TIME = "byTime";
const OUTBOX = "outbox";
const TABS = "papchat-history";

const SAVED_VARIANTS: ChatMessage["variant"][] = ["text", "gif"];

// a message on disk; `outbox` is the conversation id while it still has to go out, absent after
type Stored = ChatMessage & { key: string; conversation: string; outbox?: string };

/** Saved conversations, latest first. */
export const [conversations, setConversations] = signal<Conversation[]>([]);
/** A saved conversation on screen with no room behind it, null when there is none. */
export const [viewing, setViewing] = signal<SavedView | null>(null);
/** conversation id → messages waiting to go out. */
export const [outbox, setOutbox] = signal<Record<string, number>>({});
/** False when this network asked its members not to save chats. */
export const [networkSaves, setNetworkSaves] = signal(true);

export type SavedView = { conversation: Conversation; messages: ChatMessage[] };

/** True when a new message should be written down. */
export function canSave(): boolean {
    return prefs().saveChats && networkSaves() && typeof indexedDB !== "undefined";
}

/** A 1:1 is the same conversation from both ends, and from any device of either person. */
export function directId(a: string, b: string): string {
    return `dm:${[personOf(a), personOf(b)].sort().join(":")}`;
}

const keyOf = (conversation: string, id: string) => `${conversation}\n${id}`;

function done<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function finished(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
    });
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
    opening ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore(CONVERSATIONS, { keyPath: "id" });
            const messages = db.createObjectStore(MESSAGES, { keyPath: "key" });
            messages.createIndex(BY_TIME, ["conversation", "at"]);
            // only messages that carry the field are in it
            messages.createIndex(OUTBOX, OUTBOX);
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            // another tab deleting the database shouldn't wait for this one
            db.onversionchange = () => {
                db.close();
                opening = null;
            };
            resolve(db);
        };
    });
    return opening;
}

// runs `work`, and a blocked or missing IndexedDB (some private windows) becomes `fallback`
async function attempt<T>(fallback: T, work: (db: IDBDatabase) => Promise<T>): Promise<T> {
    if (typeof indexedDB === "undefined") return fallback;
    try
    {
        return await work(await open());
    }
    catch (error)
    {
        log("history: failed", error);
        return fallback;
    }
}

// ---------------------------------------------------------------- list

// other tabs of this browser save too
const tabs = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(TABS);
if (tabs) tabs.onmessage = () => void refresh();

async function refresh() {
    const list = await attempt<Conversation[]>([], db => done(db.transaction(CONVERSATIONS).objectStore(CONVERSATIONS).getAll()));
    setConversations(list.sort((a, b) => b.at - a.at));

    const waiting = await attempt<string[]>([], async db => {
        const stored = await done(db.transaction(MESSAGES).objectStore(MESSAGES).index(OUTBOX).getAll()) as Stored[];
        return stored.map(message => message.conversation);
    });
    const counts: Record<string, number> = {};
    for (const id of waiting) counts[id] = (counts[id] ?? 0) + 1;
    setOutbox(counts);
}

function changed() {
    void refresh();
    tabs?.postMessage(0);
}

/** Loads the saved list and asks the browser to keep it (Safari can evict sites that aren't installed). */
export async function startHistory() {
    await refresh();
    try
    {
        await navigator.storage?.persist?.();
    }
    catch (error)
    {
        log("history: persist refused", error);
    }
}

// ---------------------------------------------------------------- saving

type Saved = (conversation: Conversation, messages: ChatMessage[]) => void;
const savedListeners = new Set<Saved>();

/** Hears about every message written here for the first time. Linked devices follow along this way. */
export function onSaved(listener: Saved): () => void {
    savedListeners.add(listener);
    return () => savedListeners.delete(listener);
}

function merge(existing: Conversation | undefined, next: Conversation, at: number): Conversation {
    const members = new Map<string, ConversationMember>((existing?.members ?? []).map(member => [member.uid, member]));
    for (const member of next.members) members.set(member.uid, member);
    return {
        id: next.id,
        direct: next.direct,
        title: next.title || existing?.title || "",
        members: [...members.values()],
        at: Math.max(existing?.at ?? 0, at),
    };
}

/** What gets written for a message: the fields of `ChatMessage`, the key, and `outbox` while it's unsent. */
function stored(conversation: string, message: ChatMessage): Stored {
    const entry: Stored = { ...message, key: keyOf(conversation, message.id), conversation };
    if (message.state === "sending" || message.state === "failed") entry.outbox = conversation;
    return entry;
}

/**
 * Writes messages (text and GIFs) and brings the conversation up to date. With `replace` off a message
 * that's already there stays as it is, so this is safe to repeat. `silent` keeps it from `onSaved`.
 */
export async function saveMessages(conversation: Conversation, messages: ChatMessage[], options: { replace?: boolean; silent?: boolean } = {}) {
    const list = messages.filter(message => SAVED_VARIANTS.includes(message.variant));
    if (list.length === 0) return;
    const latest = Math.max(...list.map(message => message.at));
    const fresh: ChatMessage[] = [];

    const record = await attempt<Conversation | null>(null, async db => {
        const tx = db.transaction([CONVERSATIONS, MESSAGES], "readwrite");
        const store = tx.objectStore(MESSAGES);
        const rows = tx.objectStore(CONVERSATIONS);
        const merged = merge(await done(rows.get(conversation.id)) as Conversation | undefined, conversation, latest);
        rows.put(merged);
        await Promise.all(list.map(async message => {
            const entry = stored(conversation.id, message);
            const known = await done(store.getKey(entry.key));
            if (known === undefined) fresh.push(message);
            if (known === undefined || options.replace) store.put(entry);
        }));
        await finished(tx);
        return merged;
    });
    if (!record) return;
    changed();
    if (!options.silent && fresh.length > 0) for (const listener of savedListeners) listener(record, fresh);
}

/** Records a conversation with no new message, like the group a chat just became. */
export async function saveConversation(conversation: Conversation) {
    await attempt(undefined, async db => {
        const tx = db.transaction(CONVERSATIONS, "readwrite");
        const rows = tx.objectStore(CONVERSATIONS);
        const existing = await done(rows.get(conversation.id)) as Conversation | undefined;
        rows.put(merge(existing, conversation, existing?.at ?? conversation.at));
        await finished(tx);
    });
    changed();
}

/** Marks messages as delivered, so they leave the outbox. */
export async function markSent(conversation: string, ids: string[]) {
    await attempt(undefined, async db => {
        const tx = db.transaction(MESSAGES, "readwrite");
        const store = tx.objectStore(MESSAGES);
        await Promise.all(ids.map(async id => {
            const entry = await done(store.get(keyOf(conversation, id))) as Stored | undefined;
            if (!entry) return;
            delete entry.outbox;
            entry.state = "sent";
            store.put(entry);
        }));
        await finished(tx);
    });
    changed();
}

// ---------------------------------------------------------------- reading

function plain({ key: _key, conversation: _conversation, outbox: _outbox, ...message }: Stored): ChatMessage {
    return message;
}

/** Up to `limit` messages at or before `before` (default: the newest), oldest first. */
export async function loadMessages(conversation: string, limit: number = LIMITS.historyPage, before: number = Number.MAX_SAFE_INTEGER): Promise<ChatMessage[]> {
    return attempt<ChatMessage[]>([], db => new Promise((resolve, reject) => {
        const list: ChatMessage[] = [];
        const range = IDBKeyRange.bound([conversation, 0], [conversation, before]);
        const cursor = db.transaction(MESSAGES).objectStore(MESSAGES).index(BY_TIME).openCursor(range, "prev");
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row || list.length >= limit)
            {
                resolve(list.reverse());
                return;
            }
            list.push(plain(row.value as Stored));
            row.continue();
        };
    }));
}

/** Your messages that haven't gone out, oldest first. */
export async function unsent(conversation: string): Promise<ChatMessage[]> {
    const list = await attempt<Stored[]>([], db => done(db.transaction(MESSAGES).objectStore(MESSAGES).index(OUTBOX).getAll(conversation)) as Promise<Stored[]>);
    return list.map(plain).sort((a, b) => a.at - b.at);
}

/** Ids of the conversation's messages since `since`, newest first, at most `limit`. */
export async function messageIds(conversation: string, since: number, limit: number = Number.MAX_SAFE_INTEGER): Promise<string[]> {
    return attempt<string[]>([], db => new Promise((resolve, reject) => {
        const list: string[] = [];
        const range = IDBKeyRange.bound([conversation, since], [conversation, Number.MAX_SAFE_INTEGER]);
        const cursor = db.transaction(MESSAGES).objectStore(MESSAGES).index(BY_TIME).openCursor(range, "prev");
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row || list.length >= limit)
            {
                resolve(list);
                return;
            }
            list.push((row.value as Stored).id);
            row.continue();
        };
    }));
}

/** The messages with these ids; ids that aren't here are left out. */
export async function messagesById(conversation: string, ids: string[]): Promise<ChatMessage[]> {
    return attempt<ChatMessage[]>([], async db => {
        const store = db.transaction(MESSAGES).objectStore(MESSAGES);
        const rows = await Promise.all(ids.map(id => done(store.get(keyOf(conversation, id))) as Promise<Stored | undefined>));
        return rows.filter((row): row is Stored => !!row).map(plain);
    });
}

/** True when the message is already saved. */
export async function hasMessage(conversation: string, id: string): Promise<boolean> {
    return attempt(false, async db => await done(db.transaction(MESSAGES).objectStore(MESSAGES).getKey(keyOf(conversation, id))) !== undefined);
}

// ---------------------------------------------------------------- deleting and moving

async function removeMessages(store: IDBObjectStore, conversation: string) {
    const range = IDBKeyRange.bound([conversation, 0], [conversation, Number.MAX_SAFE_INTEGER]);
    const keys = await done(store.index(BY_TIME).getAllKeys(range));
    for (const key of keys) store.delete(key);
}

/** Deletes one conversation from this device. */
export async function deleteConversation(id: string) {
    await attempt(undefined, async db => {
        const tx = db.transaction([CONVERSATIONS, MESSAGES], "readwrite");
        tx.objectStore(CONVERSATIONS).delete(id);
        await removeMessages(tx.objectStore(MESSAGES), id);
        await finished(tx);
    });
    if (viewing()?.conversation.id === id) setViewing(null);
    changed();
}

/** Deletes every saved conversation from this device. */
export async function deleteAllConversations() {
    await attempt(undefined, async db => {
        const tx = db.transaction([CONVERSATIONS, MESSAGES], "readwrite");
        tx.objectStore(CONVERSATIONS).clear();
        tx.objectStore(MESSAGES).clear();
        await finished(tx);
    });
    setViewing(null);
    changed();
}

/** Folds one conversation into another by message id: someone's two devices turn out to be one person. */
export async function moveConversation(from: string, to: Conversation) {
    if (from === to.id) return;
    await attempt(undefined, async db => {
        const tx = db.transaction([CONVERSATIONS, MESSAGES], "readwrite");
        const rows = tx.objectStore(CONVERSATIONS);
        const store = tx.objectStore(MESSAGES);
        const source = await done(rows.get(from)) as Conversation | undefined;
        if (!source)
        {
            await finished(tx);
            return;
        }
        const target = await done(rows.get(to.id)) as Conversation | undefined;
        rows.put({ ...merge(merge(target, to, to.at), source, source.at), id: to.id, direct: to.direct, title: to.title || target?.title || source.title });

        const range = IDBKeyRange.bound([from, 0], [from, Number.MAX_SAFE_INTEGER]);
        const list = await done(store.index(BY_TIME).getAll(range)) as Stored[];
        for (const message of list)
        {
            store.delete(message.key);
            store.put(stored(to.id, plain(message)));
        }
        rows.delete(from);
        await finished(tx);
    });
    changed();
}

/** A conversation's name, for one with no live room to take it from. */
export function titleOf(conversation: Conversation): string {
    return conversation.title || conversation.members.map(member => member.name).join(", ");
}

/** The fields of an incoming history message that are safe to keep, null when it isn't one. */
export function readMessage(raw: unknown): ChatMessage | null {
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as Record<string, unknown>;
    if (typeof value.id !== "string" || !value.id || value.id.length > 64) return null;
    if (typeof value.uid !== "string" || !value.uid || value.uid.length > 200) return null;
    if (typeof value.text !== "string" || typeof value.at !== "number" || !Number.isFinite(value.at)) return null;
    const text = value.text.trim().slice(0, LIMITS.messageChars);
    if (!text) return null;

    const at = Math.min(value.at, Date.now());
    const gif = value.variant === "gif" ? cleanGif(value.gif) : null;
    return gif
        ? { id: value.id, uid: value.uid, at, variant: "gif", text, gif }
        : { id: value.id, uid: value.uid, at, variant: "text", text };
}

/** The network's wish about saving, from a network's meta. */
export function readNetworkSaves(meta: Record<string, unknown> | undefined) {
    setNetworkSaves(meta?.history !== false);
}
