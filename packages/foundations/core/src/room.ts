import { signal } from "@papit/signals";
import { ParentBootstrap, type Network as Net } from "@papit/webrtc";

import { APP, LIMITS } from "./config";
import { denoise, releaseDenoise } from "./denoise";
import { constraints, listDevices, screenHint, type CaptureName } from "./devices";
import { canSave, conversations, directId, hasMessage, loadMessages, markSent, messageIds, messagesById, networkSaves, readMessage, saveConversation, saveMessages, setViewing, unsent, viewing } from "./history";
import { setStatus } from "./identity";
import { ping } from "./ringtone";
import { PROOF, Verifier } from "./keys";
import { appClient, on as onLobby, peersOf, profileOf, readMember, send as lobbySend, sendAll as lobbySendAll, sendTo as lobbySendTo, whenLobby, type Member } from "./lobby";
import { log, logClient } from "./log";
import { personOf, samePerson } from "./people";
import { activeRoom, me, prefs, setActiveRoom, setBuzzed, setRooms, toast } from "./state";
import { storage } from "./storage";
import { Transfers } from "./transfer";
import type { ChatMessage, Conversation, ConversationMember, FileEntry, Gif, Invite, InviteKind, Profile, RoomEntry, RoomKind, RoomStatus, RoomSummary, SessionRoom, Status } from "./types";
import { cleanGif } from "./gif";

// A room (PLAN §2.5): one private mesh network carried by the lobby. Its join and every handshake go
// through the lobby's ring, never the signal server; after that each member has a direct link to each
// other one. Chat over `broadcast`, ephemeral state (typing, mute flags) over the `state` channel, files
// over `file`. The network keeps no member list: everyone says who they are (`room.hello`) on each new
// link, and a link that closes is someone leaving.
//
// To join you need a member to come in through. An invite names a few; without one (a call link, a
// push, a refresh) the room's members in the lobby are asked where it is (`room.ask` → `room.here`).

type Info = NonNullable<Net["info"]>;
type MediaPlan = NonNullable<Info["media"]>;
type Message = { meta: { type: string; sender: string }; parse(): unknown };

// member → member: who I am; `ask` wants yours back
const HELLO = "room.hello";
// lobby: where is this room? Only members who know its password answer
const ASK = "room.ask";
const HERE = "room.here";

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

/** What a peer says it is sending, and whether they're in the call at all (broadcast on the `state` channel). */
export type MediaFlags = { mic: boolean; camera: boolean; screen: boolean; call: boolean };

export type RoomOptions = {
    // the other uid of a 1:1 chat: stored in the network meta so both ends map uid → room
    direct?: string;
    // joining: where to come in (from an invite)
    info?: RoomEntry;
    // joining: uids who may be in the room, asked in the lobby where it is
    ask?: string[];
    // start with this many unread (a chat invite counts as one)
    unread?: number;
    // a group chat that already exists: its saved conversation
    conversation?: string;
};

const TITLE_MAX = 80;

class Cancelled extends Error { }

const REJOIN_TRIES = 3;
// existing members' hellos arrive within this after joining
const SETTLE_MS = 2_500;

const registry = new Map<string, Room>();
// session entries not rejoined yet: kept in storage until restoreRooms settles them
const restoring = new Map<string, SessionRoom>();

/**
 * Fires `client` (detail: the new `Network`) once in the network, after create, join or a rejoin:
 * attach media/channel listeners there (T3.1, T4.1). Fires `leave` once.
 */
export class Room extends EventTarget {
    /** Stable local id: the first network id. Used by `rooms`, `activeRoom` and `getRoom`. */
    readonly id: string;
    readonly kind: RoomKind;
    /** The network id. The same as `id`: a carried network keeps its id. */
    network: string;
    password: string;
    title: string;
    /** The other uid for a 1:1 chat, null for a group (or once a third person joins). */
    direct: string | null;
    /** The conversation this room writes to while it's a group. Rooms carry it in `meta`. */
    group: string;
    // the network's creator asked for no saving
    private saves = true;
    // messages came from the store, so the list is no longer capped
    private paged = false;
    private olderLeft = false;
    private ackTimer: ReturnType<typeof setTimeout> | null = null;

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
    /** You're in this room's call: from joining it until you hang up, whatever you mute. */
    readonly oncall: () => boolean;

    private transfers: Transfers;

    private setCaptures: (next: Record<string, MediaStream>) => void;
    private setStreams: (next: RemoteStream[] | ((prev: RemoteStream[]) => RemoteStream[])) => void;
    private setFlags: (next: Record<string, MediaFlags> | ((prev: Record<string, MediaFlags>) => Record<string, MediaFlags>)) => void;
    private setOncall: (next: boolean) => void;
    // the captures themselves; the client gets clones, so a rebuild can hand them to the next client
    private local = new Map<string, MediaStream>();
    private localEnded = new Map<string, () => void>();
    private mediaClient: Net | null = null;
    private starting = new Set<string>();

    private _net: Net | null = null;
    // uids who may be in the room, asked where it is on a rejoin
    private asked: string[] = [];
    // existing members say hello right after we come in: until then nobody counts as joining
    private settleUntil = 0;
    // what everyone says they are, by peer; `memberByPeer` is those who proved it
    private claims = new Map<string, Member>();
    private epoch = 0;
    private closed = false;
    private startedAt = 0;
    private baseline = false;
    private verifier: Verifier | null = null;
    private present = new Map<string, Profile>();
    private memberByPeer = new Map<string, Profile>();
    private leaving = new Map<string, ReturnType<typeof setTimeout>>();
    private typingUntil = new Map<string, number>();
    private typingTimer: ReturnType<typeof setInterval> | null = null;
    private lastTypingSent = 0;
    private lastBuzzSent = 0;
    private lastBuzzFrom = new Map<string, number>();
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
        this.group = "";

