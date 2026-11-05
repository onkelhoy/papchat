import { effect } from "@papit/signals";
import { ParentBootstrap, type Network as Net } from "@papit/webrtc";

import { ownAccount, receiveAccount } from "./account";
import { refreshViewing } from "./chats";
import { APP, LIMITS } from "./config";
import { addLinkedContact, contacts } from "./contacts";
import { canSave, conversations, messageIds, messagesById, onSaved, readMessage, saveMessages } from "./history";
import { adoptProfile } from "./identity";
import { appClient, lobbyNetwork, on, otherDevices, quietSend, send as lobbySend } from "./lobby";
import { log } from "./log";
import { samePerson } from "./people";
import { allRooms, readEntry } from "./room";
import { me, members, prefs } from "./state";
import type { ChatMessage, Contact, Conversation, ConversationMember } from "./types";

// Linked devices keep the same chats. Right after linking, and whenever two of them are online together,
// each tells the other which messages it has and sends what's missing, newest first. Ids make that safe
// to stop and repeat. Single new messages follow over the lobby. Files aren't included.

const IDS_CHUNK = 400;
// a conversation's newest messages: a phone doesn't need all of a laptop's years
const IDS_MAX = 20_000;
const STALL_MS = 30_000;
const LIVE = "sync.live";
const OPEN = "sync.open";
const PROFILE = "sync.profile";

export type SyncProgress = { done: number; total: number };

type Out = (type: string, payload?: unknown) => void;

function readMember(raw: unknown): ConversationMember | null {
    if (typeof raw !== "object" || raw === null) return null;
    const { uid, name, color } = raw as Record<string, unknown>;
    return typeof uid === "string" && typeof name === "string" && typeof color === "string" ? { uid, name, color } : null;
}

function readConversation(raw: unknown): Conversation | null {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, direct, title, members: people, at } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof at !== "number" || !Array.isArray(people)) return null;
    return {
        id,
        direct: typeof direct === "string" ? direct : null,
        title: typeof title === "string" ? title : "",
        members: people.map(readMember).filter((member): member is ConversationMember => !!member),
        at,
    };
}

// what arrives from your other device is yours here: `mine` in the conversation means this device's uid
function readMessages(raw: unknown): ChatMessage[] {
    if (!Array.isArray(raw)) return [];
    const mine = me()?.uid;
    return raw.map(readMessage)
        .filter((message): message is ChatMessage => !!message)
        .map(message => mine && samePerson(message.uid, mine) ? { ...message, uid: mine } : message);
}

function pieces(messages: ChatMessage[]): ChatMessage[][] {
    const list: ChatMessage[][] = [];
    let piece: ChatMessage[] = [];
    let size = 0;
    for (const { state, ...message } of messages)
    {
        // what never went out is its own device's to send
        if (state === "sending" || state === "failed") continue;
        const length = JSON.stringify(message).length;
        if (piece.length > 0 && size + length > LIMITS.historyChunk)
        {
            list.push(piece);
            piece = [];
            size = 0;
        }
        piece.push(message);
        size += length;
    }
    if (piece.length > 0) list.push(piece);
    return list;
}

/** One exchange with another device over `out`. Feed it what arrives with `receive`. */
export class DeviceSync {
    private queue: Promise<void> = Promise.resolve();
    private theyFinished = false;
    private doneSent = false;
    // both sides have everything: only then is it over, or one could hang up on the other
    private theyDone = false;
    private expected = 0;
    private arrived = 0;
    // how many the other side has finished answering for
    private settled = 0;
    private total = 0;
    private stall: ReturnType<typeof setTimeout> | undefined;
    private over = false;

    constructor(private out: Out, private progress: (state: SyncProgress) => void, private finished: () => void) { }

    /** Tells the other device what's here. */
    async start() {
        this.touch();
        this.out("sync.account", ownAccount());
        this.out("sync.contacts", { contacts: contacts() });
        const profile = profileState();
        if (profile) this.out(PROFILE, profile);
        for (const conversation of conversations())
        {
            const ids = await messageIds(conversation.id, 0, IDS_MAX);
            for (let i = 0; i < ids.length; i += IDS_CHUNK)
            {
                this.out("sync.ids", { conversation, ids: ids.slice(i, i + IDS_CHUNK) });
            }
        }
        this.out("sync.end");
    }

    /** Handles a `sync.*` message. In order: a list is only over once everything before it is done. */
    receive(type: string, payload: unknown) {
        this.touch();
        this.queue = this.queue.then(() => this.handle(type, payload)).catch(error => log("sync: failed", type, error));
    }

    stop() {
        this.over = true;
        clearTimeout(this.stall);
    }

    // it can stop anywhere and pick up next time: a quiet line just ends this round
    private touch() {
        clearTimeout(this.stall);
        if (this.over) return;
        this.stall = setTimeout(() => this.end(), STALL_MS);
    }

