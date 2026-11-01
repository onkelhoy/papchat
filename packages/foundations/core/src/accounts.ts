import { log } from "./log";
import { disablePush } from "./push";
import { me, prefs } from "./state";
import { storage } from "./storage";

// Several accounts on one browser. Logging out keeps everything and asks for no password, so anyone
// using this browser can open any account here: it keeps people apart, it doesn't keep them out.
// Modules read storage as they load, so changing account always reloads the page, every tab with it.

const TABS = "papchat-accounts";
// a page with no service worker never answers: logging out shouldn't hang on that
const PUSH_WAIT_MS = 3_000;

function reload() {
    // rooms belong to the account that was open
    storage.session.set({ rooms: [] });
    location.reload();
}

const tabs = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(TABS);
if (tabs) tabs.onmessage = reload;

// a browser has one push subscription, so it would keep ringing for whoever logged out. The account
// gets a new token the next time it opens, and contacts learn it when they next meet.
async function stopPush() {
    if (!me()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<void>(resolve => { timer = setTimeout(resolve, PUSH_WAIT_MS); });
    try
    {
        await Promise.race([disablePush(), late]);
    }
    catch (error)
    {
        log("accounts: stopping push failed", error);
    }
    clearTimeout(timer);
}

function changed() {
    tabs?.postMessage(0);
    reload();
}

/** Keeps this account as it is and goes to the login step, where a new one can be made too. */
export async function logOut() {
    await stopPush();
    storage.accounts.close(prefs().language);
    changed();
}

/** Opens another account on this browser. */
export async function openAccount(slot: string) {
    await stopPush();
    storage.accounts.open(slot);
    changed();
}
