import { effect, signal } from "@papit/signals";
import { translator, useTranslator } from "@papit/translator";

import "@papchat/app-shell";
import "@papchat/app-header";
import "@papchat/member-list";
import "@papchat/onboarding";
import "@papchat/room-list";
import "@papchat/room";
import "@papchat/incoming-call";
import "@papchat/invite-picker";
import "@papchat/settings";
import "@papchat/link-device";
import "@papchat/accounts";
import "@papchat/logs";
import "@papchat/toaster";
import type { AppHeader } from "@papchat/app-header";
import type { MemberList } from "@papchat/member-list";
import type { Onboarding } from "@papchat/onboarding";
import type { RoomList } from "@papchat/room-list";
import type { Room as RoomView, CallTile } from "@papchat/room";
import type { IncomingCall as IncomingCard } from "@papchat/incoming-call";
import type { InvitePicker } from "@papchat/invite-picker";
import type { Settings } from "@papchat/settings";
import type { LinkDevice } from "@papchat/link-device";
import type { Accounts } from "@papchat/accounts";
import type { Logs } from "@papchat/logs";
import type { Toaster } from "@papchat/toaster";

import {
    PALETTE,
    acceptInvite,
    activeRoom,
    currentStage,
    goLive,
    leaveStage,
    stages,
    watch,
    audioBlocked,
    addLinkedContact,
    contactLink,
    contactOf,
    contactProfile,
    contacts,
    denoise,
    disablePush,
    logOut,
    logLines,
    logging,
    setLogging,
    openAccount,
    removeAccount,
    savedAccounts,
    enablePush,
    networkHealth,
    forgetContact,
    peerOf,
    pushState,
    pushToken,
    refreshPush,
    releaseDenoise,
    buzzed,
    constraints,
    declineInvite,
    devices,
    calling,
    incoming,
    ringingProfile,
    listDevices,
    listNetworks,
    placeCall,
    requestNotifications,
    canNotify,
    openOfflineChat,
    askNotifications,
    ringContact,
    ringtone,
    sinkSupported,
    startNotify,
    updateProfile,
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
    network,
    prefs,
    separated,
    setNetwork,
    setPrefs,
    setStatus,
    startIdentity,
    startLobby,
    switchNetwork,
    unlockNetwork,
    GIPHY_KEY,
    GLOBAL_ID,
    acceptLink,
    cancelLink,
    joinLink,
    linkedDevices,
    linking,
    removeDevice,
    samePerson,
    startAccount,
    startLink,
    startSync,
    conversations,
    deleteAllConversations,
    deleteConversation,
    devicesOf,
    loadOlderViewing,
    memberProfile,
    openConversation,
    sendSaved,
    startHistory,
    titleOf,
    viewing,
    globalAuthors,
    globalMessages,
    globalOpen,
    globalUnseen,
    muted,
    postGlobal,
    setGlobalOpen,
    toggleMute,
    callLink,
    cancelRing,
    inAnyCall,
    joinSharedCall,
    networkLink,
    readShareLink,
    receiveRing,
    sameNetwork,
} from "@papchat/core";
import type { CaptureName, Gif, GlobalPost, Network, Prefs, Profile, Ring, Room, RoomSummary, ShareLink, Stage, Status } from "@papchat/core";

// languages with a file in asset/translations
const LANGUAGES = ["en", "sv"];

const header = document.querySelector<AppHeader>("pc-app-header")!;
const list = document.querySelector<MemberList>("pc-member-list")!;
const onboarding = document.querySelector<Onboarding>("pc-onboarding")!;
const roomList = document.querySelector<RoomList>("pc-room-list")!;
const view = document.querySelector<RoomView>("pc-room")!;
const picker = document.querySelector<InvitePicker>("pc-invite-picker")!;
const overlay = document.querySelector<HTMLElement>(".incoming")!;
const settings = document.querySelector<Settings>("pc-settings")!;
const linker = document.querySelector<LinkDevice>("pc-link-device")!;
const accounts = document.querySelector<Accounts>("pc-accounts")!;
const logsView = document.querySelector<Logs>("pc-logs")!;
const logsButton = document.querySelector<HTMLButtonElement>(".logs-open")!;
const mainArea = document.querySelector<HTMLElement>(".main")!;
const toaster = document.querySelector<Toaster>("pc-toaster")!;
const empty = document.querySelector<HTMLElement>(".empty")!;
const shell = document.querySelector<HTMLElement & { sidebaropen: boolean }>("pc-app-shell")!;

// a collapsed sidebar shows avatars only (the drawer on phones is either open or out of sight)
function syncCompact() {
    const compact = !shell.sidebaropen;
    roomList.compact = compact;
    list.compact = compact;
}
shell.addEventListener("sidebar-toggle", syncCompact);
customElements.whenDefined("pc-app-shell").then(syncCompact);

// the deploy writes version.json next to the version log; running locally there's no version to show
fetch("version.json", { cache: "no-cache" })
    .then(response => response.json())
    .then(({ version }: { version: string }) => {
        const link = document.querySelector<HTMLAnchorElement>(".version")!;
        log("version", version);
        link.textContent = version;
        link.href = `version#${version}`;
        link.hidden = false;
    })
    .catch(() => {});

const t = (key: string, vars?: Record<string, string>) => useTranslator("app")(key, vars);

