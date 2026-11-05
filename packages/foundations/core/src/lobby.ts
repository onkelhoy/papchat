import { signal } from "@papit/signals";
import { Client, type Network as Net } from "@papit/webrtc";

import { APP, httpUrl, LIMITS, LOBBY_NAME, LOBBY_VERSION, RTC, signalUrl } from "./config";
import { readNetworkSaves } from "./history";
import { PROOF, Verifier } from "./keys";
import { log, logClient } from "./log";
import { devicesOf, personOf, samePerson } from "./people";
import { lobbyStatus, me, network, separated, setLobbyStatus, setMembers, setNetwork, setSeparated, toast } from "./state";
import type { Network, NetworkEntry, NetworkHealth, Profile, Status } from "./types";

// The papchat lobby (PLAN §2.2–2.4): one chord network everyone online is in, found on the signal
// server. A private network (`network()`) is the same thing under its own name and password, so only
// its members meet. Rooms, calls, stages and device sync are networks carried by the lobby: their
// handshakes go through the ring, never the socket.
//
// webrtc 0.1 keeps no member list. Only a few anchors hold a socket so newcomers find the lobby;
// everyone else drops theirs after joining. Who is here is ours to find out: everyone broadcasts
// their profile (`presence`) and proves it with their device key. Two lobbies under one name merge
// into the one with the lowest id. They only stay apart when they can't: another password, or a
// ring next to a chord.

export type LobbyFrom = {
    peer: string;
    // null when the sender's profile isn't known (yet)
    uid: string | null;
    profile: Profile | null;
};

export type LobbyHandler<Payload = any> = (payload: Payload, from: LobbyFrom) => void;

type Info = NonNullable<Net["info"]>;
type Message = { meta: { type: string; sender: string }; parse(): unknown };

export type Member = { peer: string; at: number; profile: Profile };

const STATUSES: Status[] = ["available", "busy", "away", "dnd"];
const RETRY_MIN_MS = 3_000;
const RETRY_MAX_MS = 30_000;
// some of what the health shows has no event, like our socket closing
const HEALTH_MS = 3_000;
// a server that hasn't answered by now is waking up
const WAKING_AFTER_MS = 4_000;
// after a merge the two rings need a moment before a broadcast reaches all of them
const MERGE_SETTLE_MS = [2_000, 8_000];
// someone asked everyone to announce: spread the answers out
const ANNOUNCE_SPREAD_MS = 3_000;

// everyone → everyone: who I am. `ask` wants yours back, `reply` is that answer
const PRESENCE = "presence";
// everyone → everyone: I'm leaving
const BYE = "presence.bye";
// anchor → everyone: two networks just merged, announce yourselves to the new half
const ANNOUNCE = "presence.all";
// anchor → group: a same-name network exists that we can't get into
const SEPARATED = "lobby-separated";
// member → anchor: this password opens the network we're separated from
const UNLOCK = "lobby-unlock";
// anchor → member: that password didn't work
const UNLOCK_REFUSED = "lobby-unlock-refused";
// anchor → group: we merged into a network with this password, use it from now on
const PASSWORD = "lobby-password";

class WrongPassword extends Error { }

// a boot belongs to one epoch; stop bumps it so stale async work bails out
class Cancelled extends Error { }

// one client for everything (lobby, rooms, stages, sync), so this device has one peer id everywhere
let client: Client | null = null;
let lobby: Net | null = null;
let epoch = 0;
let running = false;
let booting = false;
let waking = false;
// we were in a lobby before: a new boot is a reconnect
let wasIn = false;
let retryMs = RETRY_MIN_MS;
// when this client started: sent with the profile so "newest peer wins" is the same for everyone
let startedAt = 0;
let profile: Profile | null = null;
const waiters = new Set<(net: Net | null) => void>();

// merging
let checking = false;
// network + password pairs that were refused, so a scan doesn't knock on the same door every time
const refused = new Set<string>();
// the anchor that told us about the network we're separated from: it tests passwords for us
let separatedBy: string | null = null;
const unlocks = new Map<string, string[]>();
let unlockQueue: Promise<void> = Promise.resolve();

// presence: everyone by what they say (`claimed`), and the ones who proved it (`memberByPeer`)
let claimed = new Map<string, Member>();
let memberByPeer = new Map<string, Member>();
let peerByUid = new Map<string, string>();
let verifier: Verifier | null = null;
// peer → when we last heard from it (any message)
const heardAt = new Map<string, number>();
let heartbeat: ReturnType<typeof setTimeout> | null = null;
// after our own tab was asleep we heard nothing either: don't drop anyone until they had time to beat
let graceUntil = 0;

const handlers = new Map<string, Set<LobbyHandler>>();
// these go by peer id, not by person, so they don't wait for a proof
const ANYONE = new Set([PRESENCE, BYE, ANNOUNCE, SEPARATED, UNLOCK, UNLOCK_REFUSED]);
const timers = new Set<{ id: ReturnType<typeof setTimeout>; resolve: () => void }>();

