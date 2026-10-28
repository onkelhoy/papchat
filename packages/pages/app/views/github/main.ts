import { effect } from "@papit/signals";
import { translator, useTranslator } from "@papit/translator";

import "@papchat/app-shell";
import "@papchat/app-header";
import "@papchat/member-list";
import "@papchat/onboarding";
import "@papchat/room-list";
import "@papchat/room";
import "@papchat/incoming-call";
import "@papchat/invite-picker";
import "@papchat/toaster";
import type { AppHeader } from "@papchat/app-header";
import type { MemberList } from "@papchat/member-list";
import type { Onboarding } from "@papchat/onboarding";
import type { RoomList } from "@papchat/room-list";
import type { Room as RoomView, CallTile } from "@papchat/room";
import type { IncomingCall as IncomingCard } from "@papchat/incoming-call";
import type { InvitePicker } from "@papchat/invite-picker";
import type { Toaster } from "@papchat/toaster";
import type { AppShell } from "@papchat/app-shell";

import {
    PALETTE,
    acceptInvite,
    activeRoom,
    audioBlocked,
    declineInvite,
    incoming,
    placeCall,
    ringtone,
    dismissToast,
    getRoom,
    openChat,
    rooms,
    selectRoom,
    toast,
    toasts,
    createProfile,
    lobbyStatus,
    log,
    me,
    members,
    prefs,
    setPrefs,
    setStatus,
    startLobby,
} from "@papchat/core";
import type { CaptureName, Profile, Room, Status } from "@papchat/core";

// languages with a file in asset/translations (sv.json arrives in T6.7)
const LANGUAGES = ["en"];

const shell = document.querySelector<AppShell>("pc-app-shell")!;
const header = document.querySelector<AppHeader>("pc-app-header")!;
const list = document.querySelector<MemberList>("pc-member-list")!;
const onboarding = document.querySelector<Onboarding>("pc-onboarding")!;
const roomList = document.querySelector<RoomList>("pc-room-list")!;
const view = document.querySelector<RoomView>("pc-room")!;
const picker = document.querySelector<InvitePicker>("pc-invite-picker")!;
const overlay = document.querySelector<HTMLElement>(".incoming")!;
const toaster = document.querySelector<Toaster>("pc-toaster")!;
const empty = document.querySelector<HTMLElement>(".empty")!;

const t = (key: string, vars?: Record<string, string>) => useTranslator("app")(key, vars);
const canScreen = !!navigator.mediaDevices?.getDisplayMedia;

const current = (): Room | null => activeRoom() ? getRoom(activeRoom()!) : null;

// language: stored choice → browser language → en
function pickLanguage(): string {
    const stored = prefs().language;
    if (LANGUAGES.includes(stored)) return stored;

    const browser = navigator.language.slice(0, 2).toLowerCase();
    return LANGUAGES.includes(browser) ? browser : "en";
}

async function changeLanguage(code: string) {
    if (!LANGUAGES.includes(code)) return;

    await translator.change(code);
    document.documentElement.lang = code;
    header.language = code;
    onboarding.language = code;
    empty.textContent = t("empty");
}

async function boot() {
    for (const id of LANGUAGES) translator.add({ id, url: `/translations/${id}.json` });
    await changeLanguage(pickLanguage());

    shell.sidebaropen = prefs().sidebarOpen;
    onboarding.colors = [...PALETTE];

    if (me())
    {
        startLobby();
    }
    else
    {
        onboarding.name = "";
        onboarding.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        onboarding.open = true;
    }
}

// state → components
effect(() => { header.me = me(); });
effect(() => { header.status = lobbyStatus(); });
effect(() => { list.me = me() ?? undefined; });
effect(() => { list.members = members(); });

effect(() => { roomList.rooms = rooms(); });
effect(() => { roomList.active = activeRoom() ?? ""; });
effect(() => { toaster.toasts = toasts(); });

