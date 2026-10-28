import { LIMITS, signalUrl } from "./config";
import { setLogging } from "./log";
import { state, toast } from "./state";
import { storage } from "./storage";

export * from "./types";
export * from "./config";
export * from "./storage";
export * from "./state";
export * from "./log";

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
    });
}
