import { Client } from "@papit/webrtc";

import { APP, LIMITS, LOBBY_NAME, RTC, signalUrl } from "./config";
import { log } from "./log";
import { me, network, separated, setLobbyStatus, setMembers, setNetwork, setSeparated, toast } from "./state";
import type { Network, NetworkEntry, Profile, Status } from "./types";

// The papchat lobby (PLAN §2.2–2.4): one chord network everyone online is in. A private network
// (`network()`) is the same thing under its own name and password, so only its members meet. Find the canonical
// lobby or create it, converge when two people create at once or a rogue group comes back, keep
// `members` / `lobbyStatus` up to date and route app messages by uid.

export type LobbyFrom = {
    peer: string;
    // null when the sender's profile isn't known (yet)
    uid: string | null;
    profile: Profile | null;
};

export type LobbyHandler<Payload = any> = (payload: Payload, from: LobbyFrom) => void;

type NetworkInfo = Awaited<ReturnType<Client["list"]>>[number];

export type Member = { peer: string; at: number; profile: Profile };

const STATUSES: Status[] = ["available", "busy", "away", "dnd"];
const RETRY_MIN_MS = 3_000;
const RETRY_MAX_MS = 30_000;
const UNREACHABLE_QUIET_MS = 3_000;
// how long the host stays after telling the group to move, so nobody loses it mid-move
const MERGE_HOST_DELAY_MS = 1_500;
const PROBE_TIMEOUT_MS = 20_000;
// host → group: move to the more canonical network. Comes with the password once someone found it.
const MERGE = "lobby-merge";
// host → group: a same-name network exists that we can't get into
const SEPARATED = "lobby-separated";
// member → host: this password opens the network we're separated from
const UNLOCK = "lobby-unlock";

class WrongPassword extends Error { }

// a boot belongs to one epoch; stop/reconnect bumps it so stale async work bails out
class Cancelled extends Error { }

let client: Client | null = null;
let epoch = 0;
let running = false;
let booting = false;
let guarding = false;
let rebooting = false;
// the client's re-register failed: the group still works, but nobody can find it until it's sent again
let unregistered = false;
// network + password pairs the host already tried, so a scan doesn't knock on the same door every minute
const refused = new Set<string>();
let retryMs = RETRY_MIN_MS;
let nextServerSlot = 0;
// when this client started: sent in the profile so "newest peer wins" is the same for everyone
let startedAt = 0;
let profile: Profile | null = null;

let peerByUid = new Map<string, string>();
let memberByPeer = new Map<string, Member>();
const handlers = new Map<string, Set<LobbyHandler>>();
const timers = new Set<{ id: ReturnType<typeof setTimeout>; resolve: () => void }>();
const lastUnreachable = new Map<string, number>();

// presence (PLAN §2.2): peer → when we last heard from it (any message, or its arrival)
const heardAt = new Map<string, number>();
let heartbeat: ReturnType<typeof setTimeout> | null = null;
// after our own tab was asleep we heard nothing either: don't drop anyone until they had time to beat
let graceUntil = 0;

// recent unicasts by receiving peer, to send again when they come back unreachable
type Sent = { uid: string; type: string; payload: unknown; tries: number; at: number };
const RECENT_MS = 10_000;
const recent = new Map<string, Sent[]>();
const retrying = new Set<string>();

// ---------------------------------------------------------------- public API

/**
 * Connects to the signal server and lands in the lobby (find, join or create). Needs a profile.
 * Resolves true once in the lobby, false if the first attempt didn't make it (it keeps retrying).
 * Never rejects. Calling it again while running returns immediately.
 */
export async function startLobby(): Promise<boolean> {
    if (running) return client?.network != null;

    profile = me();
    if (!profile)
    {
        log("lobby: no profile yet, not starting");
        return false;
    }

    running = true;
    rebooting = false;
    if (typeof window !== "undefined") window.addEventListener("pagehide", handlePageHide);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility);
    beat();
    return startClient();
}

