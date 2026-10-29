/** One network on the server, same shape as `NetworkEntry` in @papchat/core. `name` is "" for the public one. */
export type NetworkEntry = {
    name: string;
    members: number;
    locked: boolean;
};

/** Detail of `network-change`: `null` = the public papchat network, an empty password = open. */
export type NetworkChangeEvent = { network: { name: string; password: string } | null };