// the open room: messages, typing and who is who
effect(() =>
{
    const room = current();
    view.hidden = !room;
    empty.hidden = !!room;
    list.canInvite = !!room;
    if (!room) return;

    const profiles: Record<string, Profile> = {};
    const mine = me();
    if (mine) profiles[mine.uid] = mine;
    for (const p of room.participants()) profiles[p.uid] = p;

    view.profiles = profiles;
    view.me = mine?.uid ?? "";
    view.participants = room.participants();
    view.messages = room.messages();
    view.typing = room.typing();
    view.heading = room.title || room.participants().map(p => p.name).join(", ");
});

// the open room: call stage and controls
effect(() =>
{
    const room = current();
    if (!room) return;

    const captures = room.captures();
    view.incall = room.incall;
    view.mic = !!captures.mic;
    view.camera = !!captures.camera;
    view.screen = !!captures.screen;
    view.canscreen = canScreen;
    view.sinkid = prefs().devices.speaker ?? "";
    view.tiles = room.incall ? tilesOf(room) : [];
});

// who is in a call, for the phone icon in the member list
effect(() =>
{
    const uids = new Set<string>();
    for (const summary of rooms())
    {
        const room = getRoom(summary.id);
        if (room?.incall) for (const s of room.streams()) uids.add(s.uid);
    }
    list.incall = [...uids];
});

// one tile per person (camera + mic) plus one per screen share, which starts pinned (PLAN §6.7)
function tilesOf(room: Room): CallTile[] {
    const mine = me();
    const tiles: CallTile[] = [];
    const captures = room.captures();
    const flags = room.flags();

    if (mine)
    {
        tiles.push({ id: mine.uid, profile: mine, video: captures.camera, muted: !captures.mic, self: true });
        if (captures.screen) tiles.push({ id: `${mine.uid}:screen`, profile: mine, video: captures.screen, screen: true, self: true, pinned: true });
    }

    const streams = room.streams();
    for (const p of room.participants())
    {
        const theirs = streams.filter(s => s.uid === p.uid);
        const of = (name: string) => theirs.find(s => s.name === name)?.stream;
        const mic = of("mic");
        tiles.push({ id: p.uid, profile: p, video: of("camera"), audio: mic, muted: flags[p.uid] ? !flags[p.uid].mic : !mic });

        const screen = of("screen");
        if (screen) tiles.push({ id: `${p.uid}:screen`, profile: p, video: screen, screen: true, pinned: true });
    }
    return tiles;
}

// incoming calls: one card each in the overlay, newest at the bottom
const cards = new Map<string, IncomingCard>();
effect(() =>
{
    const calls = incoming();
    for (const [id, card] of cards)
    {
        if (calls.some(c => c.id === id)) continue;
        card.remove();
        cards.delete(id);
    }
    for (const call of calls)
    {
        let card = cards.get(call.id);
        if (!card)
        {
            card = document.createElement("pc-incoming-call") as IncomingCard;
            card.addEventListener("accept", (e) =>
            {
                const { id, video } = (e as CustomEvent<{ id: string; video: boolean }>).detail;
                void acceptInvite(id, video);
            });
            card.addEventListener("decline", (e) => declineInvite((e as CustomEvent<{ id: string }>).detail.id));
            cards.set(call.id, card);
            overlay.append(card);
        }
        card.call = call;
    }
});

// autoplay blocked: a sticky toast whose click unlocks audio
let blockedToast = "";
effect(() =>
{
    if (audioBlocked() && !blockedToast)
    {
        blockedToast = toast("warning", t("enableSound"), {
            action: t("enableSoundAction"),
            duration: 0,
            onAction: () => { blockedToast = ""; void ringtone.unlock(); },
        });
    }
    else if (!audioBlocked() && blockedToast)
    {
        dismissToast(blockedToast);
        blockedToast = "";
    }
});

// unread total in the tab title
effect(() =>
{
    const total = rooms().reduce((sum, r) => sum + r.unread, 0);
    document.title = total > 0 ? `(${total}) papchat` : "papchat";
});

// components → state
roomList.addEventListener("select", (e) => selectRoom((e as CustomEvent<{ id: string }>).detail.id));
roomList.addEventListener("leave", (e) => getRoom((e as CustomEvent<{ id: string }>).detail.id)?.leave());

