import { signal } from "@papit/signals";
import { Client, type Network as Net } from "@papit/webrtc";

import { addLink, deviceLabel, linkText, nameDevice, validLink } from "./account";
import { APP, LIMITS, RTC, signalUrl } from "./config";
import { adoptProfile, createProfile } from "./identity";
import { loadDeviceKey, signedBy, uidOfKey } from "./keys";
import { startLobby } from "./lobby";
import { log } from "./log";
import { deviceLink } from "./share";
import { me, network, setNetwork } from "./state";
import { DeviceSync } from "./sync";
import type { DeviceLink, Network } from "./types";

// Linking two devices: one opens a private one-time network and shows it as a QR code and a link, the
// other joins. A plain Client, not a Room, so it stays out of the sidebar, and the signal server is all
// it takes. Both then show the same short code, and BOTH have to press Accept: the device showing the
// code, or anyone who saw the link could become you, and the device that scanned, or a stranger's QR
// code could make them you. Only then do the two sign each other's key (account.ts).

export type LinkPhase = "starting" | "showing" | "joining" | "confirm" | "waiting" | "syncing" | "done" | "failed";
export type LinkFailure = "server" | "expired" | "gone" | "lost" | "same" | "declined" | "proof";

export type LinkState = {
    phase: LinkPhase;
    // the link to show (`showing`)
    url: string;
    // the short code both devices show
    code: string;
    // what the other device says it is
    other: string;
    // this device showed the code: it keeps its profile, the other one takes it
    host: boolean;
    reason?: LinkFailure;
    done: number;
    total: number;
};

const EMPTY: LinkState = { phase: "starting", url: "", code: "", other: "", host: false, done: 0, total: 0 };
const CLOSE_DELAY_MS = 1_000;

/** The link in progress, null when there is none. */
export const [linking, setLinking] = signal<LinkState | null>(null);

type Hello = { key: string; label: string };
type Who = { name: string; color: string; network: Network | null };

type Session = {
    client: Client;
    // the one-time network, once created or joined
    net: Net | null;
    host: boolean;
    peer: string | null;
    greeted: boolean;
    other: Hello | null;
    accepted: boolean;
    theyAccepted: boolean;
    finished: boolean;
    theirs: Who | null;
    sync: DeviceSync | null;
    // what arrived before this side was done signing: the other one starts as soon as it is
    early: [string, unknown][];
    timer: ReturnType<typeof setTimeout> | undefined;
};

let session: Session | null = null;

function update(partial: Partial<LinkState>) {
    setLinking(current => ({ ...(current ?? EMPTY), ...partial }));
}

function close(target: Session) {
    clearTimeout(target.timer);
    target.sync?.stop();
    try
    {
        target.client.close();
    }
    catch { /* already closed */ }
    if (session === target) session = null;
}

function fail(target: Session, reason: LinkFailure) {
    if (target.finished) return;
    target.finished = true;
    log("link: failed", reason);
    update({ phase: "failed", reason, url: "", code: "" });
    close(target);
}

function send(target: Session, type: string, payload?: unknown) {
    if (!target.peer) return;
    try
    {
        target.net?.send(target.peer, type, payload ?? null);
    }
    catch (error)
    {
        log("link: send failed", type, error);
    }
}

function open(host: boolean): Session {
    if (session) close(session);
    const client = new Client({ url: signalUrl(), rtc: RTC });
    const target: Session = { client, net: null, host, peer: null, greeted: false, other: null, accepted: false, theyAccepted: false, finished: false, theirs: null, sync: null, early: [], timer: undefined };
    session = target;
    return target;
}

// one-time: whoever came first is the other device
function meet(target: Session, peer: string): boolean {
    if (target.peer && target.peer !== peer) return false;
    target.peer = peer;
    if (!target.greeted)
    {
        target.greeted = true;
        void hello(target);
    }
    return true;
}

