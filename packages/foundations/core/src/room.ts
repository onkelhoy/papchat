import { signal } from "@papit/signals";
import { Client } from "@papit/webrtc";

import { APP, LIMITS, RTC, signalUrl } from "./config";
import { constraints, listDevices, type CaptureName } from "./devices";
import { setStatus } from "./identity";
import { ping } from "./ringtone";
import { peerOf, readMember, send as lobbySend } from "./lobby";
import { log } from "./log";
import { activeRoom, me, setActiveRoom, setRooms, toast } from "./state";
import { storage } from "./storage";
import { Transfers } from "./transfer";
import type { ChatMessage, FileEntry, Invite, InviteKind, Profile, RoomKind, RoomStatus, RoomSummary, SessionRoom, Status } from "./types";

// A room (PLAN §2.5): one private mesh network with its own Client. Chat over `client.broadcast`,
// ephemeral state (typing; mute flags in T3.1) over the `state` channel, files (T4.1) over `file`.
// A socket reconnect closes the client and builds a fresh one (see Notes: papit gap), then rejoins;
// if the network is gone (server restart) the smallest uid recreates it and re-invites the rest.

type NetworkInfo = NonNullable<Client["network"]>;
type MediaPlan = NonNullable<Parameters<Client["create"]>[0]["media"]>;

export const ROOM_PLAN: MediaPlan = {
    channels: {
        file: { ordered: true },                        // binary file chunks (T4.1)
        state: { ordered: false, maxRetransmits: 0 },   // typing, speaking, mute flags
    },
    streams: {
        mic: { kind: "audio" },
        camera: { kind: "video" },
        screen: { kind: "video" },                      // getDisplayMedia because of the name
    },
};

export type RoomFrom = {
    peer: string;
    // null when the sender's profile isn't known (yet)
    uid: string | null;
    profile: Profile | null;
};

export type RoomHandler<Payload = any> = (payload: Payload, from: RoomFrom) => void;

/** A remote media stream: `name` is `mic`, `camera` or `screen`. `uid` is "" until the peer's profile is known. */
export type RemoteStream = { peer: string; uid: string; name: string; stream: MediaStream };

/** What a peer says it is sending (broadcast on the `state` channel). */
export type MediaFlags = { mic: boolean; camera: boolean; screen: boolean };

export type RoomOptions = {
    // the other uid of a 1:1 chat: stored in the network meta so both ends map uid → room
    direct?: string;
    // start with this many unread (a chat invite counts as one)
    unread?: number;
};

const REJOIN_ATTEMPTS = 3;
const REJOIN_GAP_MS = 1_500;
const REINVITE_EVERY_MS = 3_000;
const REINVITE_FOR_MS = 60_000;
const ADOPT_WAIT_MS = 20_000;
const TITLE_MAX = 80;

class Cancelled extends Error { }

const registry = new Map<string, Room>();
// session entries not rejoined yet: kept in storage until restoreRooms settles them
const restoring = new Map<string, SessionRoom>();

/**
 * Fires `client` (detail: the new `Client`) every time a client is in the network, after create,
 * join and every rebuild: attach media/channel listeners there (T3.1, T4.1). Fires `leave` once.
 */
export class Room extends EventTarget {
    /** Stable local id: the first network id. Used by `rooms`, `activeRoom` and `getRoom`. */
    readonly id: string;
    readonly kind: RoomKind;
    /** The network currently used (differs from `id` only after a recreate). */
    network: string;
    password: string;
    title: string;
    /** The other uid for a 1:1 chat, null for a group (or once a third person joins). */
    direct: string | null;

    readonly messages: () => ChatMessage[];
    /** Everyone else in the room, one entry per uid, sorted by name. */
    readonly participants: () => Profile[];
    /** uids typing right now. */
    readonly typing: () => string[];
    readonly unread: () => number;
    readonly status: () => RoomStatus;

    private setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    private setParticipants: (next: Profile[]) => void;
    private setTyping: (next: string[]) => void;
    private setUnread: (next: number | ((prev: number) => number)) => void;
    private setStatusSignal: (next: RoomStatus) => void;

    /** Your own captures by name (`mic`, `camera`, `screen`). */
    readonly captures: () => Record<string, MediaStream>;
    /** Streams other people send, one entry per peer and name. */
    readonly streams: () => RemoteStream[];
    /** uid → what that person says they send; use it to show mute and camera-off before a stream arrives. */
    readonly flags: () => Record<string, MediaFlags>;

    private transfers: Transfers;

    private setCaptures: (next: Record<string, MediaStream>) => void;
    private setStreams: (next: RemoteStream[] | ((prev: RemoteStream[]) => RemoteStream[])) => void;
    private setFlags: (next: Record<string, MediaFlags> | ((prev: Record<string, MediaFlags>) => Record<string, MediaFlags>)) => void;
    // the captures themselves; the client gets clones, so a rebuild can hand them to the next client
    private local = new Map<string, MediaStream>();
    private localEnded = new Map<string, () => void>();
    private mediaClient: Client | null = null;
    private starting = new Set<string>();

