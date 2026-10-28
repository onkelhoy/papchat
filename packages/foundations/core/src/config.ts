import { storage } from "./storage";

export const DEFAULT_SIGNAL = "wss://render-webrtc-signal-server.onrender.com";
export const LOCAL_SIGNAL = "ws://localhost:3000";

export const RTC: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export const LIMITS = {
    roomSize: 8,
    fileBytes: 100 * 1024 * 1024,
    ringMs: 30_000,
    chunk: 16 * 1024,
    batch: 64,
    // the server strikes messages sent < 200 ms apart, keep our own calls well above that
    serverGapMs: 1_000,
    raceGuardMs: 2_000,
    messageChars: 4_000,
    // messages kept per room (no history: this is only what this tab saw)
    messagesKept: 500,
    typingSendMs: 1_000,
    typingMs: 4_000,
    // a "left" system message waits this long, so a quick reconnect doesn't show left + joined
    leaveGraceMs: 5_000,
    // after a room rebuild, missing participants get this long to come back before they count as left
    rejoinGraceMs: 30_000,
} as const;

export const LOBBY_NAME = "papchat";
export const APP = "papchat";

// ?signal=<url> overrides and is remembered, localhost pages use a local server, everything else the default
export function signalUrl(): string {
    let override: string | null = null;
    try
    {
        override = new URLSearchParams(location.search).get("signal");
    }
    catch { /* no location (not a browser) */ }

    if (override)
    {
        storage.debug.set({ ...storage.debug.get(), signal: override });
        return override;
    }

    const stored = storage.debug.get().signal;
    if (stored) return stored;

    const host = typeof location !== "undefined" ? location.hostname : "";
    if (host === "localhost" || host === "127.0.0.1") return LOCAL_SIGNAL;

    return DEFAULT_SIGNAL;
}
