import { log } from "./log";
import { isRejected, Room, selectRoom } from "./room";
import { network, toast } from "./state";
import type { Contact, Network, Ring } from "./types";

// Invite links. Everything sits in the hash, so it never reaches a server or its logs. Anyone holding
// a link can join: it carries the password.

export type ShareLink =
    | { kind: "network"; network: Network | null }
    | { kind: "call"; room: string; password: string; network: Network | null }
    | { kind: "contact"; contact: Omit<Contact, "at"> }
    | { kind: "ring"; ring: Ring };

const NAME_MAX = 40;
const ROOM_MAX = 200;
const TOKEN_MAX = 4_096;
const COLOR = /^#[0-9a-f]{6}$/i;

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

/** A link that saves you as a contact. Whoever holds it can ring this device. */
export function contactLink(contact: Omit<Contact, "at">): string {
    return linkTo({ contact: contact.uid, name: contact.name, color: contact.color, token: contact.token });
}

export function sameNetwork(a: Network | null, b: Network | null): boolean {
    return (a?.name ?? "") === (b?.name ?? "") && (a?.password ?? "") === (b?.password ?? "");
}

/** Reads a location hash. Null when it isn't an invite link, a word when it is one that can't be used. */
export function readShareLink(hash: string): ShareLink | "expired" | "invalid" | null {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    if (params.has("contact")) return readContact(params);
    if (params.has("from")) return readRing(params);

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

function readContact(params: URLSearchParams): ShareLink | "invalid" {
    const uid = params.get("contact") ?? "";
    const name = (params.get("name") ?? "").trim();
    const token = params.get("token") ?? "";
    const color = params.get("color") ?? "";
    if (!uid || uid.length > ROOM_MAX || !name || !token || token.length > TOKEN_MAX) return "invalid";
    return { kind: "contact", contact: { uid, name: name.slice(0, NAME_MAX), color: COLOR.test(color) ? color : "", token } };
}

// `from` tells it from a plain call link: this one rings you, and the service worker writes it
function readRing(params: URLSearchParams): ShareLink | "invalid" {
    const value = (name: string) => params.get(name) ?? "";
    const kind = value("kind");
    const at = Number(value("at"));
    const fields = [value("call"), value("key"), value("from"), value("pub"), value("sig")];
    if (fields.some(field => !field || field.length > ROOM_MAX)) return "invalid";
    if ((kind !== "call" && kind !== "video") || !Number.isFinite(at)) return "invalid";
    return {
        kind: "ring",
        ring: {
            id: value("call"),
            key: value("key"),
            kind,
            direct: value("direct") === "true",
            from: value("from"),
            name: value("name").trim().slice(0, NAME_MAX) || "Someone",
            at,
            pub: value("pub"),
            sig: value("sig"),
        },
    };
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
