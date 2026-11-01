import { effect } from "@papit/signals";

import { LIMITS } from "./config";
import { contactOf, contactsOf, contactProfile, forgetContact } from "./contacts";
import { signedBy, uidOfKey } from "./keys";
import { on, peerOf, profileOf, send, sendAll } from "./lobby";
import { log } from "./log";
import { devicesOf, personOf, samePerson } from "./people";
import { callText, closeNotification, pushCall, pushCancel } from "./push";
import { play, ringback, stop as stopRinging } from "./ringtone";
import { watch } from "./stage";
import { directRoom, getRoom, inAnyCall, isRejected, restoreRooms, Room, selectRoom } from "./room";
import { activeRoom, incoming, lobbyStatus, me, prefs, setIncoming, toast } from "./state";
import type { Contact, DeclineReason, IncomingCall, Invite, InviteKind, Profile, Ring, RoomKind } from "./types";

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
    // set when this call rang a closed app: that device still needs telling when it stops
    // the saved devices rung by push, none for someone in the lobby
    devices: Contact[];
};
// rooms being joined from an invite right now, so a repeated invite doesn't join twice
const joining = new Set<string>();

// ---------------------------------------------------------------- public API

/**
 * Opens the 1:1 chat with `uid`: reuses the open one (inviting them again when they left it),
 * else creates a room and invites them. Makes it the `activeRoom`. Null (plus a toast) when it
 * couldn't be created. `quiet` leaves the screen alone: it's for delivering messages in the background.
 */
export async function openChat(uid: string, options: { quiet?: boolean } = {}): Promise<Room | null> {
    const existing = directRoom(uid);
    if (existing)
    {
        if (!existing.participants().some(p => samePerson(p.uid, uid))) existing.invite(uid, "chat");
        if (!options.quiet) selectRoom(existing.id);
        return existing;
    }
    if (!me() || uid === me()?.uid) return null;

    try
    {
        const room = await Room.create("chat", "", { direct: uid });
        if (!room.invite(uid, "chat") && !options.quiet)
        {
            const name = profileOf(uid)?.name;
            toast("warning", name ? `Couldn't reach ${name}` : "Couldn't reach that person");
        }
        if (!options.quiet) selectRoom(room.id);
        return room;
    }
    catch (error)
    {
        log("invites: openChat failed", error);
        if (!options.quiet) toast("error", "Couldn't start the chat");
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
    if (invite.offline) void closeNotification(callTag(roomId));
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
        // in the call even when the mic is refused: you still hear them
        room.joinCall();
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
    if (invite.offline) void closeNotification(callTag(roomId));
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
    const name = nameOf(uid) ?? "that person";
    // not in the lobby: their device can still be woken
    const devices = peerOf(uid) ? [] : contactsOf(uid);
    if (!peerOf(uid) && devices.length === 0)
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
        else target.hangUp();
    };

    selectRoom(room.id);
    if (!await room.start("mic"))
    {
        giveUp(room);
        return null;
    }
    if (kind === "video") await room.start("camera");

    if (devices.length === 0 && !room.invite(uid, kind))
    {
        toast("warning", `Couldn't reach ${name}`);
        giveUp(room);
        return null;
    }

    // whoever is already in the chat hasn't answered yet: only newcomers (or `invite.accept`) count
    const before = new Set(room.participants().map(p => personOf(p.uid)));
    const target = room;
    const call: Outgoing = {
        room,
        // by person: answering on any device counts
        ringing: new Set([personOf(uid)]),
        // the callee declines with `timeout` itself; this covers one that vanished
        timer: setTimeout(() => expire(call), (devices.length > 0 ? LIMITS.ringOfflineMs : LIMITS.ringMs) + 3_000),
        watch: effect(() => {
            const here = target.participants().map(p => personOf(p.uid)).filter(u => !before.has(u));
            if (here.length > 0) setTimeout(() => answered(call, here), 0);
            // hung up while ringing (the chat stays, so there's no `leave` to catch it)
            if (!target.oncall()) setTimeout(() => endCall(call, true), 0);
        }),
        devices,
    };
    outgoing.set(room.id, call);
    ringback();
    room.addEventListener("leave", () => endCall(call, true), { once: true });
    if (devices.length > 0) void ringDevices(call, uid, kind);
    return room;
}

