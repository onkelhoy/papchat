/** One network on the server, same shape as `NetworkEntry` in @papchat/core. `name` is "" for the public one. */
export type NetworkEntry = {
    name: string;
    members: number;
    locked: boolean;
    nosave?: boolean;
    ring?: boolean;
};

/** Same shape as `NetworkHealth` in @papchat/core. */
export type NetworkHealth = {
    id: string;
    topology: string;
    host: boolean;
    socket: boolean;
    listed?: boolean;
    peers: { id: string; name: string; host: boolean; linked: boolean; proven: boolean }[];
    merge?: { at: number; outcome: "merged" | "refused" | "failed"; detail: string };
};

/** Detail of `network-change`: `null` = the public papchat network, an empty password = open. */
export type NetworkChangeEvent = { network: { name: string; password: string; nosave?: boolean; ring?: boolean } | null };
