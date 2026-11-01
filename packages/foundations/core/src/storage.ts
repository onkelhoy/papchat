import type { AccountData, Contact, Debug, Network, Prefs, Profile, PushRecord, SavedAccount, Session } from "./types";

const KEYS = {
    profile: "papchat:profile",
    prefs: "papchat:prefs",
    debug: "papchat:debug",
    session: "papchat:session",
    network: "papchat:network",
    push: "papchat:push",
    contacts: "papchat:contacts",
    muted: "papchat:muted",
    people: "papchat:people",
    account: "papchat:account",
    deviceNames: "papchat:device-names",
} as const;

// Whoever uses this browser: a list of accounts, and which one is open. They belong to the browser,
// not to any account, like `debug`.
const LIST = "papchat:accounts";
const ACTIVE = "papchat:active";
// the slot a new account will take, kept so a logged out page doesn't make a new key on every load
const BLANK = "papchat:blank";

export const DEFAULT_PREFS: Prefs = {
    v: 1,
    ringtone: "beep-boom",
    dialtone: "",
    noiseReduction: "off",
    volume: 0.8,
    language: "",
    autoDeclineBusy: false,
    notifications: true,
    notificationsAsked: false,
    profileAt: 0,
    devices: {},
    sidebarOpen: true,
    recentEmoji: [],
    saveChats: true,
};

function read(area: () => Storage, key: string): unknown {
    try
    {
        const raw = area().getItem(key);
        return raw === null ? undefined : JSON.parse(raw);
    }
    catch
    {
        return undefined;
    }
}

function write(area: () => Storage, key: string, value: unknown) {
    try
    {
        if (value === undefined) area().removeItem(key);
        else area().setItem(key, JSON.stringify(value));
    }
    catch { /* private mode, quota, blocked storage: the app keeps working without persistence */ }
}

const local = () => localStorage;
const session = () => sessionStorage;

// One browser holds several accounts, each in its own slot. The first account's slot is "", so its
// names have no suffix: what was here before accounts existed simply is that account, nothing moves.
// `papchat:active` missing means "", null means logged out, and the page runs on a blank slot.
function openSlot(): { slot: string; out: boolean } {
    const active = read(local, ACTIVE);
    if (typeof active === "string") return { slot: active, out: false };
    if (active !== null) return { slot: "", out: false };
    return { slot: blankSlot(), out: true };
}

function blankSlot(): string {
    const blank = read(local, BLANK);
    if (typeof blank === "string" && blank) return blank;
    const slot = crypto.randomUUID();
    write(local, BLANK, slot);
    return slot;
}

const opened = openSlot();
/** The slot this page runs on. Fixed for the life of the page: changing account reloads it. */
export const slot = opened.slot;
let loggedOut = opened.out;

/** A storage name inside a slot, for `localStorage` keys, databases and broadcast channels alike. */
export const inSlot = (name: string, of: string = slot) => of ? `${name}:${of}` : name;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProfile(value: unknown): value is Profile {
    return hasProfileFields(value) && value.v === 2 && typeof value.key === "string" && value.key.length > 0;
}

function hasProfileFields(value: unknown): value is Record<string, unknown> {
    return isObject(value)
        && typeof value.uid === "string" && value.uid.length > 0
        && typeof value.name === "string" && value.name.length > 0
        && typeof value.color === "string"
        && ["available", "busy", "away", "dnd"].includes(value.status as string);
}

function isSavedAccount(value: unknown): value is SavedAccount {
    return isObject(value)
        && typeof value.slot === "string"
        && typeof value.uid === "string"
        && typeof value.name === "string"
        && typeof value.color === "string"
        && typeof value.at === "number";
}

function isContact(value: unknown): value is Contact {
    return isObject(value)
        && typeof value.uid === "string" && value.uid.length > 0
        && typeof value.name === "string"
        && typeof value.color === "string"
        && typeof value.token === "string" && value.token.length > 0
        && typeof value.at === "number";
}

