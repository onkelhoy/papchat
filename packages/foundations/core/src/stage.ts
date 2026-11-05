import { effect, signal } from "@papit/signals";
import { ParentBootstrap, type Network as Net } from "@papit/webrtc";

import { APP, LIMITS } from "./config";
import { denoise, releaseDenoise } from "./denoise";
import { constraints, listDevices, screenHint, type CaptureName } from "./devices";
import { appClient, broadcast as lobbyBroadcast, lobbyNetwork, on, peerOf, profileOf, send as lobbySend, uidOf } from "./lobby";
import { log, logClient } from "./log";
import { lobbyStatus, me, members, prefs, setStages, stages, toast } from "./state";
import { readEntry, toEntry } from "./room";
import type { ChatMessage, Gif, Invite, Profile, RoomEntry, StageSummary } from "./types";
import { cleanGif } from "./gif";

// Stages (PLAN §2.7): one presenter broadcasting to many viewers over a multicast tree rooted at
// the presenter, carried by the lobby (no server involved). Only the presenter captures; everyone
// chats with `broadcast`. The lobby carries `stage.announce` / `stage.end` / `stage.query` so everyone
// has the `stages` list, and each announce says where to come in. The tree keeps no member list:
// viewers tell the presenter they're watching (`stage.here`), which is the viewer count.

type MediaPlan = NonNullable<NonNullable<Net["info"]>["media"]>;
type Message = { meta: { type: string; sender: string }; parse(): unknown };

const HERE = "stage.here";
const REFRESH_MS = 2_000;
const BYE = "stage.bye";

const STAGE_PLAN: MediaPlan = {
    streams: {
        mic: { kind: "audio" },
        camera: { kind: "video" },
        screen: { kind: "video" },
    },
};

// viewer counts go out with a re-announce, at most this often
const ANNOUNCE_GAP_MS = 5_000;
// how long a new lobby member gets to open links before a presenter tells them about the stage
const TELL_DELAY_MS = 3_000;

/** Children per node in the multicast tree. Lower it in the console to test relaying: `papchat.setStageFanout(1)`. */
let fanout = 3;
export function setStageFanout(next: number) {
    fanout = Math.max(1, Math.floor(next));
}

/** The stage you present or watch, null when none. */
export const [currentStage, setCurrentStage] = signal<Stage | null>(null);

export class Stage {
    readonly id: string;
    readonly title: string;
    readonly presenter: Profile;
    readonly mine: boolean;

    /** Chat, oldest first. */
    readonly messages: () => ChatMessage[];
    /** Your captures by name (presenter only). */
    readonly captures: () => Record<string, MediaStream>;
    /** The presenter's streams by name (`mic`, `camera`, `screen`), as they reach you. */
    readonly streams: () => Record<string, MediaStream>;
    /** People watching (everyone in the network but the presenter). */
    readonly viewers: () => number;

    private setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    private setCaptures: (next: Record<string, MediaStream>) => void;
    private setStreams: (next: Record<string, MediaStream> | ((prev: Record<string, MediaStream>) => Record<string, MediaStream>)) => void;
    private setViewers: (next: number) => void;

    private local = new Map<string, MediaStream>();
    private ended = false;
    private lastAnnounce = 0;
    private announceTimer: ReturnType<typeof setTimeout> | undefined;
    // presenter: viewer peer → when they last said they're watching
    private watchers = new Map<string, number>();
    private hereTimer: ReturnType<typeof setInterval> | undefined;
    private refreshTimer: ReturnType<typeof setInterval> | undefined;