    private _client: Client | null = null;
    private epoch = 0;
    private closed = false;
    private startedAt = 0;
    private baseline = false;
    private present = new Map<string, Profile>();
    private memberByPeer = new Map<string, Profile>();
    private leaving = new Map<string, ReturnType<typeof setTimeout>>();
    private expected = new Map<string, Profile>();
    private expectedTimer: ReturnType<typeof setTimeout> | null = null;
    private typingUntil = new Map<string, number>();
    private typingTimer: ReturnType<typeof setInterval> | null = null;
    private lastTypingSent = 0;
    private reinviteTimer: ReturnType<typeof setInterval> | null = null;
    private adoptTimer: ReturnType<typeof setTimeout> | null = null;
    private handlers = new Map<string, Set<RoomHandler>>();
    private stateHandlers = new Map<string, Set<RoomHandler>>();
    private stateListener: ((event: Event) => void) | null = null;

    private constructor(id: string, kind: RoomKind, password: string, title: string, direct: string | null, unread: number) {
        super();
        this.id = id;
        this.network = id;
        this.kind = kind;
        this.password = password;
        this.title = title;
        this.direct = direct;

        [this.messages, this.setMessages] = signal<ChatMessage[]>([]);
        [this.participants, this.setParticipants] = signal<Profile[]>([]);
        [this.typing, this.setTyping] = signal<string[]>([]);
        [this.unread, this.setUnread] = signal(unread);
        [this.status, this.setStatusSignal] = signal<RoomStatus>("connecting");
        [this.captures, this.setCaptures] = signal<Record<string, MediaStream>>({});
        [this.streams, this.setStreams] = signal<RemoteStream[]>([]);
        [this.flags, this.setFlags] = signal<Record<string, MediaFlags>>({});

        this.onMessage("chat", this.handleChat);
        this.onState("typing", this.handleTyping);
        this.onState("flags", this.handleFlags);
        this.addEventListener("client", this.handleClientMedia);
        this.transfers = new Transfers(this);
    }

    // ------------------------------------------------------------ create / join

    /** Creates a new private mesh room and enters it. Rejects when the server can't be reached. */
    static async create(kind: RoomKind, title = "", options: RoomOptions = {}): Promise<Room> {
        const profile = me();
        if (!profile) throw new Error("a room needs a profile");

        const direct = options.direct && options.direct !== profile.uid ? options.direct : null;
        const meta: Record<string, unknown> = { app: APP, kind: "room", room: kind, title: cleanTitle(title) };
        if (direct) meta.direct = [profile.uid, direct];

        const password = randomPassword();
        const draft = new Room("", kind, password, cleanTitle(title), direct, options.unread ?? 0);
        const info = await draft.connect(c => c.create({
            name: `papchat:room:${crypto.randomUUID()}`,
            private: true,
            password,
            meta,
            media: ROOM_PLAN,
        }));

        const room = draft.register(info.id);
        log("room: created", room.id, kind);
        return room;
    }

    /**
     * Joins an existing room. Rejects when it doesn't exist (any more) or is full
     * (`isRejected(error)` tells those apart). Joining a room you're already in returns that room.
     */
    static async join(id: string, password: string, kind: RoomKind, options: RoomOptions = {}): Promise<Room> {
        const existing = findRoom(id);
        if (existing) return existing;
        if (!me()) throw new Error("a room needs a profile");

        const draft = new Room("", kind, password, "", null, options.unread ?? 0);
        const info = await draft.connect(c => c.join(id, password));
        draft.readMeta(info);

        const room = draft.register(info.id);
        log("room: joined", room.id, kind);
        return room;
    }

    // ------------------------------------------------------------ public API

    /** The current client (null while rebuilding or once closed), for media (T3.1) and console checks. */
    get client(): Client | null {
        return this._client;
    }

    /** Files sent and received in this room (with transfer state), oldest first. */
    files(): FileEntry[] {
        return this.transfers.files();
    }

    /** Sends files to everyone in the room (over 100 MB toasts and is skipped). */
    sendFiles(files: File[]) {
        this.transfers.send(files);
    }

    /** Cancels a file in flight: yours for everyone, someone else's only for you. */
    cancelFile(fid: string) {
        this.transfers.cancel(fid);
    }

    /** Adds the chat entry that shows a file card in the conversation (used by transfers). */
    addFileMessage(uid: string, fid: string, at: number) {
        this.push({ id: `file:${fid}`, uid, at, variant: "file", text: "", fid });
    }

    /** Sends a chat message to everyone in the room. False when empty or not connected. */
    send(text: string): boolean {
        const profile = me();
        const clean = String(text ?? "").trim().slice(0, LIMITS.messageChars);
        const c = this._client;
        if (!clean || !profile || !c?.network) return false;

        const message: ChatMessage = { id: crypto.randomUUID(), uid: profile.uid, at: Date.now(), variant: "text", text: clean };
        try
        {
            c.broadcast("chat", { id: message.id, text: message.text, at: message.at, uid: message.uid });
        }
        catch (error)
        {
            log("room: chat broadcast failed", error);
            return false;
        }

        this.lastTypingSent = 0;
        this.push(message);
        return true;
    }

    /** Call on every keystroke: tells the others you are typing, at most once per second. */
    notifyTyping() {
        const now = Date.now();
        if (now - this.lastTypingSent < LIMITS.typingSendMs) return;
        this.lastTypingSent = now;
        this.sendState("typing");
    }

