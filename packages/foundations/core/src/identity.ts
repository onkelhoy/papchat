import { setLobbyProfile } from "./lobby";
import { log } from "./log";
import { setRoomsProfile } from "./room";
import { me, setMe } from "./state";
import { storage } from "./storage";
import type { Profile, Status } from "./types";

// who you are: a stable uid (peer ids change on every connect), stored once in localStorage

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

export function getProfile(): Profile | null {
    return me() ?? storage.profile.get();
}

export function hasProfile(): boolean {
    return getProfile() !== null;
}

/**
 * Creates (or replaces the name/colour of) your profile. Keeps an existing uid, so a re-onboarding
 * doesn't turn you into someone new. Throws on an empty name.
 */
export function createProfile(name: string, color?: string): Profile {
    const clean = cleanName(name);
    if (!clean) throw new Error("a profile needs a name");

    const existing = getProfile();
    return commit({
        v: 1,
        uid: existing?.uid ?? crypto.randomUUID(),
        name: clean,
        color: color || existing?.color || randomColor(),
        status: existing?.status ?? "available",
    });
}

export function updateProfile(partial: Partial<Pick<Profile, "name" | "color" | "status">>): Profile | null {
    const current = getProfile();
    if (!current) return null;

    const next: Profile = { ...current, v: 1 };
    if (partial.name !== undefined)
    {
        const clean = cleanName(partial.name);
        if (clean) next.name = clean;
    }
    if (partial.color) next.color = partial.color;
    if (partial.status && STATUSES.includes(partial.status)) next.status = partial.status;

    return commit(next);
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