// the ringing UI is already up: the caller hears it while a sleeping server wakes
async function ringDevices(call: Outgoing, uid: string, kind: Extract<RoomKind, "call" | "video">) {
    const room = call.room;
    if (await pushAll(call.devices, room, kind, true)) return;
    if (outgoing.get(room.id) !== call) return;

    toast("warning", `Couldn't reach ${nameOf(uid) ?? "that person"}`);
    call.devices = [];
    call.ringing.delete(personOf(uid));
    finishIfEmpty(call);
}

/** Rings a saved contact into a running call. Nothing follows it: the ring just runs out. */
export async function ringContact(room: Room, uid: string, kind: Extract<RoomKind, "call" | "video">) {
    const devices = contactsOf(uid);
    if (devices.length === 0 || await pushAll(devices, room, kind, false)) return;
    toast("warning", `Couldn't reach ${devices[0].name}`);
}

// true when at least one device took it; a device that's gone for good is forgotten
async function pushAll(devices: Contact[], room: Room, kind: Extract<RoomKind, "call" | "video">, direct: boolean): Promise<boolean> {
    const results = await Promise.all(devices.map(async device => {
        const status = await pushCall(device.token, { id: room.network, password: room.password }, kind, direct);
        log("invites: pushed", device.uid, status);
        if (status === "gone") forgetContact(device.uid);
        return status;
    }));
    return results.includes("sent");
}

/**
 * A call that arrived as a push: `tapped` when the person opened its notification, otherwise an open
 * tab heard about it. It goes through the normal answer flow, or counts as missed when it's over.
 * False when it isn't from who it says.
 */
export async function receiveRing(call: Ring, tapped: boolean): Promise<boolean> {
    const proven = await uidOfKey(call.pub).catch(() => null) === call.from && await signedBy(call.pub, call.sig, callText(call));
    if (!proven)
    {
        log("invites: a push that doesn't prove its caller", call.from);
        return false;
    }

    const name = contactOf(call.from)?.name ?? call.name;
    if (!me() || pending.has(call.id) || getRoom(call.id)?.incall) return true;

    const left = LIMITS.ringOfflineMs - (Date.now() - call.at);
    if (left <= 0)
    {
        toast("info", `Missed call from ${name}`);
        return true;
    }

    // a tap is a choice, an open tab goes by your status
    if (!tapped && (me()?.status === "dnd" || (inAnyCall() && prefs().autoDeclineBusy))) return true;
    ring({
        room: call.id,
        password: call.key,
        kind: call.kind,
        title: "",
        from: call.from,
        members: [],
        offline: true,
        name,
        ...(call.direct ? { direct: true } : {}),
    }, left);
    return true;
}

/** The caller of a pushed call stopped. */
export function cancelRing(roomId: string) {
    missRing(roomId);
}

/** Tells everyone still ringing for `roomId` to stop (caller hung up). */
export function cancelInvite(roomId: string, uids: string[]) {
    const room = getRoom(roomId);
    const id = room?.network ?? roomId;
    for (const uid of uids) sendAll(uid, "invite.cancel", { room: id });
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
    // picked up on another device of yours: nothing was missed
    if ((payload as Record<string, unknown>).elsewhere === true) stopRing(room);
    else missRing(room);
});

on<unknown>("invite.accept", (payload, from) => {
    const id = readId(payload);
    log("invites: accepted", id, "by", from.uid);
    const call = id ? outgoingOf(id) : undefined;
    if (call && from.uid)
    {
        stopOtherDevices(call, from.uid);
        answered(call, [personOf(from.uid)]);
    }
});