// pap-icon fetches its file per icon and can render before the fetch lands, leaving the icon empty
// (papit finding #13): load the sprites once into its shared registry, then re-name any icon that
// rendered empty so it picks them up. Icons created later find them straight away.
const ICON_FILES = ["/icons/sun.svg", "/icons/moon.svg", "/icons/computer.svg"];

async function preloadIcons() {
    await customElements.whenDefined("pap-icon");
    const registry = (customElements.get("pap-icon") as unknown as { icons?: Map<string, string> }).icons;
    if (!registry) return;

    const parser = new DOMParser();
    await Promise.all(ICON_FILES.map(async url =>
    {
        try
        {
            const res = await fetch(url);
            if (!res.ok) return;
            const svg = parser.parseFromString(await res.text(), "image/svg+xml").querySelector("svg");
            if (!svg) return;

            // the same markup pap-icon stores itself: a <symbol> becomes an <svg part="svg">
            const add = (element: Element, names: string[]) =>
            {
                element.setAttribute("part", "svg");
                element.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                const markup = element.outerHTML.replace(/^<symbol/, "<svg").replace(/symbol>$/, "svg>");
                for (const name of names) if (name && !registry.has(name)) registry.set(name, markup);
            };
            const symbols = svg.querySelectorAll("symbol");
            if (symbols.length > 0) symbols.forEach(symbol => add(symbol, [symbol.id]));
            else add(svg, [url.split("/").pop()!.replace(/\.svg$/, ""), svg.id]);
        }
        catch (error)
        {
            console.warn("[papchat] icons: could not load", url, error);
        }
    }));
    refreshIcons(document);
}

function refreshIcons(root: Document | ShadowRoot) {
    for (const el of root.querySelectorAll("*"))
    {
        if (el.localName === "pap-icon")
        {
            const icon = el as HTMLElement & { name?: string };
            const name = icon.name;
            if (name && !icon.shadowRoot?.querySelector("svg"))
            {
                icon.name = "";
                icon.name = name;
            }
        }
        if (el.shadowRoot) refreshIcons(el.shadowRoot);
    }
}

void preloadIcons();
const canScreen = !!navigator.mediaDevices?.getDisplayMedia;

const current = (): Room | null => activeRoom() ? getRoom(activeRoom()!) : null;

// the stage (presented or watched) takes the main area instead of a room until a room is picked
const [stageView, setStageView] = signal(false);
const shownStage = (): Stage | null => stageView() ? currentStage() : null;
// something else than a room fills the main area
const elsewhere = () => !!shownStage() || globalOpen() || !!viewing();

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
    settings.language = code;
    onboarding.language = code;
    empty.textContent = t("empty");
    logsButton.textContent = t("logs");
    setLanguage(code);
    settings.shortcuts = [
        { keys: "M", label: t("shortcutMic") },
        { keys: "V", label: t("shortcutCamera") },
        { keys: "S", label: t("shortcutScreen") },
        { keys: "Esc", label: t("shortcutClose") },
    ];
}

// next to the page, so its scope is the GitHub Pages subpath. Calls and notifications are the only
// thing it's for: without it the app works as before
async function registerWorker() {
    if (!("serviceWorker" in navigator)) return;
    try
    {
        await navigator.serviceWorker.register("sw.js", { scope: "./" });
    }
    catch (error)
    {
        log("worker: not registered", error);
    }
}

async function boot() {
    log("browser", navigator.userAgent);
    void registerWorker();
    for (const id of LANGUAGES) translator.add({ id, url: `/translations/${id}.json` });
    await changeLanguage(pickLanguage());

    try
    {
        await startIdentity();
    }
    catch (error)
    {
        log("identity: no device key", error);
        toast("error", t("identityFailed"));
        return;
    }

    settings.sinkSupported = sinkSupported;
    void startHistory();
    await startAccount();
    startSync();
    startNotify();
    askNotifications(() => toast("info", t("notificationsAsk"), {
        action: t("notificationsAllow"),
        duration: 0,
        onAction: async () => {
            if (!await requestNotifications()) toast("warning", t("notificationsDenied"));
        },
    }), () => toast("info", t("notificationsInstall"), { duration: 0 }));
    void (canNotify() ? enablePush() : refreshPush());
    void ringtone.loadTones();
    void ringtone.loadDialtones();
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
    receiveLink();
}

// invite links: read once and taken out of the address bar, so a reload doesn't follow them again
let waitingCall: Extract<ShareLink, { kind: "call" }> | null = null;
// the link that's waiting for someone to log in, to follow from whichever account opens
let waitingHash = "";

type JoinLink = Exclude<ShareLink, { kind: "contact" | "ring" | "link" }>;

function receiveLink() {
    const hash = location.hash;
    const link = readShareLink(hash);
    if (!link) return;
    history.replaceState(null, "", location.pathname + location.search);

    if (link === "expired" || link === "invalid")
    {
        toast("warning", t(link === "expired" ? "linkExpired" : "linkInvalid"));
        return;
    }
    if (link.kind === "contact")
    {
        const added = addLinkedContact(link.contact);
        toast("info", t(added ? "contactSaved" : "contactKnown", { name: link.contact.name }));
        return;
    }
    if (link.kind === "ring")
    {
        void takeRing(link.ring, true);
        return;
    }
    if (link.kind === "link")
    {
        // no profile needed: a new device becomes whoever it links to
        linker.open = true;
        void joinLink(link.network, link.key);
        return;
    }
    if (me())
    {
        openLink(link, hash);
        return;
    }
    onboarding.joining = link.network;
    waitingHash = hash;
    waitingCall = link.kind === "call" ? link : null;
}
window.addEventListener("hashchange", receiveLink);

