import { effect } from "@papit/signals";
import { translator, useTranslator } from "@papit/translator";

import "@papchat/app-shell";
import "@papchat/app-header";
import "@papchat/member-list";
import "@papchat/onboarding";
import "@papchat/room-list";
import "@papchat/conversation";
import "@papchat/toaster";
import type { AppHeader } from "@papchat/app-header";
import type { MemberList } from "@papchat/member-list";
import type { Onboarding } from "@papchat/onboarding";
import type { RoomList } from "@papchat/room-list";
import type { Conversation } from "@papchat/conversation";
import type { Toaster } from "@papchat/toaster";
import type { AppShell } from "@papchat/app-shell";

import {
    PALETTE,
    activeRoom,
    dismissToast,
    getRoom,
    openChat,
    rooms,
    selectRoom,
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
import type { Profile, Status } from "@papchat/core";

// languages with a file in asset/translations (sv.json arrives in T6.7)
const LANGUAGES = ["en"];

const shell = document.querySelector<AppShell>("pc-app-shell")!;
const header = document.querySelector<AppHeader>("pc-app-header")!;
const list = document.querySelector<MemberList>("pc-member-list")!;
const onboarding = document.querySelector<Onboarding>("pc-onboarding")!;
const roomList = document.querySelector<RoomList>("pc-room-list")!;
const conversation = document.querySelector<Conversation>("pc-conversation")!;
const toaster = document.querySelector<Toaster>("pc-toaster")!;
const empty = document.querySelector<HTMLElement>(".empty")!;

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
    empty.textContent = useTranslator("app")("empty");
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
    const room = activeRoom() ? getRoom(activeRoom()!) : null;
    conversation.hidden = !room;
    empty.hidden = !!room;
    if (!room) return;

    const profiles: Record<string, Profile> = {};
    const mine = me();
    if (mine) profiles[mine.uid] = mine;
    for (const p of room.participants()) profiles[p.uid] = p;

    conversation.profiles = profiles;
    conversation.me = mine?.uid ?? "";
    conversation.messages = room.messages();
    conversation.typing = room.typing();
    conversation.heading = room.title || room.participants().map(p => p.name).join(", ");
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

conversation.addEventListener("send", (e) => getRoom(activeRoom() ?? "")?.send((e as CustomEvent<{ text: string }>).detail.text));
conversation.addEventListener("typing", () => getRoom(activeRoom() ?? "")?.notifyTyping());

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

list.addEventListener("member-action", (e) =>
{
    const { uid, action } = (e as CustomEvent<{ uid: string; action: string }>).detail;
    if (action === "chat") openChat(uid);
    else log("member-action (wired in later waves)", action, uid);
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
