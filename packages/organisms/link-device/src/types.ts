import type { LinkState } from "@papchat/core";

export type { LinkState };

/** Detail of `link-text`: a scanned or pasted link. */
export type LinkTextEvent = { text: string };

/** Why the entered link wasn't taken, "" when it's fine. */
export type LinkNotice = "" | "invalid" | "expired";