/** Leaves the lobby, closes the socket and clears every timer and listener. */
export function stopLobby() {
    running = false;
    stopClient();
    if (typeof window !== "undefined") window.removeEventListener("pagehide", handlePageHide);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility);
    if (heartbeat) clearTimeout(heartbeat);
    heartbeat = null;
    heardAt.clear();
    recent.clear();
    retrying.clear();
    peerByUid = new Map();
    memberByPeer = new Map();
    setMembers([]);
    setLobbyStatus("idle");
}

/**
 * Unicast an app message to whoever has `uid` (their newest peer). False when unknown or not in the
 * lobby. Comes back unreachable → sent again a couple of times before "Couldn't reach" shows.
 */
export function send(uid: string, type: string, payload?: unknown): boolean {
    return sendTry(uid, type, payload, 0);
}

function sendTry(uid: string, type: string, payload: unknown, tries: number): boolean {
    const peer = peerByUid.get(uid);
    if (!client?.network || !peer) return false;
    try
    {
        const sent = client.send(peer, type, payload);
        if (sent) remember(peer, { uid, type, payload, tries, at: Date.now() });
        return sent;
    }
    catch (error)
    {
        log("lobby: send failed", type, error);
        return false;
    }
}

/** Broadcast an app message to everyone in the lobby. */
export function broadcast(type: string, payload?: unknown): boolean {
    if (!client?.network) return false;
    try
    {
        return client.broadcast(type, payload);
    }
    catch (error)
    {
        log("lobby: broadcast failed", type, error);
        return false;
    }
}

/** Listens for lobby app messages of `type`. Returns the unsubscribe function. Survives reconnects. */
export function on<Payload = any>(type: string, handler: LobbyHandler<Payload>): () => void {
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
    if (!client) return;
    try
    {
        client.setProfile(wire(next));
    }
    catch (error)
    {
        log("lobby: setProfile failed", error);
    }
}

export function peerOf(uid: string): string | null {
    return peerByUid.get(uid) ?? null;
}

export function uidOf(peer: string): string | null {
    return memberByPeer.get(peer)?.profile.uid ?? null;
}

export function profileOf(uid: string): Profile | null {
    const peer = peerByUid.get(uid);
    return (peer && memberByPeer.get(peer)?.profile) || null;
}

/**
 * Tries a password on the network this group is separated from. True when that was handled here, so
 * the page must not switch network: a right password moves the whole group, a wrong one shows a toast.
 * False when we aren't separated, or `next` is another network: a normal switch.
 */
export async function unlockNetwork(next: Network | null): Promise<boolean> {
    const c = client;
    const target = separated();
    if (!c?.network || !target || !next || next.name !== network()?.name) return false;

    const current = epoch;
    try
    {
        if (!await canEnter(target, next.password))
        {
            toast("warning", `That isn't the password for "${next.name}"`);
            return true;
        }
        alive(current);
        setNetwork(next);
        setSeparated(null);
        if (c.host === c.id)
        {
            await merge(current, c, target, next.password);
            return true;
        }
        c.send(c.host!, UNLOCK, { password: next.password });
        await wait(MERGE_HOST_DELAY_MS);
        alive(current);
        rejoin();
    }
    catch (error)
    {
        if (error instanceof Cancelled) return true;
        log("lobby: unlock failed", error);
        toast("error", `Couldn't reach "${next.name}"`);
    }
    return true;
}

/** The underlying client, for console checks. Null while stopped. */
export function lobbyClient(): Client | null {
    return client;
}

/**
 * The papchat networks on the signal server: the public one first (always listed), then the
 * private ones by name. Uses the lobby's socket, or a short-lived one when we're not in a lobby
 * (e.g. after a wrong password). Resolves to just the public one when the server can't be reached.
 */
