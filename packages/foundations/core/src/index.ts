import { LIMITS, signalUrl } from "./config";
import * as identity from "./identity";
import * as lobby from "./lobby";
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
        lobby,
        identity,
    });
}