/** How this device is doing in its network, null while it isn't in one. */
export const [networkHealth, setNetworkHealth] = signal<NetworkHealth | null>(null);
let healthTimer: ReturnType<typeof setInterval> | undefined;
let healthShown = "null";
let listed: boolean | undefined;
let lastMerge: NetworkHealth["merge"];

// ---------------------------------------------------------------- public API

/**
 * Lands in the lobby: finds it on the signal server and joins it, or creates it. Needs a profile.
 * Resolves true once in the lobby, false if the first attempt didn't make it (it keeps retrying).
 * Never rejects. Calling it again while running returns immediately.
 */
export async function startLobby(): Promise<boolean> {
    if (running) return lobby != null;

    profile = me();
    if (!profile)
    {
        log("lobby: no profile yet, not starting");
        return false;
    }

    running = true;
    if (typeof window !== "undefined") window.addEventListener("pagehide", handlePageHide);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility);
    beat();
    healthTimer = setInterval(tick, HEALTH_MS);
    return startClient();
}

/** Leaves the lobby (and with it every room and stage), closes the socket, clears every timer. */
export function stopLobby() {
    running = false;
    say(BYE);
    stopClient();
    if (typeof window !== "undefined") window.removeEventListener("pagehide", handlePageHide);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility);
    if (heartbeat) clearTimeout(heartbeat);
    heartbeat = null;
    clearInterval(healthTimer);
    clearPresence();
    wasIn = false;
    reportHealth();
    setLobbyStatus("idle");
}

/** The client every network of this device goes through. Null while the lobby isn't running. */
export function appClient(): Client | null {
    return client;
}

/** The lobby network, null while not in it. Rooms, stages and sync are carried by it. */
export function lobbyNetwork(): Net | null {
    return lobby && !lobby.closed ? lobby : null;
}

/** Resolves with the lobby once in it, or null after `ms` (or when stopped). */
export function whenLobby(ms: number): Promise<Net | null> {
    const now = lobbyNetwork();
    if (now) return Promise.resolve(now);
    if (!running) return Promise.resolve(null);
    return new Promise(resolve => {
        const done = (net: Net | null) => {
            clearTimeout(timer);
            waiters.delete(done);
            resolve(net);
        };
        const timer = setTimeout(() => done(null), ms);
        waiters.add(done);
    });
}

/** Unicast an app message to whoever has `uid` (their newest peer). False when unknown or not in the lobby. */
export function send(uid: string, type: string, payload?: unknown): boolean {
    const peer = peerOf(uid);
    return peer ? sendTo(peer, type, payload) : false;
}

/** Unicast to a lobby peer id. False when not in the lobby or there's no route. */
export function sendTo(peer: string, type: string, payload?: unknown): boolean {
    const net = lobbyNetwork();
    if (!net) return false;
    try
    {
        return net.send(peer, type, payload ?? null);
    }
    catch (error)
    {
        log("lobby: send failed", type, error);
        return false;
    }
}

/** Broadcast an app message to everyone in the lobby. */
export function broadcast(type: string, payload?: unknown): boolean {
    const net = lobbyNetwork();
    if (!net) return false;
    try
    {
        return net.broadcast(type, payload ?? null);
    }
    catch (error)
    {
        log("lobby: broadcast failed", type, error);
        return false;
    }
}

/**
 * Listens for lobby app messages of `type`. Returns the unsubscribe function. Survives reconnects.
 * Only proven senders get through, unless `anyone` (for messages that go by peer id, not by person).
 */
export function on<Payload = any>(type: string, handler: LobbyHandler<Payload>, options: { anyone?: boolean } = {}): () => void {
    if (options.anyone) ANYONE.add(type);
    let set = handlers.get(type);
    if (!set)
    {
        set = new Set();
        handlers.set(type, set);
    }
    set.add(handler as LobbyHandler);
    return () => {
        set.delete(handler as LobbyHandler);
        if (set.size === 0 && handlers.get(type) === set) handlers.delete(type);
    };
}

/** Pushes a changed profile to the lobby (identity.ts calls this on every change). */
export function setLobbyProfile(next: Profile) {
    profile = next;
    announce(false);
}

/** The newest peer of `uid`, or of another device of theirs when that one isn't here. */
export function peerOf(uid: string): string | null {
    return peerByUid.get(uid) ?? online(uid)[0] ?? null;
}

// the peers of every device of whoever owns `uid`, `uid`'s own first
function online(uid: string): string[] {
    const list = devicesOf(uid).filter(device => peerByUid.has(device));
    return list.sort((a, b) => Number(b === uid) - Number(a === uid)).map(device => peerByUid.get(device)!);
}

/** The lobby peer of `uid` itself and of each of its owner's other devices that are here. */
export function peersOf(uid: string): string[] {
    return devicesOf(uid).map(device => peerByUid.get(device)).filter((peer): peer is string => !!peer);
}

