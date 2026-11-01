import { log } from "./log";
import { inSlot } from "./storage";

// Your identity is a key pair on this device, not a name. The private key can't be exported, so it
// never leaves the browser, and your uid is a hash of the public key: nobody can claim a uid without
// being able to sign for it. `Verifier` makes every member prove that.

const DB = "papchat";
const STORE = "keys";
const RECORD = "device";

const CURVE = { name: "ECDSA", namedCurve: "P-256" };
const SIGNING = { name: "ECDSA", hash: "SHA-256" };
const UID_BYTES = 16;

/** The app message type a `Verifier` talks on. */
export const PROOF = "proof";

const ASK_GAP_MS = 2_000;
// past this a member counts as not answering; they stay out but are still asked, slowly (a phone in
// the background can't answer until it's back)
const PROVE_MS = 30_000;
const LATE_GAP_MS = 20_000;
const HELD_MAX = 16;
const NONCE_MAX = 64;
const SIGNATURE_MAX = 128;

export type DeviceKey = {
    uid: string;
    /** The public key, base64url. */
    key: string;
    sign(text: string): Promise<string>;
};

function encode(bytes: ArrayBuffer | Uint8Array): string {
    const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return btoa(String.fromCharCode(...list)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(text: string): Uint8Array<ArrayBuffer> {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/** The uid belonging to a public key. Rejects on a key that isn't base64url. */
export async function uidOfKey(key: string): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", decode(key));
    return encode(new Uint8Array(hash).slice(0, UID_BYTES));
}

// one transaction, so two tabs starting at once end up with the same pair: the first one in wins
function keepFirst(fresh: CryptoKeyPair): Promise<CryptoKeyPair> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(DB, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(STORE, "readwrite");
            const store = tx.objectStore(STORE);
            let pair = fresh;
            const stored = store.get(inSlot(RECORD));
            stored.onsuccess = () => {
                if (stored.result) pair = stored.result as CryptoKeyPair;
                else store.put(fresh, inSlot(RECORD));
            };
            tx.oncomplete = () => {
                db.close();
                resolve(pair);
            };
            tx.onabort = () => {
                db.close();
                reject(tx.error);
            };
        };
    });
}

let device: DeviceKey | null = null;
let loading: Promise<DeviceKey> | null = null;

async function load(): Promise<DeviceKey> {
    const fresh = await crypto.subtle.generateKey(CURVE, false, ["sign", "verify"]);
    let pair = fresh;
    try
    {
        pair = await keepFirst(fresh);
    }
    catch (error)
    {
        // some private windows: this session gets a key of its own
        log("keys: no IndexedDB, the key lasts this session", error);
    }

    const key = encode(await crypto.subtle.exportKey("raw", pair.publicKey));
    device = {
        uid: await uidOfKey(key),
        key,
        sign: async text => encode(await crypto.subtle.sign(SIGNING, pair.privateKey, utf8(text))),
    };
    return device;
}

/** This device's key, made on first use. Rejects without WebCrypto (plain http). */
export function loadDeviceKey(): Promise<DeviceKey> {
    loading ??= load();
    return loading;
}

/** The key once `loadDeviceKey` has finished. */
export function deviceKey(): DeviceKey | null {
    return device;
}

/** True when `signature` over `text` was made with the private half of `key`. */
export async function signedBy(key: string, signature: string, text: string): Promise<boolean> {
    try
    {
        const publicKey = await crypto.subtle.importKey("raw", decode(key), CURVE, false, ["verify"]);
        return await crypto.subtle.verify(SIGNING, publicKey, decode(signature), utf8(text));
    }
    catch
    {
        return false;
    }
}

// who signs and who asked are part of it, so a proof can't be replayed to someone else or passed
// along by a third peer
const proofText = (nonce: string, signer: string, asker: string) => `papchat proof\n${nonce}\n${signer}\n${asker}`;

type Claim = { profile: { uid: string; key: string } };
type Check = { uid: string; key: string; nonce: string; state: "asking" | "proven" | "failed"; started: number; sent: number; late: boolean };

export type VerifierLink = {
    /** Our peer id. */
    me(): string | null;
    /** False while a send can't reach anyone. */
    ready(): boolean;
    send(peer: string, payload: unknown): void;
    /** A member was proven or stopped counting as pending: read the members again. */
    changed(): void;
};

/**
 * Checks the members of one client: their key must hash to their uid, and they must sign a random
 * challenge. A member only counts once proven. What they send before that is held, then delivered.
 */
export class Verifier {
    private checks = new Map<string, Check>();
    private held = new Map<string, (() => void)[]>();
    private timer: ReturnType<typeof setInterval> | undefined;
    private stopped = false;