on<unknown>("invite.decline", (payload, from) => {
    const room = readId(payload);
    if (!room) return;
    const value = payload as Record<string, unknown>;
    const reason = REASONS.includes(value.reason as DeclineReason) ? value.reason as DeclineReason : "declined";
    const name = from.profile?.name ?? "They";
    log("invites: declined", room, reason, "by", from.uid);

    // every ringing device times out on its own: one answer per person
    if (from.uid && !firstAnswer(room, from.uid)) return;

    const call = outgoingOf(room);
    if (call && from.uid)
    {
        stopOtherDevices(call, from.uid);
        call.ringing.delete(personOf(from.uid));
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

const ANSWER_MEMORY_MS = 10_000;
const answers = new Set<string>();

function firstAnswer(room: string, uid: string): boolean {
    const key = `${room}\n${personOf(uid)}`;
    if (answers.has(key)) return false;
    answers.add(key);
    setTimeout(() => answers.delete(key), ANSWER_MEMORY_MS);
    return true;
}

// one device answered: the person's other devices stop ringing
function stopOtherDevices(call: Outgoing, uid: string) {
    for (const device of devicesOf(uid))
    {
        if (device !== uid) send(device, "invite.cancel", { room: call.room.network, elsewhere: true });
    }
}

const callTag = (roomId: string) => `call:${roomId}`;

function missRing(roomId: string) {
    const invite = pending.get(roomId);
    if (!invite) return;
    stopRing(roomId);
    toast("info", `Missed call from ${callerName(invite)}`);
    log("invites: cancelled", roomId);
}

function callerName(invite: Invite): string {
    return profileOf(invite.from)?.name ?? invite.name ?? "Someone";
}

function callerProfile(invite: Invite): Profile {
    const contact = contactOf(invite.from);
    return profileOf(invite.from) ?? (contact ? contactProfile(contact) : { ...unknownProfile(invite.from), name: callerName(invite) });
}

function ring(invite: Invite, ms: number = LIMITS.ringMs) {
    pending.set(invite.room, { ...invite, at: Date.now() });
    const from = callerProfile(invite);
    const call: IncomingCall = { id: invite.room, from, kind: invite.kind, title: invite.title, at: Date.now() };
    setIncoming(list => [...list.filter(c => c.id !== call.id), call]);
    ringTimers.set(invite.room, setTimeout(() => {
        declineInvite(invite.room, "timeout");
        if (invite.offline) toast("info", `Missed call from ${callerName(invite)}`);
    }, ms));
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

function nameOf(uid: string): string | null {
    return profileOf(uid)?.name ?? contactOf(uid)?.name ?? null;
}

function expire(call: Outgoing) {
    // these are people: a person's uid works for any lookup
    for (const uid of call.ringing)
    {
        toast("info", `${nameOf(uid) ?? "They"} didn't answer`);
    }
    cancelDevice(call);
    call.ringing.clear();
    finishIfEmpty(call);
}

// nobody left to wait for: with nobody in the call either, it's over (a 1:1 chat stays open)
function finishIfEmpty(call: Outgoing) {
    if (call.ringing.size > 0) return;
    const room = call.room;
    const empty = room.kind === "chat"
        ? room.othersInCall().length === 0
        : room.participants().length === 0;
    endCall(call, false);
    if (!empty) return;
    if (room.kind === "chat") room.hangUp();
    else room.leave();
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
    if (cancel && call.ringing.size > 0)
    {
        cancelDevice(call);
        cancelInvite(call.room.id, [...call.ringing]);
    }
}

// a closed app has no lobby to hear `invite.cancel` on
function cancelDevice(call: Outgoing) {
    for (const device of call.devices) pushCancel(device.token, call.room.network);
    call.devices = [];
}

function unknownProfile(uid: string): Profile {
    return { v: 2, uid, key: "", name: "Someone", color: "#6b7280", status: "available" };
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
    const name = callerName(invite);

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
        // the room is gone: the caller stopped before this person got here
        if (invite.offline && !isRejected(error)) toast("info", `Missed call from ${name}`);
        else toast("warning", isRejected(error) ? "The room is full" : `Couldn't join ${name}'s chat`);
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

    // only the lobby knows who really sent it, never the payload
    const from = sender;
    if (!from) return null;

    return {
        room: value.room,
        password: value.password as string | undefined,
        kind: value.kind as InviteKind,
        title: typeof value.title === "string" ? value.title.trim().slice(0, 80) : "",
        from,
        members: Array.isArray(value.members) ? value.members.filter(isId).slice(0, 16) : [],
        ...(value.direct === true ? { direct: true } : {}),
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