        [this.messages, this.setMessages] = signal<ChatMessage[]>([]);
        [this.participants, this.setParticipants] = signal<Profile[]>([]);
        [this.typing, this.setTyping] = signal<string[]>([]);
        [this.unread, this.setUnread] = signal(unread);
        [this.status, this.setStatusSignal] = signal<RoomStatus>("connecting");
        [this.captures, this.setCaptures] = signal<Record<string, MediaStream>>({});
        [this.streams, this.setStreams] = signal<RemoteStream[]>([]);
        [this.flags, this.setFlags] = signal<Record<string, MediaFlags>>({});
        [this.oncall, this.setOncall] = signal(false);

        this.onMessage(HELLO, this.handleHello);
        this.onMessage("chat", this.handleChat);
        this.onMessage("buzz", this.handleBuzz);
        this.onMessage("ack", this.handleAck);
        this.onMessage("history.offer", this.handleOffer);
        this.onMessage("history.want", this.handleWant);
        this.onMessage("history.fill", this.handleFill);
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
        const group = options.conversation ?? crypto.randomUUID();
        const meta: Record<string, unknown> = { app: APP, kind: "room", room: kind, title: cleanTitle(title), conversation: group };
        if (direct) meta.direct = [profile.uid, direct];
        if (!networkSaves()) meta.history = false;

        const password = randomPassword();
        const draft = new Room("", kind, password, cleanTitle(title), direct, options.unread ?? 0);
        draft.group = group;
        draft.saves = networkSaves();
        const id = crypto.randomUUID();
        const info = await draft.connect(async (accept) => {
            const lobby = await whenLobby(0);
            const c = appClient();
            if (!lobby || !c) throw new Error("not in the lobby");
            return c.create({ name: "papchat:room", topology: "mesh", private: true, password, meta, media: ROOM_PLAN }, { bootstrap: new ParentBootstrap(lobby, id), accept });
        });

