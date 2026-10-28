import { effect } from "@papit/signals";

import { on, profileOf, send } from "./lobby";
import { log } from "./log";
import { allRooms, directRoom, getRoom, isRejected, restoreRooms, Room, selectRoom } from "./room";
import { lobbyStatus, me, toast } from "./state";
import type { DeclineReason, Invite, InviteKind } from "./types";

// Invites over the lobby (PLAN §2.4): `invite`, `invite.accept`, `invite.decline`, `invite.cancel`.
// Chat invites auto-join (toast + unread, no ring). Call/video/stage invites are kept as pending
// for T3.1 to ring; acceptInvite/declineInvite are what its incoming-call UI calls.

export type PendingInvite = Invite & { at: number };

const KINDS: InviteKind[] = ["chat", "call", "video", "stage"];
const REASONS: DeclineReason[] = ["declined", "busy", "dnd", "timeout"];
const ID_MAX = 200;

// room id → invite waiting for an answer (call/video/stage)
const pending = new Map<string, PendingInvite>();
// rooms being joined from an invite right now, so a repeated invite doesn't join twice
const joining = new Set<string>();

// ---------------------------------------------------------------- public API

/**
 * Opens the 1:1 chat with `uid`: reuses the open one, else creates a room and invites them.
 * Makes it the `activeRoom`. Null (plus a toast) when it couldn't be created.
 */
export async function openChat(uid: string): Promise<Room | null> {
    const existing = directRoom(uid);
    if (existing)
    {
        selectRoom(existing.id);
        return existing;
    }
    if (!me() || uid === me()?.uid) return null;

    try
    {
        const room = await Room.create("chat", "", { direct: uid });
        if (!room.invite(uid, "chat"))
        {
            const name = profileOf(uid)?.name;
            toast("warning", name ? `Couldn't reach ${name}` : "Couldn't reach that person");
        }
        selectRoom(room.id);
        return room;
    }
    catch (error)
    {
        log("invites: openChat failed", error);
        toast("error", "Couldn't start the chat");
        return null;
    }
}

/** Invites `uid` to a room you're in (by room id). False when not reachable or not in that room. */
export function inviteTo(roomId: string, uid: string, kind?: InviteKind): boolean {
    const room = getRoom(roomId);
    return room ? room.invite(uid, kind ?? room.kind) : false;
}

/** Invites waiting for an answer (call/video/stage), oldest first. */
export function pendingInvites(): PendingInvite[] {
    return [...pending.values()].sort((a, b) => a.at - b.at);
}

/**
 * Accepts a pending invite: tells the inviter (`invite.accept`) and joins the room.
 * T3.1 starts mic/camera after this resolves.
 */
export async function acceptInvite(roomId: string): Promise<Room | null> {
    const invite = pending.get(roomId);
    if (!invite) return null;
    pending.delete(roomId);
    send(invite.from, "invite.accept", { room: invite.room });
    return joinFromInvite(invite, false);
}

/** Declines a pending invite and tells the inviter why. */
export function declineInvite(roomId: string, reason: DeclineReason = "declined"): boolean {
    const invite = pending.get(roomId);
    if (!invite) return false;
    pending.delete(roomId);
    return send(invite.from, "invite.decline", { room: invite.room, reason });
}

/** Tells everyone still ringing for `roomId` to stop (caller hung up). */
export function cancelInvite(roomId: string, uids: string[]) {
    const room = getRoom(roomId);
    const id = room?.network ?? roomId;
    for (const uid of uids) send(uid, "invite.cancel", { room: id });
}

// ---------------------------------------------------------------- lobby handlers