    private constructor(private client: Net, id: string, title: string, presenter: Profile, mine: boolean, private presenterPeer: string) {
        this.id = id;
        this.title = title;
        this.presenter = presenter;
        this.mine = mine;

        [this.messages, this.setMessages] = signal<ChatMessage[]>([]);
        [this.captures, this.setCaptures] = signal<Record<string, MediaStream>>({});
        [this.streams, this.setStreams] = signal<Record<string, MediaStream>>({});
        [this.viewers, this.setViewers] = signal(0);

        logClient(client, "stage");
        client.addEventListener("message", this.handleMessage);
        client.addEventListener("leader", this.handleLeader);
        client.addEventListener("close", this.handleClose);
        client.addEventListener("error", this.handleError);
        client.media.addEventListener("stream", this.handleStream);
        client.media.addEventListener("stream-ended", this.handleStreamEnded);
        // presenter: drop who stopped saying so; viewer: say so again
        this.hereTimer = setInterval(() => (mine ? this.countViewers() : this.sayHere()), LIMITS.stageHereMs);
        if (!mine) this.sayHere();
        // a node takes its place in the tree after its link opened, and webrtc only re-applies streams
        // on a link event (papit finding #33): look again now and then, it's a no-op when nothing moved
        this.refreshTimer = setInterval(() => {
            try { this.client.media.refresh(); } catch (error) { log("stage: refresh failed", error); }
        }, REFRESH_MS);
    }

    // ------------------------------------------------------------ presenter

    /** Starts a stage with you as presenter and announces it in the lobby. */
    static async goLive(title: string): Promise<Stage> {
        const profile = me();
        if (!profile) throw new Error("a stage needs a profile");
        currentStage()?.end();

        const clean = title.trim().slice(0, 80) || `${profile.name}'s stage`;
        const lobby = lobbyNetwork();
        const c = appClient();
        if (!lobby || !c) throw new Error("not in the lobby");
        const id = crypto.randomUUID();
        const client = await c.create({
            name: "papchat:stage",
            topology: { name: "multicast", fanout },
            meta: { app: APP, kind: "stage", title: clean, presenter: profile.uid },
            media: STAGE_PLAN,
        }, { bootstrap: new ParentBootstrap(lobby, id) });
        try
        {
            const stage = new Stage(client, id, clean, profile, true, client.me);
            setCurrentStage(stage);
            stage.announce();
            upsert(stage.summary());
            log("stage: live", stage.id);
            return stage;
        }
        catch (error)
        {
            client.leave();
            throw error;
        }
    }

    /** Starts your mic, camera or screen for the viewers (presenter only). False on failure (toasted). */
    async start(name: CaptureName): Promise<boolean> {
        if (!this.mine || this.ended) return false;
        if (this.local.has(name)) return true;
        try
        {
            const { display, ...wanted } = constraints(name);
            const raw = display ? await navigator.mediaDevices.getDisplayMedia(wanted) : await navigator.mediaDevices.getUserMedia(wanted);
            const source = name === "mic" ? await denoise(raw, prefs().noiseReduction) : raw;
            if (this.ended)
            {
                source.getTracks().forEach(t => t.stop());
                releaseDenoise(source);
                return false;
            }
            if (name === "screen") screenHint(source);
            source.getTracks()[0]?.addEventListener("ended", () => this.stop(name));
            this.local.set(name, source);
            await this.client.media.start(name, source.clone());
            this.setCaptures(Object.fromEntries(this.local));
            void listDevices();
            return true;
        }
        catch (error)
        {
            this.release(name);
            const cancelled = name === "screen" && error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
            if (!cancelled) toast("warning", `Couldn't start the ${name === "mic" ? "microphone" : name}`);
            log("stage: start failed", name, error);
            return false;
        }
    }

    /** Stops a capture (presenter only). */
    stop(name: CaptureName | string) {
        if (!this.local.has(name)) return;
        this.release(name);
        try
        {
            this.client.media.stop(name);
        }
        catch (error)
        {
            log("stage: stop failed", name, error);
        }
    }

    /** Invites someone in the lobby to watch (presenter only). */
    invite(uid: string): boolean {
        if (!this.mine || this.ended) return false;
        const info = this.entry();
        const invite: Invite = { room: this.id, password: "", kind: "stage", title: this.title, from: this.presenter.uid, members: [], ...(info ? { info } : {}) };
        return lobbySend(uid, "invite", invite);
    }

    // ------------------------------------------------------------ viewer