    /** True while you capture something or someone sends you a stream. */
    get incall(): boolean {
        return Object.keys(this.captures()).length > 0 || this.streams().length > 0;
    }

    /**
     * Starts your mic, camera or screen and sends it to everyone in the room. Asks the browser for
     * permission, toasts and returns false when that fails (cancelling the screen picker is silent).
     */
    async start(name: CaptureName): Promise<boolean> {
        if (this.closed || !this._client?.network) return false;
        if (this.local.has(name)) return true;
        if (this.starting.has(name)) return false;

        this.starting.add(name);
        try
        {
            const source = await capture(name);
            if (this.closed || !this._client?.network || this.local.has(name))
            {
                source.getTracks().forEach(t => t.stop());
                return this.local.has(name);
            }

            const onEnded = () => this.stop(name);
            source.getTracks()[0]?.addEventListener("ended", onEnded);
            this.local.set(name, source);
            this.localEnded.set(name, () => source.getTracks()[0]?.removeEventListener("ended", onEnded));

            await this._client.media.start(name, source.clone());
            this.captured();
            void listDevices();
            return true;
        }
        catch (error)
        {
            this.release(name);
            this.captured();
            const reason = captureError(name, error);
            if (reason) toast("warning", reason);
            log("room: start failed", name, error);
            return false;
        }
        finally
        {
            this.starting.delete(name);
        }
    }

    /** Stops your mic, camera or screen and releases the device. */
    stop(name: CaptureName | string) {
        if (!this.local.has(name)) return;
        this.release(name);
        try
        {
            this._client?.media.stop(name);
        }
        catch (error)
        {
            log("room: stop failed", name, error);
        }
        this.captured();
    }

    /** Invites someone in the lobby to this room. False when they aren't reachable in the lobby. */
    invite(uid: string, kind: InviteKind = this.kind, extra: Partial<Invite> = {}): boolean {
        const profile = me();
        if (!profile || this.closed) return false;

        const invite: Invite = {
            room: this.network,
            password: this.password,
            kind,
            title: this.title,
            from: profile.uid,
            members: [profile.uid, ...this.present.keys()],
            ...(this.direct === uid ? { direct: true } : {}),
            ...extra,
        };
        const sent = lobbySend(uid, "invite", invite);
        log("room: invite", uid, kind, sent ? "sent" : "not sent");
        return sent;
    }

    /** Resets the unread count. */
    markRead() {
        if (this.unread() === 0) return;
        this.setUnread(0);
        this.sync();
    }

    /** Leaves for good: closes the client, forgets the room (rooms signal, session, activeRoom). */
    leave() {
        if (!registry.has(this.id) || registry.get(this.id) !== this) return;
        if (!this.closed) this.end();
        this.dispose();
        registry.delete(this.id);
        setRooms(list => list.filter(r => r.id !== this.id));
        saveSession();
        if (activeRoom() === this.id) setActiveRoom(null);
        log("room: left", this.id);
        this.dispatchEvent(new CustomEvent("leave", { detail: this.id }));
    }

    /** Listens for room app messages of `type` (sent with `client.broadcast`/`send`). Returns unsubscribe. */
    onMessage<Payload = any>(type: string, handler: RoomHandler<Payload>): () => void {
        return subscribe(this.handlers, type, handler as RoomHandler);
    }

    /** Listens for `state` channel messages of `type` (unreliable, direct peers only). Returns unsubscribe. */
    onState<Payload = any>(type: string, handler: RoomHandler<Payload>): () => void {
        return subscribe(this.stateHandlers, type, handler as RoomHandler);
    }

    /** Sends ephemeral state to every linked peer over the `state` channel. Returns how many got it. */
    sendState(type: string, payload?: unknown): number {
        const c = this._client;
        if (!c?.network) return 0;
        try
        {
            return c.media.channel("state").broadcast(JSON.stringify({ type, payload }));
        }
        catch (error)
        {
            log("room: state send failed", type, error);
            return 0;
        }
    }

    /** The uid behind a room peer id. */
    uidOf(peer: string): string | null {
        return this.memberByPeer.get(peer)?.uid ?? null;
    }

    summary(): RoomSummary {
        return {
            id: this.id,
            kind: this.kind,
            title: this.title,
            participants: this.participants(),
            unread: this.unread(),
            incall: this.incall,
            live: false,
        };
    }

    /** Pushes this room's summary into the `rooms` signal. T3.1/T4.1 call it when they change what it shows. */
    sync() {
        if (!registry.has(this.id)) return;
        const summary = this.summary();
        setRooms(list => list.some(r => r.id === this.id)
            ? list.map(r => r.id === this.id ? summary : r)
            : [...list, summary]);
    }

    // ------------------------------------------------------------ internals used by invites.ts / identity.ts

    /** @internal a chat invite arrived while you're in the room: count it once. */
    bumpUnread() {
        if (activeRoom() === this.id) return;
        this.setUnread(n => n + 1);
        this.sync();
    }