    private end() {
        if (this.over) return;
        this.stop();
        for (const room of allRooms()) void room.reloadHistory();
        void refreshViewing();
        this.finished();
    }

    private checkDone() {
        if (this.theyFinished && this.arrived >= this.expected && !this.doneSent)
        {
            this.doneSent = true;
            this.out("sync.done");
        }
        if (this.doneSent && this.theyDone) this.end();
    }

    private async handle(type: string, payload: unknown) {
        const value = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
        if (type === "sync.account")
        {
            await receiveAccount(payload);
        }
        else if (type === PROFILE)
        {
            readProfile(value);
        }
        else if (type === "sync.contacts")
        {
            if (Array.isArray(value.contacts)) for (const contact of value.contacts.slice(0, LIMITS.contacts)) readContact(contact);
        }
        else if (type === "sync.ids")
        {
            await this.handleIds(value);
        }
        else if (type === "sync.want")
        {
            const conversation = readConversation(value.conversation);
            const ids = Array.isArray(value.ids) ? value.ids.filter((id): id is string => typeof id === "string") : [];
            if (!conversation) return;
            for (const messages of pieces(await messagesById(conversation.id, ids))) this.out("sync.messages", { conversation, messages });
            // what it holds back (unsent, deleted since) won't come, and the other side shouldn't wait for it
            this.out("sync.sent", { count: ids.length });
        }
        else if (type === "sync.messages")
        {
            const conversation = readConversation(value.conversation);
            const messages = readMessages(value.messages);
            if (conversation && canSave()) await saveMessages(conversation, messages, { silent: true });
            this.arrived += messages.length;
            this.progress({ done: this.arrived, total: this.total });
        }
        else if (type === "sync.sent")
        {
            this.settled += typeof value.count === "number" ? value.count : 0;
            this.arrived = Math.max(this.arrived, this.settled);
            this.checkDone();
        }
        else if (type === "sync.end")
        {
            this.theyFinished = true;
            this.checkDone();
        }
        else if (type === "sync.done")
        {
            this.theyDone = true;
            this.checkDone();
        }
    }

    private async handleIds(value: Record<string, unknown>) {
        const conversation = readConversation(value.conversation);
        if (!conversation || !canSave() || !Array.isArray(value.ids)) return;
        const known = new Set(await messageIds(conversation.id, 0));
        const missing = value.ids.filter((id): id is string => typeof id === "string" && !known.has(id));
        if (missing.length === 0) return;
        this.expected += missing.length;
        this.total += missing.length;
        this.progress({ done: this.arrived, total: this.total });
        this.out("sync.want", { conversation, ids: missing });
    }
}

function readContact(raw: unknown) {
    if (typeof raw !== "object" || raw === null) return;
    const { uid, name, color, token } = raw as Record<string, unknown>;
    if (typeof uid !== "string" || typeof name !== "string" || typeof token !== "string" || !uid || !token) return;
    const networks = (raw as Record<string, unknown>).networks;
    addLinkedContact({ uid, name, color: typeof color === "string" ? color : "", token, ...(Array.isArray(networks) ? { networks: networks.filter(item => typeof item === "string") } : {}) } as Omit<Contact, "at">);
}

// ---------------------------------------------------------------- new messages

/** Every new message goes to your other devices right away. */
function follow() {
    onSaved((conversation, messages) => {
        const devices = otherDevices();
        if (devices.length === 0) return;
        for (const list of pieces(messages))
        {
            for (const device of devices) quietSend(device, LIVE, { conversation, messages: list });
        }
    });
}

// ---------------------------------------------------------------- one name and colour

function profileState() {
    const profile = me();
    return profile ? { uid: profile.uid, name: profile.name, color: profile.color, at: prefs().profileAt ?? 0 } : null;
}

// the newest wins, and the smaller uid when neither has ever changed. Status stays per device
function readProfile(value: Record<string, unknown>) {
    const profile = me();
    const { uid, name, color, at } = value;
    if (!profile || typeof uid !== "string" || typeof name !== "string" || typeof color !== "string" || typeof at !== "number") return;

    const mine = prefs().profileAt ?? 0;
    if (at < mine || (at === mine && uid > profile.uid)) return;
    if (name === profile.name && color === profile.color) return;
    adoptProfile(name, color, at);
}

function followProfile() {
    let sent = "";
    effect(() => {
        const profile = me();
        if (!profile) return;
        const changed = `${profile.name}\n${profile.color}`;
        const first = !sent;
        if (changed === sent) return;
        sent = changed;
        if (first) return;
        for (const device of otherDevices()) quietSend(device, PROFILE, profileState());
    });
}