type Message = { meta: { type: string; sender: string }; parse(): unknown };

// listens once the network is there; whatever linked before that is met right away
function listen(target: Session, net: Net) {
    target.net = net;
    net.addEventListener("link", (event) => {
        const { peer, open } = (event as CustomEvent<{ peer: string; open: boolean }>).detail;
        if (open) meet(target, peer);
        else if (peer === target.peer) fail(target, "lost");
    });
    net.addEventListener("message", (event) => {
        const message = (event as CustomEvent<Message>).detail;
        const { type, sender } = message.meta;
        // their first message can get here before our side says the link is open
        if (!meet(target, sender)) return;
        let payload: unknown;
        try { payload = message.parse(); } catch { return; }
        if (type.startsWith("sync."))
        {
            if (target.sync) target.sync.receive(type, payload);
            else target.early.push([type, payload]);
        }
        else void handle(target, type, payload).catch(error => log("link: failed on", type, error));
    });
    for (const peer of net.linked) meet(target, peer);
}

async function hello(target: Session) {
    const own = await loadDeviceKey();
    send(target, "link.hello", { key: own.key, label: deviceLabel() } satisfies Hello);
}

// the same on both devices, and different with anyone else's key
async function shortCode(a: string, b: string): Promise<string> {
    const [first, second] = a < b ? [a, b] : [b, a];
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`papchat code\n${first}\n${second}`)));
    const number = ((hash[0] << 16) | (hash[1] << 8) | hash[2]) % 1_000_000;
    const digits = String(number).padStart(6, "0");
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function who(): Who | null {
    const profile = me();
    return profile ? { name: profile.name, color: profile.color, network: network() } : null;
}

async function handle(target: Session, type: string, payload: unknown) {
    const value = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
    const own = await loadDeviceKey();

    if (type === "link.hello")
    {
        if (target.other || typeof value.key !== "string") return;
        if (value.key === own.key)
        {
            fail(target, "same");
            return;
        }
        // a key that isn't one fails here, not at the signatures
        await uidOfKey(value.key);
        target.other = { key: value.key, label: typeof value.label === "string" ? value.label.slice(0, 64) : "" };
        // ours may have reached them before they were listening (webrtc hands out the network only once
        // joined): once more, they ignore a second one
        void hello(target);
        clearTimeout(target.timer);
        update({ phase: "confirm", url: "", code: await shortCode(own.key, value.key), other: target.other.label, host: target.host });
        return;
    }
    if (type === "link.no")
    {
        fail(target, "declined");
        return;
    }
    if (type === "link.yes")
    {
        target.theyAccepted = true;
        target.theirs = readWho(value);
        if (target.host && target.accepted) await sign(target);
        return;
    }
    if (type === "link.signed") await countersign(target, value);
    else if (type === "link.final") await finish(target, value);
}

function readWho(value: Record<string, unknown>): Who | null {
    const { name, color, network: net } = value;
    if (typeof name !== "string" || !name.trim() || typeof color !== "string") return null;
    const clean = typeof net === "object" && net !== null ? net as Record<string, unknown> : null;
    return {
        name,
        color,
        network: clean && typeof clean.name === "string" ? { name: clean.name, password: typeof clean.password === "string" ? clean.password : "" } : null,
    };
}

const ordered = (x: string, y: string): [string, string] => x < y ? [x, y] : [y, x];

// both said yes: the host signs first
async function sign(target: Session) {
    const own = await loadDeviceKey();
    if (!target.other) return;
    const [a, b] = ordered(own.key, target.other.key);
    const at = Date.now();
    send(target, "link.signed", { at, sig: await own.sign(linkText(a, b, at)) });
}