    /**
     * @internal a second 1:1 with the same person is folded into this one: its messages (not its
     * file cards, their transfers stay behind) join this history in time order, unread adds up.
     */
    absorb(other: Room) {
        const known = new Set(this.messages().map(m => m.id));
        const moved = other.messages().filter(m => m.variant !== "file" && !known.has(m.id));
        if (moved.length > 0)
        {
            this.setMessages(list => {
                const next = [...moved, ...list].sort((a, b) => a.at - b.at);
                return next.length > LIMITS.messagesKept ? next.slice(next.length - LIMITS.messagesKept) : next;
            });
        }
        if (other.unread() > 0 && activeRoom() !== this.id) this.setUnread(n => n + other.unread());
        this.sync();
        log("room: absorbed", other.id, "into", this.id, moved.length, "messages");
    }

    /** @internal the network vanished and someone recreated it: follow them there. */
    async adopt(invite: Invite): Promise<boolean> {
        if (this.closed || invite.replaces !== this.network || !invite.password) return false;
        log("room: following the recreated room", this.network, "→", invite.room);
        this.clearAdoptTimer();
        try
        {
            this.password = invite.password;
            const info = await this.connect(c => c.join(invite.room, invite.password));
            this.network = info.id;
            saveSession();
            return true;
        }
        catch (error)
        {
            if (!(error instanceof Cancelled)) this.lost(isRejected(error) ? "full" : "gone");
            return false;
        }
    }

    /** @internal */
    setProfile(profile: Profile) {
        try
        {
            this._client?.setProfile(this.wire(profile));
        }
        catch (error)
        {
            log("room: setProfile failed", error);
        }
    }

    // ------------------------------------------------------------ media

    // forget one capture (stops its tracks, leaves the client alone)
    private release(name: string) {
        const source = this.local.get(name);
        if (!source) return;
        this.localEnded.get(name)?.();
        this.localEnded.delete(name);
        this.local.delete(name);
        source.getTracks().forEach(t => t.stop());
    }

    // after any change to what we capture
    private captured() {
        this.setCaptures(Object.fromEntries(this.local));
        this.sendFlags();
        this.mediaChanged();
    }

    private mediaChanged() {
        this.sync();
        updateBusy();
    }

    private ownFlags(): MediaFlags {
        return { mic: this.local.has("mic"), camera: this.local.has("camera"), screen: this.local.has("screen") };
    }

    private sendFlags() {
        this.sendState("flags", this.ownFlags());
    }

    // a new client: listen to its media and hand it our captures again
    private handleClientMedia = (event: Event) => {
        const c = (event as CustomEvent<Client>).detail;
        this.unlistenMedia();
        this.mediaClient = c;
        c.media.addEventListener("stream", this.handleStream);
        c.media.addEventListener("stream-ended", this.handleStreamEnded);
        c.media.addEventListener("channel-open", this.handleChannelOpen);

        for (const [name, source] of this.local)
        {
            c.media.start(name, source.clone()).catch(error => log("room: restart failed", name, error));
        }
        this.sendFlags();
    };

    private unlistenMedia() {
        const old = this.mediaClient;
        this.mediaClient = null;
        if (!old) return;
        old.media.removeEventListener("stream", this.handleStream);
        old.media.removeEventListener("stream-ended", this.handleStreamEnded);
        old.media.removeEventListener("channel-open", this.handleChannelOpen);
    }

    private handleStream = (event: Event) => {
        const { peer, name, stream } = (event as CustomEvent<{ peer: string; name: string; stream: MediaStream }>).detail;
        const entry: RemoteStream = { peer, uid: this.uidOf(peer) ?? "", name, stream };
        this.setStreams(list => [...list.filter(s => !(s.peer === peer && s.name === name)), entry]);
        this.mediaChanged();
    };

    private handleStreamEnded = (event: Event) => {
        const { peer, name } = (event as CustomEvent<{ peer: string; name: string }>).detail;
        this.setStreams(list => list.filter(s => !(s.peer === peer && s.name === name)));
        this.mediaChanged();
    };

    // tell a newly linked peer what we send
    private handleChannelOpen = (event: Event) => {
        if ((event as CustomEvent<{ label: string }>).detail?.label === "state") this.sendFlags();
    };

    private handleFlags = (payload: unknown, from: RoomFrom) => {
        if (!from.uid || from.uid === me()?.uid || typeof payload !== "object" || payload === null) return;
        const value = payload as Record<string, unknown>;
        const flags: MediaFlags = { mic: value.mic === true, camera: value.camera === true, screen: value.screen === true };
        const uid = from.uid;
        this.setFlags(map => ({ ...map, [uid]: flags }));
    };

    // peers get their uid once the members are known
    private resolveStreams() {
        const list = this.streams();
        if (!list.some(s => s.uid !== (this.uidOf(s.peer) ?? ""))) return;
        this.setStreams(list.map(s => ({ ...s, uid: this.uidOf(s.peer) ?? "" })));
    }

    // ------------------------------------------------------------ client lifecycle

    private register(id: string): Room {
        (this as { id: string }).id = id;
        this.network = id;
        registry.set(id, this);
        if (this.direct) setDirect(this.direct, this);
        saveSession();
        this.sync();
        return this;
    }

