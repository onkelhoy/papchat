import type { Client } from "@papit/webrtc";
import { signal } from "@papit/signals";

import { LIMITS } from "./config";
import { log } from "./log";
import { activeRoom, me, toast } from "./state";
import type { FileEntry, FileInfo } from "./types";
import type { Room, RoomFrom } from "./room";

// File transfer in a room (PLAN §2.6): `file.offer` / `file.cancel` as room app messages, the bytes
// as frames on the `file` channel: [16-byte fid][u32 seq][≤ 16 KiB data]. Every frame is checked
// (length, known fid from that peer, seq in range, chunk size). Late joiners don't get earlier files.

const HEAD = 16 + 4;
// Channel has no bufferedAmount (PLAN §9), so pace by guess: one batch, then a short pause
const PAUSE_MS = 100;
// the sender waits this long after the offer so it arrives before the first frame
const OFFER_LEAD_MS = 500;
// a receive with no frame for this long has lost its sender
const STALL_MS = 30_000;

type Outgoing = { file: File; cancelled: boolean; declined: Set<string> };
type Incoming = {
    info: FileInfo;
    peer: string;
    total: number;
    chunks: (ArrayBuffer | undefined)[];
    got: number;
    stall: ReturnType<typeof setTimeout> | undefined;
};

export class Transfers {
    /** Files offered in this room (sent and received), oldest first. */
    readonly files: () => FileEntry[];
    private setFiles: (next: FileEntry[] | ((prev: FileEntry[]) => FileEntry[])) => void;

    private outgoing = new Map<string, Outgoing>();
    private incoming = new Map<string, Incoming>();
    private urls = new Set<string>();
    private queue: Promise<void> = Promise.resolve();
    private channelClient: Client | null = null;

    constructor(private room: Room) {
        [this.files, this.setFiles] = signal<FileEntry[]>([]);

        room.onMessage("file.offer", this.handleOffer);
        room.onMessage("file.cancel", this.handleCancel);
        room.addEventListener("client", this.handleClient);
        room.addEventListener("leave", () => this.dispose(), { once: true });
    }

    /** Offers `files` to everyone in the room and sends them one after another. */
    send(files: File[]) {
        const profile = me();
        if (!profile) return;

        for (const file of files)
        {
            if (file.size > LIMITS.fileBytes)
            {
                toast("warning", `${file.name} is over ${Math.round(LIMITS.fileBytes / 1024 / 1024)} MB`);
                continue;
            }

            const info: FileInfo = { fid: newFid(), name: cleanName(file.name), size: file.size, type: file.type.slice(0, 100), uid: profile.uid, at: Date.now() };
            const url = this.url(file);
            this.add({ ...info, state: "sending", progress: 0, url });
            this.room.addFileMessage(info.uid, info.fid, info.at);

            const job: Outgoing = { file, cancelled: false, declined: new Set() };
            this.outgoing.set(info.fid, job);
            this.queue = this.queue.then(() => this.transmit(info, job)).catch(error => {
                log("transfer: send failed", info.fid, error);
                this.update(info.fid, { state: "failed" });
            });
        }
    }

    /** Stops a file: a sender's cancel stops it for everyone, a receiver's only for them. */
    cancel(fid: string) {
        const entry = this.files().find(f => f.fid === fid);
        if (!entry || (entry.state !== "sending" && entry.state !== "receiving")) return;

        const job = this.outgoing.get(fid);
        if (job) job.cancelled = true;
        this.dropIncoming(fid);
        this.update(fid, { state: "cancelled" });
        this.broadcast("file.cancel", { fid });
    }

    // ------------------------------------------------------------ sending

    private async transmit(info: FileInfo, job: Outgoing) {
        if (job.cancelled) return;
        this.broadcast("file.offer", info);
        await sleep(OFFER_LEAD_MS);

        const total = Math.ceil(info.size / LIMITS.chunk);
        const fid = hexBytes(info.fid);
        const span = LIMITS.chunk * LIMITS.batch;

        for (let start = 0; start < total; start += LIMITS.batch)
        {
            if (job.cancelled) return;
            const channel = this.room.client?.media.channel("file");
            if (!channel) throw new Error("not connected");

            const offset = start * LIMITS.chunk;
            const bytes = new Uint8Array(await job.file.slice(offset, offset + span).arrayBuffer());
            const end = Math.min(start + LIMITS.batch, total);
            for (let seq = start; seq < end; seq++)
            {
                const from = (seq - start) * LIMITS.chunk;
                channel.broadcast(frame(fid, seq, bytes.subarray(from, from + LIMITS.chunk)));
            }

            this.update(info.fid, { progress: end / total });
            await sleep(PAUSE_MS);
        }

        if (!job.cancelled) this.update(info.fid, { state: "done", progress: 1 });
        this.outgoing.delete(info.fid);
    }

    // ------------------------------------------------------------ receiving

    private handleOffer = (payload: unknown, from: RoomFrom) => {
        const info = readOffer(payload);
        if (!info || !from.uid || info.uid !== from.uid || info.uid === me()?.uid) return;
        if (this.files().some(f => f.fid === info.fid)) return;

        const total = Math.ceil(info.size / LIMITS.chunk);
        this.add({ ...info, at: Date.now(), state: "receiving", progress: 0 });
        this.room.addFileMessage(info.uid, info.fid, Date.now());
        if (activeRoom() !== this.room.id) this.room.bumpUnread();

        const job: Incoming = { info, peer: from.peer, total, chunks: new Array(total), got: 0, stall: undefined };
        this.incoming.set(info.fid, job);
        if (total === 0) this.finish(job);
        else this.touch(job);
    };