// a notification: opened (the link above, or a message when a tab was already open), or an open tab
// hearing the push
async function takeRing(ring: Ring, tapped: boolean) {
    if (!await receiveRing(ring, tapped) && tapped) toast("warning", t("linkInvalid"));
}

navigator.serviceWorker?.addEventListener("message", (e) =>
{
    const { type, hash, id, tapped } = e.data as { type?: string; hash?: string; id?: string; tapped?: boolean };
    if (type === "cancel" && id) cancelRing(id);
    if (type !== "ring" || !hash) return;
    const link = readShareLink(hash);
    if (link && typeof link === "object" && link.kind === "ring") void takeRing(link.ring, !!tapped);
});

function openLink(link: JoinLink, hash: string) {
    if (link.kind === "network" && sameNetwork(link.network, network()))
    {
        toast("info", t("linkHere"));
        return;
    }
    if (!inAnyCall() && !currentStage())
    {
        followLink(link, hash);
        return;
    }
    toast("info", t("linkConfirm"), { action: t("linkConfirmAction"), duration: 0, onAction: () => followLink(link, hash) });
}

function followLink(link: JoinLink, hash: string) {
    if (link.kind === "network")
    {
        void moveTo(link.network);
    }
    else if (sameNetwork(link.network, network()))
    {
        void joinSharedCall(link.room, link.password);
    }
    else
    {
        // moving reloads the page: the hash goes back, so the reload joins the call from the right network
        history.replaceState(null, "", hash);
        switchNetwork(link.network);
    }
}

// linking a device: settings or onboarding open it, this device shows its code straight away
function openLinker() {
    linker.notice = "";
    linker.open = true;
    void startLink();
}

// a code read by the camera, or pasted: only this site's device links count
function takeLinkText(text: string) {
    let url: URL | null = null;
    try
    {
        url = new URL(text);
    }
    catch { /* not a URL */ }

    const link = url && url.origin === location.origin && url.pathname === location.pathname ? readShareLink(url.hash) : null;
    if (link === "expired")
    {
        linker.notice = "expired";
        return;
    }
    if (!link || link === "invalid" || link.kind !== "link")
    {
        linker.notice = "invalid";
        return;
    }
    linker.notice = "";
    void joinLink(link.network, link.key);
}

linker.addEventListener("retry", () => void startLink());
linker.addEventListener("accept", acceptLink);
linker.addEventListener("close", cancelLink);
linker.addEventListener("link-text", (e) => takeLinkText((e as CustomEvent<{ text: string }>).detail.text));
effect(() => { linker.state = linking(); });
// a new device that just linked became someone
effect(() => { if (me()) onboarding.open = false; });

// the password for a network we're separated from moves the group, with no reload
async function moveTo(next: Network | null) {
    if (!await unlockNetwork(next)) switchNetwork(next);
}

// state → components
effect(() => { header.me = me(); });
effect(() => { header.status = lobbyStatus(); });
effect(() => { header.separated = separated() !== null; });
effect(() => { list.me = me() ?? undefined; });
effect(() => { list.members = members(); });
effect(() => { list.stages = stages(); });
effect(() =>
{
    // a person with two saved devices is one row, and none when any device of theirs is here
    const here = members();
    const seen: string[] = [];
    list.contacts = contacts().filter(c =>
    {
        if (here.some(p => samePerson(p.uid, c.uid)) || seen.some(uid => samePerson(uid, c.uid))) return false;
        seen.push(c.uid);
        return true;
    }).map(contactProfile);
});
effect(() => { header.live = !!currentStage()?.mine; });

effect(() => { list.muted = muted(); });

// global chat is always first, then the stage you're on with a Live badge, then the rooms
const [language, setLanguage] = signal("");
effect(() =>
{
    language();
    const stage = currentStage();
    const fixed: RoomSummary[] = [{ id: GLOBAL_ID, kind: "global", title: t("globalChat"), participants: [], unread: 0, incall: false, live: false, dot: globalUnseen() }];
    if (stage) fixed.push({ id: stage.id, kind: "stage", title: stage.title, participants: [stage.presenter], unread: 0, incall: false, live: true });

    // saved conversations with no room right now come last, latest first
    const live = rooms();
    // read from the room: a summary keeps the id from its last update, and a stale one shows a second row
    const open = new Set(live.map(r => getRoom(r.id)?.conversationId ?? r.conversation));
    const saved = conversations()
        .filter(c => !open.has(c.id))
        .map((c): RoomSummary => ({ id: c.id, kind: "chat", title: c.title, participants: c.members.map(memberProfile), unread: 0, incall: false, live: false, saved: true }));
    roomList.rooms = [...fixed, ...live, ...saved];
});
effect(() => { roomList.active = globalOpen() ? GLOBAL_ID : viewing()?.conversation.id ?? shownStage()?.id ?? activeRoom() ?? ""; });
effect(() => { toaster.toasts = toasts(); });