    // a fresh client into the network; rejects (and cleans up) when `run` fails
    private async connect(run: (c: Client) => Promise<NetworkInfo>): Promise<NetworkInfo> {
        const current = ++this.epoch;
        this.dropClient();
        this.setStatus(this.baseline ? "reconnecting" : "connecting");

        const profile = me();
        if (!profile) throw new Error("a room needs a profile");

        this.startedAt = Date.now();
        const c = new Client({
            url: signalUrl(),
            rtc: RTC,
            topology: "mesh",
            profile: this.wire(profile),
            accept: (_newcomer, info) => info.size < LIMITS.roomSize,
        });
        this._client = c;
        this.attach(c);

        try
        {
            await c.ready;
            this.alive(current);
            const info = await run(c);
            this.alive(current);

            // before anything else: messages on a channel arrive only after its first channel() call
            c.media.channel("file");
            const state = c.media.channel("state");
            this.stateListener = (event: Event) => this.handleState(event);
            state.addEventListener("message", this.stateListener);

            this.setStatus("connected");
            this.readMembers(c);
            this.dispatchEvent(new CustomEvent("client", { detail: c }));
            return info;
        }
        catch (error)
        {
            if (current === this.epoch) this.dropClient();
            if (error instanceof Cancelled || current !== this.epoch) throw new Cancelled();
            throw error;
        }
    }

    private dropClient() {
        const old = this._client;
        this._client = null;
        if (!old) return;
        this.unlistenMedia();
        this.setStreams([]);
        this.detach(old);
        if (this.stateListener)
        {
            try
            {
                old.media.channel("state").removeEventListener("message", this.stateListener);
            }
            catch { /* closing anyway */ }
            this.stateListener = null;
        }
        try
        {
            old.close();
        }
        catch (error)
        {
            log("room: close failed", error);
        }
    }

    // reconnect error: the old client can't talk to the server any more, rebuild (PLAN Notes, papit gap)
    private async rebuild() {
        if (this.closed) return;
        log("room: socket reconnected with a new id, rebuilding", this.id);
        const known = new Map([...this.present, ...this.expected]);
        this.expect(known);
        this.setStatus("reconnecting");

        for (let attempt = 0; attempt < REJOIN_ATTEMPTS; attempt++)
        {
            try
            {
                await this.connect(c => c.join(this.network, this.password));
                return;
            }
            catch (error)
            {
                if (error instanceof Cancelled) return;
                if (isRejected(error))
                {
                    this.lost("full");
                    return;
                }
                log("room: rejoin failed", attempt + 1, error);
                await delay(REJOIN_GAP_MS * (attempt + 1));
                if (this.closed) return;
            }
        }

        // the network is gone (server restart, or we were alone): the smallest uid recreates it
        const mine = me()?.uid ?? "";
        const smallest = [mine, ...known.keys()].sort()[0];
        if (smallest === mine) await this.recreate([...known.keys()]);
        else this.awaitAdopt();
    }

    private async recreate(uids: string[]) {
        const old = this.network;
        try
        {
            const meta: Record<string, unknown> = { app: APP, kind: "room", room: this.kind, title: this.title };
            const profile = me();
            if (this.direct && profile) meta.direct = [profile.uid, this.direct];

            const info = await this.connect(c => c.create({
                name: `papchat:room:${crypto.randomUUID()}`,
                private: true,
                password: this.password,
                meta,
                media: ROOM_PLAN,
            }));
            this.network = info.id;
            saveSession();
            log("room: recreated", old, "→", info.id);
            this.reinvite(uids, old);
        }
        catch (error)
        {
            if (!(error instanceof Cancelled)) this.lost("gone");
        }
    }

    // re-invite everyone who was here until they're back (the lobby may still be rebooting too)
    private reinvite(uids: string[], replaces: string) {
        this.clearReinvite();
        const lastSent = new Map<string, number>();
        const until = Date.now() + REINVITE_FOR_MS;
        const tick = () => {
            const missing = uids.filter(uid => !this.present.has(uid));
            if (this.closed || missing.length === 0 || Date.now() > until)
            {
                this.clearReinvite();
                return;
            }
            for (const uid of missing)
            {
                if (!peerOf(uid) || Date.now() - (lastSent.get(uid) ?? 0) < REINVITE_EVERY_MS * 3) continue;
                if (this.invite(uid, this.kind, { replaces })) lastSent.set(uid, Date.now());
            }
        };
        this.reinviteTimer = setInterval(tick, REINVITE_EVERY_MS);
        tick();
    }

    // someone else recreates the room: wait for their invite (invites.ts calls adopt)
    private awaitAdopt() {
        this.clearAdoptTimer();
        log("room: waiting for the recreated room", this.network);
        this.adoptTimer = setTimeout(() => this.lost("gone"), ADOPT_WAIT_MS);
    }

    // the room can't be reached any more: keep the messages, stop trying
    private lost(reason: "full" | "gone") {
        if (this.closed) return;
        this.end();
        this.system(reason === "full" ? "The room is full" : "Connection to this chat was lost", "");
        if (reason === "full") toast("warning", "The room is full");
        saveSession();
        this.sync();
    }