/** uids of your other devices that are in the lobby right now. */
export function otherDevices(): string[] {
    const mine = me()?.uid;
    return mine ? devicesOf(mine).filter(uid => uid !== mine && peerByUid.has(uid)) : [];
}

/** Sends to every device of whoever owns `uid`: a call rings them all. False when none is here. */
export function sendAll(uid: string, type: string, payload?: unknown): boolean {
    let sent = false;
    for (const device of devicesOf(uid))
    {
        const peer = peerByUid.get(device);
        if (peer && sendTo(peer, type, payload)) sent = true;
    }
    return sent;
}

/** Sends something nobody asked for: a peer that can't be reached is no reason for a toast. */
export function quietSend(uid: string, type: string, payload?: unknown): boolean {
    const peer = peerByUid.get(uid);
    return peer ? sendTo(peer, type, payload) : false;
}

/** Reads the members again after the person map changed. */
export function refreshMembers() {
    if (running) publish();
}

/** The proven uid behind a lobby peer id. A room or stage peer is the same id. */
export function uidOf(peer: string): string | null {
    return memberByPeer.get(peer)?.profile.uid ?? null;
}

export function profileOf(uid: string): Profile | null {
    const peer = peerOf(uid);
    return (peer && memberByPeer.get(peer)?.profile) || null;
}

/** The proven profile behind a lobby peer id. */
export function profileOfPeer(peer: string): Profile | null {
    return memberByPeer.get(peer)?.profile ?? null;
}

/**
 * Tries a password on the network this group is separated from. True when that was handled here, so
 * the page must not switch network: an anchor tests it and merges the group, or says it was wrong.
 * False when this is a real change of network: a normal switch.
 */
export async function unlockNetwork(next: Network | null): Promise<boolean> {
    const net = lobbyNetwork();
    const current = network();
    if (!net || !next || !current || next.name !== current.name) return false;
    // someone else got there first: we already have it, and reloading would end our calls
    if (next.password === current.password) return true;
    if (!separated()) return false;

    if (net.anchored) queueUnlock(next.password, net.me);
    else if (separatedBy) sendTo(separatedBy, UNLOCK, { password: next.password });
    else return false;
    return true;
}

/**
 * The papchat networks on the signal server: the public one first (always listed), then the
 * private ones by name. Resolves to just the public one when the server can't be reached.
 */
export async function listNetworks(): Promise<NetworkEntry[]> {
    const found = new Map<string, NetworkEntry>([["", { name: "", members: 0, locked: false }]]);
    try
    {
        for (const info of await fetchNetworks())
        {
            if (!isLobby(info)) continue;
            const name = nameOf(info);
            // two lobbies under one name (a merge that hasn't happened yet) count as one network
            const entry = found.get(name) ?? { name, members: 0, locked: false };
            entry.members += info.size;
            entry.locked ||= info.meta?.locked === true;
            entry.nosave ||= info.meta?.history === false;
            entry.ring ||= topologyOf(info) === "ring";
            found.set(name, entry);
        }
    }
    catch (error)
    {
        log("lobby: listing networks failed", error);
    }
    // the network we're in counts everyone we know of, the server only its anchors
    const mine = lobbyNetwork();
    const entry = found.get(network()?.name ?? "");
    if (mine && entry) entry.members = Math.max(entry.members, claimed.size + 1);
    return [...found.values()].sort((a, b) => (a.name === "" ? -1 : b.name === "" ? 1 : a.name.localeCompare(b.name)));
}

// ---------------------------------------------------------------- client lifecycle

function startClient(): Promise<boolean> {
    const current = ++epoch;
    startedAt = Date.now();
    retryMs = RETRY_MIN_MS;

    try
    {
        client = new Client({ url: signalUrl(), rtc: RTC });
    }
    catch (error)
    {
        // a bad ?signal= url ends up here
        log("lobby: could not create the client", error);
        client = null;
        running = false;
        setLobbyStatus("closed");
        toast("error", "Couldn't connect: bad signal server address");
        return Promise.resolve(false);
    }

    logClient(client, "client");
    client.addEventListener("error", handleClientError);
    void scan(current);
    return boot(current);
}

function stopClient() {
    epoch++;
    booting = false;
    checking = false;
    refused.clear();
    unlocks.clear();
    separatedBy = null;
    listed = undefined;
    lastMerge = undefined;
    setSeparated(null);
    for (const timer of timers)
    {
        clearTimeout(timer.id);
        timer.resolve();
    }
    timers.clear();

    const net = lobby;
    lobby = null;
    if (net) detach(net);
    const old = client;
    client = null;
    if (old)
    {
        old.removeEventListener("error", handleClientError);
        try
        {
            old.close();
        }
        catch (error)
        {
            log("lobby: close failed", error);
        }
    }
    settleWaiters();
}

// ---------------------------------------------------------------- finding the lobby

