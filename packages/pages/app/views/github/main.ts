import { effect } from "@papit/signals";
import { translator } from "@papit/translator";

import "@papchat/app-shell";
import "@papchat/app-header";
import "@papchat/member-list";
import "@papchat/onboarding";
import type { AppHeader } from "@papchat/app-header";
import type { MemberList } from "@papchat/member-list";
import type { Onboarding } from "@papchat/onboarding";
import type { AppShell } from "@papchat/app-shell";

import {
    PALETTE,
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
import type { Status } from "@papchat/core";

// languages with a file in asset/translations (sv.json arrives in T6.7)
const LANGUAGES = ["en"];

const shell = document.querySelector<AppShell>("pc-app-shell")!;
const header = document.querySelector<AppHeader>("pc-app-header")!;
const list = document.querySelector<MemberList>("pc-member-list")!;
const onboarding = document.querySelector<Onboarding>("pc-onboarding")!;

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

// components → state
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
    // chat, call, video and invite are wired in the next waves
    log("member-action", (e as CustomEvent).detail);
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