    constructor(private link: VerifierLink) { }

    verified(peer: string): boolean {
        return this.checks.get(peer)?.state === "proven";
    }

    /** Someone is still being checked, not counting those who ran out of time. */
    get pending(): boolean {
        return [...this.checks.values()].some(check => check.state === "asking" && !check.late);
    }

    /** Brings the checks in line with the member list: `[peer, member]` entries. */
    sync(claims: [string, Claim][]) {
        const members = new Set(claims.map(([peer]) => peer));
        for (const peer of this.checks.keys())
        {
            if (members.has(peer)) continue;
            this.checks.delete(peer);
            this.held.delete(peer);
        }
        for (const [peer, { profile }] of claims)
        {
            const check = this.checks.get(peer);
            if (check?.uid === profile.uid && check.key === profile.key) continue;
            this.start(peer, profile.uid, profile.key);
        }
    }

    /** Runs `run` once `peer` is proven, or never when they fail. */
    hold(peer: string, run: () => void) {
        if (this.checks.get(peer)?.state === "failed") return;
        const list = this.held.get(peer) ?? [];
        if (list.length < HELD_MAX) list.push(run);
        this.held.set(peer, list);
    }

    /** A `PROOF` message came in. */
    receive(sender: string, payload: unknown) {
        if (typeof payload !== "object" || payload === null) return;
        const { ask, nonce, signature } = payload as Record<string, unknown>;
        if (typeof ask === "string" && ask.length <= NONCE_MAX) void this.answer(sender, ask);
        else if (typeof nonce === "string" && typeof signature === "string" && signature.length <= SIGNATURE_MAX) void this.check(sender, nonce, signature);
    }

    /** A link opened: ask whoever we couldn't reach yet. */
    poke() {
        for (const [peer, check] of this.checks)
        {
            if (check.state === "asking" && check.nonce && check.sent === 0) this.ask(peer, check);
        }
    }

    stop() {
        this.stopped = true;
        clearInterval(this.timer);
        this.timer = undefined;
        this.checks.clear();
        this.held.clear();
    }

    private start(peer: string, uid: string, key: string) {
        const check: Check = { uid, key, nonce: "", state: "asking", started: Date.now(), sent: 0, late: false };
        this.checks.set(peer, check);
        void uidOfKey(key).catch(() => null).then(real => {
            if (this.checks.get(peer) !== check) return;
            if (real !== uid)
            {
                log("keys: uid doesn't match the key", peer, uid);
                check.state = "failed";
                this.held.delete(peer);
                this.link.changed();
                return;
            }
            check.nonce = encode(crypto.getRandomValues(new Uint8Array(18)));
            this.ask(peer, check);
            this.timer ??= setInterval(this.tick, ASK_GAP_MS);
        });
    }

    private ask(peer: string, check: Check) {
        if (!this.link.ready()) return;
        check.sent = Date.now();
        this.link.send(peer, { ask: check.nonce });
    }

    private tick = () => {
        const now = Date.now();
        let asking = false;
        for (const [peer, check] of this.checks)
        {
            if (check.state !== "asking" || !check.nonce) continue;
            asking = true;
            if (!check.late && now - check.started >= PROVE_MS)
            {
                check.late = true;
                log("keys: no proof in time", peer, check.uid);
                this.link.changed();
            }
            if (now - check.sent >= (check.late ? LATE_GAP_MS : ASK_GAP_MS)) this.ask(peer, check);
        }
        if (asking) return;
        clearInterval(this.timer);
        this.timer = undefined;
    };

    private async answer(sender: string, nonce: string) {
        const peer = this.link.me();
        if (!peer) return;
        const own = await loadDeviceKey();
        const signature = await own.sign(proofText(nonce, peer, sender));
        if (!this.stopped) this.link.send(sender, { nonce, signature });
    }

    private async check(sender: string, nonce: string, signature: string) {
        const check = this.checks.get(sender);
        const peer = this.link.me();
        if (!check || !peer || check.state !== "asking" || check.nonce !== nonce) return;

        const good = await signedBy(check.key, signature, proofText(nonce, sender, peer));
        if (this.checks.get(sender) !== check || check.state !== "asking") return;
        // a bad proof changes nothing: a peer's sender id can be faked, so it may not be theirs
        if (!good)
        {
            log("keys: bad proof", sender, check.uid);
            return;
        }

        check.state = "proven";
        this.link.changed();
        const held = this.held.get(sender) ?? [];
        this.held.delete(sender);
        for (const run of held) run();
    }
}