async function boot(current: number): Promise<boolean> {
    const c = client;
    if (!c) return false;
    booting = true;
    syncStatus();
    let joined: Net | null = null;

    try
    {
        // join the lowest id we can enter
        const found = (await fetchNetworks()).filter(isOurs).sort(byId);
        alive(current);
        let locked = false;
        for (const target of found.slice(0, LIMITS.joinTries))
        {
            try
            {
                log("lobby: joining", target.id);
                joined = await join(c, target.id);
                break;
            }
            catch (error)
            {
                alive(current);
                // a rogue member who reloads gets back to its group here, behind the locked one
                if (error instanceof WrongPassword) locked = true;
                else log("lobby: join failed", target.id, error);
            }
        }
        alive(current);
        // the network exists but isn't ours to enter: making a second one would only split it
        if (!joined && locked) throw new WrongPassword();

        // none (or none would have us): we make it, and a merge brings any other one in later
        if (!joined)
        {
            log("lobby: creating", network()?.name ?? LOBBY_NAME);
            joined = await create(c);
        }
        alive(current);
        enter(joined);
        return true;
    }
    catch (error)
    {
        if (error instanceof Cancelled || current !== epoch)
        {
            // stopped while joining: don't stay in a network nobody watches
            if (joined && joined !== lobby) joined.leave();
            return false;
        }
        booting = false;
        if (error instanceof WrongPassword)
        {
            // retrying can't help: stay out until the user picks another password in the settings
            log("lobby: wrong password for", network()?.name);
            running = false;
            stopClient();
            setLobbyStatus("closed");
            toast("error", `Wrong password for the network "${network()?.name ?? ""}". Change it in Settings → Profile.`);
            return false;
        }
        log("lobby: boot failed, retrying", error);
        syncStatus();
        retry(current);
        return false;
    }
}

function retry(current: number) {
    const delay = retryMs;
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    void wait(delay).then(() => {
        if (current !== epoch || !client || lobby) return;
        void boot(current);
    });
}

function create(c: Client): Promise<Net> {
    const net = network();
    return c.create({
        name: net?.name ?? LOBBY_NAME,
        topology: net?.ring ? "ring" : "chord",
        ...(net?.password ? { password: net.password } : {}),
        // only flags: anyone listing networks can read this
        meta: {
            app: APP,
            kind: "lobby",
            v: LOBBY_VERSION,
            ...(net ? { network: net.name, locked: !!net.password } : {}),
            ...(net?.nosave ? { history: false } : {}),
        },
        anchors: net ? LIMITS.networkAnchors : LIMITS.lobbyAnchors,
        beacon: LIMITS.beaconMs,
    }, { acceptMerge });
}

async function join(c: Client, id: string): Promise<Net> {
    const password = network()?.password || undefined;
    try
    {
        // acceptMerge here too: any member may become an anchor later
        return await c.join(id, password ? { password } : {}, { acceptMerge });
    }
    catch (error)
    {
        if (isWrongPassword(error)) throw new WrongPassword();
        throw error;
    }
}

function enter(net: Net) {
    lobby = net;
    wasIn = true;
    booting = false;
    retryMs = RETRY_MIN_MS;
    attach(net);
    readNetworkSaves(net.info?.meta);
    rememberTopology(net);
    log("lobby: in", net.info?.id, net.anchored ? "(anchor)" : "");
    // who's here: everyone answers this one
    announce(true);
    syncStatus();
    settleWaiters();
    if (net.anchored) void later(LIMITS.raceGuardMs, () => check(epoch));
}

function settleWaiters() {
    const net = lobbyNetwork();
    if (net === null && running) return;
    for (const done of [...waiters]) done(net);
}

/** The public networks on the signal server, over http. */
async function fetchNetworks(): Promise<Info[]> {
    const slow = setTimeout(() => {
        waking = true;
        syncStatus();
    }, WAKING_AFTER_MS);
    try
    {
        const response = await fetch(`${httpUrl()}/networks`, { signal: AbortSignal.timeout(LIMITS.wakeMs), cache: "no-store" });
        if (!response.ok) throw new Error(`the server said ${response.status}`);
        const list: unknown = await response.json();
        return Array.isArray(list) ? list.filter(isInfo) : [];
    }
    finally
    {
        clearTimeout(slow);
        if (waking)
        {
            waking = false;
            syncStatus();
        }
    }
}

function isInfo(value: unknown): value is Info {
    if (typeof value !== "object" || value === null) return false;
    const info = value as Record<string, unknown>;
    return typeof info.id === "string" && typeof info.name === "string" && typeof info.size === "number";
}

// a papchat lobby of this version, of any network
function isLobby(info: Info): boolean {
    return info.meta?.app === APP && info.meta?.kind === "lobby" && info.meta?.v === LOBBY_VERSION;
}

// "" for the public one
function nameOf(info: Info): string {
    return typeof info.meta?.network === "string" ? info.meta.network : "";
}

// a lobby of the network we're set to be in
function isOurs(info: Info): boolean {
    return isLobby(info) && nameOf(info) === (network()?.name ?? "");
}