    /** Joins a stage as a viewer, through `info` or what its announce said. Rejects when it's gone. */
    static async watch(id: string, info?: RoomEntry): Promise<Stage> {
        const profile = me();
        if (!profile) throw new Error("a stage needs a profile");
        const existing = currentStage();
        if (existing?.id === id) return existing;
        existing?.end();

        const entry = info?.id === id ? info : entries.get(id);
        const lobby = lobbyNetwork();
        const c = appClient();
        if (!entry || !lobby || !c) throw new Error("the stage can't be found");

        const client = await c.join(entry as Parameters<typeof c.join>[0], {}, { bootstrap: new ParentBootstrap(lobby, id) });
        try
        {
            const meta = client.info?.meta ?? {};
            if (meta.app !== APP || meta.kind !== "stage") throw new Error("not a papchat stage");

            const uid = typeof meta.presenter === "string" ? meta.presenter : "";
            const presenter = profileOf(uid);
            const presenterPeer = peerOf(uid);
            if (!presenter || !presenterPeer) throw new Error("presenter unknown");

            const title = typeof meta.title === "string" ? meta.title : "";
            const stage = new Stage(client, id, title, presenter, false, presenterPeer);
            setCurrentStage(stage);
            log("stage: watching", stage.id);
            return stage;
        }
        catch (error)
        {
            client.leave();
            throw error;
        }
    }

    /** Where to come in: the stage's info with a few entry peers. */
    entry(): RoomEntry | null {
        const info = this.client.invite();
        return info ? toEntry(info) : null;
    }

    // ------------------------------------------------------------ everyone

    /** Sends a chat message (or a GIF) to everyone on the stage. */
    send(text: string, gif?: Gif): boolean {
        const profile = me();
        const sent = gif ? cleanGif(gif) : null;
        const clean = sent ? sent.url : String(text ?? "").trim().slice(0, LIMITS.messageChars);
        if (!clean || !profile || this.ended) return false;

        const message: ChatMessage = { id: crypto.randomUUID(), uid: profile.uid, at: Date.now(), variant: sent ? "gif" : "text", text: clean, ...(sent ? { gif: sent } : {}) };
        try
        {
            this.client.broadcast("chat", { id: message.id, text: message.text, at: message.at, ...(sent ? { gif: sent } : {}) });
        }
        catch (error)
        {
            log("stage: chat failed", error);
            return false;
        }
        this.push(message);
        return true;
    }

    /** Presenter: ends the stage for everyone. Viewer: stops watching. */
    end() {
        if (this.ended) return;
        this.ended = true;
        clearTimeout(this.announceTimer);
        clearInterval(this.hereTimer);
        clearInterval(this.refreshTimer);
        if (!this.mine) this.tell(BYE);

        if (this.mine)
        {
            lobbyBroadcast("stage.end", { stage: this.id });
            remove(this.id);
        }
        for (const name of [...this.local.keys()]) this.release(name);

        this.client.removeEventListener("message", this.handleMessage);
        this.client.removeEventListener("leader", this.handleLeader);
        this.client.removeEventListener("close", this.handleClose);
        this.client.removeEventListener("error", this.handleError);
        this.client.media.removeEventListener("stream", this.handleStream);
        this.client.media.removeEventListener("stream-ended", this.handleStreamEnded);
        try
        {
            if (!this.client.closed) this.client.leave();
        }
        catch (error)
        {
            log("stage: close failed", error);
        }
        this.setStreams({});
        if (currentStage() === this) setCurrentStage(null);
        log("stage: ended", this.id);
    }

    /** True once ended (by you, the presenter or a lost connection). */
    get closed(): boolean {
        return this.ended;
    }

    summary(): StageSummary {
        return { id: this.id, title: this.title, presenter: this.presenter, viewers: this.viewers(), mine: this.mine };
    }

    /** Tells the lobby about this stage (all, or one uid: a `stage.query` or a new member). */
    announce(to?: string) {
        if (!this.mine || this.ended) return;
        const info = this.entry();
        const payload = { stage: this.id, title: this.title, presenter: this.presenter.uid, viewers: this.viewers(), ...(info ? { info } : {}) };
        if (to) lobbySend(to, "stage.announce", payload);
        else
        {
            this.lastAnnounce = Date.now();
            lobbyBroadcast("stage.announce", payload);
        }
    }

    // ------------------------------------------------------------ internals

    private release(name: string) {
        const source = this.local.get(name);
        source?.getTracks().forEach(t => t.stop());
        if (source) releaseDenoise(source);
        this.local.delete(name);
        this.setCaptures(Object.fromEntries(this.local));
    }

