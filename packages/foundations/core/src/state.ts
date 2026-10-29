import { signal } from "@papit/signals";

import { storage } from "./storage";
import type {
    IncomingCall,
    LobbyStatus,
    Network,
    Prefs,
    Profile,
    RoomSummary,
    StageSummary,
    Toast,
    ToastKind,
} from "./types";

// app state: core writes, the page reads inside effects and binds to components

export const [me, setMe] = signal<Profile | null>(storage.profile.get());
export const [prefs, setPrefsSignal] = signal<Prefs>(storage.prefs.get());
export const [lobbyStatus, setLobbyStatus] = signal<LobbyStatus>("idle");
// the private network the lobby lives in, null for the public one
export const [network, setNetworkSignal] = signal<Network | null>(storage.network.get());
// everyone else in the lobby, one entry per uid (newest peer wins)
export const [members, setMembers] = signal<Profile[]>([]);
export const [rooms, setRooms] = signal<RoomSummary[]>([]);
export const [activeRoom, setActiveRoom] = signal<string | null>(null);
export const [stages, setStages] = signal<StageSummary[]>([]);
export const [incoming, setIncoming] = signal<IncomingCall[]>([]);
export const [toasts, setToasts] = signal<Toast[]>([]);
export const [audioBlocked, setAudioBlocked] = signal(false);
/** The last buzz someone sent you (the page shakes, notify shows it while hidden). */
export const [buzzed, setBuzzed] = signal<{ room: string; uid: string; name: string; at: number } | null>(null);

export function setPrefs(partial: Partial<Prefs>) {
    const next = { ...prefs(), ...partial, v: 1 as const };
    next.volume = Math.min(1, Math.max(0, next.volume));
    storage.prefs.set(next);
    setPrefsSignal(next);
}

/** Saves the network to use (null = public). Takes effect on the next `startLobby`; `switchNetwork` reloads. */
export function setNetwork(next: Network | null) {
    const name = next?.name.trim().slice(0, 40) ?? "";
    const value = name ? { name, password: next!.password } : null;
    storage.network.set(value);
    setNetworkSignal(value);
}

/** Moves to another network: saves it, forgets this tab's rooms (they belong to the old one) and reloads. */
export function switchNetwork(next: Network | null) {
    setNetwork(next);
    storage.session.set({ rooms: [] });
    location.reload();
}

export function toast(kind: ToastKind, text: string, options: Partial<Omit<Toast, "id" | "kind" | "text">> = {}): string {
    const id = crypto.randomUUID();
    setToasts(list => [...list, { id, kind, text, ...options }]);
    return id;
}

export function dismissToast(id: string) {
    setToasts(list => list.filter(t => t.id !== id));
}

export const state = {
    me, prefs, lobbyStatus, network, members, rooms, activeRoom, stages, incoming, toasts, audioBlocked,
};