function byId(a: Info, b: Info): number {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function topologyOf(info: Pick<Info, "topology">): string {
    return typeof info.topology === "string" ? info.topology : info.topology.name;
}

// whoever ends up alone and reloads creates the network again, and it should come back as what it was
function rememberTopology(net: Net) {
    const current = network();
    if (!current || !net.info) return;
    const ring = topologyOf(net.info) === "ring";
    if (ring !== !!current.ring) setNetwork({ ...current, ring });
}

function isWrongPassword(error: unknown): boolean {
    return /wrong password|forbidden/i.test(String((error as Error)?.message ?? error));
}

// ---------------------------------------------------------------- merging (one network per name)

// Every scan, the first anchor looks at the server's list. A same-name lobby with a lower id is the one
// to be in, so we merge into it: the whole group moves over peer links and takes its id. The other side
// never asks, so two groups never merge into each other at once. What stops a merge for good is a
// password we don't have or another topology. Anything else (a timeout, links that didn't open) is
// tried again on the next scan.
async function scan(current: number) {
    try
    {
        while (true)
        {
            await wait(LIMITS.mergeScanMs * (0.75 + Math.random() * 0.5));
            alive(current);
            await check(current);
        }
    }
    catch (error)
    {
        if (!(error instanceof Cancelled)) log("lobby: scan stopped", error);
    }
}

async function check(current: number) {
    const net = lobbyNetwork();
    if (!net?.info || checking || booting || !net.anchored || !firstAnchor(net)) return;
    checking = true;

    try
    {
        const lobbies = (await fetchNetworks()).filter(isOurs).sort(byId);
        alive(current);
        if (lobby !== net || !net.info) return;
        const mine = net.info.id;
        listed = lobbies.some(n => n.id === mine);
        reportHealth();

        // an older network we can't enter doesn't stop us joining one we can
        let wall: string | null = null;
        for (const target of lobbies)
        {
            if (target.id >= mine) break;
            // a ring and a chord can't be one network: they stay apart on purpose
            if (topologyOf(target) !== topologyOf(net.info)) continue;
            // the password only goes to a network that asks for one
            const password = target.meta?.locked === true ? network()?.password ?? "" : "";
            if (refused.has(refusedKey(target.id, password)))
            {
                wall ??= target.id;
                continue;
            }

            log("lobby: a same-name network with a lower id exists, merging", mine, "→", target.id);
            const outcome = await merge(current, net, target.id, password);
            if (outcome === "merged") return;
            if (outcome === "refused") wall ??= target.id;
            // anything else is worth another try on the next scan
            if (outcome === "failed") return;
        }
        log(wall ? "lobby: staying separate from" : "lobby: this is the network", wall ?? mine);
        markSeparated(wall);
    }
    catch (error)
    {
        if (!(error instanceof Cancelled)) log("lobby: check failed", error);
    }
    finally
    {
        checking = false;
    }
}

// The beacon goes out from the first anchor, so that's the one that merges. webrtc doesn't show the
// anchor list yet (papit finding #32): without it every anchor counts as first.
function firstAnchor(net: Net): boolean {
    const anchors = (net as unknown as { anchors?: { anchors?: string[] } | null }).anchors?.anchors;
    return !anchors?.length || anchors[0] === net.me;
}

async function merge(current: number, net: Net, target: string, password: string): Promise<"merged" | "refused" | "declined" | "failed"> {
    try
    {
        await net.merge(target, password || undefined);
        alive(current);
        noteMerge("merged", target);
        return "merged";
    }
    catch (error)
    {
        if (error instanceof Cancelled) throw error;
        alive(current);
        const reason = String((error as Error)?.message ?? error);
        if (isWrongPassword(error))
        {
            refused.add(refusedKey(target, password));
            noteMerge("refused", reason);
            return "refused";
        }
        // their side said no for another reason (an older papchat, another topology config): not again
        if (/merge refused|topology/i.test(reason))
        {
            refused.add(refusedKey(target, password));
            noteMerge("refused", reason);
            return "declined";
        }
        log("lobby: merge failed", target, error);
        noteMerge("failed", reason);
        return "failed";
    }
}

function noteMerge(outcome: "merged" | "refused" | "failed", detail: string) {
    lastMerge = { at: Date.now(), outcome, detail };
    reportHealth();
}

// A merge can move this whole group, so only our own kind counts. The password was checked already.
function acceptMerge(info: Info): boolean {
    return isOurs(info);
}

function refusedKey(id: string, password: string): string {
    return `${id}\n${password}`;
}

// sent on every scan, because members who joined since then haven't heard
function markSeparated(target: string | null) {
    const changed = target !== separated();
    setSeparated(target);
    if (target || changed) broadcast(SEPARATED, { network: target });
}

function handleSeparated(payload: { network?: unknown }, from: LobbyFrom) {
    const net = lobbyNetwork();
    if (!net || net.anchored) return;
    const target = typeof payload?.network === "string" ? payload.network : null;
    separatedBy = target ? from.peer : null;
    setSeparated(target);
}

function handleUnlock(payload: { password?: unknown }, from: LobbyFrom) {
    if (!lobbyNetwork()?.anchored || typeof payload?.password !== "string") return;
    queueUnlock(payload.password, from.peer);
}

function handleUnlockRefused(_payload: unknown, from: LobbyFrom) {
    if (from.peer === separatedBy) wrongPassword();
}

function wrongPassword() {
    toast("warning", `That isn't the password for "${network()?.name ?? ""}"`);
}

// one at a time: however many people press at once, each different password is tested once
function queueUnlock(password: string, peer: string) {
    const net = lobbyNetwork();
    const target = separated();
    if (!net || !target) return;
    if (refused.has(refusedKey(target, password)))
    {
        refuse(net, [peer]);
        return;
    }

    const waiting = unlocks.get(password);
    if (waiting)
    {
        waiting.push(peer);
        return;
    }
    unlocks.set(password, [peer]);
    const current = epoch;
    unlockQueue = unlockQueue.then(() => tryUnlock(current, net, password));
}

async function tryUnlock(current: number, net: Net, password: string) {
    try
    {
        alive(current);
        const target = separated();
        // an earlier password in the queue already worked
        if (!target || lobby !== net) return;

        const outcome = await merge(current, net, target, password);
        if (outcome === "merged") sharePassword(current, password);
        else if (outcome === "refused") refuse(net, unlocks.get(password) ?? []);
    }
    catch (error)
    {
        if (!(error instanceof Cancelled)) log("lobby: unlock failed", error);
    }
    finally
    {
        unlocks.delete(password);
    }
}

function refuse(net: Net, peers: string[]) {
    for (const peer of peers)
    {
        if (peer === net.me) wrongPassword();
        else sendTo(peer, UNLOCK_REFUSED);
    }
}

// the group moved into a network with another password: without it, their next reload is refused
function sharePassword(current: number, password: string) {
    const name = network()?.name;
    if (!name) return;
    const net = network();
    if (net) setNetwork({ ...net, password });
    for (const delay of MERGE_SETTLE_MS)
    {
        void later(delay, () => {
            if (current === epoch) broadcast(PASSWORD, { network: name, password });
        });
    }
}

function handlePassword(payload: { network?: unknown; password?: unknown }) {
    const net = network();
    if (!net || payload?.network !== net.name || typeof payload.password !== "string") return;
    if (payload.password !== net.password) setNetwork({ ...net, password: payload.password });
}

on(SEPARATED, handleSeparated);
on(UNLOCK, handleUnlock);
on(UNLOCK_REFUSED, handleUnlockRefused);
on(PASSWORD, handlePassword);

// ---------------------------------------------------------------- presence

// what goes over the wire: the profile plus when this client started
function wire(p: Profile): Record<string, unknown> {
    return { ...p, at: startedAt };
}

function announce(ask: boolean) {
    if (!profile || !lobbyNetwork()) return;
    broadcast(PRESENCE, { profile: wire(profile), ...(ask ? { ask: true } : {}) });
}

function say(type: string) {
    if (lobbyNetwork()) broadcast(type, {});
}

function handlePresence(payload: { profile?: unknown; ask?: unknown; reply?: unknown }, from: LobbyFrom) {
    const member = readMember(from.peer, payload?.profile);
    if (!member) return;
    const before = claimed.get(from.peer);
    claimed.set(from.peer, member);
    heardAt.set(from.peer, Date.now());

    // they're new here (or after a merge): tell them who we are, straight back
    if (payload.ask === true && payload.reply !== true && profile) sendTo(from.peer, PRESENCE, { profile: wire(profile), reply: true });

    if (!before || before.profile.uid !== member.profile.uid || before.profile.key !== member.profile.key) verifier?.sync([...claimed]);
    applyProofs();
}

function handleBye(_payload: unknown, from: LobbyFrom) {
    forget([from.peer]);
}

// two networks merged: everyone announces once, spread out, so both halves learn each other
function handleAnnounce() {
    void later(Math.random() * ANNOUNCE_SPREAD_MS, () => announce(false));
}

on(PRESENCE, handlePresence);
on(BYE, handleBye);
on(ANNOUNCE, handleAnnounce);

function forget(peers: string[]) {
    let changed = false;
    for (const peer of peers)
    {
        heardAt.delete(peer);
        if (claimed.delete(peer)) changed = true;
    }
    if (!changed) return;
    verifier?.sync([...claimed]);
    applyProofs();
}

function clearPresence() {
    heardAt.clear();
    peerByUid = new Map();
    claimed = new Map();
    memberByPeer = new Map();
    setMembers([]);
}

/** Reads a wire profile (Profile + `at`) as sent by `wire()`; null when it is not a usable profile. Rooms reuse it. */
export function readMember(peer: string, raw: unknown): Member | null {
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as Record<string, unknown>;
    if (typeof value.uid !== "string" || !value.uid) return null;
    if (typeof value.key !== "string" || !value.key) return null;
    if (typeof value.name !== "string" || !value.name.trim()) return null;

    return {
        peer,
        at: typeof value.at === "number" ? value.at : 0,
        profile: {
            v: 2,
            uid: value.uid,
            key: value.key,
            name: value.name.trim().slice(0, 32),
            color: typeof value.color === "string" ? value.color : "",
            status: STATUSES.includes(value.status as Status) ? value.status as Status : "available",
        },
    };
}

// only members who proved their uid count
function applyProofs() {
    memberByPeer = new Map([...claimed].filter(([peer]) => verifier?.verified(peer)));
    publish();
    reportHealth();
}

// one peer per uid and one entry per person (newest wins). Your own peer is left out, and so are your
// other devices: they're you, not someone to chat with
function publish() {
    const byUid = new Map<string, Member>();
    for (const member of memberByPeer.values())
    {
        const current = byUid.get(member.profile.uid);
        if (newer(member, current)) byUid.set(member.profile.uid, member);
    }
    peerByUid = new Map([...byUid.values()].map(m => [m.profile.uid, m.peer]));

    const mine = me()?.uid;
    const byPerson = new Map<string, Member>();
    for (const member of byUid.values())
    {
        const { uid } = member.profile;
        if (uid === mine || (mine && samePerson(uid, mine))) continue;
        const person = personOf(uid);
        if (newer(member, byPerson.get(person))) byPerson.set(person, member);
    }
    setMembers(
        [...byPerson.values()]
            .map(m => m.profile)
            .sort((a, b) => a.name.localeCompare(b.name) || (a.uid < b.uid ? -1 : 1)),
    );
}

function newer(member: Member, current: Member | undefined): boolean {
    return !current || member.at > current.at || (member.at === current.at && member.peer > current.peer);
}

// any message is a sign of life
function heard(peer: string) {
    if (claimed.has(peer)) heardAt.set(peer, Date.now());
}

// one small broadcast per interval, then drop whoever went quiet without saying goodbye
function beat() {
    if (heartbeat) clearTimeout(heartbeat);
    heartbeat = null;
    if (!running) return;

    announce(false);
    const now = Date.now();
    if (now >= graceUntil)
    {
        const stale = [...claimed.keys()].filter(peer => now - (heardAt.get(peer) ?? 0) > LIMITS.staleMs);
        if (stale.length > 0)
        {
            log("lobby: quiet for too long, dropping", stale);
            forget(stale);
        }
    }

    const hidden = typeof document !== "undefined" && document.hidden;
    heartbeat = setTimeout(beat, hidden ? LIMITS.heartbeatHiddenMs : LIMITS.heartbeatMs);
}

// back in front: say so right away, and give everyone a hidden-interval to beat before ageing them
function handleVisibility() {
    if (document.hidden) return;
    graceUntil = Date.now() + LIMITS.heartbeatHiddenMs + 10_000;
    beat();
}

// ---------------------------------------------------------------- status and health

function tick() {
    syncStatus();
}

// lobbyStatus: "connected" once in the lobby and linked to someone (or keeping the socket as an anchor)
function syncStatus() {
    reportHealth();
    if (!running)
    {
        setLobbyStatus("idle");
        return;
    }
    if (!client)
    {
        setLobbyStatus("closed");
        return;
    }

    const net = lobbyNetwork();
    if (!net || booting)
    {
        setLobbyStatus(waking ? "waking" : wasIn ? "reconnecting" : "connecting");
        return;
    }
    // cut off from everyone: the beacon heals it back
    const alone = net.linked.size === 0 && (!net.anchored || !client.online);
    const next = alone ? "reconnecting" : "connected";
    if (lobbyStatus() !== next) log("lobby: status", next);
    setLobbyStatus(next);
}

function reportHealth() {
    const net = lobbyNetwork();
    const next: NetworkHealth | null = !net?.info ? null : {
        id: net.info.id.slice(0, 8),
        topology: topologyOf(net.info),
        anchor: net.anchored,
        socket: !!client?.online,
        listed: net.anchored ? listed : undefined,
        peers: [...new Set([...claimed.keys(), ...net.linked])]
            .filter(peer => peer !== net.me)
            .map(peer => ({
                id: peer.slice(0, 8),
                name: claimed.get(peer)?.profile.name ?? "",
                linked: net.linked.has(peer),
                proven: !!verifier?.verified(peer),
            })),
        merge: lastMerge,
    };
    const shown = JSON.stringify(next);
    if (shown === healthShown) return;
    healthShown = shown;
    setNetworkHealth(next);
}

// ---------------------------------------------------------------- network events (never throw)

function attach(net: Net) {
    verifier = new Verifier({
        me: () => net.me,
        ready: () => net.linked.size > 0,
        send: (peer, payload) => { sendTo(peer, PROOF, payload); },
        changed: () => { if (net === lobby) applyProofs(); },
    });
    net.addEventListener("message", handleMessage);
    net.addEventListener("link", handleLink);
    net.addEventListener("merged", handleMerged);
    net.addEventListener("update", handleUpdate);
    net.addEventListener("anchored", handleAnchored);
    net.addEventListener("close", handleClose);
}

function detach(net: Net) {
    verifier?.stop();
    verifier = null;
    net.removeEventListener("message", handleMessage);
    net.removeEventListener("link", handleLink);
    net.removeEventListener("merged", handleMerged);
    net.removeEventListener("update", handleUpdate);
    net.removeEventListener("anchored", handleAnchored);
    net.removeEventListener("close", handleClose);
    try
    {
        if (!net.closed) net.leave();
    }
    catch (error)
    {
        log("lobby: leave failed", error);
    }
}

function handleMessage(event: Event) {
    if (event.target !== lobby) return;
    const message = (event as CustomEvent<Message>).detail;
    const { type, sender } = message.meta;
    let payload: unknown;
    try
    {
        payload = message.parse();
    }
    catch
    {
        log("lobby: unreadable message", type, sender);
        return;
    }

    heard(sender);
    if (type === PROOF)
    {
        verifier?.receive(sender, payload);
        return;
    }

    const set = handlers.get(type);
    if (!set || set.size === 0)
    {
        log("lobby: unhandled message", type, sender);
        return;
    }
    if (ANYONE.has(type) || verifier?.verified(sender)) deliver(type, sender, payload, set);
    else verifier?.hold(sender, () => deliver(type, sender, payload, set));
}

function deliver(type: string, sender: string, payload: unknown, set: Set<LobbyHandler>) {
    const member = memberByPeer.get(sender);
    const from: LobbyFrom = { peer: sender, uid: member?.profile.uid ?? null, profile: member?.profile ?? null };
    for (const handler of [...set])
    {
        try
        {
            handler(payload, from);
        }
        catch (error)
        {
            console.error(`[papchat] lobby handler for "${type}" failed`, error);
        }
    }
}

// a new direct link: someone we may not know yet (after a merge, or they just came in)
function handleLink(event: Event) {
    if (event.target !== lobby) return;
    const { peer, open } = (event as CustomEvent<{ peer: string; open: boolean }>).detail;
    if (open)
    {
        verifier?.poke();
        if (!claimed.has(peer) && profile) sendTo(peer, PRESENCE, { profile: wire(profile), ask: true });
    }
    syncStatus();
}

// fires on the two ends of the bridge. The side that moved has the other network's id from here on
function handleMerged(event: Event) {
    if (event.target !== lobby) return;
    const net = lobby!;
    log("lobby: merged, now", net.info?.id);
    readNetworkSaves(net.info?.meta);
    setSeparated(null);
    separatedBy = null;
    syncStatus();
    const current = epoch;
    for (const delay of MERGE_SETTLE_MS)
    {
        void later(delay, () => {
            if (current !== epoch) return;
            broadcast(ANNOUNCE, {});
            announce(false);
        });
    }
}

function handleUpdate(event: Event) {
    if (event.target !== lobby) return;
    readNetworkSaves(lobby!.info?.meta);
    reportHealth();
}

function handleAnchored(event: Event) {
    if (event.target !== lobby) return;
    const anchored = (event as CustomEvent<boolean>).detail;
    log("lobby: anchor", anchored);
    syncStatus();
    if (anchored) void later(LIMITS.raceGuardMs, () => check(epoch));
}

// the lobby closed under us (its carrier is gone): find it again. Rooms carried by it close too
function handleClose(event: Event) {
    const net = event.target as Net;
    if (net !== lobby) return;
    log("lobby: closed, finding it again");
    detach(net);
    lobby = null;
    clearPresence();
    separatedBy = null;
    setSeparated(null);
    if (!running || !client) return;
    syncStatus();
    retry(epoch);
}

function handleClientError(event: Event) {
    const detail = (event as CustomEvent<{ type: string; message: string }>).detail;
    log("lobby: error", detail?.type, detail?.message);
}

function handlePageHide(event: PageTransitionEvent) {
    // a page going into the back/forward cache keeps running later, so only leave for real unloads
    if (event.persisted) return;
    try
    {
        say(BYE);
        client?.close();
    }
    catch { /* unloading anyway */ }
}

// ---------------------------------------------------------------- helpers

function wait(ms: number): Promise<void> {
    return new Promise(resolve => {
        const timer = {
            id: setTimeout(() => {
                timers.delete(timer);
                resolve();
            }, ms),
            resolve,
        };
        timers.add(timer);
    });
}

// runs `fn` after `ms` unless the lobby stops first
async function later(ms: number, fn: () => unknown) {
    const current = epoch;
    await wait(ms);
    if (current !== epoch) return;
    try
    {
        await fn();
    }
    catch (error)
    {
        log("lobby: timer failed", error);
    }
}

function alive(current: number) {
    if (current !== epoch || !client) throw new Cancelled();
}
