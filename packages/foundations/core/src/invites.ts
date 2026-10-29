import { effect } from "@papit/signals";

import { LIMITS } from "./config";
import { on, peerOf, profileOf, send } from "./lobby";
import { log } from "./log";
import { play, ringback, stop as stopRinging } from "./ringtone";
import { watch } from "./stage";
import { allRooms, directRoom, getRoom, inAnyCall, isRejected, restoreRooms, Room, selectRoom } from "./room";
import { activeRoom, incoming, lobbyStatus, me, prefs, setIncoming, toast } from "./state";
import type { DeclineReason, IncomingCall, Invite, InviteKind, Profile, RoomKind } from "./types";

// Invites over the lobby (PLAN §2.4): `invite`, `invite.accept`, `invite.decline`, `invite.cancel`.
// Chat invites auto-join (toast + unread, no ring). Call/video/stage invites are kept as pending
// for T3.1 to ring; acceptInvite/declineInvite are what its incoming-call UI calls.

export type PendingInvite = Invite & { at: number };

const KINDS: InviteKind[] = ["chat", "call", "video", "stage"];
const REASONS: DeclineReason[] = ["declined", "busy", "dnd", "timeout"];
const ID_MAX = 200;

// room id → invite waiting for an answer (call/video/stage)
const pending = new Map<string, PendingInvite>();
// room id → auto-decline timer of a ringing invite
const ringTimers = new Map<string, ReturnType<typeof setTimeout>>();
// room id → outgoing call still waiting for answers
const outgoing = new Map<string, Outgoing>();

type Outgoing = {
    room: Room;
    ringing: Set<string>;
    timer: ReturnType<typeof setTimeout>;
    watch: () => void;
};
// rooms being joined from an invite right now, so a repeated invite doesn't join twice
const joining = new Set<string>();

// ---------------------------------------------------------------- public API

/**
 * Opens the 1:1 chat with `uid`: reuses the open one (inviting them again when they left it),
 * else creates a room and invites them. Makes it the `activeRoom`. Null (plus a toast) when it
 * couldn't be created.
 */
