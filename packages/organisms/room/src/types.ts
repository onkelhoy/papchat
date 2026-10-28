import type { ChatMessage, Profile } from "@papchat/core";
import type { CallTile } from "@papchat/call-stage";

export type { ChatMessage, Profile, CallTile };

/** header "Call" / "Video" buttons (not in a call) */
export type CallRequestEvent = { kind: "call" | "video" };