// the open room: messages, typing and who is who
effect(() =>
{
    if (elsewhere()) return;
    const room = current();
    view.hidden = !room;
    empty.hidden = !!room;
    list.canInvite = !!room;
    if (!room) return;

    // people who have left can still have messages in the history
    const profiles: Record<string, Profile> = {};
    const mine = me();
    const saved = conversations().find(c => c.id === room.conversationId);
    for (const member of saved?.members ?? []) addProfile(profiles, memberProfile(member));
    for (const p of room.participants()) addProfile(profiles, p);
    if (mine) profiles[mine.uid] = mine;

    view.profiles = profiles;
    view.me = mine?.uid ?? "";
    view.participants = room.participants();
    view.messages = room.messages();
    view.typing = room.typing();
    view.files = room.files();
    view.heading = room.title || room.participants().map(p => p.name).join(", ") || (saved ? titleOf(saved) : "");
    view.canbuzz = !!room.direct;
    view.nocall = false;
    view.textonly = false;
});

// the open room: call stage and controls
effect(() =>
{
    if (elsewhere()) return;
    const room = current();
    if (!room) return;

    const captures = room.captures();
    view.viewer = false;
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
        if (room?.incall) for (const uid of room.othersInCall()) uids.add(uid);
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
    const incall = new Set(room.othersInCall());
    for (const p of room.participants())
    {
        if (!incall.has(p.uid)) continue;
        const theirs = streams.filter(s => s.uid === p.uid);
        const of = (name: string) => theirs.find(s => s.name === name)?.stream;
        const mic = of("mic");
        tiles.push({ id: p.uid, profile: p, video: of("camera"), audio: mic, muted: flags[p.uid] ? !flags[p.uid].mic : !mic });

        const screen = of("screen");
        if (screen) tiles.push({ id: `${p.uid}:screen`, profile: p, video: screen, screen: true, pinned: true });
    }

    for (const uid of calling()[room.id] ?? [])
    {
        if (![...incall].some(other => samePerson(other, uid))) tiles.push({ id: `ringing:${uid}`, profile: ringingProfile(uid), ringing: true });
    }
    return tiles;
}

// a new stage (going live, watching) opens; picking a room leaves the stage running in the background
let lastStage: Stage | null = null;
effect(() =>
{
    const stage = currentStage();
    if (stage === lastStage) return;
    lastStage = stage;
    if (stage) showStage();
    else setStageView(false);
});
effect(() => { if (activeRoom()) setStageView(false); });
effect(() => { if (activeRoom() || stageView()) setTimeout(() => setGlobalOpen(false), 0); });

function showStage() {
    selectRoom(null);
    setGlobalOpen(false);
    setStageView(true);
}

// a person's messages can come from any of their devices
function addProfile(profiles: Record<string, Profile>, profile: Profile) {
    for (const uid of devicesOf(profile.uid)) profiles[uid] = profile;
}

// a saved conversation with no room: its history, and what you write waits until someone's back
effect(() =>
{
    const saved = viewing();
    if (!saved || shownStage() || globalOpen()) return;

    view.hidden = false;
    empty.hidden = true;
    list.canInvite = false;

    const mine = me();
    const profiles: Record<string, Profile> = {};
    for (const member of saved.conversation.members) addProfile(profiles, memberProfile(member));
    if (mine) profiles[mine.uid] = mine;

    view.profiles = profiles;
    view.me = mine?.uid ?? "";
    view.participants = [];
    view.messages = saved.messages;
    view.typing = [];
    view.files = [];
    view.heading = titleOf(saved.conversation);
    view.canbuzz = false;
    view.nocall = !saved.conversation.direct;
    view.textonly = false;
    view.incall = false;
    view.viewer = false;
    view.tiles = [];
});

function showGlobal() {
    selectRoom(null);
    setStageView(false);
    setGlobalOpen(true);
}

// global chat in the room view: everyone in the network, text only, no calls
effect(() =>
{
    if (!globalOpen()) return;
    language();

    view.hidden = false;
    empty.hidden = true;
    list.canInvite = false;

    const mine = me();
    const profiles: Record<string, Profile> = { ...globalAuthors() };
    for (const p of members()) profiles[p.uid] = p;
    if (mine) profiles[mine.uid] = mine;

    view.profiles = profiles;
    view.me = mine?.uid ?? "";
    view.participants = [];
    view.messages = globalMessages();
    view.typing = [];
    view.files = [];
    view.heading = t("globalChat");
    view.canbuzz = false;
    view.nocall = true;
    view.textonly = true;
    view.incall = false;
    view.viewer = false;
    view.tiles = [];
});

// the stage in the room view: presenter gets capture controls, viewers the presenter's tile and chat
effect(() =>
{
    const stage = shownStage();
    if (!stage) return;

    view.hidden = false;
    empty.hidden = true;
    list.canInvite = stage.mine;

    const mine = me();
    const profiles: Record<string, Profile> = {};
    for (const p of members()) profiles[p.uid] = p;
    profiles[stage.presenter.uid] = stage.presenter;
    if (mine) profiles[mine.uid] = mine;

    view.profiles = profiles;
    view.me = mine?.uid ?? "";
    view.participants = [];
    view.messages = stage.messages();
    view.typing = [];
    view.files = [];
    view.heading = stage.title;
    view.canbuzz = false;
    view.nocall = false;
    view.textonly = false;
    view.incall = true;
    view.viewer = !stage.mine;

    const captures = stage.captures();
    view.mic = !!captures.mic;
    view.camera = !!captures.camera;
    view.screen = !!captures.screen;
    view.canscreen = canScreen;
    view.sinkid = prefs().devices.speaker ?? "";
    view.tiles = stageTiles(stage);
});

// the presenter's camera + mic tile, plus their screen pinned
function stageTiles(stage: Stage): CallTile[] {
    const presenter = stage.presenter;
    if (stage.mine)
    {
        const captures = stage.captures();
        const tiles: CallTile[] = [{ id: presenter.uid, profile: presenter, video: captures.camera, muted: !captures.mic, self: true }];
        if (captures.screen) tiles.push({ id: `${presenter.uid}:screen`, profile: presenter, video: captures.screen, screen: true, self: true, pinned: true });
        return tiles;
    }

    const streams = stage.streams();
    const tiles: CallTile[] = [{ id: presenter.uid, profile: presenter, video: streams.camera, audio: streams.mic, muted: !streams.mic }];
    if (streams.screen) tiles.push({ id: `${presenter.uid}:screen`, profile: presenter, video: streams.screen, screen: true, pinned: true });
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

// settings dialog
effect(() => { settings.profile = me() ?? undefined; });
effect(() => { settings.prefs = prefs(); });
effect(() => { settings.network = network()?.name ?? ""; });
effect(() => { settings.separated = separated() !== null; });
effect(() => { settings.health = networkHealth() ?? undefined; });
effect(() => { settings.invitelink = networkLink(network()); });
effect(() => { settings.pushstate = pushState(); });
effect(() => { settings.linked = linkedDevices(); });
effect(() =>
{
    const profile = me();
    const token = pushToken();
    settings.contactlink = profile && token ? contactLink({ uid: profile.uid, name: profile.name, color: profile.color, token }) : "";
});
effect(() => { header.invitelink = me() ? networkLink(network()) : ""; });
effect(() => { header.network = network()?.name ?? ""; });
effect(() => { settings.tones = ringtone.tones().map(({ id, label }) => ({ id, label })); });
// the files first (the first is the default), then the built-in beep they fall back to
effect(() => { settings.dialtones = [...ringtone.dialtones().map(({ id, label }) => ({ id, label })), { id: ringtone.SYNTH_DIAL, label: t("dialSynth") }]; });
effect(() => { settings.devices = devices(); });
effect(() => { settings.playing = ringtone.previewing(); });

async function refreshNetworks() {
    settings.networks = await listNetworks();
}

function openSettings() {
    void listDevices();
    void refreshNetworks();
    settings.open = true;
}

// camera / mic test streams for the Devices tab, stopped on close or when a new one starts
const tests: Partial<Record<"camera" | "mic", MediaStream>> = {};
function stopTest(kind: "camera" | "mic") {
    const stream = tests[kind];
    stream?.getTracks().forEach(t => t.stop());
    if (stream) releaseDenoise(stream);
    delete tests[kind];
    if (kind === "camera") settings.camerastream = undefined;
    else settings.micstream = undefined;
}
async function startTest(kind: "camera" | "mic") {
    stopTest(kind);
    try
    {
        const raw = await navigator.mediaDevices.getUserMedia(constraints(kind));
        // the mic test runs through the chosen noise reduction, so its meter shows what others hear
        const stream = kind === "mic" ? await denoise(raw, prefs().noiseReduction) : raw;
        if (!settings.open)
        {
            stream.getTracks().forEach(t => t.stop());
            releaseDenoise(stream);
            return;
        }
        tests[kind] = stream;
        if (kind === "camera") settings.camerastream = stream;
        else settings.micstream = stream;
        void listDevices();
    }
    catch (error)
    {
        log("settings: test failed", kind, error);
        toast("warning", t(kind === "camera" ? "cameraFailed" : "micFailed"));
    }
}

// a changed mic/camera applies to a running call: restart that capture with the new device
function restartCaptures(before: Prefs["devices"], after: Prefs["devices"]) {
    const target: Room | Stage | null = shownStage() ?? current();
    for (const name of ["mic", "camera"] as const)
    {
        if (!target || before[name] === after[name] || !target.captures()[name]) continue;
        target.stop(name);
        void target.start(name);
    }
    if (tests.camera && before.camera !== after.camera) void startTest("camera");
    if (tests.mic && before.mic !== after.mic) void startTest("mic");
}

// a new noise reduction level applies to a running mic (call or stage) and to the mic test
function restartMic() {
    const target: Room | Stage | null = shownStage() ?? current();
    if (target?.captures().mic)
    {
        target.stop("mic");
        void target.start("mic");
    }
    if (tests.mic) void startTest("mic");
}

settings.addEventListener("profile-change", (e) => updateProfile((e as CustomEvent<{ partial: Partial<Pick<Profile, "name" | "color" | "status">> }>).detail.partial));
settings.addEventListener("prefs-change", (e) =>
{
    const { partial } = (e as CustomEvent<{ partial: Partial<Prefs> }>).detail;
    const before = prefs().devices;
    const noise = prefs().noiseReduction;
    setPrefs(partial);
    if (partial.devices) restartCaptures(before, prefs().devices);
    if (partial.noiseReduction && partial.noiseReduction !== noise) restartMic();
});
settings.addEventListener("networks-refresh", () => void refreshNetworks());
settings.addEventListener("link-device", openLinker);
settings.addEventListener("remove-device", (e) => void removeDevice((e as CustomEvent<{ uid: string }>).detail.uid));
settings.addEventListener("network-change", (e) => void moveTo((e as CustomEvent<{ network: Network | null }>).detail.network));
settings.addEventListener("language-change", (e) =>
{
    const { value } = (e as CustomEvent<{ value: string }>).detail;
    setPrefs({ language: value });
    changeLanguage(value);
});
settings.addEventListener("request-notifications", async () =>
{
    if (!await requestNotifications()) toast("warning", t("notificationsDenied"));
});
settings.addEventListener("push-disable", () => void disablePush());
settings.addEventListener("delete-chats", () =>
{
    void deleteAllConversations();
    toast("success", t("chatsDeleted"));
});
settings.addEventListener("preview-device", (e) => void startTest((e as CustomEvent<{ kind: "camera" | "mic" }>).detail.kind));
settings.addEventListener("preview", (e) => ringtone.preview((e as CustomEvent<{ id: string }>).detail.id));
settings.addEventListener("preview-stop", () => ringtone.stop());
settings.addEventListener("preview-dial", (e) => ringtone.previewDial((e as CustomEvent<{ id: string }>).detail.id));
settings.addEventListener("close", () =>
{
    settings.open = false;
    stopTest("camera");
    stopTest("mic");
    if (ringtone.previewing()) ringtone.stop();
});

// unread total in the tab title
effect(() =>
{
    const total = rooms().reduce((sum, r) => sum + r.unread, 0);
    document.title = total > 0 ? `(${total}) papchat` : "papchat";
});

// the logs page sits over the main area: logging carries on behind it, and going anywhere closes it
const [logsOpen, setLogsOpen] = signal(false);
effect(() =>
{
    const open = logsOpen();
    mainArea.classList.toggle("logging", open);
    logsView.hidden = !open;
});
effect(() => { logsView.enabled = logging(); });
effect(() =>
{
    const lines = logLines();
    if (logsOpen()) logsView.lines = lines;
});
// only moving somewhere else counts: a new message updates what's on screen without going anywhere
let logsPlace = "";
effect(() =>
{
    const place = globalOpen() ? GLOBAL_ID : viewing()?.conversation.id ?? shownStage()?.id ?? activeRoom() ?? "";
    if (place !== logsPlace) setTimeout(() => setLogsOpen(false), 0);
    logsPlace = place;
});
logsButton.addEventListener("click", () =>
{
    setLogsOpen(true);
    if (matchMedia("(max-width: 799.98px)").matches) shell.sidebaropen = false;
});
logsView.addEventListener("logs-close", () => setLogsOpen(false));
logsView.addEventListener("logs-enable", () => setLogging(true));
logsView.addEventListener("logs-disable", () => setLogging(false));
logsView.addEventListener("logs-copy", () =>
{
    const lines = logLines().map(line => `${new Date(line.at).toISOString()} ${line.text}`);
    // where this device stands right now, so two people's logs can be laid side by side
    const text = [`network: ${JSON.stringify(networkHealth())}`, ...lines].join("\n");
    navigator.clipboard.writeText(text).then(
        () => toast("info", t("logsCopied")),
        () => toast("warning", t("logsCopyFailed")),
    );
});

// components → state
roomList.addEventListener("select", (e) =>
{
    setLogsOpen(false);
    const { id } = (e as CustomEvent<{ id: string }>).detail;
    if (id === GLOBAL_ID) showGlobal();
    else if (id === currentStage()?.id) showStage();
    else if (getRoom(id)) selectRoom(id);
    else void openConversation(id);
});
roomList.addEventListener("leave", (e) =>
{
    const { id } = (e as CustomEvent<{ id: string }>).detail;
    if (id === currentStage()?.id) leaveStage();
    else if (getRoom(id)) getRoom(id)!.leave();
    else void deleteConversation(id);
});

const GLOBAL_PROBLEMS: Record<GlobalPost, string> = {
    sent: "",
    empty: "",
    wait: "globalWait",
    offline: "globalOffline",
    unreachable: "globalUnreachable",
};

view.addEventListener("send", (e) =>
{
    const { text } = (e as CustomEvent<{ text: string }>).detail;
    const stage = shownStage();
    if (globalOpen())
    {
        const problem = GLOBAL_PROBLEMS[postGlobal(text)];
        if (problem)
        {
            e.preventDefault();
            toast("info", t(problem));
        }
    }
    else if (stage) stage.send(text);
    else if (viewing())
    {
        if (!sendSaved(text))
        {
            e.preventDefault();
            toast("warning", t("cantQueue"));
        }
    }
    else if (text.trim().toLowerCase() === "/buzz") sendBuzz();
    else current()?.send(text);
});

// recently used emoji for the composer's picker, newest first, kept in prefs
effect(() => { view.recentEmoji = prefs().recentEmoji; });
view.addEventListener("emoji", (e) =>
{
    const { emoji } = (e as CustomEvent<{ emoji: string }>).detail;
    setPrefs({ recentEmoji: [emoji, ...prefs().recentEmoji.filter(other => other !== emoji)].slice(0, 24) });
});

// GIFs: the composer asks (gif-search), the page asks GIPHY, the composer gets `gifs` back.
// No key → `gifs` stays null and the composer hides GIFs.
const GIPHY = "https://api.giphy.com/v1/gifs";
let gifRequest = 0;
if (GIPHY_KEY) view.gifs = { items: [], loading: false };

view.addEventListener("gif-search", async (e) =>
{
    if (!GIPHY_KEY) return;
    const { query } = (e as CustomEvent<{ query: string }>).detail;
    const request = ++gifRequest;
    view.gifs = { items: view.gifs?.items ?? [], loading: true };

    const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: "24", rating: "pg-13", bundle: "messaging_non_clips" });
    if (query) params.set("q", query);
    let items: Gif[] = [];
    try
    {
        const res = await fetch(`${GIPHY}/${query ? "search" : "trending"}?${params}`);
        const json = await res.json() as { data?: { id: string; title?: string; images?: { fixed_width?: { url?: string; webp?: string; width?: string; height?: string } } }[] };
        items = (json.data ?? []).flatMap(gif =>
        {
            const image = gif.images?.fixed_width;
            const url = image?.webp || image?.url;
            return url ? [{ id: gif.id, url, width: Number(image?.width) || 200, height: Number(image?.height) || 200, title: gif.title ?? "" }] : [];
        });
    }
    catch (error)
    {
        console.warn("papchat: GIPHY request failed", error);
    }
    // a newer search started while this one ran
    if (request !== gifRequest) return;
    view.gifs = { items, loading: false };
});