async function countersign(target: Session, value: Record<string, unknown>) {
    const own = await loadDeviceKey();
    const { at, sig } = value;
    if (!target.other || !target.accepted || typeof at !== "number" || typeof sig !== "string") return;
    const [a, b] = ordered(own.key, target.other.key);
    const text = linkText(a, b, at);
    if (!await signedBy(target.other.key, sig, text))
    {
        fail(target, "proof");
        return;
    }
    const mine = await own.sign(text);
    const link: DeviceLink = own.key === a ? { a, b, at, sa: mine, sb: sig } : { a, b, at, sa: sig, sb: mine };
    await keep(target, link);
    send(target, "link.final", { link });
    beginSync(target);
}

async function finish(target: Session, value: Record<string, unknown>) {
    const own = await loadDeviceKey();
    const link = value.link as DeviceLink | undefined;
    if (!target.other || !link || typeof link !== "object") return;
    const [a, b] = ordered(own.key, target.other.key);
    if (link.a !== a || link.b !== b || !await validLink(link))
    {
        fail(target, "proof");
        return;
    }
    await keep(target, link);
    beginSync(target);
}

async function keep(target: Session, link: DeviceLink) {
    await addLink(link);
    const other = target.other!;
    nameDevice(await uidOfKey(other.key), other.label);
    await adopt(target);
}

// a brand new device becomes the person it just linked to, on the same network. Otherwise the device
// that showed the code keeps its name and colour, and they follow every change from here on (sync.ts)
async function adopt(target: Session) {
    const theirs = target.theirs;
    if (!theirs) return;
    if (me())
    {
        if (!target.host) adoptProfile(theirs.name, theirs.color, Date.now());
        return;
    }
    if (theirs.network) setNetwork(theirs.network);
    createProfile(theirs.name, theirs.color);
    void startLobby();
}

function beginSync(target: Session) {
    update({ phase: "syncing" });
    target.sync = new DeviceSync(
        (type, payload) => send(target, type, payload),
        ({ done, total }) => update({ done, total }),
        () => {
            target.finished = true;
            update({ phase: "done" });
            setTimeout(() => close(target), CLOSE_DELAY_MS);
        },
    );
    void target.sync.start();
    for (const [type, payload] of target.early) target.sync.receive(type, payload);
    target.early = [];
}

/** Shows this device as a QR code and a link for another one to open. Works from any network. */
export async function startLink() {
    const target = open(true);
    update({ ...EMPTY });
    const password = crypto.randomUUID();
    try
    {
        await loadDeviceKey();
        const net: Net = await target.client.create(
            { name: "papchat:link", topology: "mesh", private: true, password, meta: { app: APP, kind: "link" } },
            // one other device, once
            { accept: () => target.peer === null && net.linked.size === 0 },
        );
        listen(target, net);
        const info = net.info!;
        if (target.finished || session !== target) return;
        const expires = Date.now() + LIMITS.linkMs;
        update({ phase: "showing", url: deviceLink(info.id, password, expires) });
        target.timer = setTimeout(() => fail(target, "expired"), LIMITS.linkMs);
    }
    catch (error)
    {
        log("link: couldn't open", error);
        fail(target, "server");
    }
}

/** Opens a link shown by another device. */
export async function joinLink(id: string, key: string) {
    const target = open(false);
    update({ ...EMPTY, phase: "joining" });
    try
    {
        await loadDeviceKey();
        const net = await target.client.join(id, { password: key }, { accept: () => false });
        listen(target, net);
    }
    catch (error)
    {
        log("link: couldn't join", error);
        // the server can't tell an expired link from a used one
        fail(target, "gone");
    }
}

/** This device says yes. Nothing happens until the other one has too. */
export function acceptLink() {
    const target = session;
    if (!target?.other || target.accepted) return;
    target.accepted = true;
    update({ phase: "waiting" });
    send(target, "link.yes", who() ?? {});
    if (target.host && target.theyAccepted) void sign(target);
}

/** Says no, or gives up. */
export function cancelLink() {
    const target = session;
    if (target)
    {
        send(target, "link.no");
        target.finished = true;
        close(target);
    }
    setLinking(null);
}