export async function listNetworks(): Promise<NetworkEntry[]> {
    const own = client;
    const c = own ?? new Client({ url: signalUrl(), rtc: RTC, topology: "chord" });
    const found = new Map<string, NetworkEntry>([["", { name: "", members: 0, locked: false }]]);
    try
    {
        await c.ready;
        for (const info of await c.list())
        {
            if (info.meta?.app !== APP || info.meta?.kind !== "lobby") continue;
            const name = typeof info.meta.network === "string" ? info.meta.network : "";
            // two lobbies under one name (a race that hasn't converged yet) count as one network
            const entry = found.get(name) ?? { name, members: 0, locked: false };
            entry.members += info.size;
            entry.locked ||= info.meta.locked === true;
            found.set(name, entry);
        }
    }
    catch (error)
    {
        log("lobby: listing networks failed", error);
    }
    finally
    {
        if (!own) try { c.close(); } catch { /* already closed */ }
    }
    return [...found.values()].sort((a, b) => (a.name === "" ? -1 : b.name === "" ? 1 : a.name.localeCompare(b.name)));
}

// ---------------------------------------------------------------- client lifecycle

function startClient(): Promise<boolean> {
    const current = ++epoch;
    startedAt = Date.now();
    nextServerSlot = 0;
    retryMs = RETRY_MIN_MS;

    try
    {
        client = new Client({
            url: signalUrl(),
            rtc: RTC,
            topology: "chord",
            profile: wire(profile!),
        });
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

    attach(client);
    syncStatus();
    void scan(current);
    return boot(current);
}

function stopClient() {
    epoch++;
    booting = false;
    guarding = false;
    unregistered = false;
    refused.clear();
    setSeparated(null);
    for (const timer of timers)
    {
        clearTimeout(timer.id);
        timer.resolve();
    }
    timers.clear();

    const old = client;
    client = null;
    if (!old) return;
    detach(old);
    try
    {
        old.close();
    }
    catch (error)
    {
        log("lobby: close failed", error);
    }
}

// members drop their socket once linked, so moving network on the same Client can't work: start a
// fresh one, and `boot` lands it on the canonical lobby
function rejoin() {
    if (!running) return;
    log("lobby: rebuilding the lobby connection");
    rebooting = true;
    stopClient();
    peerByUid = new Map();
    memberByPeer = new Map();
    setMembers([]);
    void startClient();
}

// ---------------------------------------------------------------- boot and election (§2.2)

async function boot(current: number): Promise<boolean> {
    const c = client;
    if (!c) return false;
    booting = true;
    syncStatus();

    try
    {
        await c.ready;
        alive(current);

        // steps 1, 2 and 5: join the most canonical lobby we can enter, retry once from the top
        let locked = false;
        for (let attempt = 0; attempt < 2 && !c.network; attempt++)
        {
            const lobbies = await findLobbies(current, c);
            if (lobbies.length === 0) break;

            for (const target of lobbies)
            {
                try
                {
                    log("lobby: joining", target.id, target.meta);
                    await join(current, c, target.id);
                    break;
                }
                catch (error)
                {
                    alive(current);
                    // a rogue member who reloads gets back to its group here, behind the locked one
                    if (error instanceof WrongPassword)
                    {
                        locked = true;
                        continue;
                    }
                    log("lobby: join failed", error);
                    break;
                }
            }
        }
        // the network exists but isn't ours to enter: creating a second one would split it
        if (locked && !c.network) throw new WrongPassword();

        // step 3: none (or joining keeps failing): we host it
        if (!c.network)
        {
            const net = network();
            log("lobby: creating", net?.name ?? LOBBY_NAME);
            await serverCall(current, () => c.create({
                name: net?.name ?? LOBBY_NAME,
                ...(net?.password ? { password: net.password } : {}),
                meta: { app: APP, kind: "lobby", v: 1, created: Date.now(), ...(net ? { network: net.name, locked: !!net.password } : {}) },
            }));
        }
        alive(current);

        booting = false;
        rebooting = false;
        retryMs = RETRY_MIN_MS;
        syncStatus();
        log("lobby: in", c.network?.id, c.host === c.id ? "(host)" : "");

        // step 4
        await raceGuard(current);
        return client === c && c.network != null;
    }
    catch (error)
    {
        if (error instanceof Cancelled) return false;
        if (error instanceof WrongPassword)
        {
            // retrying can't help: stay out until the user picks another password in the settings
            log("lobby: wrong password for", network()?.name);
            booting = false;
            running = false;
            stopClient();
            setLobbyStatus("closed");
            toast("error", `Wrong password for the network "${network()?.name ?? ""}". Change it in Settings → Profile.`);
            return false;
        }
        log("lobby: boot failed, retrying", error);
        booting = false;
        syncStatus();
        retry(current);
        return false;
    }
}

function retry(current: number) {
    const delay = retryMs;
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    wait(delay).then(() => {
        if (current !== epoch || !client || client.network) return;
        void boot(current);
    });
}

// after creating or joining, look once more: if a more canonical lobby showed up, move there.
// Everyone applies the same order, so simultaneous creators all end up in the same lobby.
async function raceGuard(current: number) {
    const c = client;
    if (!c || guarding) return;
    guarding = true;

    try
    {
        await wait(LIMITS.raceGuardMs);
        alive(current);
        if (!c.network) return;

        const lobbies = await findLobbies(current, c);
        // not listed yet (a re-register is still under way): our id and order aren't known, so decide nothing
        const own = serverId(c);
        const mine = lobbies.find(n => n.id === own);
        if (!mine)
        {
            log("lobby: not listed yet, checking again later", own);
            return;
        }

        // an older network we can't enter doesn't stop us joining one we can
        let wall: string | null = null;
        for (const target of lobbies)
        {
            if (compare(target, mine) >= 0) break;
            if (await mayEnter(current, target))
            {
                log("lobby: a more canonical lobby exists, moving", mine.id, "→", target.id);
                await merge(current, c, target.id);
                return;
            }
            wall ??= target.id;
        }
        log(wall ? "lobby: staying separate from" : "lobby: already the canonical lobby", wall ?? mine.id);
        markSeparated(wall);
    }
    catch (error)
    {
        if (!(error instanceof Cancelled)) log("lobby: race guard failed", error);
    }
    finally
    {
        if (current === epoch)
        {
            guarding = false;
            booting = false;
            syncStatus();
        }
    }
}

// the host moves last: the network it hosts dies with it, and a member that missed the message
// gets another try from whoever takes over as host
async function merge(current: number, c: Client, target: string, password?: string) {
    if (c.members.length > 1)
    {
        broadcast(MERGE, { network: target, ...(password ? { password } : {}) });
        await wait(MERGE_HOST_DELAY_MS);
        alive(current);
    }
    rejoin();
}

async function mayEnter(current: number, target: NetworkInfo): Promise<boolean> {
    if (target.meta?.locked !== true) return true;

    const password = network()?.password ?? "";
    const key = `${target.id}\n${password}`;
    if (refused.has(key)) return false;

    const open = await canEnter(target.id, password);
    alive(current);
    if (!open) refused.add(key);
    return open;
}

// only joining can test a password. A client with no profile never shows up in anyone's member list.
// False for a wrong password; anything else throws, because it says nothing about the password.
async function canEnter(id: string, password: string): Promise<boolean> {
    const probe = new Client({ url: signalUrl(), rtc: RTC, topology: "chord", timeout: PROBE_TIMEOUT_MS, connectTimeout: PROBE_TIMEOUT_MS });
    try
    {
        await probe.ready;
        await probe.join(id, password || undefined);
        return true;
    }
    catch (error)
    {
        if (isWrongPassword(error)) return false;
        throw error;
    }
    finally
    {
        try { probe.close(); } catch { /* already closed */ }
    }
}

function isWrongPassword(error: unknown): boolean {
    return /wrong password|forbidden/i.test(String((error as Error)?.message ?? error));
}

// sent on every scan, because members who joined since then haven't heard
function markSeparated(target: string | null) {
    const changed = target !== separated();
    setSeparated(target);
    if (target || changed) broadcast(SEPARATED, { network: target });
}

function handleMerge(payload: { network?: unknown; password?: unknown }, from: LobbyFrom) {
    const c = client;
    if (!c?.network || c.host === c.id || from.peer !== c.host) return;

    const net = network();
    if (net && typeof payload?.password === "string") setNetwork({ name: net.name, password: payload.password });
    log("lobby: the group is moving");
    // rebuild outside the client's own event dispatch; a second message finds another client and stops
    setTimeout(() => { if (client === c) rejoin(); }, 0);
}

function handleSeparated(payload: { network?: unknown }, from: LobbyFrom) {
    const c = client;
    if (!c?.network || c.host === c.id || from.peer !== c.host) return;
    setSeparated(typeof payload?.network === "string" ? payload.network : null);
}

// the host tests it too: anyone in the group can send this
function handleUnlock(payload: { password?: unknown }) {
    const c = client;
    const target = separated();
    const net = network();
    if (!c?.network || c.host !== c.id || !target || !net || typeof payload?.password !== "string") return;

    const current = epoch;
    const password = payload.password;
    void (async () => {
        try
        {
            if (!await canEnter(target, password))
            {
                log("lobby: unlock refused");
                return;
            }
            alive(current);
            setNetwork({ name: net.name, password });
            setSeparated(null);
            await merge(current, c, target, password);
        }
        catch (error)
        {
            if (!(error instanceof Cancelled)) log("lobby: unlock failed", error);
        }
    })();
}

on(MERGE, handleMerge);
on(SEPARATED, handleSeparated);
on(UNLOCK, handleUnlock);

// the race guard runs once after joining, which misses a rogue group that comes back later: keep looking
async function scan(current: number) {
    try
    {
        while (true)
        {
            await wait(LIMITS.rogueScanMs);
            alive(current);
            await recheck(current);
        }
    }
    catch (error)
    {
        if (!(error instanceof Cancelled)) log("lobby: scan stopped", error);
    }
}

// only the host has a socket, so it looks for everyone
async function recheck(current: number) {
    const c = client;
    if (!c?.network || c.host !== c.id || c.status !== "connected" || booting) return;

    try
    {
        if (unregistered)
        {
            log("lobby: registering the network again");
            unregistered = false;
            // private, and the only way to send it again (papit gap): it reports its own failure as an "error"
            await serverCall(current, () => c["reregister"]());
        }
        await raceGuard(current);
    }
    catch (error)
    {
        if (!(error instanceof Cancelled)) log("lobby: recheck failed", error);
    }
}

async function findLobbies(current: number, c: Client): Promise<NetworkInfo[]> {
    const all = await serverCall(current, () => c.list());
    alive(current);
    const name = network()?.name;
    return all
        // the public lobby has no `network`, a private one carries its name
        .filter(n => n.meta?.app === APP && n.meta?.kind === "lobby" && n.meta?.network === name)
        .sort(compare);
}

async function join(current: number, c: Client, id: string) {
    const password = network()?.password || undefined;
    try
    {
        await serverCall(current, () => c.join(id, password));
    }
    catch (error)
    {
        if (isWrongPassword(error)) throw new WrongPassword();
        throw error;
    }
}

/**
 * The id the server knows this network by. After a re-register that differs from `c.network.id`, which keeps
 * the old one, and only `serverNetwork` has the new one: it's private, so read it around the type (papit gap).
 */
export function serverId(c: Client): string | null {
    return c["serverNetwork"] ?? c.network?.id ?? null;
}

// canonical = smallest meta.created, then smallest id
function compare(a: NetworkInfo, b: NetworkInfo): number {
    const ca = created(a);
    const cb = created(b);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function created(n: NetworkInfo): number {
    const value = n.meta?.created;
    return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------- helpers

// the server strikes messages to it that come < 200 ms apart: space ours ≥ LIMITS.serverGapMs
async function serverCall<T>(current: number, run: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const at = Math.max(now, nextServerSlot);
    nextServerSlot = at + LIMITS.serverGapMs;
    if (at > now) await wait(at - now);
    alive(current);
    return run();
}

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

function alive(current: number) {
    if (current !== epoch || !client) throw new Cancelled();
}

// what goes over the wire: the profile plus when this client started
function wire(p: Profile): Record<string, unknown> {
    return { ...p, at: startedAt };
}

/** Reads a wire profile (Profile + `at`) as sent by `wire()`; null when it is not a usable profile. Rooms reuse it. */
export function readMember(peer: string, raw: unknown): Member | null {
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as Record<string, unknown>;
    if (typeof value.uid !== "string" || !value.uid) return null;
    if (typeof value.name !== "string" || !value.name.trim()) return null;

    return {
        peer,
        at: typeof value.at === "number" ? value.at : 0,
        profile: {
            v: 1,
            uid: value.uid,
            name: value.name.trim().slice(0, 32),
            color: typeof value.color === "string" ? value.color : "",
            status: STATUSES.includes(value.status as Status) ? value.status as Status : "available",
        },
    };
}

// lobbyStatus: the socket status, except "connected" only counts once we're in the lobby
function syncStatus() {
    if (!running)
    {
        setLobbyStatus("idle");
        return;
    }
    if (!client)
    {
        setLobbyStatus(rebooting ? "reconnecting" : "closed");
        return;
    }

    const status = client.status;
    if (status === "connected" || status === "connecting")
    {
        if (status === "connected" && client.network && !booting) setLobbyStatus("connected");
        else setLobbyStatus(rebooting ? "reconnecting" : "connecting");
        return;
    }
    setLobbyStatus(status);
}

// ---------------------------------------------------------------- client events (never throw)

function attach(c: Client) {
    c.addEventListener("status", handleStatus);
    c.addEventListener("members", handleMembers);
    c.addEventListener("message", handleMessage);
    c.addEventListener("unreachable", handleUnreachable);
    c.addEventListener("host", handleHost);
    c.addEventListener("error", handleError);
}

function detach(c: Client) {
    c.removeEventListener("status", handleStatus);
    c.removeEventListener("members", handleMembers);
    c.removeEventListener("message", handleMessage);
    c.removeEventListener("unreachable", handleUnreachable);
    c.removeEventListener("host", handleHost);
    c.removeEventListener("error", handleError);
}

function handleStatus(event: Event) {
    if (event.target !== client) return;
    try
    {
        const status = (event as CustomEvent).detail;
        log("lobby: status", status);
        syncStatus();
        // back from a drop: the server may have a same-name network now
        if (status === "connected") void recheck(epoch);
    }
    catch (error)
    {
        log("lobby: status handler failed", error);
    }
}

// one entry per uid (newest peer wins), yourself left out
function handleMembers(event: Event) {
    if (event.target !== client) return;
    try
    {
        const c = client!;
        const { members, profiles } = (event as CustomEvent<{ members: string[]; profiles: Record<string, unknown> }>).detail;
        const byPeer = new Map<string, Member>();
        const now = Date.now();

        for (const peer of members)
        {
            if (peer === c.id) continue;
            const member = readMember(peer, profiles[peer]);
            if (!member) continue;
            byPeer.set(peer, member);
            // a newcomer counts as heard; a known one keeps its time (a join elsewhere isn't a sign of life)
            if (!heardAt.has(peer)) heardAt.set(peer, now);
        }
        for (const peer of heardAt.keys())
        {
            if (!byPeer.has(peer)) heardAt.delete(peer);
        }


        memberByPeer = byPeer;
        publish();
        syncStatus();
    }
    catch (error)
    {
        log("lobby: members handler failed", error);
    }
}

function handleMessage(event: Event) {
    if (event.target !== client) return;
    const { type, sender, payload } = (event as CustomEvent<{ type: string; sender: string; payload: unknown }>).detail;
    const set = handlers.get(type);
    if (!set || set.size === 0)
    {
        log("lobby: unhandled message", type, sender);
        return;
    }

    heard(sender);
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

function handleUnreachable(event: Event) {
    if (event.target !== client) return;
    try
    {
        const { receiver } = (event as CustomEvent<{ receiver: string; ref: string }>).detail;
        log("lobby: unreachable", receiver);
        if (resend(receiver)) return;

        // one toast per person for a burst of undeliverable messages
        const now = Date.now();
        if (now - (lastUnreachable.get(receiver) ?? 0) < UNREACHABLE_QUIET_MS) return;
        lastUnreachable.set(receiver, now);

        const name = memberByPeer.get(receiver)?.profile.name;
        toast("warning", name ? `Couldn't reach ${name}` : "Couldn't reach that person");
    }
    catch (error)
    {
        log("lobby: unreachable handler failed", error);
    }
}

// promoted to host (the old one left): our lobby might be a stale duplicate, check once
function handleHost(event: Event) {
    if (event.target !== client) return;
    try
    {
        const c = client!;
        if ((event as CustomEvent<string>).detail !== c.id || !c.network || booting) return;
        log("lobby: we are the host now");
        void raceGuard(epoch);
    }
    catch (error)
    {
        log("lobby: host handler failed", error);
    }
}

function handleError(event: Event) {
    if (event.target !== client) return;
    const detail = (event as CustomEvent<{ type: string; message: string; payload: unknown }>).detail;
    log("lobby: error", detail?.type, detail?.message, detail?.payload);
    // the scan sends it again
    if (detail?.type === "host") unregistered = true;
}

// ---------------------------------------------------------------- presence

// members by uid (newest peer wins) among the peers heard from lately, yourself left out
function publish() {
    const now = Date.now();
    const newest = new Map<string, Member>();
    for (const [peer, member] of memberByPeer)
    {
        if (!fresh(peer, now)) continue;
        const current = newest.get(member.profile.uid);
        if (!current || member.at > current.at || (member.at === current.at && peer > current.peer))
        {
            newest.set(member.profile.uid, member);
        }
    }

    peerByUid = new Map([...newest.values()].map(m => [m.profile.uid, m.peer]));
    setMembers(
        [...newest.values()]
            .map(m => m.profile)
            .sort((a, b) => a.name.localeCompare(b.name) || (a.uid < b.uid ? -1 : 1)),
    );
}

function fresh(peer: string, now: number): boolean {
    return now < graceUntil || now - (heardAt.get(peer) ?? now) < LIMITS.staleMs;
}

// any message is a sign of life; one from someone we had dropped brings them back
function heard(peer: string) {
    const now = Date.now();
    const was = fresh(peer, now);
    if (memberByPeer.has(peer) || heardAt.has(peer)) heardAt.set(peer, now);
    if (!was && memberByPeer.has(peer)) publish();
}

// one tiny broadcast per interval, then drop whoever went quiet (only republished when that changes)
function beat() {
    if (heartbeat) clearTimeout(heartbeat);
    heartbeat = null;
    if (!running) return;

    if (client?.network) broadcast("here");
    const now = Date.now();
    // kept past a peer's departure (a send to someone who just reloaded is retried to their new peer)
    for (const [peer, list] of recent)
    {
        if (now - (list.at(-1)?.at ?? 0) > RECENT_MS) recent.delete(peer);
    }
    const stale = [...peerByUid.values()].filter(peer => !fresh(peer, now));
    if (stale.length > 0)
    {
        log("lobby: quiet for too long, dropping", stale);
        publish();
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

// `here` only needs to arrive (handleMessage marks the sender heard)
on("here", () => { });

// ---------------------------------------------------------------- resend

function remember(peer: string, entry: Sent) {
    const list = (recent.get(peer) ?? []).filter(e => entry.at - e.at < RECENT_MS);
    list.push(entry);
    recent.set(peer, list.slice(-8));
}

// what was sent to `peer` lately goes out again shortly (to their newest peer by then); true while
// a retry is on its way, so the burst of unreachables for one send stays quiet
function resend(peer: string): boolean {
    if (retrying.has(peer)) return true;
    const now = Date.now();
    const again = (recent.get(peer) ?? []).filter(e => now - e.at < RECENT_MS && e.tries < LIMITS.resendTries);
    recent.delete(peer);
    if (again.length === 0) return false;

    retrying.add(peer);
    const current = epoch;
    void wait(LIMITS.resendGapMs).then(() => {
        retrying.delete(peer);
        if (current !== epoch) return;
        for (const e of again)
        {
            log("lobby: sending again", e.type, "to", e.uid, `(${e.tries + 1})`);
            sendTry(e.uid, e.type, e.payload, e.tries + 1);
        }
    });
    return true;
}

function handlePageHide(event: PageTransitionEvent) {
    // a page going into the back/forward cache keeps running later, so only leave for real unloads
    if (event.persisted) return;
    try
    {
        client?.close();
    }
    catch { /* unloading anyway */ }
}