    // stops networking (shared by leave and lost)
    private end() {
        this.closed = true;
        this.epoch++;
        this.dropClient();
        for (const name of [...this.local.keys()]) this.release(name);
        this.setCaptures({});
        this.setFlags({});
        this.mediaChanged();
        this.clearReinvite();
        this.clearAdoptTimer();
        if (this.expectedTimer) clearTimeout(this.expectedTimer);
        this.expectedTimer = null;
        for (const timer of this.leaving.values()) clearTimeout(timer);
        this.leaving.clear();
        if (this.typingTimer) clearInterval(this.typingTimer);
        this.typingTimer = null;
        this.typingUntil.clear();
        this.setTyping([]);
        this.setStatus("closed");
        if (this.direct) unsetDirect(this.direct, this);
    }

    private dispose() {
        this.handlers.clear();
        this.stateHandlers.clear();
    }

    private clearReinvite() {
        if (this.reinviteTimer) clearInterval(this.reinviteTimer);
        this.reinviteTimer = null;
    }

    private clearAdoptTimer() {
        if (this.adoptTimer) clearTimeout(this.adoptTimer);
        this.adoptTimer = null;
    }

    private alive(current: number) {
        if (current !== this.epoch || this.closed) throw new Cancelled();
    }

    private setStatus(next: RoomStatus) {
        if (this.status() === next) return;
        this.setStatusSignal(next);
    }

    private wire(profile: Profile): Record<string, unknown> {
        return { ...profile, at: this.startedAt };
    }

    private readMeta(info: NetworkInfo) {
        const meta = info.meta ?? {};
        if (typeof meta.title === "string") this.title = cleanTitle(meta.title);

        const mine = me()?.uid;
        const direct = Array.isArray(meta.direct) ? meta.direct.filter((u): u is string => typeof u === "string") : [];
        this.direct = mine && direct.length === 2 && direct.includes(mine)
            ? direct.find(u => u !== mine) ?? null
            : null;
        if (this.direct && [...this.present.keys()].some(uid => uid !== this.direct)) this.direct = null;
    }

    // ------------------------------------------------------------ members → participants + system messages

    // remembers who was here across a rebuild: missing ones get rejoinGraceMs before they count as left
    private expect(known: Map<string, Profile>) {
        this.expected = new Map(known);
        if (this.expectedTimer) clearTimeout(this.expectedTimer);
        this.expectedTimer = setTimeout(() => {
            this.expectedTimer = null;
            const gone = [...this.expected.values()].filter(p => !this.present.has(p.uid));
            this.expected.clear();
            for (const profile of gone) this.system(`${profile.name} left`, profile.uid);
        }, LIMITS.rejoinGraceMs);
    }

    private readMembers(c: Client) {
        this.applyMembers(c, [...c.members], c.profiles as Record<string, unknown>);
    }

