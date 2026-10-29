import type { ChatMessage, FileEntry, Gif, Profile } from "@papchat/core";
import type { CallTile } from "@papchat/call-stage";

export type { ChatMessage, FileEntry, Profile, CallTile };

/** header "Call" / "Video" buttons (not in a call) */
export type CallRequestEvent = { kind: "call" | "video" };

// GIF results for the composer (same shape as @papchat/composer's GifState)
export type GifState = { items: Gif[]; loading: boolean };
