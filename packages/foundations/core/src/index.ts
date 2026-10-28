import { LIMITS, signalUrl } from "./config";
import * as identity from "./identity";
import * as invites from "./invites";
import * as lobby from "./lobby";
import * as devices from "./devices";
import * as notify from "./notify";
import * as ringtone from "./ringtone";
import * as room from "./room";
import { setLogging } from "./log";
import { state, toast } from "./state";
import { storage } from "./storage";

export * from "./types";
export * from "./config";
export * from "./storage";
export * from "./state";
export * from "./log";
export * from "./identity";
export * from "./lobby";
export * from "./room";
export * from "./invites";
export * from "./devices";
export * from "./notify";
export * from "./transfer";
export * as ringtone from "./ringtone";

// console handle for manual checks: papchat.state.prefs(), papchat.setLogging(true), …
declare global {
    interface Window {
        papchat: Record<string, unknown>;
    }
}

if (typeof window !== "undefined")
{
    window.papchat = Object.assign(window.papchat ?? {}, {
        state,
        storage,
        toast,
        setLogging,
        signalUrl,
        LIMITS,
        ...identity,
        ...lobby,
        ...room,
        ...invites,
        ...devices,
        ...notify,
        ringtone,
        lobby,
        identity,
    });
}