view.addEventListener("gif", (e) =>
{
    const { gif } = (e as CustomEvent<{ gif: Gif }>).detail;
    const stage = shownStage();
    if (stage) stage.send("", gif);
    else if (viewing()) sendSaved("", gif);
    else current()?.send("", gif);
});

// buzz: the header button or "/buzz"; one per 10 s, the wait is toasted
function sendBuzz() {
    const room = current();
    if (!room || room.buzz()) return;
    const wait = room.buzzWait;
    if (wait > 0) toast("info", t("buzzWait", { seconds: String(Math.ceil(wait / 1000)) }));
}
view.addEventListener("buzz", sendBuzz);

// someone buzzed you: the window shakes (a flash with reduced motion) and the buzz sound plays
const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
effect(() =>
{
    if (!buzzed()) return;
    ringtone.buzz();
    const frames = calm.matches
        ? [{ filter: "brightness(1)" }, { filter: "brightness(1.5)" }, { filter: "brightness(1)" }]
        : [0, -12, 12, -10, 10, -6, 6, 0].map(x => ({ transform: `translateX(${x}px)` }));
    shell.animate(frames, { duration: calm.matches ? 500 : 600, easing: "ease-in-out" });
});
view.addEventListener("typing", () => { if (!elsewhere()) current()?.notifyTyping(); });
view.addEventListener("older", () =>
{
    if (viewing()) void loadOlderViewing();
    else if (!elsewhere()) void current()?.loadOlder();
});
view.addEventListener("files", (e) =>
{
    if (globalOpen())
    {
        toast("info", t("globalFiles"));
        return;
    }
    if (viewing())
    {
        toast("info", t("savedFiles"));
        return;
    }
    if (shownStage())
    {
        toast("info", t("filesOnStage"));
        return;
    }
    current()?.sendFiles((e as CustomEvent<{ files: File[] }>).detail.files);
});
view.addEventListener("cancel", (e) => current()?.cancelFile((e as CustomEvent<{ fid: string }>).detail.fid));

