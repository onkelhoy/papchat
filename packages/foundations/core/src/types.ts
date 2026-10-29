// shared papchat types: components `import type` these, core implements them

export type Status = "available" | "busy" | "away" | "dnd";
export type Presence = Status | "offline";

export type Profile = {
    v: 1;
    uid: string;
    name: string;
    color: string;
    status: Status;
};

export type Prefs = {
    v: 1;
    ringtone: string;
    volume: number;
    language: string;
    autoDeclineBusy: boolean;
    notifications: boolean;
    devices: { mic?: string; camera?: string; speaker?: string };
    sidebarOpen: boolean;
};

/** A private network: its own lobby, found by name and locked with the password. `null` = the public papchat lobby. */
export type Network = {
    name: string;
    password: string;
};

/** One network on the signal server, for the network list. `name` is "" for the public one. */
export type NetworkEntry = {
    name: string;
    members: number;
    locked: boolean;
};

export type Debug = {
    signal?: string;
    log?: boolean;
};

export type SessionRoom = {
    id: string;
    password?: string;
    kind: RoomKind;
};

export type Session = {
    rooms: SessionRoom[];
};

export type LobbyStatus = "idle" | "connecting" | "waking" | "connected" | "reconnecting" | "closed";

export type RoomKind = "chat" | "call" | "video" | "stage";
export type RoomStatus = "connecting" | "connected" | "reconnecting" | "closed";
export type InviteKind = RoomKind;
export type DeclineReason = "declined" | "busy" | "dnd" | "timeout";

export type Invite = {
    room: string;
    password?: string;
    kind: InviteKind;
    title: string;
    from: string;
    members: string[];
    // the room is the sender's 1:1 with you: you keep one 1:1 per person, so a second one gets merged
    direct?: boolean;
    // set when a room was rebuilt after its network vanished (server restart): the old network id
    replaces?: string;
};

export type IncomingCall = {
    id: string;
    from: Profile;
    kind: InviteKind;
    title: string;
    at: number;
};

export type ChatMessage = {
    id: string;
    uid: string;
    at: number;
    variant: "text" | "system" | "file";
    text: string;
    fid?: string;
};

export type FileInfo = {
    fid: string;
    name: string;
    size: number;
    type: string;
    uid: string;
    at: number;
};

export type TransferState = {
    state: "sending" | "receiving" | "done" | "cancelled" | "failed";
    progress: number;
    url?: string;
};

export type FileEntry = FileInfo & TransferState;

export type RoomSummary = {
    id: string;
    kind: RoomKind;
    title: string;
    participants: Profile[];
    unread: number;
    incall: boolean;
    live: boolean;
};

export type StageSummary = {
    id: string;
    title: string;
    presenter: Profile;
    viewers: number;
    mine: boolean;
};

export type ToastKind = "info" | "success" | "warning" | "error";

export type Toast = {
    id: string;
    kind: ToastKind;
    text: string;
    action?: string;
    duration?: number;
    onAction?: () => void;
};