    private applyMembers(c: Client, peers: string[], profiles: Record<string, unknown>) {
        const mine = me()?.uid;
        const byPeer = new Map<string, Profile>();
        const newest = new Map<string, { at: number; peer: string; profile: Profile }>();

        for (const peer of peers)
        {
            if (peer === c.id) continue;
            const member = readMember(peer, profiles[peer]);
            if (!member) continue;
            byPeer.set(peer, member.profile);
            if (member.profile.uid === mine) continue;

            const current = newest.get(member.profile.uid);
            if (!current || member.at > current.at || (member.at === current.at && peer > current.peer))
            {
                newest.set(member.profile.uid, member);
            }
        }
        this.memberByPeer = byPeer;
        this.resolveStreams();

        const next = new Map([...newest.values()].map(m => [m.profile.uid, m.profile]));
        if (this.baseline)
        {
            for (const [uid, profile] of next)
            {
                if (this.present.has(uid)) continue;
                const pending = this.leaving.get(uid);
                if (pending !== undefined)
                {
                    clearTimeout(pending);
                    this.leaving.delete(uid);
                }
                else if (this.expected.has(uid))
                {
                    this.expected.delete(uid);
                }
                else
                {
                    this.system(`${profile.name} joined`, uid);
                }
            }
            for (const [uid, profile] of this.present)
            {
                if (next.has(uid) || this.leaving.has(uid) || this.expected.has(uid)) continue;
                this.leaving.set(uid, setTimeout(() => {
                    this.leaving.delete(uid);
                    if (this.closed || this.present.has(uid)) return;
                    this.system(`${profile.name} left`, uid);
                    // a call room with nobody else left is over: close it instead of leaving you alone in it
                    if ((this.kind === "call" || this.kind === "video") && this.present.size === 0 && this.leaving.size === 0) this.leave();
                }, LIMITS.leaveGraceMs));
                this.stopTyping(uid);
            }
        }
        this.baseline = true;
        this.present = next;

        // a third person turns a 1:1 into a group: openChat makes a new 1:1 after that
        if (this.direct && [...next.keys()].some(uid => uid !== this.direct))
        {
            unsetDirect(this.direct, this);
            this.direct = null;
        }

        this.setParticipants(
            [...next.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.uid < b.uid ? -1 : 1)),
        );
        this.sync();
    }

    // ------------------------------------------------------------ messages, typing

    private push(message: ChatMessage) {
        this.setMessages(list => {
            const next = [...list, message];
            return next.length > LIMITS.messagesKept ? next.slice(next.length - LIMITS.messagesKept) : next;
        });
    }

    private system(text: string, uid: string) {
        this.push({ id: crypto.randomUUID(), uid, at: Date.now(), variant: "system", text });
    }

    private handleChat = (payload: unknown, from: RoomFrom) => {
        if (typeof payload !== "object" || payload === null) return;
        const value = payload as Record<string, unknown>;
        if (typeof value.text !== "string") return;
        const text = value.text.trim().slice(0, LIMITS.messageChars);
        if (!text) return;

        // trust the sender's room profile over what the payload says
        const uid = from.uid ?? (typeof value.uid === "string" ? value.uid : "");
        if (!uid) return;
        const at = typeof value.at === "number" && Number.isFinite(value.at) ? Math.min(value.at, Date.now()) : Date.now();
        const id = typeof value.id === "string" && value.id ? value.id.slice(0, 64) : crypto.randomUUID();
        if (this.messages().some(m => m.id === id)) return;

        this.stopTyping(uid);
        this.push({ id, uid, at, variant: "text", text });
        if (uid === me()?.uid) return;
        if (activeRoom() !== this.id)
        {
            this.setUnread(n => n + 1);
            this.sync();
        }
        // the open chat in a background tab counts as unseen too
        if (activeRoom() !== this.id || document.hidden) ping();
    };

    private handleTyping = (_payload: unknown, from: RoomFrom) => {
        if (!from.uid || from.uid === me()?.uid) return;
        this.typingUntil.set(from.uid, Date.now() + LIMITS.typingMs);
        this.syncTyping();
        if (!this.typingTimer) this.typingTimer = setInterval(() => this.syncTyping(), 1_000);
    };

    private stopTyping(uid: string) {
        if (this.typingUntil.delete(uid)) this.syncTyping();
    }

    private syncTyping() {
        const now = Date.now();
        for (const [uid, until] of this.typingUntil)
        {
            if (until <= now) this.typingUntil.delete(uid);
        }
        const next = [...this.typingUntil.keys()].sort();
        const current = this.typing();
        if (next.length !== current.length || next.some((uid, i) => uid !== current[i])) this.setTyping(next);
        if (this.typingUntil.size === 0 && this.typingTimer)
        {
            clearInterval(this.typingTimer);
            this.typingTimer = null;
        }
    }

    private from(peer: string): RoomFrom {
        const profile = this.memberByPeer.get(peer) ?? null;
        return { peer, uid: profile?.uid ?? null, profile };
    }

    // ------------------------------------------------------------ client events (never throw)

    private attach(c: Client) {
        c.addEventListener("members", this.handleMembers);
        c.addEventListener("message", this.handleMessage);
        c.addEventListener("error", this.handleError);
    }

    private detach(c: Client) {
        c.removeEventListener("members", this.handleMembers);
        c.removeEventListener("message", this.handleMessage);
        c.removeEventListener("error", this.handleError);
    }

    private handleMembers = (event: Event) => {
        if (event.target !== this._client) return;
        try
        {
            const { members, profiles } = (event as CustomEvent<{ members: string[]; profiles: Record<string, unknown> }>).detail;
            this.applyMembers(this._client!, members, profiles);
        }
        catch (error)
        {
            log("room: members handler failed", error);
        }
    };

    private handleMessage = (event: Event) => {
        if (event.target !== this._client) return;
        const { type, sender, payload } = (event as CustomEvent<{ type: string; sender: string; payload: unknown }>).detail;
        dispatch(this.handlers, type, payload, this.from(sender));
    };

    private handleState(event: Event) {
        const { peer, data } = (event as CustomEvent<{ peer: string; data: unknown }>).detail;
        if (typeof data !== "string" || data.length > 16 * 1024) return;
        let message: { type?: unknown; payload?: unknown };
        try
        {
            message = JSON.parse(data);
        }
        catch
        {
            return;
        }
        if (typeof message?.type !== "string") return;
        dispatch(this.stateHandlers, message.type, message.payload, this.from(peer));
    }

    private handleError = (event: Event) => {
        if (event.target !== this._client) return;
        const detail = (event as CustomEvent<{ type: string; message: string; payload: unknown }>).detail;
        log("room: error", this.id, detail?.type, detail?.message);
        // rebuild outside the client's own event dispatch
        if (detail?.type === "reconnect") setTimeout(() => void this.rebuild(), 0);
    };
}

// ---------------------------------------------------------------- media helpers

async function capture(name: CaptureName): Promise<MediaStream> {
    const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!devices) throw new DOMException("media devices need https", "NotSupportedError");

    const { display, ...wanted } = constraints(name);
    return display ? devices.getDisplayMedia(wanted) : devices.getUserMedia(wanted);
}

// the toast text for a failed capture, "" when the user simply cancelled
function captureError(name: CaptureName, error: unknown): string {
    const what = name === "mic" ? "microphone" : name === "camera" ? "camera" : "screen";
    const kind = error instanceof DOMException ? error.name : "";

    if (name === "screen" && (kind === "NotAllowedError" || kind === "AbortError")) return "";
    if (kind === "NotAllowedError" || kind === "SecurityError") return `Allow ${what} access in your browser to use it`;
    if (kind === "NotFoundError" || kind === "OverconstrainedError") return `No ${what} found`;
    if (kind === "NotReadableError") return `The ${what} is in use by another app`;
    return `Couldn't start the ${what}`;
}