view.addEventListener("send", (e) => current()?.send((e as CustomEvent<{ text: string }>).detail.text));
view.addEventListener("typing", () => current()?.notifyTyping());

// header Call / Video: a 1:1 chat rings the other person in a new call room; a group starts here
view.addEventListener("call", async (e) =>
{
    const { kind } = (e as CustomEvent<{ kind: "call" | "video" }>).detail;
    const room = current();
    if (!room) return;
    if (room.direct)
    {
        void placeCall(room.direct, kind);
        return;
    }
    if (await room.start("mic") && kind === "video") await room.start("camera");
});

view.addEventListener("toggle", (e) =>
{
    const control = (e as unknown as CustomEvent<{ control?: string }>).detail?.control;
    const room = current();
    if (!room || (control !== "mic" && control !== "camera" && control !== "screen")) return;
    const name = control as CaptureName;
    if (room.captures()[name]) room.stop(name);
    else void room.start(name);
});

// hang up: a call room is left (cancels ringing); in a chat room only the call ends
view.addEventListener("hangup", () =>
{
    const room = current();
    if (!room) return;
    if (room.kind === "call" || room.kind === "video") room.leave();
    else for (const name of Object.keys(room.captures())) room.stop(name);
});

view.addEventListener("invite", () =>
{
    const room = current();
    if (!room) return;
    const here = new Set(room.participants().map(p => p.uid));
    picker.members = members().filter(p => !here.has(p.uid) && p.uid !== me()?.uid);
    picker.open = true;
});
view.addEventListener("devices", () => log("devices (T6.4)"));

picker.addEventListener("invite", (e) =>
{
    const { uids } = (e as CustomEvent<{ uids: string[] }>).detail;
    picker.open = false;
    const room = current();
    if (room) for (const uid of uids) invite(room, uid);
});

// mid-call invites ring (call/video); outside a call the room's own kind is used
function invite(room: Room, uid: string) {
    const kind = room.incall ? (room.captures().camera ? "video" : "call") : room.kind;
    if (!room.invite(uid, kind)) toast("warning", t("inviteFailed", { name: members().find(p => p.uid === uid)?.name ?? "?" }));
}

toaster.addEventListener("action", (e) =>
{
    const { id } = (e as CustomEvent<{ id: string }>).detail;
    toasts().find(t => t.id === id)?.onAction?.();
    dismissToast(id);
});
toaster.addEventListener("dismiss", (e) => dismissToast((e as CustomEvent<{ id: string }>).detail.id));

header.addEventListener("status-change", (e) => setStatus((e as CustomEvent<{ status: Status }>).detail.status));
header.addEventListener("language-change", (e) =>
{
    const { value } = (e as CustomEvent<{ value: string }>).detail;
    setPrefs({ language: value });
    changeLanguage(value);
});
header.addEventListener("open-settings", () => log("open-settings (T6.4)"));
header.addEventListener("go-live", () => log("go-live (T5.4)"));

shell.addEventListener("sidebar-toggle", (e) => setPrefs({ sidebarOpen: (e as CustomEvent<{ open: boolean }>).detail.open }));

// from the sidebar and from the room's People tab (both bubble to document)
document.addEventListener("member-action", (e) =>
{
    const { uid, action } = (e as CustomEvent<{ uid: string; action: string }>).detail;
    if (action === "chat") void openChat(uid);
    else if (action === "call" || action === "video") void placeCall(uid, action);
    else if (action === "invite")
    {
        const room = current();
        if (room) invite(room, uid);
    }
});

onboarding.addEventListener("language-change", (e) =>
{
    const { value } = (e as CustomEvent<{ value: string }>).detail;
    setPrefs({ language: value });
    changeLanguage(value);
});
onboarding.addEventListener("submit", (e) =>
{
    const { name, color, language } = (e as unknown as CustomEvent<{ name: string; color: string; language: string }>).detail;
    setPrefs({ language });
    createProfile(name, color);
    onboarding.open = false;
    startLobby();
});

boot();
