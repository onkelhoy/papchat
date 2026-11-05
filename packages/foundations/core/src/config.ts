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
    // no sign that an invite reached a device in use by now: its app is in the background, so push it too
    inviteSeenMs: 2_500,
    // a cancel still arrives this long after the call, and turns into a missed call
    missedCallS: 24 * 60 * 60,
    // how long to wait for the signal server over HTTP: a cold start alone takes 30-60 s
    wakeMs: 90_000,
    contacts: 100,
    chunk: 16 * 1024,
    batch: 64,
    // the public network keeps this many anchors (peers with a socket, so newcomers can find it); a
    // network someone made keeps one
    lobbyAnchors: 3,
    networkAnchors: 1,
    // the first anchor's beacon: a part that misses three heals back into the network
    beaconMs: 10_000,
    // an anchor looks for a same-name network this often, and merges into the one with the lowest id
    mergeScanMs: 15_000,
    // a new anchor (it just made the network, or was asked to keep a socket) looks this soon
    raceGuardMs: 2_000,
    // listed lobbies tried before making one: a merge brings the rest together later
    joinTries: 3,
    // how long to wait for a room member in the lobby to answer where the room is
    askMs: 6_000,
    // a room member that isn't in the lobby yet (it's still loading) gets this long to show up
    askWaitMs: 12_000,
    messageChars: 4_000,
    // messages kept per room when chats aren't saved
    messagesKept: 500,
    // saved messages loaded at a time
    historyPage: 100,
    // no receipt by now: the message shows as not sent, and stays in the outbox
    ackMs: 8_000,
    // what members offer each other when they meet, to fill gaps
    historyFillMs: 7 * 24 * 60 * 60_000,
    historyOffer: 1_000,
    // a link for another device works this long
    linkMs: 5 * 60_000,
    // history goes in pieces of about this many characters
    historyChunk: 12_000,
    typingSendMs: 1_000,
    typingMs: 4_000,
    // a "left" system message waits this long, so a quick reconnect doesn't show left + joined
    leaveGraceMs: 5_000,
    // a stage viewer tells the presenter it's still watching this often
    stageHereMs: 20_000,
    // presence: everyone broadcasts their profile this often (less while hidden); someone not heard
    // from for `staleMs` (a closed phone that never said goodbye) drops out of the member list
    heartbeatMs: 30_000,
    heartbeatHiddenMs: 60_000,
    staleMs: 150_000,
    // a buzz (shake + sound) at most this often per sender, checked on both ends
    buzzGapMs: 10_000,
    // global chat: posts from one sender closer together than this are dropped by everyone
    globalGapMs: 1_000,
} as const;

export const LOBBY_NAME = "papchat";
// lobbies of older papchat versions are left alone: they can't talk to this one
export const APP = "papchat";
export const LOBBY_VERSION = 2;

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

/** The signal server over http(s), for `/networks`, `/health` and `/push/*`. */
export function httpUrl(): string {
    return signalUrl().replace(/^ws/, "http").replace(/\/+$/, "");
}
