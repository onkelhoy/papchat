import { deviceKey, loadDeviceKey } from "./keys";
import { setLobbyProfile } from "./lobby";
import { log } from "./log";
import { setRoomsProfile } from "./room";
import { me, setMe, setPrefs } from "./state";
import { storage } from "./storage";
import type { Profile, Status } from "./types";

// who you are: a uid from this device's key (keys.ts) plus a name and colour, which are only labels

// avatar colours offered in onboarding/settings; a new profile gets a random one
export const PALETTE = [
    "#2563eb", // blue
    "#7c3aed", // violet
    "#db2777", // pink
    "#dc2626", // red
    "#ea580c", // orange
    "#ca8a04", // amber
    "#16a34a", // green
    "#0d9488", // teal
] as const;

export const NAME_MAX = 32;

const STATUSES: Status[] = ["available", "busy", "away", "dnd"];

function cleanName(name: string): string {
    return String(name ?? "").trim().slice(0, NAME_MAX);
}

function randomColor(): string {
    return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

// writes storage, updates `me` and tells the lobby and every room
function commit(profile: Profile): Profile {
    storage.profile.set(profile);
    setMe(profile);
    setLobbyProfile(profile);
    setRoomsProfile(profile);
    log("profile", profile);
    return profile;
}

/**
 * Loads the device key and fits your profile to it, before anything connects. A profile from before
 * keys becomes a new person with the same name and colour. Rejects without WebCrypto (plain http).
 */
export async function startIdentity(): Promise<void> {
    const { uid, key } = await loadDeviceKey();
    const current = me() ?? storage.profile.legacy();
    if (!current) return;
    if (me()?.uid === uid && me()?.key === key) return;
    commit({ v: 2, uid, key, name: current.name, color: current.color, status: current.status });
}

export function getProfile(): Profile | null {
    return me() ?? storage.profile.get();
}

export function hasProfile(): boolean {
    return getProfile() !== null;
}

/**
 * Creates (or replaces the name/colour of) your profile. Throws on an empty name, or before
 * `startIdentity` has loaded the key.
 */
export function createProfile(name: string, color?: string): Profile {
    const clean = cleanName(name);
    if (!clean) throw new Error("a profile needs a name");

    const device = deviceKey();
    if (!device) throw new Error("a profile needs the device key");

    const existing = getProfile();
    return commit({
        v: 2,
        uid: device.uid,
        key: device.key,
        name: clean,
        color: color || existing?.color || randomColor(),
        status: existing?.status ?? "available",
    });
}

export function updateProfile(partial: Partial<Pick<Profile, "name" | "color" | "status">>, at: number = Date.now()): Profile | null {
    const current = getProfile();
    if (!current) return null;

    const next: Profile = { ...current };
    if (partial.name !== undefined)
    {
        const clean = cleanName(partial.name);
        if (clean) next.name = clean;
    }
    if (partial.color) next.color = partial.color;
    if (partial.status && STATUSES.includes(partial.status)) next.status = partial.status;

    if (next.name !== current.name || next.color !== current.color) setPrefs({ profileAt: at });
    return commit(next);
}

/** Takes the name and colour of a linked device, keeping the time they were set. */
export function adoptProfile(name: string, color: string, at: number) {
    return updateProfile({ name, color }, at);
}

export function setName(name: string) {
    return updateProfile({ name });
}

export function setColor(color: string) {
    return updateProfile({ color });
}

export function setStatus(status: Status) {
    return updateProfile({ status });
}
