import type { Profile } from "@papchat/core";

/** One participant on the stage. `id` must be unique and stable (peer id or uid). */
export type CallTile = {
    id: string;
    profile: Profile;
    video?: MediaStream | null;
    audio?: MediaStream | null;
    muted?: boolean;
    screen?: boolean;
    self?: boolean;
    /** initial pinned state; once a tile is pinned or unpinned in the stage, that choice wins */
    pinned?: boolean;
};

export type PinEvent = { id: string; pinned: boolean };
