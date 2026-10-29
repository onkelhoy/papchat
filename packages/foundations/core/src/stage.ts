import { effect, signal } from "@papit/signals";
import { Client } from "@papit/webrtc";

import { APP, LIMITS, RTC, signalUrl } from "./config";
import { constraints, listDevices, screenHint, type CaptureName } from "./devices";
import { broadcast as lobbyBroadcast, lobbyClient, on, profileOf, readMember, send as lobbySend } from "./lobby";
import { log } from "./log";
import { lobbyStatus, me, members, setStages, stages, toast } from "./state";
import type { ChatMessage, Invite, Profile, StageSummary } from "./types";

// Stages (PLAN §2.7): one presenter broadcasting to many viewers over a multicast tree rooted at
// the presenter. Only the presenter captures; everyone chats with `client.broadcast`. The lobby
// carries `stage.announce` / `stage.end` / `stage.query` so everyone has the `stages` list.

type MediaPlan = NonNullable<Parameters<Client["create"]>[0]["media"]>;

const STAGE_PLAN: MediaPlan = {
    streams: {
        mic: { kind: "audio" },
        camera: { kind: "video" },
        screen: { kind: "video" },
    },
};

// viewer counts go out with a re-announce, at most this often
const ANNOUNCE_GAP_MS = 5_000;

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

    private constructor(private client: Client, id: string, title: string, presenter: Profile, mine: boolean) {
        this.id = id;
        this.title = title;
        this.presenter = presenter;
        this.mine = mine;

        [this.messages, this.setMessages] = signal<ChatMessage[]>([]);
        [this.captures, this.setCaptures] = signal<Record<string, MediaStream>>({});
        [this.streams, this.setStreams] = signal<Record<string, MediaStream>>({});
        [this.viewers, this.setViewers] = signal(0);

        client.addEventListener("message", this.handleMessage);
        client.addEventListener("members", this.handleMembers);
        client.addEventListener("error", this.handleError);
        client.media.addEventListener("stream", this.handleStream);
        client.media.addEventListener("stream-ended", this.handleStreamEnded);
        this.countViewers();
    }

    // ------------------------------------------------------------ presenter

    /** Starts a stage with you as presenter and announces it in the lobby. */
    static async goLive(title: string): Promise<Stage> {
        const profile = me();
        if (!profile) throw new Error("a stage needs a profile");
        currentStage()?.end();

        const clean = title.trim().slice(0, 80) || `${profile.name}'s stage`;
        const client = newClient(profile, { name: "multicast", fanout });
        try
        {
            await client.ready;
            const info = await client.create({
                name: `papchat:stage:${crypto.randomUUID()}`,
                private: false,
                meta: { app: APP, kind: "stage", title: clean, presenter: profile.uid },
                media: STAGE_PLAN,
            });
            const stage = new Stage(client, info.id, clean, profile, true);
            setCurrentStage(stage);
            stage.announce();
            upsert(stage.summary());
            log("stage: live", stage.id);
            return stage;
        }
        catch (error)
        {
            client.close();
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
            const source = display ? await navigator.mediaDevices.getDisplayMedia(wanted) : await navigator.mediaDevices.getUserMedia(wanted);
            if (this.ended)
            {
                source.getTracks().forEach(t => t.stop());
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
        const invite: Invite = { room: this.id, password: "", kind: "stage", title: this.title, from: this.presenter.uid, members: [] };
        return lobbySend(uid, "invite", invite);
    }

    // ------------------------------------------------------------ viewer

    /** Joins a stage as a viewer. Rejects when it's gone. */
    static async watch(id: string): Promise<Stage> {
        const profile = me();
        if (!profile) throw new Error("a stage needs a profile");
        const existing = currentStage();
        if (existing?.id === id) return existing;
        existing?.end();

        const client = newClient(profile);
        try
        {
            await client.ready;
            const info = await client.join(id);
            const meta = info.meta ?? {};
            if (meta.app !== APP || meta.kind !== "stage") throw new Error("not a papchat stage");

            const uid = typeof meta.presenter === "string" ? meta.presenter : "";
            const presenter = profileOf(uid) ?? readMember(info.host, client.profile(info.host))?.profile;
            if (!presenter) throw new Error("presenter unknown");

            const title = typeof meta.title === "string" ? meta.title : "";
            const stage = new Stage(client, info.id, title, presenter, false);
            setCurrentStage(stage);
            log("stage: watching", stage.id);
            return stage;
        }
        catch (error)
        {
            client.close();
            throw error;
        }
    }

    // ------------------------------------------------------------ everyone

    /** Sends a chat message to everyone on the stage. */
    send(text: string): boolean {
        const profile = me();
        const clean = String(text ?? "").trim().slice(0, LIMITS.messageChars);
        if (!clean || !profile || this.ended) return false;

        const message: ChatMessage = { id: crypto.randomUUID(), uid: profile.uid, at: Date.now(), variant: "text", text: clean };
        try
        {
            this.client.broadcast("chat", { id: message.id, text: message.text, at: message.at });
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

        if (this.mine)
        {
            lobbyBroadcast("stage.end", { stage: this.id });
            remove(this.id);
        }
        for (const name of [...this.local.keys()]) this.release(name);

        this.client.removeEventListener("message", this.handleMessage);
        this.client.removeEventListener("members", this.handleMembers);
        this.client.removeEventListener("error", this.handleError);
        this.client.media.removeEventListener("stream", this.handleStream);
        this.client.media.removeEventListener("stream-ended", this.handleStreamEnded);
        try
        {
            this.client.close();
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

    /** Tells the lobby about this stage (all, or one uid when answering a `stage.query`). */
    announce(to?: string) {
        if (!this.mine || this.ended) return;
        const payload = { stage: this.id, title: this.title, presenter: this.presenter.uid, viewers: this.viewers() };
        if (to) lobbySend(to, "stage.announce", payload);
        else
        {
            this.lastAnnounce = Date.now();
            lobbyBroadcast("stage.announce", payload);
        }
    }

    // ------------------------------------------------------------ internals

    private release(name: string) {
        this.local.get(name)?.getTracks().forEach(t => t.stop());
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
        const host = this.client.host;
        const count = this.client.members.filter(p => p !== host).length;
        if (count === this.viewers()) return;
        this.setViewers(count);
        if (this.mine) this.reannounce();
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
        const { type, sender, payload } = (event as CustomEvent<{ type: string; sender: string; payload: unknown }>).detail;
        if (type !== "chat" || typeof payload !== "object" || payload === null) return;
        const value = payload as Record<string, unknown>;
        const uid = readMember(sender, this.client.profile(sender))?.profile.uid;
        if (!uid || typeof value.text !== "string") return;

        const text = value.text.trim().slice(0, LIMITS.messageChars);
        const id = typeof value.id === "string" && value.id ? value.id.slice(0, 64) : crypto.randomUUID();
        if (!text || this.messages().some(m => m.id === id)) return;
        const at = typeof value.at === "number" && Number.isFinite(value.at) ? Math.min(value.at, Date.now()) : Date.now();
        this.push({ id, uid, at, variant: "text", text });
    };

    private handleMembers = () => {
        // the host is the root of the tree: without it the stage is over
        if (!this.mine && !this.client.members.includes(this.client.network?.host ?? ""))
        {
            this.hostLost();
            return;
        }
        this.countViewers();
    };

    private handleError = (event: Event) => {
        const detail = (event as CustomEvent<{ type: string; message: string }>).detail;
        log("stage: error", this.id, detail?.type, detail?.message);
        if (!this.mine && (detail?.type === "reconnect" || detail?.type === "closed")) this.hostLost();
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
export async function watch(id: string): Promise<Stage | null> {
    try
    {
        return await Stage.watch(id);
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

function newClient(profile: Profile, topology?: { name: string; fanout: number }): Client {
    return new Client({
        url: signalUrl(),
        rtc: RTC,
        ...(topology ? { topology } : {}),
        profile: { ...profile, at: Date.now() },
    });
}

// ---------------------------------------------------------------- the stages list

function upsert(summary: StageSummary) {
    setStages(list => [...list.filter(s => s.id !== summary.id), summary]);
}

function remove(id: string) {
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
    if (summary && !summary.mine) upsert(summary);
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

// once per lobby connection: ask who is live, and list stage networks for any announce we missed
let asked = false;
effect(() => {
    const connected = lobbyStatus() === "connected";
    if (!connected)
    {
        asked = false;
        return;
    }
    if (asked) return;
    asked = true;
    lobbyBroadcast("stage.query", {});
    setTimeout(() => void listStages(), 2_000);
});

async function listStages() {
    const c = lobbyClient();
    if (!c) return;
    try
    {
        for (const info of await c.list())
        {
            const meta = info.meta ?? {};
            if (meta.app !== APP || meta.kind !== "stage" || stages().some(s => s.id === info.id)) continue;
            const presenter = typeof meta.presenter === "string" ? profileOf(meta.presenter) : null;
            if (!presenter || presenter.uid === me()?.uid) continue;
            upsert({ id: info.id, title: typeof meta.title === "string" ? meta.title : "", presenter, viewers: Math.max(0, info.size - 1), mine: false });
        }
    }
    catch (error)
    {
        log("stage: list failed", error);
    }
}

// a presenter who left the lobby has no stage any more
effect(() => {
    const here = new Set(members().map(p => p.uid));
    const mine = me()?.uid;
    const gone = stages().filter(s => s.presenter.uid !== mine && !here.has(s.presenter.uid));
    if (gone.length > 0) setStages(list => list.filter(s => !gone.includes(s)));
});
