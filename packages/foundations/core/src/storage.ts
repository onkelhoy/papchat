import type { Contact, Debug, Network, Prefs, Profile, PushRecord, Session } from "./types";

const KEYS = {
    profile: "papchat:profile",
    prefs: "papchat:prefs",
    debug: "papchat:debug",
    session: "papchat:session",
    network: "papchat:network",
    push: "papchat:push",
    contacts: "papchat:contacts",
    muted: "papchat:muted",
} as const;

export const DEFAULT_PREFS: Prefs = {
    v: 1,
    ringtone: "beep-boom",
    dialtone: "",
    noiseReduction: "off",
    volume: 0.8,
    language: "",
    autoDeclineBusy: false,
    notifications: false,
    devices: {},
    sidebarOpen: true,
    recentEmoji: [],
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
            const value = read(local, KEYS.profile);
            return isProfile(value) ? value : null;
        },
        /** A profile from before device keys, for its name, colour and status. */
        legacy(): Pick<Profile, "name" | "color" | "status"> | null {
            const value = read(local, KEYS.profile);
            return hasProfileFields(value) && value.v === 1 ? value as Pick<Profile, "name" | "color" | "status"> : null;
        },
        set(value: Profile | null) {
            write(local, KEYS.profile, value ?? undefined);
        },
    },
    prefs: {
        // unknown or wrongly typed fields fall back to the defaults one by one
        get(): Prefs {
            const value = read(local, KEYS.prefs);
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
            write(local, KEYS.prefs, value);
        },
    },
    // null = the public lobby
    network: {
        get(): Network | null {
            const value = read(local, KEYS.network);
            if (!isObject(value) || typeof value.name !== "string" || !value.name.trim()) return null;
            return { name: value.name.trim(), password: typeof value.password === "string" ? value.password : "" };
        },
        set(value: Network | null) {
            write(local, KEYS.network, value ?? undefined);
        },
    },
    // this browser's push token, and the subscription it was made from
    push: {
        get(): PushRecord | null {
            const value = read(local, KEYS.push);
            return isObject(value) && typeof value.token === "string" && typeof value.endpoint === "string"
                ? { token: value.token, endpoint: value.endpoint }
                : null;
        },
        set(value: PushRecord | null) {
            write(local, KEYS.push, value ?? undefined);
        },
    },
    contacts: {
        get(): Contact[] {
            const value = read(local, KEYS.contacts);
            return Array.isArray(value) ? value.filter(isContact) : [];
        },
        set(value: Contact[]) {
            write(local, KEYS.contacts, value);
        },
    },
    // people you've muted in global chat
    muted: {
        get(): string[] {
            const value = read(local, KEYS.muted);
            return Array.isArray(value) ? value.filter((uid): uid is string => typeof uid === "string") : [];
        },
        set(value: string[]) {
            write(local, KEYS.muted, value);
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