on<unknown>("invite", (payload, from) => {
    const invite = readInvite(payload, from.uid);
    if (!invite)
    {
        log("invites: malformed invite", payload);
        return;
    }
    log("invites: invite", invite.kind, invite.room, "from", invite.from);

    // a room we're in was recreated after its network vanished: follow it
    if (invite.replaces)
    {
        const room = allRooms().find(r => r.network === invite.replaces);
        if (room) void room.adopt(invite);
        return;
    }

    const existing = getRoom(invite.room);
    if (existing)
    {
        if (invite.kind === "chat") existing.bumpUnread();
        return;
    }

    if (invite.kind === "chat")
    {
        void joinFromInvite(invite, true);
        return;
    }

    // T3.1: ring here (incoming signal, ringtone, timeout / dnd / busy auto-decline)
    pending.set(invite.room, { ...invite, at: Date.now() });
});

on<unknown>("invite.cancel", (payload) => {
    const room = readId(payload);
    if (!room) return;
    // T3.1: stop ringing and drop the incoming entry
    if (pending.delete(room)) log("invites: cancelled", room);
});

on<unknown>("invite.accept", (payload, from) => {
    // T3.1: stop the ringback once someone accepts
    log("invites: accepted", readId(payload), "by", from.uid);
});

on<unknown>("invite.decline", (payload, from) => {
    const room = readId(payload);
    if (!room) return;
    const value = payload as Record<string, unknown>;
    const reason = REASONS.includes(value.reason as DeclineReason) ? value.reason as DeclineReason : "declined";
    const name = from.profile?.name ?? "They";
    log("invites: declined", room, reason, "by", from.uid);

    // T3.1: close an empty call room once everyone declined
    const text = {
        declined: `${name} declined`,
        busy: `${name} is busy`,
        dnd: `${name} doesn't want to be disturbed`,
        timeout: `${name} didn't answer`,
    }[reason];
    toast("info", text);
});

// rejoin this tab's rooms once the lobby is up (the lobby is needed for re-invites after a recreate)
let restored = false;
effect(() => {
    if (restored || lobbyStatus() !== "connected") return;
    restored = true;
    // outside the effect run: joining writes signals
    setTimeout(() => void restoreRooms(), 0);
});

// ---------------------------------------------------------------- helpers

async function joinFromInvite(invite: Invite, announce: boolean): Promise<Room | null> {
    if (joining.has(invite.room)) return null;
    joining.add(invite.room);
    const name = profileOf(invite.from)?.name ?? "Someone";

    try
    {
        const unread = invite.kind === "chat" ? 1 : 0;
        const room = await Room.join(invite.room, invite.password ?? "", invite.kind, { unread });
        if (announce)
        {
            toast("info", room.direct ? `${name} started a chat` : `${name} added you to a chat`, {
                action: "Open",
                onAction: () => selectRoom(room.id),
            });
        }
        return room;
    }
    catch (error)
    {
        log("invites: join failed", invite.room, error);
        toast("warning", isRejected(error) ? "The room is full" : `Couldn't join ${name}'s chat`);
        return null;
    }
    finally
    {
        joining.delete(invite.room);
    }
}

function readInvite(payload: unknown, sender: string | null): Invite | null {
    if (typeof payload !== "object" || payload === null) return null;
    const value = payload as Record<string, unknown>;
    if (!isId(value.room)) return null;
    if (!KINDS.includes(value.kind as InviteKind)) return null;
    if (value.password !== undefined && typeof value.password !== "string") return null;

    // the lobby knows who really sent it; fall back to the payload only when it doesn't (yet)
    const from = sender ?? (isId(value.from) ? value.from : null);
    if (!from) return null;

    return {
        room: value.room,
        password: value.password as string | undefined,
        kind: value.kind as InviteKind,
        title: typeof value.title === "string" ? value.title.trim().slice(0, 80) : "",
        from,
        members: Array.isArray(value.members) ? value.members.filter(isId).slice(0, 16) : [],
        ...(isId(value.replaces) ? { replaces: value.replaces } : {}),
    };
}

function readId(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const room = (payload as Record<string, unknown>).room;
    return isId(room) ? room : null;
}

function isId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
}