export const storage = {
    profile: {
        get(): Profile | null {
            const value = read(local, inSlot(KEYS.profile));
            return isProfile(value) ? value : null;
        },
        /** A profile from before device keys, for its name, colour and status. */
        legacy(): Pick<Profile, "name" | "color" | "status"> | null {
            const value = read(local, inSlot(KEYS.profile));
            return hasProfileFields(value) && value.v === 1 ? value as Pick<Profile, "name" | "color" | "status"> : null;
        },
        set(value: Profile | null) {
            write(local, inSlot(KEYS.profile), value ?? undefined);
        },
    },
    prefs: {
        // unknown or wrongly typed fields fall back to the defaults one by one
        get(): Prefs {
            const value = read(local, inSlot(KEYS.prefs));
            if (!isObject(value) || value.v !== 1) return { ...DEFAULT_PREFS, devices: {}, recentEmoji: [] };

            const prefs = { ...DEFAULT_PREFS, devices: {}, recentEmoji: [] } as Prefs;
            for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[])
            {
                if (key === "devices")
                {
                    if (isObject(value.devices)) prefs.devices = { ...value.devices } as Prefs["devices"];
                    continue;
                }
                if (key === "recentEmoji")
                {
                    if (Array.isArray(value.recentEmoji)) prefs.recentEmoji = value.recentEmoji.filter((e): e is string => typeof e === "string").slice(0, 24);
                    continue;
                }
                if (typeof value[key] === typeof DEFAULT_PREFS[key]) (prefs as Record<string, unknown>)[key] = value[key];
            }
            prefs.volume = Math.min(1, Math.max(0, prefs.volume));
            return prefs;
        },
        set(value: Prefs) {
            write(local, inSlot(KEYS.prefs), value);
        },
    },
    // null = the public lobby
    network: {
        get(): Network | null {
            const value = read(local, inSlot(KEYS.network));
            if (!isObject(value) || typeof value.name !== "string" || !value.name.trim()) return null;
            return { name: value.name.trim(), password: typeof value.password === "string" ? value.password : "", ...(value.nosave === true ? { nosave: true } : {}) };
        },
        set(value: Network | null) {
            write(local, inSlot(KEYS.network), value ?? undefined);
        },
    },
    // this browser's push token, and the subscription it was made from
    push: {
        get(): PushRecord | null {
            const value = read(local, inSlot(KEYS.push));
            return isObject(value) && typeof value.token === "string" && typeof value.endpoint === "string"
                ? { token: value.token, endpoint: value.endpoint }
                : null;
        },
        set(value: PushRecord | null) {
            write(local, inSlot(KEYS.push), value ?? undefined);
        },
    },
    contacts: {
        get(): Contact[] {
            const value = read(local, inSlot(KEYS.contacts));
            return Array.isArray(value) ? value.filter(isContact) : [];
        },
        set(value: Contact[]) {
            write(local, inSlot(KEYS.contacts), value);
        },
    },
    // uid → the uid standing for that person, see people.ts
    people: {
        get(): Record<string, string> {
            const value = read(local, inSlot(KEYS.people));
            if (!isObject(value)) return {};
            return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
        },
        set(value: Record<string, string>) {
            write(local, inSlot(KEYS.people), value);
        },
    },
    // every device link and removal you've seen, see account.ts
    account: {
        get(): AccountData {
            const value = read(local, inSlot(KEYS.account));
            return isObject(value) && Array.isArray(value.links) && Array.isArray(value.removed)
                ? value as AccountData
                : { links: [], removed: [] };
        },
        set(value: AccountData) {
            write(local, inSlot(KEYS.account), value);
        },
    },
    // what your devices are called
    deviceNames: {
        get(): Record<string, string> {
            const value = read(local, inSlot(KEYS.deviceNames));
            return isObject(value) ? value as Record<string, string> : {};
        },
        set(value: Record<string, string>) {
            write(local, inSlot(KEYS.deviceNames), value);
        },
    },
    // people you've muted in global chat
    muted: {
        get(): string[] {
            const value = read(local, inSlot(KEYS.muted));
            return Array.isArray(value) ? value.filter((uid): uid is string => typeof uid === "string") : [];
        },
        set(value: string[]) {
            write(local, inSlot(KEYS.muted), value);
        },
    },
    // every account on this browser, latest first
    accounts: {
        get(): SavedAccount[] {
            const value = read(local, LIST);
            return Array.isArray(value) ? value.filter(isSavedAccount).sort((a, b) => b.at - a.at) : [];
        },
        /** Puts this slot's profile on the list. The first profile on a blank slot also opens it. */
        remember(profile: Pick<Profile, "uid" | "name" | "color">) {
            const others = storage.accounts.get().filter(account => account.slot !== slot);
            write(local, LIST, [{ slot, uid: profile.uid, name: profile.name, color: profile.color, at: Date.now() }, ...others]);
            if (!loggedOut) return;
            loggedOut = false;
            write(local, ACTIVE, slot);
            write(local, BLANK, undefined);
        },
    },
    debug: {
        get(): Debug {
            const value = read(local, KEYS.debug);
            return isObject(value) ? value as Debug : {};
        },
        set(value: Debug) {
            write(local, KEYS.debug, value);
        },
    },
    // tab scoped: rooms this tab is in, so a refresh can rejoin them
    session: {
        get(): Session {
            const value = read(session, KEYS.session);
            if (!isObject(value) || !Array.isArray(value.rooms)) return { rooms: [] };
            return {
                rooms: value.rooms.filter(r => isObject(r) && typeof r.id === "string" && typeof r.kind === "string") as Session["rooms"],
            };
        },
        set(value: Session) {
            write(session, KEYS.session, value);
        },
    },
};

// an account from before the list, or from a list that was lost, still belongs on it
const present = storage.profile.get() ?? storage.profile.legacy() as (Profile | null);
if (present && !loggedOut && !storage.accounts.get().some(account => account.slot === slot)) storage.accounts.remember(present);