export async function openChat(uid: string): Promise<Room | null> {
    const existing = directRoom(uid);
    if (existing)
    {
        if (!existing.participants().some(p => p.uid === uid)) existing.invite(uid, "chat");
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
export async function acceptInvite(roomId: string, withVideo = false): Promise<Room | null> {
    const invite = pending.get(roomId);
    if (!invite) return null;
    stopRing(roomId);
    send(invite.from, "invite.accept", { room: invite.room });

    // a stage invite: watch it (stages aren't rooms)
    if (invite.kind === "stage")
    {
        await watch(invite.room);
        return null;
    }

    // a call in the caller's 1:1 while you still hold an older 1:1 with them: theirs wins
    const older = invite.direct ? directRoom(invite.from) : null;
    const room = await joinFromInvite(invite, false);
    if (!room) return null;
    if (older && older !== room) fold(older, room);

    selectRoom(room.id);
    if (invite.kind === "call" || invite.kind === "video")
    {
        await room.start("mic");
        if (invite.kind === "video" && withVideo) await room.start("camera");
    }
    return room;
}

/** Declines a pending invite and tells the inviter why. */
export function declineInvite(roomId: string, reason: DeclineReason = "declined"): boolean {
    const invite = pending.get(roomId);
    if (!invite) return false;
    stopRing(roomId);
    return send(invite.from, "invite.decline", { room: invite.room, reason });
}

/**
 * Calls `uid` in your 1:1 chat with them (created first when there is none, so chat and calls
 * share one conversation): starts mic (and camera), invites them and plays the ringback until
 * they answer. Hanging up or leaving while it rings cancels the invite. Null on failure.
 */
export async function placeCall(uid: string, kind: Extract<RoomKind, "call" | "video"> = "call"): Promise<Room | null> {
    const profile = me();
    if (!profile || uid === profile.uid) return null;
    const name = profileOf(uid)?.name ?? "that person";
    if (!peerOf(uid))
    {
        toast("warning", `Couldn't reach ${name}`);
        return null;
    }

    let room = directRoom(uid);
    const fresh = !room;
    try
    {
        room ??= await Room.create("chat", "", { direct: uid });
    }
    catch (error)
    {
        log("invites: placeCall failed", error);
        toast("error", "Couldn't start the call");
        return null;
    }

    // a new room is only there for this call; an existing chat stays, only the call ends
    const giveUp = (target: Room) => {
        if (fresh) target.leave();
        else hangUp(target);
    };

    selectRoom(room.id);
    if (!await room.start("mic"))
    {
        giveUp(room);
        return null;
    }
    if (kind === "video") await room.start("camera");

    if (!room.invite(uid, kind))
    {
        toast("warning", `Couldn't reach ${name}`);
        giveUp(room);
        return null;
    }

    // whoever is already in the chat hasn't answered yet: only newcomers (or `invite.accept`) count
    const before = new Set(room.participants().map(p => p.uid));
    const target = room;
    const call: Outgoing = {
        room,
        ringing: new Set([uid]),
        // the callee declines with `timeout` itself; this covers one that vanished
        timer: setTimeout(() => expire(call), LIMITS.ringMs + 3_000),
        watch: effect(() => {
            const here = target.participants().map(p => p.uid).filter(u => !before.has(u));
            if (here.length > 0) setTimeout(() => answered(call, here), 0);
            // hung up while ringing (the chat stays, so there's no `leave` to catch it)
            if (Object.keys(target.captures()).length === 0) setTimeout(() => endCall(call, true), 0);
        }),
    };
    outgoing.set(room.id, call);
    ringback();
    room.addEventListener("leave", () => endCall(call, true), { once: true });
    return room;
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
    if (existing && invite.kind === "chat")
    {
        // a 1:1 re-invite only syncs; it isn't news
        if (!invite.direct) existing.bumpUnread();
        return;
    }

    if (invite.kind === "chat")
    {
        void joinChat(invite);
        return;
    }
    // a call in a room you're already in (your 1:1) rings like any other

    const status = me()?.status;
    if (status === "dnd")
    {
        send(invite.from, "invite.decline", { room: invite.room, reason: "dnd" });
        return;
    }
    if (inAnyCall() && prefs().autoDeclineBusy)
    {
        send(invite.from, "invite.decline", { room: invite.room, reason: "busy" });
        return;
    }
    ring(invite);
});

on<unknown>("invite.cancel", (payload) => {
    const room = readId(payload);
    if (!room) return;
    const invite = pending.get(room);
    if (!invite) return;
    stopRing(room);
    const name = profileOf(invite.from)?.name ?? "Someone";
    toast("info", `Missed call from ${name}`);
    log("invites: cancelled", room);
});

on<unknown>("invite.accept", (payload, from) => {
    const id = readId(payload);
    log("invites: accepted", id, "by", from.uid);
    const call = id ? outgoingOf(id) : undefined;
    if (call) answered(call, [from.uid ?? ""]);
});

on<unknown>("invite.decline", (payload, from) => {
    const room = readId(payload);
    if (!room) return;
    const value = payload as Record<string, unknown>;
    const reason = REASONS.includes(value.reason as DeclineReason) ? value.reason as DeclineReason : "declined";
    const name = from.profile?.name ?? "They";
    log("invites: declined", room, reason, "by", from.uid);

    const call = outgoingOf(room);
    if (call && from.uid)
    {
        call.ringing.delete(from.uid);
        finishIfEmpty(call);
    }
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

// ---------------------------------------------------------------- ringing

function ring(invite: Invite) {
    pending.set(invite.room, { ...invite, at: Date.now() });
    const from = profileOf(invite.from) ?? unknownProfile(invite.from);
    const call: IncomingCall = { id: invite.room, from, kind: invite.kind, title: invite.title, at: Date.now() };
    setIncoming(list => [...list.filter(c => c.id !== call.id), call]);
    ringTimers.set(invite.room, setTimeout(() => declineInvite(invite.room, "timeout"), LIMITS.ringMs));
    play(prefs().ringtone, { loop: true });
}

// an invite got an answer (or was cancelled): stop its timer and, with nothing else ringing, the tone
function stopRing(roomId: string) {
    pending.delete(roomId);
    clearTimeout(ringTimers.get(roomId));
    ringTimers.delete(roomId);
    setIncoming(list => list.filter(c => c.id !== roomId));
    if (incoming().length === 0) stopRinging();
}

function outgoingOf(id: string): Outgoing | undefined {
    const room = getRoom(id);
    return room ? outgoing.get(room.id) : undefined;
}

// someone picked up: no more ringback, and they stop counting as ringing
function answered(call: Outgoing, uids: string[]) {
    stopRinging();
    for (const uid of uids) call.ringing.delete(uid);
    if (call.ringing.size === 0) endCall(call, false);
}

function expire(call: Outgoing) {
    for (const uid of call.ringing)
    {
        toast("info", `${profileOf(uid)?.name ?? "They"} didn't answer`);
    }
    call.ringing.clear();
    finishIfEmpty(call);
}

// nobody left to wait for: with nobody in the call either, it's over (a 1:1 chat stays open)
function finishIfEmpty(call: Outgoing) {
    if (call.ringing.size > 0) return;
    const room = call.room;
    const empty = room.kind === "chat"
        ? room.streams().length === 0
        : room.participants().length === 0;
    endCall(call, false);
    if (!empty) return;
    if (room.kind === "chat") hangUp(room);
    else room.leave();
}

// ends your part of a call in a room that stays (a chat): stops every capture
function hangUp(room: Room) {
    for (const name of Object.keys(room.captures())) room.stop(name);
}

// one 1:1 per person: `loser` hands its history (and focus) to `winner`, then is left
function fold(loser: Room, winner: Room) {
    if (loser === winner) return;
    winner.absorb(loser);
    if (activeRoom() === loser.id) selectRoom(winner.id);
    loser.leave();
}

// stops the ringback and watching; `cancel` also tells whoever is still ringing
function endCall(call: Outgoing, cancel: boolean) {
    if (!outgoing.delete(call.room.id)) return;
    clearTimeout(call.timer);
    call.watch();
    stopRinging();
    if (cancel && call.ringing.size > 0) cancelInvite(call.room.id, [...call.ringing]);
}

function unknownProfile(uid: string): Profile {
    return { v: 1, uid, name: "Someone", color: "#6b7280", status: "available" };
}

// ---------------------------------------------------------------- helpers

/**
 * A chat invite. A 1:1 from someone you already have a 1:1 with (both opened it at once, or they
 * lost theirs) keeps the room with the smaller network id: the same answer on both ends. When yours
 * wins they're invited to it (they fold theirs on arrival).
 */
async function joinChat(invite: Invite) {
    const mine = invite.direct ? directRoom(invite.from) : null;
    if (!mine)
    {
        await joinFromInvite(invite, true);
        return;
    }

    if (mine.network < invite.room)
    {
        log("invites: keeping our 1:1", mine.network, "over", invite.room);
        mine.invite(invite.from, "chat");
        return;
    }

    log("invites: switching 1:1", mine.network, "→", invite.room);
    const room = await joinFromInvite(invite, false);
    if (room) fold(mine, room);
}

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
        ...(value.direct === true ? { direct: true } : {}),
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