    private push(message: ChatMessage) {
        this.setMessages(list => {
            const next = [...list, message];
            return next.length > LIMITS.messagesKept ? next.slice(next.length - LIMITS.messagesKept) : next;
        });
    }

    private countViewers() {
        const now = Date.now();
        for (const [peer, at] of this.watchers)
        {
            if (now - at > LIMITS.stageHereMs * 2.5) this.watchers.delete(peer);
        }
        const count = this.watchers.size;
        if (count === this.viewers()) return;
        this.setViewers(count);
        if (this.mine) this.reannounce();
    }

    // viewer → presenter, through the tree
    private tell(type: string) {
        try
        {
            this.client.send(this.presenterPeer, type, {});
        }
        catch (error)
        {
            log("stage: send failed", type, error);
        }
    }

    private sayHere() {
        if (!this.ended && !this.mine) this.tell(HERE);
    }

    // viewer counts reach the lobby, throttled
    private reannounce() {
        upsert(this.summary());
        if (this.announceTimer) return;
        const wait = Math.max(0, this.lastAnnounce + ANNOUNCE_GAP_MS - Date.now());
        this.announceTimer = setTimeout(() => {
            this.announceTimer = undefined;
            this.announce();
        }, wait);
    }

    private handleMessage = (event: Event) => {
        const message = (event as CustomEvent<Message>).detail;
        const { type, sender } = message.meta;
        if (this.mine && (type === HERE || type === BYE))
        {
            if (type === HERE) this.watchers.set(sender, Date.now());
            else this.watchers.delete(sender);
            this.countViewers();
            return;
        }
        if (type !== "chat") return;
        let payload: unknown;
        try { payload = message.parse(); } catch { return; }
        if (typeof payload !== "object" || payload === null) return;
        const value = payload as Record<string, unknown>;
        // the same peer id as in the lobby, where they proved who they are
        const uid = uidOf(sender);
        if (!uid || typeof value.text !== "string") return;

        const text = value.text.trim().slice(0, LIMITS.messageChars);
        const id = typeof value.id === "string" && value.id ? value.id.slice(0, 64) : crypto.randomUUID();
        if (!text || this.messages().some(m => m.id === id)) return;
        const at = typeof value.at === "number" && Number.isFinite(value.at) ? Math.min(value.at, Date.now()) : Date.now();
        const gif = cleanGif(value.gif);
        this.push(gif ? { id, uid, at, variant: "gif", text, gif } : { id, uid, at, variant: "text", text });
    };

    // the presenter is the root of the tree: a new root means they're gone
    private handleLeader = (event: Event) => {
        const { root } = (event as CustomEvent<{ root: string | null }>).detail ?? { root: null };
        if (!this.mine && root !== this.presenterPeer) this.hostLost();
    };

    // the lobby carrying it went away
    private handleClose = () => {
        if (this.mine) this.end();
        else this.hostLost();
    };

    private handleError = (event: Event) => {
        const detail = (event as CustomEvent<{ type: string; message: string }>).detail;
        log("stage: error", this.id, detail?.type, detail?.message);
    };

    private hostLost() {
        if (this.ended) return;
        toast("info", `${this.presenter.name}'s stage ended`);
        remove(this.id);
        this.end();
    }

    private handleStream = (event: Event) => {
        const { name, stream } = (event as CustomEvent<{ peer: string; name: string; stream: MediaStream }>).detail;
        this.setStreams(map => ({ ...map, [name]: stream }));
    };

    private handleStreamEnded = (event: Event) => {
        const { name } = (event as CustomEvent<{ peer: string; name: string }>).detail;
        this.setStreams(map => {
            const next = { ...map };
            delete next[name];
            return next;
        });
    };
}

/** Starts a stage with you as presenter. Null (plus a toast) on failure. */
export async function goLive(title: string): Promise<Stage | null> {
    try
    {
        return await Stage.goLive(title);
    }
    catch (error)
    {
        log("stage: go live failed", error);
        toast("error", "Couldn't start the stage");
        return null;
    }
}