        const room = draft.register(info.id);
        log("room: created", room.id, kind);
        return room;
    }

    /**
     * Joins an existing room, through `options.info` or by asking `options.ask` in the lobby. Rejects
     * when it doesn't exist (any more) or is full (`isRejected(error)` tells those apart). Joining a room
     * you're already in returns that room.
     */
    static async join(id: string, password: string, kind: RoomKind, options: RoomOptions = {}): Promise<Room> {
        const existing = findRoom(id);
        if (existing) return existing;
        if (!me()) throw new Error("a room needs a profile");

        const draft = new Room("", kind, password, "", null, options.unread ?? 0);
        draft.asked = [...new Set(options.ask ?? [])];
        const info = await draft.connect(accept => enter(id, password, options.info ?? null, draft.asked, accept));
        draft.readMeta(info);

        const room = draft.register(info.id);
        log("room: joined", room.id, kind);
        return room;
    }

    // ------------------------------------------------------------ public API

    /** The room's network (null while joining, rejoining or once closed), for media and console checks. */
    get net(): Net | null {
        return this._net;
    }

    /** Where to come in: the room's info with a few members as entries. Null while not in it. */
    entry(): RoomEntry | null {
        const info = this._net?.invite();
        return info ? toEntry(info) : null;
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

    /** Sends a chat message (or a GIF) to everyone in the room. False when empty or not connected. */
    send(text: string, gif?: Gif): boolean {
        const profile = me();
        const sent = gif ? cleanGif(gif) : null;
        const clean = sent ? sent.url : String(text ?? "").trim().slice(0, LIMITS.messageChars);
        const c = this._net;
        if (!clean || !profile || !c) return false;

        const message: ChatMessage = { id: crypto.randomUUID(), uid: profile.uid, at: Date.now(), variant: sent ? "gif" : "text", text: clean, state: "sending", ...(sent ? { gif: sent } : {}) };
        try
        {
            c.broadcast("chat", wireMessage(message));
        }
        catch (error)
        {
            log("room: chat broadcast failed", error);
            return false;
        }

        this.lastTypingSent = 0;
        this.push(message);
        this.persist([message], true);
        this.awaitReceipts();
        return true;
    }

    /** The saved conversation this room writes to right now. */
    get conversationId(): string {
        const mine = me()?.uid;
        return this.direct && mine ? directId(mine, this.direct) : this.group;
    }

    /** Messages that reached this device another way (a linked device): shown, nothing more. */
    showSaved(messages: ChatMessage[]) {
        this.addSaved(messages);
    }

    /** Reads the store again after it was changed from outside. */
    async reloadHistory() {
        await this.openHistory();
    }

    /** Pages older saved messages in. False when there are none left. */
    async loadOlder(): Promise<boolean> {
        if (!this.saving || !this.olderLeft) return false;
        const first = this.messages().find(message => message.variant !== "system");
        if (!first) return false;
        const page = await loadMessages(this.conversationId, LIMITS.historyPage, first.at);
        this.olderLeft = page.length >= LIMITS.historyPage;
        this.addSaved(page);
        return this.olderLeft;
    }

    /**
     * Buzzes everyone in the room: their window shakes and a sound plays. At most once per
     * `LIMITS.buzzGapMs`: false when too soon (or not connected).
     */
    buzz(): boolean {
        const profile = me();
        const c = this._net;
        const now = Date.now();
        if (!profile || !c || now - this.lastBuzzSent < LIMITS.buzzGapMs) return false;
        try
        {
            c.broadcast("buzz", { at: now });
        }
        catch (error)
        {
            log("room: buzz failed", error);
            return false;
        }
        this.lastBuzzSent = now;
        const other = this.direct ? this.participants().find(p => p.uid === this.direct)?.name : null;
        this.system(other ? `You buzzed ${other}` : "You buzzed everyone", profile.uid);
        return true;
    }

    /** True while a buzz you sent is too recent to send another. */
    get buzzWait(): number {
        return Math.max(0, LIMITS.buzzGapMs - (Date.now() - this.lastBuzzSent));
    }

    /** Call on every keystroke: tells the others you are typing, at most once per second. */
    notifyTyping() {
        const now = Date.now();
        if (now - this.lastTypingSent < LIMITS.typingSendMs) return;
        this.lastTypingSent = now;
        this.sendState("typing");
    }

    /** True from joining the call until hanging up; muting mic and camera doesn't end it. */
    get incall(): boolean {
        return this.oncall();
    }

    /** uids of everyone else in the call (by what they say, or by a stream they send). */
    othersInCall(): string[] {
        const uids = new Set<string>();
        for (const [uid, flags] of Object.entries(this.flags()))
        {
            if (flags.call && this.present.has(uid)) uids.add(uid);
        }
        for (const s of this.streams())
        {
            if (s.uid) uids.add(s.uid);
        }
        return [...uids];
    }

    /** Joins the call without starting anything (starting a capture joins too). */
    joinCall() {
        if (this.closed || this.oncall()) return;
        this.setOncall(true);
        this.sendFlags();
        this.mediaChanged();
    }

    /** Leaves the call: stops every capture, the room (and its chat) stays. */
    hangUp() {
        for (const name of [...this.local.keys()]) this.stop(name);
        if (!this.oncall()) return;
        this.setOncall(false);
        this.sendFlags();
        this.mediaChanged();
    }

    /**
     * Starts your mic, camera or screen and sends it to everyone in the room. Asks the browser for
     * permission, toasts and returns false when that fails (cancelling the screen picker is silent).
     */
    async start(name: CaptureName): Promise<boolean> {
        if (this.closed || !this._net) return false;
        if (this.local.has(name)) return true;
        if (this.starting.has(name)) return false;

        this.starting.add(name);
        try
        {
            const source = await capture(name);
            if (this.closed || !this._net || this.local.has(name))
            {
                source.getTracks().forEach(t => t.stop());
                releaseDenoise(source);
                return this.local.has(name);
            }

            if (name === "screen") screenHint(source);
            const onEnded = () => this.stop(name);
            source.getTracks()[0]?.addEventListener("ended", onEnded);
            this.local.set(name, source);
            this.localEnded.set(name, () => source.getTracks()[0]?.removeEventListener("ended", onEnded));

            await this._net.media.start(name, source.clone());
            this.captured();
            this.joinCall();
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
            this._net?.media.stop(name);
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

        const info = this.entry();
        const invite: Invite = {
            room: this.network,
            password: this.password,
            kind,
            title: this.title,
            from: profile.uid,
            members: [profile.uid, ...this.present.keys()],
            ...(this.direct && samePerson(this.direct, uid) ? { direct: true } : {}),
            ...(info ? { info } : {}),
            ...extra,
        };
        // a chat goes to one device and the others follow; a call rings them all
        const sent = kind === "chat" ? lobbySend(uid, "invite", invite) : lobbySendAll(uid, "invite", invite);
        log("room: invite", uid, kind, sent ? "sent" : "not sent");
        return sent;
    }

    /** Sends an app message to one person in the room. False when they aren't here. */
    sendTo(uid: string, type: string, payload?: unknown): boolean {
        const c = this._net;
        if (!c) return false;
        for (const [peer, profile] of this.memberByPeer)
        {
            if (profile.uid !== uid) continue;
            try
            {
                return c.send(peer, type, payload ?? null);
            }
            catch (error)
            {
                log("room: send failed", type, error);
                return false;
            }
        }
        return false;
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
        const c = this._net;
        if (!c) return 0;
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

    /** @internal uids of everyone else here, or last asked: what a refresh asks where the room is. */
    memberUids(): string[] {
        return [...new Set([...this.present.keys(), ...this.asked])].slice(0, 16);
    }

    /** The uid behind a room peer id. */
    uidOf(peer: string): string | null {
        return this.memberByPeer.get(peer)?.uid ?? null;
    }

    summary(): RoomSummary {
        const here = this.participants();
        return {
            id: this.id,
            kind: this.kind,
            title: this.title,
            // nobody here yet: who this chat is with, as last seen
            participants: here.length > 0 ? here : this.lastSeen(),
            unread: this.unread(),
            incall: this.incall,
            live: false,
            conversation: this.conversationId,
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
                return !this.paged && next.length > LIMITS.messagesKept ? next.slice(next.length - LIMITS.messagesKept) : next;
            });
        }
        if (other.unread() > 0 && activeRoom() !== this.id) this.setUnread(n => n + other.unread());
        this.sync();
        log("room: absorbed", other.id, "into", this.id, moved.length, "messages");
    }

    /** @internal tells everyone in the room about the change */
    setProfile(profile: Profile) {
        const c = this._net;
        if (!c) return;
        for (const peer of c.linked) this.hello(c, peer, false, profile);
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
        releaseDenoise(source);
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
        return { mic: this.local.has("mic"), camera: this.local.has("camera"), screen: this.local.has("screen"), call: this.oncall() };
    }

    private sendFlags() {
        this.sendState("flags", this.ownFlags());
    }

    // a new network: listen to its media and hand it our captures again
    private handleClientMedia = (event: Event) => {
        const c = (event as CustomEvent<Net>).detail;
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
        const mic = value.mic === true, camera = value.camera === true, screen = value.screen === true;
        // older peers don't send `call`: sending anything means in the call
        const call = typeof value.call === "boolean" ? value.call : mic || camera || screen;
        const uid = from.uid;
        const was = this.flags()[uid]?.call ?? false;
        this.setFlags(map => ({ ...map, [uid]: { mic, camera, screen, call } }));
        if (was && !call) this.endIfAlone();
    };

    // a 1:1 call is over once the other person is out of it (hung up or left)
    private endIfAlone() {
        if (!this.direct || !this.oncall() || this.othersInCall().length > 0) return;
        log("room: the other side hung up", this.id);
        this.hangUp();
    }

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
        void this.openHistory();
        // the chat on screen just got a room
        if (viewing()?.conversation.id === this.conversationId) selectRoom(id);
        return this;
    }

    // into the network (create, join or rejoin); rejects (and cleans up) when `run` fails
    private async connect(run: (accept: () => boolean) => Promise<Net>): Promise<Info> {
        const current = ++this.epoch;
        this.dropClient();
        this.setStatus(this.baseline ? "reconnecting" : "connecting");

        const profile = me();
        if (!profile) throw new Error("a room needs a profile");
        this.startedAt = Date.now();

        try
        {
            // the entry decides: a full room turns newcomers away
            const c = await run(() => this._net !== null && this._net.linked.size + 1 < LIMITS.roomSize);
            if (current !== this.epoch || this.closed)
            {
                c.leave();
                throw new Cancelled();
            }
            this.use(c);
            return c.info!;
        }
        catch (error)
        {
            if (current === this.epoch) this.dropClient();
            if (error instanceof Cancelled || current !== this.epoch) throw new Cancelled();
            throw error;
        }
    }

    private use(c: Net) {
        this._net = c;
        this.verifier = new Verifier({
            me: () => c.me,
            ready: () => c.linked.size > 0,
            send: (peer, payload) => { c.send(peer, PROOF, payload); },
            changed: () => { if (c === this._net) this.applyMembers(); },
        });
        this.attach(c);

        // before anything else: messages on a channel arrive only after its first channel() call
        c.media.channel("file");
        const state = c.media.channel("state");
        this.stateListener = (event: Event) => this.handleState(event);
        state.addEventListener("message", this.stateListener);

        this.setStatus("connected");
        if (!this.baseline)
        {
            this.settleUntil = Date.now() + SETTLE_MS;
            setTimeout(() => { if (this._net === c) this.applyMembers(); }, SETTLE_MS + 50);
        }
        // whoever is here already sent their hello before we were listening: ask again
        for (const peer of c.linked) this.hello(c, peer, true);
        this.applyMembers();
        this.dispatchEvent(new CustomEvent("client", { detail: c }));
    }

    private dropClient() {
        const old = this._net;
        this._net = null;
        this.verifier?.stop();
        this.verifier = null;
        this.claims.clear();
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
            if (!old.closed) old.leave();
        }
        catch (error)
        {
            log("room: leave failed", error);
        }
    }

    // the network closed under us (the lobby carrying it went away): come back in through whoever is left
    private async rejoin() {
        if (this.closed) return;
        const uids = [...new Set([...this.present.keys(), ...this.asked])];
        log("room: lost, rejoining", this.id, uids.length);
        for (let attempt = 0; attempt < REJOIN_TRIES && !this.closed; attempt++)
        {
            try
            {
                await this.connect(accept => enter(this.id, this.password, null, uids, accept));
                log("room: back in", this.id);
                return;
            }
            catch (error)
            {
                if (error instanceof Cancelled) return;
                log("room: rejoin failed", this.id, error);
            }
        }
        // nobody to come back to: a chat lives on in the history, a call is over
        if (!this.closed) this.leave();
    }

    // stops networking
    private end() {
        this.closed = true;
        this.epoch++;
        this.dropClient();
        for (const name of [...this.local.keys()]) this.release(name);
        this.setCaptures({});
        this.setFlags({});
        this.setOncall(false);
        this.mediaChanged();
        for (const timer of this.leaving.values()) clearTimeout(timer);
        this.leaving.clear();
        if (this.typingTimer) clearInterval(this.typingTimer);
        this.typingTimer = null;
        if (this.ackTimer) clearTimeout(this.ackTimer);
        this.ackTimer = null;
        this.typingUntil.clear();
        this.setTyping([]);
        this.setStatus("closed");
        if (this.direct) unsetDirect(this.direct, this);
    }

    private dispose() {
        this.handlers.clear();
        this.stateHandlers.clear();
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

    private readMeta(info: Info) {
        const meta = info.meta ?? {};
        if (typeof meta.title === "string") this.title = cleanTitle(meta.title);
        this.group = typeof meta.conversation === "string" && meta.conversation ? meta.conversation : info.id;
        this.saves = meta.history !== false;

        // by person: a chat started with your other device is still yours
        const mine = me()?.uid;
        const direct = Array.isArray(meta.direct) ? meta.direct.filter((u): u is string => typeof u === "string") : [];
        this.direct = mine && direct.length === 2 && direct.some(u => samePerson(u, mine))
            ? direct.find(u => !samePerson(u, mine)) ?? null
            : null;
        if (this.direct && [...this.present.keys()].some(uid => !samePerson(uid, this.direct!))) this.direct = null;
    }

    // ------------------------------------------------------------ members → participants + system messages

    private hello(c: Net, peer: string, ask: boolean, profile = me()) {
        if (!profile) return;
        try
        {
            c.send(peer, HELLO, { profile: this.wire(profile), ...(ask ? { ask: true } : {}) });
        }
        catch (error)
        {
            log("room: hello failed", error);
        }
    }

    // a hello goes by peer id: it is the claim the verifier then checks
    private handleHello = (payload: { profile?: unknown; ask?: unknown }, from: RoomFrom) => {
        const c = this._net;
        if (!c) return;
        const member = readMember(from.peer, payload?.profile);
        if (!member) return;
        const before = this.claims.get(from.peer);
        this.claims.set(from.peer, member);
        if (payload.ask === true) this.hello(c, from.peer, false);
        if (!before || before.profile.uid !== member.profile.uid || before.profile.key !== member.profile.key) this.verifier?.sync([...this.claims]);
        this.applyMembers();
    };

    private applyMembers() {
        const mine = me()?.uid;
        const byPeer = new Map<string, Profile>();
        const newest = new Map<string, { at: number; peer: string; profile: Profile }>();
        const claims = this.claims;

        for (const [peer, member] of claims)
        {
            // only members who proved their uid count
            if (!this.verifier?.verified(peer)) continue;
            byPeer.set(peer, member.profile);
            // your other devices are you, and someone's two devices are one person
            if (mine && samePerson(member.profile.uid, mine)) continue;

            const person = personOf(member.profile.uid);
            const current = newest.get(person);
            if (!current || member.at > current.at || (member.at === current.at && peer > current.peer))
            {
                newest.set(person, member);
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
                else
                {
                    this.system(`${profile.name} joined`, uid);
                    if (this.oncall()) toast("info", `${profile.name} joined`);
                }
            }
            for (const [uid, profile] of this.present)
            {
                if (next.has(uid) || this.leaving.has(uid)) continue;
                this.leaving.set(uid, setTimeout(() => {
                    this.leaving.delete(uid);
                    if (this.closed || this.present.has(uid)) return;
                    this.system(`${profile.name} left`, uid);
                    if (this.flags()[uid])
                    {
                        this.setFlags(({ [uid]: _gone, ...rest }) => rest);
                        this.endIfAlone();
                    }
                    // a call room with nobody else left is over: close it instead of leaving you alone in it
                    if ((this.kind === "call" || this.kind === "video") && this.present.size === 0 && this.leaving.size === 0) this.leave();
                }, LIMITS.leaveGraceMs));
                this.stopTyping(uid);
            }
        }
        // nobody who was already here counts as joining, however long their hello or proof takes
        if (!this.verifier?.pending && Date.now() >= this.settleUntil) this.baseline = true;
        const arrived = [...next.keys()].filter(uid => !this.present.has(uid));
        const changed = arrived.length > 0 || [...this.present.keys()].some(uid => !next.has(uid));
        this.present = next;
        // a refresh finds the room again through these people
        if (changed) saveSession();

        // a third person turns a 1:1 into a group: openChat makes a new 1:1 after that, and what
        // the group says from here on is kept apart from the 1:1
        if (this.direct && [...next.keys()].some(uid => !samePerson(uid, this.direct!)))
        {
            unsetDirect(this.direct, this);
            this.direct = null;
            if (this.saving) void saveConversation(this.record());
        }
        if (arrived.length > 0) setTimeout(() => this.welcome(arrived), 0);

        this.setParticipants(
            [...next.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.uid < b.uid ? -1 : 1)),
        );
        this.sync();
    }

    // ------------------------------------------------------------ messages, typing

    // in time order: a message sent again, or filled in, can be older than what's on screen
    private push(message: ChatMessage) {
        this.setMessages(list => {
            const index = list.findLastIndex(other => other.at <= message.at) + 1;
            const next = [...list.slice(0, index), message, ...list.slice(index)];
            return !this.paged && next.length > LIMITS.messagesKept ? next.slice(next.length - LIMITS.messagesKept) : next;
        });
    }

    private get saving(): boolean {
        return this.saves && canSave();
    }

    private persist(messages: ChatMessage[], replace = false) {
        if (this.saving) void saveMessages(this.record(), messages, { replace });
    }

    // what the store should know about this chat
    private record(): Conversation {
        const people = this.participants().map(toMember);
        const other = this.direct ? profileOf(this.direct) : null;
        if (other && !people.some(p => samePerson(p.uid, other.uid))) people.push(toMember(other));
        return {
            id: this.conversationId,
            direct: this.direct ? personOf(this.direct) : null,
            title: this.title,
            members: people,
            at: Date.now(),
        };
    }

    private lastSeen(): Profile[] {
        const members = conversations().find(entry => entry.id === this.conversationId)?.members ?? [];
        return members.map(member => ({ v: 2, uid: member.uid, key: "", name: member.name, color: member.color, status: "available" }));
    }

    // the chat so far, and what we still have to send
    private async openHistory() {
        if (!this.saving) return;
        const id = this.conversationId;
        const [recent, waiting] = await Promise.all([loadMessages(id), unsent(id)]);
        if (this.closed) return;
        this.paged = true;
        this.olderLeft = recent.length >= LIMITS.historyPage;
        this.addSaved([...recent, ...waiting]);
        this.sync();
        this.flush();
    }

    // messages from the store or another member: only the ones not on screen yet
    private addSaved(list: ChatMessage[]) {
        const known = new Set(this.messages().map(message => message.id));
        const fresh = list.filter(message => {
            if (known.has(message.id)) return false;
            known.add(message.id);
            return true;
        });
        if (fresh.length === 0) return;
        this.paged = true;
        this.setMessages(current => [...current, ...fresh].sort((a, b) => a.at - b.at));
    }

    // someone new is here: they get what's waiting, and both sides compare notes
    private welcome(uids: string[]) {
        if (this.closed) return;
        this.flush();
        for (const uid of uids) void this.offer(uid);
    }

    // sends everything of ours nobody has confirmed, in order
    private flush() {
        const c = this._net;
        const mine = me()?.uid;
        if (!c || !mine || this.present.size === 0) return;

        const unconfirmed = this.messages().filter(message => message.uid === mine && (message.state === "sending" || message.state === "failed"));
        if (unconfirmed.length === 0) return;
        try
        {
            for (const message of unconfirmed) c.broadcast("chat", wireMessage(message));
        }
        catch (error)
        {
            log("room: sending again failed", error);
            return;
        }
        this.setMessages(list => list.map(message => message.state === "failed" ? { ...message, state: "sending" as const } : message));
        this.awaitReceipts();
    }

    private awaitReceipts() {
        if (this.ackTimer) clearTimeout(this.ackTimer);
        this.ackTimer = setTimeout(() => {
            this.ackTimer = null;
            const late = this.messages().filter(message => message.state === "sending");
            if (late.length === 0) return;
            const failed = late.map(message => ({ ...message, state: "failed" as const }));
            const byId = new Map(failed.map(message => [message.id, message]));
            this.setMessages(list => list.map(message => byId.get(message.id) ?? message));
            this.persist(failed, true);
        }, LIMITS.ackMs);
    }

    private handleAck: RoomHandler<{ ids?: unknown }> = (payload) => {
        const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id): id is string => typeof id === "string") : [];
        if (ids.length === 0) return;
        const confirmed = new Set(ids);
        this.setMessages(list => list.map(message => confirmed.has(message.id) && message.state && message.state !== "sent" ? { ...message, state: "sent" as const } : message));
        void markSent(this.conversationId, ids);
    };

    // a group's past only goes to someone it's already saved with, so an invite doesn't hand over the backlog
    private async offer(uid: string) {
        if (!this.saving) return;
        const id = this.conversationId;
        const known = conversations().find(entry => entry.id === id);
        if (!this.direct && !known?.members.some(member => samePerson(member.uid, uid))) return;
        const ids = await messageIds(id, Date.now() - LIMITS.historyFillMs, LIMITS.historyOffer);
        if (ids.length > 0) this.sendTo(uid, "history.offer", { conversation: id, ids });
    }

    private handleOffer: RoomHandler<{ conversation?: unknown; ids?: unknown }> = async (payload, from) => {
        const id = this.conversationId;
        if (!this.saving || !from.uid || payload?.conversation !== id || !Array.isArray(payload.ids)) return;
        const known = new Set(await messageIds(id, Date.now() - LIMITS.historyFillMs));
        const missing = payload.ids.filter((other): other is string => typeof other === "string" && !known.has(other)).slice(0, LIMITS.historyOffer);
        if (missing.length > 0) this.sendTo(from.uid, "history.want", { conversation: id, ids: missing });
    };

    private handleWant: RoomHandler<{ conversation?: unknown; ids?: unknown }> = async (payload, from) => {
        const id = this.conversationId;
        if (!this.saving || !from.uid || payload?.conversation !== id || !Array.isArray(payload.ids)) return;
        const ids = payload.ids.filter((other): other is string => typeof other === "string").slice(0, LIMITS.historyOffer);
        for (const messages of chunks(await messagesById(id, ids)))
        {
            this.sendTo(from.uid, "history.fill", { conversation: id, messages });
        }
    };

    private handleFill: RoomHandler<{ conversation?: unknown; messages?: unknown }> = (payload, from) => {
        const id = this.conversationId;
        const mine = me()?.uid;
        if (!this.saving || !from.uid || !mine || payload?.conversation !== id || !Array.isArray(payload.messages)) return;

        // the original author and time stay, but only someone from this conversation can be the author
        const saved = conversations().find(entry => entry.id === id)?.members ?? [];
        const allowed = [mine, from.uid, ...this.present.keys(), ...saved.map(member => member.uid)];
        const fresh = payload.messages
            .map(readMessage)
            .filter((message): message is ChatMessage => !!message && allowed.some(uid => samePerson(uid, message.uid)));
        if (fresh.length === 0) return;

        const known = new Set(this.messages().map(message => message.id));
        const added = fresh.filter(message => !known.has(message.id));
        this.addSaved(fresh);
        this.persist(fresh);
        const news = added.filter(message => !samePerson(message.uid, mine)).length;
        if (news > 0 && activeRoom() !== this.id)
        {
            this.setUnread(n => n + news);
            this.sync();
        }
    };

    private receipt(peer: string, id: string) {
        try
        {
            this._net?.send(peer, "ack", { ids: [id] });
        }
        catch (error)
        {
            log("room: receipt failed", error);
        }
    }

    private system(text: string, uid: string) {
        this.push({ id: crypto.randomUUID(), uid, at: Date.now(), variant: "system", text });
    }

    private handleChat = async (payload: unknown, from: RoomFrom) => {
        if (typeof payload !== "object" || payload === null) return;
        const value = payload as Record<string, unknown>;
        if (typeof value.text !== "string") return;
        const text = value.text.trim().slice(0, LIMITS.messageChars);
        if (!text) return;

        // trust the sender's room profile over what the payload says; your other device is you
        const sender = from.uid ?? (typeof value.uid === "string" ? value.uid : "");
        if (!sender) return;
        const mine = me()?.uid;
        const uid = mine && samePerson(sender, mine) ? mine : sender;
        const at = typeof value.at === "number" && Number.isFinite(value.at) ? Math.min(value.at, Date.now()) : Date.now();
        const id = typeof value.id === "string" && value.id ? value.id.slice(0, 64) : crypto.randomUUID();

        // confirmed either way: a message sent twice means they never heard the first receipt
        this.receipt(from.peer, id);
        if (this.messages().some(m => m.id === id)) return;
        if (this.saving && await hasMessage(this.conversationId, id)) return;
        if (this.messages().some(m => m.id === id)) return;

        this.stopTyping(uid);
        const gif = cleanGif(value.gif);
        const message: ChatMessage = gif ? { id, uid, at, variant: "gif", text, gif } : { id, uid, at, variant: "text", text };
        this.push(message);
        this.persist([message]);
        if (uid === mine) return;
        if (activeRoom() !== this.id)
        {
            this.setUnread(n => n + 1);
            this.sync();
        }
        // the open chat in a background tab counts as unseen too
        if (activeRoom() !== this.id || document.hidden) ping();
    };

    // someone buzzed: once per gap per sender, whatever they send
    private handleBuzz = (_payload: unknown, from: RoomFrom) => {
        const uid = from.uid;
        if (!uid || uid === me()?.uid) return;
        const now = Date.now();
        if (now - (this.lastBuzzFrom.get(uid) ?? 0) < LIMITS.buzzGapMs) return;
        this.lastBuzzFrom.set(uid, now);

        const name = from.profile?.name ?? "Someone";
        this.system(`${name} buzzed you`, uid);
        if (activeRoom() !== this.id)
        {
            this.setUnread(n => n + 1);
            this.sync();
        }
        setBuzzed({ room: this.id, uid, name, at: now });
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

    private attach(c: Net) {
        logClient(c, "room");
        c.addEventListener("message", this.handleMessage);
        c.addEventListener("link", this.handleLink);
        c.addEventListener("close", this.handleClose);
        c.addEventListener("error", this.handleError);
    }

    private detach(c: Net) {
        c.removeEventListener("message", this.handleMessage);
        c.removeEventListener("link", this.handleLink);
        c.removeEventListener("close", this.handleClose);
        c.removeEventListener("error", this.handleError);
    }

    // a mesh: everyone is linked to everyone, so a link is a member
    private handleLink = (event: Event) => {
        const c = this._net;
        if (!c || event.target !== c) return;
        const { peer, open } = (event as CustomEvent<{ peer: string; open: boolean }>).detail;
        if (open)
        {
            this.verifier?.poke();
            this.hello(c, peer, !this.claims.has(peer));
            return;
        }
        if (!this.claims.delete(peer)) return;
        this.verifier?.sync([...this.claims]);
        this.applyMembers();
    };

    private handleClose = (event: Event) => {
        if (event.target !== this._net || this.closed) return;
        this.dropClient();
        this.setStatus("reconnecting");
        void this.rejoin();
    };

    private handleMessage = (event: Event) => {
        if (event.target !== this._net) return;
        const message = (event as CustomEvent<Message>).detail;
        const { type, sender } = message.meta;
        let payload: unknown;
        try
        {
            payload = message.parse();
        }
        catch
        {
            return;
        }
        if (type === PROOF)
        {
            this.verifier?.receive(sender, payload);
            return;
        }
        // the claim the proof is about can't wait for the proof
        if (type === HELLO)
        {
            dispatch(this.handlers, type, payload, this.from(sender));
            return;
        }
        this.whenProven(sender, () => dispatch(this.handlers, type, payload, this.from(sender)));
    };

    // nothing from someone who hasn't proven who they are yet; they get the rest after
    private whenProven(peer: string, run: () => void) {
        if (this.verifier?.verified(peer)) run();
        else this.verifier?.hold(peer, run);
    }

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
        this.whenProven(peer, () => dispatch(this.stateHandlers, message.type as string, message.payload, this.from(peer)));
    }

    private handleError = (event: Event) => {
        if (event.target !== this._net) return;
        const detail = (event as CustomEvent<{ type: string; message: string; payload: unknown }>).detail;
        log("room: error", this.id, detail?.type, detail?.message);
    };
}