on<unknown>(PROFILE, (payload, from) => {
    const mine = me()?.uid;
    if (!mine || !from.uid || !samePerson(from.uid, mine) || from.uid === mine) return;
    if (typeof payload === "object" && payload !== null) readProfile(payload as Record<string, unknown>);
});

on<unknown>(LIVE, (payload, from) => {
    const mine = me()?.uid;
    if (!mine || !from.uid || !samePerson(from.uid, mine) || from.uid === mine) return;
    if (typeof payload !== "object" || payload === null || !canSave()) return;
    const value = payload as Record<string, unknown>;
    const conversation = readConversation(value.conversation);
    const messages = readMessages(value.messages);
    if (!conversation || messages.length === 0) return;

    void saveMessages(conversation, messages, { silent: true }).then(() => {
        allRooms().find(room => room.conversationId === conversation.id)?.showSaved(messages);
        void refreshViewing();
    });
});

// ---------------------------------------------------------------- catching up

// a private network of two carried by the lobby, so all of this goes straight between the devices and
// nothing touches the server. The smaller uid opens it
const syncing = new Set<string>();
const done = new Set<string>();

type Message = { meta: { type: string; sender: string }; parse(): unknown };

function run(net: Net, device: string) {
    let peer: string | null = null;
    const out: Out = (type, payload) => {
        if (!peer) return;
        try { net.send(peer, type, payload ?? null); } catch (error) { log("sync: send failed", type, error); }
    };
    const finish = () => {
        syncing.delete(device);
        try { net.leave(); } catch { /* already closed */ }
    };
    const sync = new DeviceSync(out, () => undefined, () => {
        done.add(device);
        finish();
    });
    const meet = (other: string) => {
        if (peer) return;
        peer = other;
        void sync.start();
    };
    net.addEventListener("link", (event) => {
        const { peer: other, open } = (event as CustomEvent<{ peer: string; open: boolean }>).detail;
        if (open) meet(other);
        else if (other === peer)
        {
            sync.stop();
            finish();
        }
    });
    net.addEventListener("message", (event) => {
        const message = (event as CustomEvent<Message>).detail;
        const { type, sender } = message.meta;
        if (!type.startsWith("sync.")) return;
        meet(sender);
        try { sync.receive(type, message.parse()); } catch (error) { log("sync: bad message", type, error); }
    });
    net.addEventListener("close", () => {
        sync.stop();
        syncing.delete(device);
    });
    // linked before we were listening
    for (const other of net.linked) meet(other);
}

async function openSync(device: string) {
    const password = crypto.randomUUID();
    const lobby = lobbyNetwork();
    const c = appClient();
    if (!lobby || !c)
    {
        syncing.delete(device);
        return;
    }
    const id = crypto.randomUUID();
    let net: Net | null = null;
    try
    {
        net = await c.create(
            { name: "papchat:sync", topology: "mesh", private: true, password, meta: { app: APP, kind: "sync" } },
            { bootstrap: new ParentBootstrap(lobby, id), accept: () => (net?.linked.size ?? 0) === 0 },
        );
        run(net, device);
        lobbySend(device, OPEN, { network: id, password, info: net.invite() });
    }
    catch (error)
    {
        log("sync: couldn't open", error);
        syncing.delete(device);
        try { net?.leave(); } catch { /* already closed */ }
    }
}

on<unknown>(OPEN, async (payload, from) => {
    const mine = me()?.uid;
    if (!mine || !from.uid || !samePerson(from.uid, mine) || from.uid === mine || syncing.has(from.uid)) return;
    if (typeof payload !== "object" || payload === null) return;
    const { network, password, info } = payload as Record<string, unknown>;
    if (typeof network !== "string" || typeof password !== "string") return;
    const entry = readEntry(info, network);
    const lobby = lobbyNetwork();
    const c = appClient();
    if (!entry || !lobby || !c) return;

    syncing.add(from.uid);
    const device = from.uid;
    try
    {
        const net = await c.join(entry as Parameters<typeof c.join>[0], { password }, { bootstrap: new ParentBootstrap(lobby, network), accept: () => false });
        run(net, device);
    }
    catch (error)
    {
        log("sync: couldn't join", error);
        syncing.delete(device);
    }
});

/** Starts following and catching up with your other devices. Once, at boot. */
export function startSync() {
    follow();
    followProfile();
    effect(() => {
        members();
        // a moment later: proofs and links settle first
        setTimeout(() => {
            const mine = me()?.uid;
            const here = otherDevices();
            // gone for a while: it has catching up to do when it's back
            for (const device of done) if (!here.includes(device)) done.delete(device);
            for (const device of here)
            {
                if (!mine || mine > device || syncing.has(device) || done.has(device)) continue;
                syncing.add(device);
                void openSync(device);
            }
        }, 5_000);
    });
}