/** Watches stage `id`. Null (plus a toast) when it's gone. */
export async function watch(id: string, info?: RoomEntry): Promise<Stage | null> {
    try
    {
        return await Stage.watch(id, info);
    }
    catch (error)
    {
        log("stage: watch failed", id, error);
        toast("warning", "That stage has ended");
        remove(id);
        return null;
    }
}

/** Ends your stage or stops watching. */
export function leaveStage() {
    currentStage()?.end();
}

// ---------------------------------------------------------------- the stages list

// stage id → where to come in, from its announce
const entries = new Map<string, RoomEntry>();

function upsert(summary: StageSummary) {
    setStages(list => [...list.filter(s => s.id !== summary.id), summary]);
}

function remove(id: string) {
    entries.delete(id);
    if (stages().some(s => s.id === id)) setStages(list => list.filter(s => s.id !== id));
}

function readAnnounce(payload: unknown, uid: string | null): StageSummary | null {
    if (typeof payload !== "object" || payload === null || !uid) return null;
    const value = payload as Record<string, unknown>;
    if (typeof value.stage !== "string" || !value.stage || value.presenter !== uid) return null;
    const presenter = profileOf(uid);
    if (!presenter) return null;
    return {
        id: value.stage,
        title: typeof value.title === "string" ? value.title.slice(0, 80) : "",
        presenter,
        viewers: typeof value.viewers === "number" && value.viewers >= 0 ? Math.floor(value.viewers) : 0,
        mine: uid === me()?.uid,
    };
}

on<unknown>("stage.announce", (payload, from) => {
    const summary = readAnnounce(payload, from.uid);
    if (!summary || summary.mine) return;
    const info = readEntry((payload as { info?: unknown }).info, summary.id);
    if (info) entries.set(summary.id, info);
    upsert(summary);
});

on<unknown>("stage.end", (payload, from) => {
    const id = typeof (payload as { stage?: unknown })?.stage === "string" ? (payload as { stage: string }).stage : "";
    const known = stages().find(s => s.id === id);
    if (!known || known.presenter.uid !== from.uid) return;
    remove(id);
    const watching = currentStage();
    if (watching?.id === id && !watching.mine)
    {
        toast("info", `${watching.presenter.name}'s stage ended`);
        watching.end();
    }
});

on<unknown>("stage.query", (_payload, from) => {
    const stage = currentStage();
    if (stage?.mine && from.uid) stage.announce(from.uid);
});

// once per lobby connection, as soon as a link is open: `connected` comes with the server's welcome,
// before any peer link, and a broadcast sent then reaches nobody
let asked = false;
effect(() => {
    if (lobbyStatus() !== "connected")
    {
        asked = false;
        return;
    }
    if (asked) return;
    asked = true;

    const c = lobbyNetwork();
    if (c?.linked.size) askWhoIsLive();
    else c?.addEventListener("link", askWhoIsLive, { once: true });
});

function askWhoIsLive() {
    lobbyBroadcast("stage.query", {});
}

// a query can still get lost, so a presenter also tells each new member once, after their links have
// had time to open. By peer, because a reload keeps the uid. Going live already told everyone present.
let told = new Set<string>();
let toldFor: Stage | null = null;
effect(() => {
    const list = members();
    const stage = currentStage();
    if (!stage?.mine)
    {
        told = new Set();
        toldFor = null;
        return;
    }

    const peers = new Map(list.map(p => [peerOf(p.uid), p.uid]));
    if (toldFor === stage)
    {
        for (const [peer, uid] of peers)
        {
            if (peer && !told.has(peer)) setTimeout(() => tell(stage, uid, peer), TELL_DELAY_MS);
        }
    }
    toldFor = stage;
    told = new Set([...peers.keys()].filter(peer => peer !== null));
});

function tell(stage: Stage, uid: string, peer: string) {
    if (currentStage() === stage && peerOf(uid) === peer) stage.announce(uid);
}

// a presenter who left the lobby has no stage any more
effect(() => {
    const here = new Set(members().map(p => p.uid));
    const mine = me()?.uid;
    const gone = stages().filter(s => s.presenter.uid !== mine && !here.has(s.presenter.uid));
    if (gone.length > 0) setStages(list => list.filter(s => !gone.includes(s)));
});