// ---------------------------------------------------------------- media helpers

async function capture(name: CaptureName): Promise<MediaStream> {
    const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!devices) throw new DOMException("media devices need https", "NotSupportedError");

    const { display, ...wanted } = constraints(name);
    if (display) return devices.getDisplayMedia(wanted);
    const stream = await devices.getUserMedia(wanted);
    return name === "mic" ? denoise(stream, prefs().noiseReduction) : stream;
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

/** True while you're in any room's call. */
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

/** Sets `activeRoom` and marks it read. Null clears it. Either way a saved chat on screen makes way. */
export function selectRoom(id: string | null) {
    const room = id ? findRoom(id) : null;
    setViewing(null);
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

// 1:1 chats: person → room, in memory (PLAN §2.5)
const directs = new Map<string, Room>();

/** The open 1:1 room with `uid`, or any device of theirs. */
export function directRoom(uid: string): Room | null {
    const room = directs.get(personOf(uid));
    return room && room.status() !== "closed" ? room : null;
}

function setDirect(uid: string, room: Room) {
    directs.set(personOf(uid), room);
}

function unsetDirect(uid: string, room: Room) {
    if (directs.get(personOf(uid)) === room) directs.delete(personOf(uid));
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

/** @internal the person map changed: 1:1 rooms are keyed by person. */
export function rekeyDirects() {
    directs.clear();
    for (const room of registry.values())
    {
        if (room.direct && room.status() !== "closed") setDirect(room.direct, room);
        room.sync();
    }
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
        .map((r): SessionRoom => ({ id: r.network, password: r.password, kind: r.kind, members: r.memberUids() }));
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
            if (!entry.members?.length) throw new Error("nobody to ask where it is");
            joined.push(await Room.join(entry.id, entry.password, entry.kind, { ask: entry.members }));
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

// ---------------------------------------------------------------- finding a room through the lobby

// room id → who's waiting for a `room.here`, and which peers it asked
const asking = new Map<string, { peers: Set<string>; found: (info: RoomEntry | null) => void }>();

/** Joins room `id` through `info`, or through what its members in the lobby say. */
async function enter(id: string, password: string, info: RoomEntry | null, uids: string[], accept: () => boolean): Promise<Net> {
    const lobby = await whenLobby(LIMITS.askWaitMs);
    const c = appClient();
    if (!lobby || !c) throw new Error("not in the lobby");

    let entry = info?.id === id && info.entries.length > 0 ? info : null;
    let failure: unknown = null;
    // an invite's entries can be gone (they reloaded): then the members are asked
    for (let round = 0; round < 2; round++)
    {
        if (!entry && uids.length > 0) entry = await locate(id, password, uids);
        if (!entry) break;
        try
        {
            return await c.join(entry as Info, { password }, { bootstrap: new ParentBootstrap(lobby, id), accept });
        }
        catch (error)
        {
            if (isRejected(error)) throw error;
            log("room: couldn't come in through", entry.entries, error);
            failure = error;
            entry = null;
        }
    }
    throw failure ?? new Error("gone");
}

// asks every device of each uid; the first member that knows the room and its password answers
function locate(id: string, password: string, uids: string[]): Promise<RoomEntry> {
    // a newer look for the same room replaces this one
    asking.get(id)?.found(null);
    return new Promise((resolve, reject) => {
        const peers = new Set<string>();
        const started = Date.now();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (info: RoomEntry | null) => {
            clearTimeout(timer);
            if (asking.get(id) === waiting) asking.delete(id);
            if (info) resolve(info);
            else reject(new Error("gone"));
        };
        const waiting = { peers, found: finish };
        asking.set(id, waiting);

        // someone just reloaded (their peer is new), or isn't in the lobby yet: keep looking for a while
        const round = () => {
            for (const uid of uids)
            {
                for (const peer of peersOf(uid))
                {
                    if (peers.has(peer)) continue;
                    if (lobbySendTo(peer, ASK, { room: id, password })) peers.add(peer);
                }
            }
            const waited = Date.now() - started;
            if (waited > LIMITS.askWaitMs + LIMITS.askMs || (peers.size > 0 && waited > LIMITS.askMs && !uids.some(uid => peersOf(uid).some(peer => !peers.has(peer)))))
            {
                finish(null);
                return;
            }
            timer = setTimeout(round, ASK_ROUND_MS);
        };
        round();
    });
}

const ASK_ROUND_MS = 1_000;

onLobby<{ room?: unknown; password?: unknown }>(ASK, (payload, from) => {
    if (!isId(payload?.room) || typeof payload.password !== "string") return;
    const room = findRoom(payload.room);
    if (!room || room.password !== payload.password) return;
    const info = room.entry();
    if (info) lobbySendTo(from.peer, HERE, { room: payload.room, info });
}, { anyone: true });

onLobby<{ room?: unknown; info?: unknown }>(HERE, (payload, from) => {
    if (!isId(payload?.room)) return;
    const waiting = asking.get(payload.room);
    // only the peers we asked: anyone else could send us into a room of their own
    if (!waiting?.peers.has(from.peer)) return;
    const info = readEntry(payload.info, payload.room);
    if (info) waiting.found(info);
}, { anyone: true });

/** Reads a room's info from the wire; null when it isn't one for room `id`. */
export function readEntry(raw: unknown, id: string): RoomEntry | null {
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as Record<string, unknown>;
    if (value.id !== id || typeof value.name !== "string" || typeof value.private !== "boolean" || typeof value.size !== "number") return null;
    const topology = value.topology;
    const named = typeof topology === "object" && topology !== null && typeof (topology as Record<string, unknown>).name === "string";
    if (typeof topology !== "string" && !named) return null;
    if (!Array.isArray(value.entries)) return null;
    const entries = value.entries.filter(isId).slice(0, 8);
    if (entries.length === 0) return null;
    return {
        id,
        name: value.name.slice(0, 200),
        topology: topology as RoomEntry["topology"],
        private: value.private,
        size: value.size,
        entries,
        ...(typeof value.meta === "object" && value.meta !== null ? { meta: value.meta as Record<string, unknown> } : {}),
    };
}

/** The part of a network's invite that goes in an invite, an announce or a `room.here`. */
export function toEntry(info: Info): RoomEntry {
    return {
        id: info.id,
        name: info.name,
        topology: info.topology,
        private: info.private,
        size: info.size,
        entries: info.entries ?? [],
        ...(info.meta ? { meta: info.meta } : {}),
    };
}

function isId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 200;
}

// ---------------------------------------------------------------- helpers

// the same id and time every time it's sent, so a repeat is recognised
function wireMessage(message: ChatMessage): Record<string, unknown> {
    return { id: message.id, text: message.text, at: message.at, uid: message.uid, ...(message.gif ? { gif: message.gif } : {}) };
}

function toMember(profile: Profile): ConversationMember {
    return { uid: profile.uid, name: profile.name, color: profile.color };
}

// history in pieces small enough for one message, without what only this device knows
function chunks(messages: ChatMessage[]): ChatMessage[][] {
    const pieces: ChatMessage[][] = [];
    let piece: ChatMessage[] = [];
    let size = 0;
    for (const { state: _state, ...message } of messages)
    {
        const length = JSON.stringify(message).length;
        if (piece.length > 0 && size + length > LIMITS.historyChunk)
        {
            pieces.push(piece);
            piece = [];
            size = 0;
        }
        piece.push(message);
        size += length;
    }
    if (piece.length > 0) pieces.push(piece);
    return pieces;
}

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

// a real unload: leave every room so the others see us go at once (the session stays for the refresh)
function handlePageHide(event: PageTransitionEvent) {
    if (event.persisted) return;
    for (const room of registry.values())
    {
        try
        {
            room.net?.leave();
        }
        catch { /* unloading anyway */ }
    }
}

if (typeof window !== "undefined") window.addEventListener("pagehide", handlePageHide);