// header Call / Video: a 1:1 chat rings the other person in this same room; a group starts here
view.addEventListener("call", async (e) =>
{
    const { kind } = (e as CustomEvent<{ kind: "call" | "video" }>).detail;
    const person = viewing()?.conversation.direct;
    if (person)
    {
        void placeCall(person, kind);
        return;
    }
    const room = current();
    if (!room) return;
    if (room.direct)
    {
        void placeCall(room.direct, kind);
        return;
    }
    if (await room.start("mic") && kind === "video") await room.start("camera");
});

// mic / camera / screen of the stage you present or the room you're in
function toggleCapture(name: CaptureName) {
    const target: Room | Stage | null = shownStage() ?? current();
    if (!target) return;
    if (target.captures()[name]) target.stop(name);
    else void target.start(name);
}

view.addEventListener("toggle", (e) =>
{
    const control = (e as unknown as CustomEvent<{ control?: string }>).detail?.control;
    if (control === "mic" || control === "camera" || control === "screen") toggleCapture(control);
});

// keyboard: M / V / S toggle mic / camera / screen while in a call or presenting (Escape closes dialogs natively)
const SHORTCUTS: Record<string, CaptureName> = { m: "mic", v: "camera", s: "screen" };
const TYPING = /^(INPUT|TEXTAREA|SELECT)$|^PAP-(INPUT|TEXTAREA|SELECT)$/;