// busy while in a call (PLAN §2.2), restored afterwards; dnd and an explicit busy are left alone
let statusBeforeCall: Status | null = null;

function updateBusy() {
    const profile = me();
    if (!profile) return;

    const incall = inAnyCall();
    if (incall && statusBeforeCall === null && (profile.status === "available" || profile.status === "away"))
    {
        statusBeforeCall = profile.status;
        setStatus("busy");
    }
    else if (!incall && statusBeforeCall !== null)
    {
        const back = statusBeforeCall;
        statusBeforeCall = null;
        if (profile.status === "busy") setStatus(back);
    }
}

/** True while any room has a capture or a remote stream. */
export function inAnyCall(): boolean {
    for (const room of registry.values())
    {
        if (room.incall) return true;
    }
    return false;
}

// ---------------------------------------------------------------- registry

/** A room you're in, by its stable id (or its current network id). */
export function getRoom(id: string): Room | null {
    return findRoom(id);
}

/** Every room you're in (closed ones included until you leave them). */
export function allRooms(): Room[] {
    return [...registry.values()];
}

/** Sets `activeRoom` and marks it read. Null clears it. */
export function selectRoom(id: string | null) {
    const room = id ? findRoom(id) : null;
    setActiveRoom(room ? room.id : null);
    room?.markRead();
}

/** Leaves every room (e.g. on sign-out). */
export function leaveAllRooms() {
    for (const room of [...registry.values()]) room.leave();
}

/** True when a join failed because the room turned us away (full). */
export function isRejected(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith("rejected");
}

// 1:1 chats: uid → room, in memory (PLAN §2.5)
const directs = new Map<string, Room>();

/** The open 1:1 room with `uid`, if any. */
export function directRoom(uid: string): Room | null {
    const room = directs.get(uid);
    return room && room.status() !== "closed" ? room : null;
}

function setDirect(uid: string, room: Room) {
    directs.set(uid, room);
}

function unsetDirect(uid: string, room: Room) {
    if (directs.get(uid) === room) directs.delete(uid);
}

function findRoom(id: string): Room | null {
    const room = registry.get(id);
    if (room) return room;
    for (const r of registry.values())
    {
        if (r.network === id) return r;
    }
    return null;
}

/** @internal identity.ts pushes profile changes to every room. */
export function setRoomsProfile(profile: Profile) {
    for (const room of registry.values()) room.setProfile(profile);
}

// ---------------------------------------------------------------- session (rejoin after refresh)

/** @internal */
export function saveSession() {
    const live = [...registry.values()]
        .filter(r => r.status() !== "closed")
        .map((r): SessionRoom => ({ id: r.network, password: r.password, kind: r.kind }));
    const ids = new Set(live.map(r => r.id));
    storage.session.set({ rooms: [...live, ...[...restoring.values()].filter(r => !ids.has(r.id))] });
}

/**
 * Rejoins the rooms of `papchat:session` (this tab, before a refresh) that still exist; the others
 * are dropped from the session. Safe to call more than once.
 */
export async function restoreRooms(): Promise<Room[]> {
    const entries = storage.session.get().rooms.filter(r => !findRoom(r.id) && !restoring.has(r.id));
    for (const entry of entries) restoring.set(entry.id, entry);

    const joined: Room[] = [];
    for (const entry of entries)
    {
        try
        {
            if (entry.password === undefined) throw new Error("no password stored");
            joined.push(await Room.join(entry.id, entry.password, entry.kind));
        }
        catch (error)
        {
            log("room: could not rejoin", entry.id, error);
        }
        finally
        {
            restoring.delete(entry.id);
            saveSession();
        }
    }
    return joined;
}

// ---------------------------------------------------------------- helpers

function subscribe(map: Map<string, Set<RoomHandler>>, type: string, handler: RoomHandler): () => void {
    let set = map.get(type);
    if (!set)
    {
        set = new Set();
        map.set(type, set);
    }
    set.add(handler);
    return () => {
        set.delete(handler);
        if (set.size === 0 && map.get(type) === set) map.delete(type);
    };
}

function dispatch(map: Map<string, Set<RoomHandler>>, type: string, payload: unknown, from: RoomFrom) {
    const set = map.get(type);
    if (!set || set.size === 0)
    {
        log("room: unhandled", type, from.peer);
        return;
    }
    for (const handler of [...set])
    {
        try
        {
            handler(payload, from);
        }
        catch (error)
        {
            console.error(`[papchat] room handler for "${type}" failed`, error);
        }
    }
}

function cleanTitle(title: string): string {
    return String(title ?? "").trim().slice(0, TITLE_MAX);
}

// 16 random bytes, base64url
function randomPassword(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// a real unload: close every room client so the others see us leave at once (the session stays for the refresh)
function handlePageHide(event: PageTransitionEvent) {
    if (event.persisted) return;
    for (const room of registry.values())
    {
        try
        {
            room.client?.close();
        }
        catch { /* unloading anyway */ }
    }
}

if (typeof window !== "undefined") window.addEventListener("pagehide", handlePageHide);
