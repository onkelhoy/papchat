import { log } from "./log";
import { isRejected, Room, selectRoom } from "./room";
import { network, toast } from "./state";
import type { Network } from "./types";

// Invite links. Everything sits in the hash, so it never reaches a server or its logs. Anyone holding
// a link can join: it carries the password.

export type ShareLink =
    | { kind: "network"; network: Network | null }
    | { kind: "call"; room: string; password: string; network: Network | null };

const NAME_MAX = 40;
const ROOM_MAX = 200;

function linkTo(params: Record<string, string>): string {
    return `${location.origin}${location.pathname}#${new URLSearchParams(params)}`;
}

/** A link to a network, null for the public one (an empty `join`). */
export function networkLink(net: Network | null): string {
    return linkTo({ join: net?.name ?? "", ...(net?.password ? { key: net.password } : {}) });
}

/** A link to a call. It carries your network too, so whoever follows it ends up where you are. */
export function callLink(room: Room): string {
    const net = network();
    return linkTo({ call: room.network, key: room.password, join: net?.name ?? "", ...(net?.password ? { netkey: net.password } : {}) });
}

export function sameNetwork(a: Network | null, b: Network | null): boolean {
    return (a?.name ?? "") === (b?.name ?? "") && (a?.password ?? "") === (b?.password ?? "");
}

/** Reads a location hash. Null when it isn't an invite link, a word when it is one that can't be used. */
export function readShareLink(hash: string): ShareLink | "expired" | "invalid" | null {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const name = params.get("join");
    const room = params.get("call");
    if (name === null && room === null) return null;
    if (name === null) return "invalid";

    const exp = params.get("exp");
    if (exp !== null)
    {
        const seconds = Number(exp);
        if (!Number.isFinite(seconds)) return "invalid";
        if (Date.now() >= seconds * 1000) return "expired";
    }

    const clean = name.trim();
    if (clean.length > NAME_MAX) return "invalid";
    const key = params.get("key") ?? "";
    if (room === null) return { kind: "network", network: clean ? { name: clean, password: key } : null };

    const net = clean ? { name: clean, password: params.get("netkey") ?? "" } : null;
    return room && room.length <= ROOM_MAX && key ? { kind: "call", room, password: key, network: net } : "invalid";
}

/** Joins the call behind a link: nobody rings, the people in it see you join. Null (plus a toast) when it's over. */
export async function joinSharedCall(id: string, password: string): Promise<Room | null> {
    try
    {
        const room = await Room.join(id, password, "call");
        selectRoom(room.id);
        // in the call even when the mic is refused: you still hear them
        room.joinCall();
        await room.start("mic");
        return room;
    }
    catch (error)
    {
        log("share: join failed", id, error);
        toast("warning", isRejected(error) ? "The room is full" : "That call has ended");
        return null;
    }
}