    private handleCancel = (payload: unknown, from: RoomFrom) => {
        const fid = typeof (payload as { fid?: unknown })?.fid === "string" ? (payload as { fid: string }).fid : "";
        if (!fid || !from.uid) return;

        // the sender stopped: stop here too
        const inbound = this.incoming.get(fid);
        if (inbound && inbound.peer === from.peer)
        {
            this.dropIncoming(fid);
            this.update(fid, { state: "cancelled" });
            toast("info", `${inbound.info.name} was cancelled`);
            return;
        }

        // a receiver stopped: the sender stops once nobody in the room still wants it
        const job = this.outgoing.get(fid);
        if (!job) return;
        job.declined.add(from.uid);
        if (this.room.participants().every(p => job.declined.has(p.uid)))
        {
            job.cancelled = true;
            this.update(fid, { state: "cancelled" });
        }
    };

    private handleClient = (event: Event) => {
        const next = (event as CustomEvent<Client>).detail;
        this.unlisten();
        this.channelClient = next;
        next.media.channel("file").addEventListener("message", this.handleFrame);
    };

    private handleFrame = (event: Event) => {
        const { peer, data } = (event as CustomEvent<{ peer: string; data: unknown }>).detail;
        if (data instanceof ArrayBuffer) this.readFrame(peer, new Uint8Array(data));
        else if (ArrayBuffer.isView(data)) this.readFrame(peer, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        else if (data instanceof Blob && data.size <= HEAD + LIMITS.chunk) void data.arrayBuffer().then(b => this.readFrame(peer, new Uint8Array(b)));
    };

    private readFrame(peer: string, bytes: Uint8Array) {
        if (bytes.byteLength <= HEAD || bytes.byteLength > HEAD + LIMITS.chunk) return;

        const job = this.incoming.get(bytesHex(bytes.subarray(0, 16)));
        if (!job || job.peer !== peer) return;

        const seq = new DataView(bytes.buffer, bytes.byteOffset + 16, 4).getUint32(0);
        if (seq >= job.total || job.chunks[seq]) return;

        const size = bytes.byteLength - HEAD;
        const expected = seq === job.total - 1 ? job.info.size - LIMITS.chunk * (job.total - 1) : LIMITS.chunk;
        if (size !== expected) return;

        job.chunks[seq] = bytes.slice(HEAD).buffer;
        job.got++;
        this.touch(job);

        if (job.got === job.total) this.finish(job);
        else if (job.got % 32 === 0) this.update(job.info.fid, { progress: job.got / job.total });
    }

    private finish(job: Incoming) {
        const blob = new Blob(job.chunks as ArrayBuffer[], { type: job.info.type });
        this.dropIncoming(job.info.fid);
        this.update(job.info.fid, { state: "done", progress: 1, url: this.url(blob) });
    }

    // restart the stall timer
    private touch(job: Incoming) {
        clearTimeout(job.stall);
        job.stall = setTimeout(() => {
            if (this.incoming.get(job.info.fid) !== job) return;
            this.dropIncoming(job.info.fid);
            this.update(job.info.fid, { state: "failed" });
        }, STALL_MS);
    }

    private dropIncoming(fid: string) {
        const job = this.incoming.get(fid);
        if (!job) return;
        clearTimeout(job.stall);
        this.incoming.delete(fid);
    }

    // ------------------------------------------------------------ helpers

    private add(entry: FileEntry) {
        this.setFiles(list => [...list, entry]);
    }

    private update(fid: string, partial: Partial<FileEntry>) {
        this.setFiles(list => list.map(f => f.fid === fid ? { ...f, ...partial } : f));
    }

    private url(blob: Blob): string {
        const url = URL.createObjectURL(blob);
        this.urls.add(url);
        return url;
    }

    private broadcast(type: string, payload: unknown) {
        try
        {
            this.room.client?.broadcast(type, payload);
        }
        catch (error)
        {
            log("transfer: broadcast failed", type, error);
        }
    }

    private unlisten() {
        try
        {
            this.channelClient?.media.channel("file").removeEventListener("message", this.handleFrame);
        }
        catch { /* client already closed */ }
        this.channelClient = null;
    }

    private dispose() {
        for (const job of this.outgoing.values()) job.cancelled = true;
        for (const fid of [...this.incoming.keys()]) this.dropIncoming(fid);
        this.unlisten();
        for (const url of this.urls) URL.revokeObjectURL(url);
        this.urls.clear();
    }
}

// ---------------------------------------------------------------- frames

function newFid(): string {
    return crypto.randomUUID().replace(/-/g, "");
}

function frame(fid: Uint8Array, seq: number, data: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(HEAD + data.byteLength);
    out.set(fid, 0);
    new DataView(out.buffer).setUint32(16, seq);
    out.set(data, HEAD);
    return out;
}

function hexBytes(hex: string): Uint8Array {
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function bytesHex(bytes: Uint8Array): string {
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
}

function readOffer(payload: unknown): FileInfo | null {
    if (typeof payload !== "object" || payload === null) return null;
    const value = payload as Record<string, unknown>;
    if (typeof value.fid !== "string" || !/^[0-9a-f]{32}$/.test(value.fid)) return null;
    if (typeof value.size !== "number" || !Number.isInteger(value.size) || value.size < 0 || value.size > LIMITS.fileBytes) return null;
    if (typeof value.uid !== "string") return null;
    return {
        fid: value.fid,
        name: cleanName(typeof value.name === "string" ? value.name : ""),
        size: value.size,
        type: typeof value.type === "string" ? value.type.slice(0, 100) : "",
        uid: value.uid,
        at: Date.now(),
    };
}

function cleanName(name: string): string {
    return name.replace(/[\u0000-\u001f\/\\]/g, "").trim().slice(0, 200) || "file";
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