function typing(e: KeyboardEvent): boolean {
    return e.composedPath().some(node => node instanceof HTMLElement && (TYPING.test(node.tagName) || node.isContentEditable));
}

document.addEventListener("keydown", (e) =>
{
    const name = SHORTCUTS[e.key.toLowerCase()];
    if (!name || e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e) || settings.open || picker.open || onboarding.open || accounts.open) return;

    const stage = shownStage();
    const room = current();
    const active = stage ? stage.mine : !!room?.incall;
    if (!active || (name === "screen" && !canScreen)) return;

    e.preventDefault();
    toggleCapture(name);
});

// hang up: a stage ends (presenter) or is left (viewer); a call room is left (cancels ringing); in a chat room only the call ends
view.addEventListener("hangup", () =>
{
    const stage = shownStage();
    if (stage)
    {
        stage.end();
        return;
    }
    const room = current();
    if (!room) return;
    if (room.kind === "call" || room.kind === "video") room.leave();
    else room.hangUp();
});

view.addEventListener("invite", () =>
{
    const stage = shownStage();
    const room = current();
    if (!stage?.mine && !room) return;
    const here = new Set(stage ? [] : room!.participants().map(p => p.uid));
    const online = members().filter(p => !here.has(p.uid) && p.uid !== me()?.uid);
    // saved contacts get rung on their device, so only a call can take them
    const away = !stage && room?.incall ? contacts().filter(c => !here.has(c.uid) && !online.some(p => p.uid === c.uid)).map(contactProfile) : [];
    picker.members = [...online, ...away];
    picker.offline = away.map(p => p.uid);
    picker.link = !stage && room?.incall ? callLink(room) : "";
    picker.open = true;
});
view.addEventListener("devices", openSettings);

