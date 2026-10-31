import { storage } from "./storage";

export const DEFAULT_SIGNAL = "wss://render-webrtc-signal-server.onrender.com";

export const RTC: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export const LIMITS = {
    roomSize: 8,
    fileBytes: 100 * 1024 * 1024,
    ringMs: 30_000,
    // ringing someone whose app is closed: the phone wakes, and the server may be starting as well
    ringOfflineMs: 60_000,
    // a cancel still arrives this long after the call, and turns into a missed call
    missedCallS: 24 * 60 * 60,
    // how long to wait for the signal server over HTTP: a cold start alone takes 30-60 s
    wakeMs: 90_000,
    contacts: 100,
    chunk: 16 * 1024,
    batch: 64,
    // the server strikes messages sent < 200 ms apart, keep our own calls well above that
    serverGapMs: 1_000,
    raceGuardMs: 2_000,
    // the host checks this often for a more canonical lobby: a rogue group coming back only shows up later
    rogueScanMs: 60_000,
    messageChars: 4_000,
    // messages kept per room (no history: this is only what this tab saw)
    messagesKept: 500,
    typingSendMs: 1_000,
    typingMs: 4_000,
    // a "left" system message waits this long, so a quick reconnect doesn't show left + joined
    leaveGraceMs: 5_000,
    // presence: everyone broadcasts a tiny `here` this often (less while hidden); someone not heard
    // from for `staleMs` (a closed phone the server hasn't noticed yet) drops out of the member list
    heartbeatMs: 30_000,
    heartbeatHiddenMs: 60_000,
    staleMs: 150_000,
    // a unicast that came back unreachable (routes still settling after a reload) is sent again
    resendTries: 2,
    resendGapMs: 1_500,
    // a buzz (shake + sound) at most this often per sender, checked on both ends
    buzzGapMs: 10_000,
    // global chat: posts from one sender closer together than this are dropped by everyone
    globalGapMs: 1_000,
} as const;

export const LOBBY_NAME = "papchat";
export const APP = "papchat";

// ?signal=<url> overrides and is remembered, everything else (localhost too) uses the deployed server
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

    return DEFAULT_SIGNAL;
}
