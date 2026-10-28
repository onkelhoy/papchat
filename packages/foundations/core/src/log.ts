import { storage } from "./storage";

let enabled: boolean | null = null;

export function log(...args: unknown[]) {
    if (enabled === null) enabled = storage.debug.get().log === true;
    if (enabled) console.debug("[papchat]", ...args);
}

export function setLogging(on: boolean) {
    enabled = on;
    storage.debug.set({ ...storage.debug.get(), log: on });
}