picker.addEventListener("invite", (e) =>
{
    const { uids } = (e as CustomEvent<{ uids: string[] }>).detail;
    picker.open = false;
    for (const uid of uids) invite(uid);
});

// to the shown stage (presenter only), else the open room: mid-call invites ring (call/video),
// outside a call the room's own kind is used
function invite(uid: string) {
    const stage = shownStage();
    const room = current();
    let sent = false;
    if (stage) sent = stage.mine && stage.invite(uid);
    else if (room && room.incall && !peerOf(uid) && contactOf(uid))
    {
        void ringContact(room, uid, room.captures().camera ? "video" : "call");
        return;
    }
    else if (room) sent = room.invite(uid, room.incall ? (room.captures().camera ? "video" : "call") : room.kind);
    else return;
    if (!sent) toast("warning", t("inviteFailed", { name: members().find(p => p.uid === uid)?.name ?? "?" }));
}

toaster.addEventListener("action", (e) =>
{
    const { id } = (e as CustomEvent<{ id: string }>).detail;
    toasts().find(t => t.id === id)?.onAction?.();
    dismissToast(id);
});
toaster.addEventListener("dismiss", (e) => dismissToast((e as CustomEvent<{ id: string }>).detail.id));

header.addEventListener("status-change", (e) => setStatus((e as CustomEvent<{ status: Status }>).detail.status));
header.addEventListener("open-settings", openSettings);
// going live: the stage opens in presenter mode with mic and camera (each toasts on failure)
header.addEventListener("go-live", async (e) =>
{
    const stage = await goLive((e as CustomEvent<{ title: string }>).detail.title);
    if (stage && await stage.start("mic")) await stage.start("camera");
});
header.addEventListener("end-live", () => { if (currentStage()?.mine) leaveStage(); });

list.addEventListener("watch", async (e) =>
{
    const stage = await watch((e as CustomEvent<{ id: string }>).detail.id);
    if (stage) showStage();
});

// from the sidebar and from the room's People tab (both bubble to document)
async function chatWith(uid: string) {
    const contact = contactOf(uid);
    if (!contact || peerOf(uid))
    {
        await openChat(uid);
        return;
    }
    const { name, color } = contact;
    if (!await openOfflineChat({ uid, name, color })) toast("warning", t("offlineChatNeedsSaving"));
}

document.addEventListener("member-action", (e) =>
{
    const { uid, action } = (e as CustomEvent<{ uid: string; action: string }>).detail;
    if (action === "chat") void chatWith(uid);
    else if (action === "call" || action === "video") void placeCall(uid, action);
    else if (action === "invite") invite(uid);
    else if (action === "remove") forgetContact(uid);
    else if (action === "mute" || action === "unmute") toggleMute(uid);
});

// files dropped on a member (sidebar or People tab): open their chat, then send
document.addEventListener("member-files", async (e) =>
{
    const { uid, files } = (e as CustomEvent<{ uid: string; files: File[] }>).detail;
    const room = await openChat(uid);
    room?.sendFiles(files);
});

onboarding.addEventListener("link-device", openLinker);
// an invite that's waiting goes back in the address, so the account opening reads it
onboarding.addEventListener("account-pick", (e) =>
{
    if (waitingHash) history.replaceState(null, "", location.pathname + location.search + waitingHash);
    void openAccount((e as CustomEvent<{ slot: string }>).detail.slot);
});
accounts.addEventListener("account-pick", (e) => void openAccount((e as CustomEvent<{ slot: string }>).detail.slot));
accounts.addEventListener("add-account", () => void logOut());
async function handleAccountRemove(e: Event)
{
    if (!await removeAccount((e as CustomEvent<{ slot: string }>).detail.slot)) toast("warning", t("accountRemoveFailed"));
}
onboarding.addEventListener("account-remove", handleAccountRemove);
accounts.addEventListener("account-remove", handleAccountRemove);
header.addEventListener("manage-accounts", () => { accounts.open = true; });
header.addEventListener("log-out", () => void logOut());
effect(() =>
{
    onboarding.accounts = savedAccounts();
    accounts.accounts = savedAccounts();
    accounts.current = me()?.uid ?? "";
});
onboarding.addEventListener("language-change", (e) =>
{
    const { value } = (e as CustomEvent<{ value: string }>).detail;
    setPrefs({ language: value });
    changeLanguage(value);
});
onboarding.addEventListener("submit", (e) =>
{
    const { name, color, language, network: net } = (e as unknown as CustomEvent<{ name: string; color: string; language: string; network: { name: string; password: string } | null }>).detail;
    setPrefs({ language });
    setNetwork(net);
    createProfile(name, color);
    onboarding.open = false;
    startLobby();
    if (waitingCall) followLink(waitingCall, "");
    waitingCall = null;
});

boot();
